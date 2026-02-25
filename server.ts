/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  // Game State
  type Player = {
    id: string;
    x: number;
    y: number;
    angle: number;
    color: string;
    name: string;
    speed: number;
    laps: number;
    bestLapTime: number; // milliseconds, Infinity if none
    lastLapStart: number;
    nitro: number;
    drifting: boolean;
  };

  type Room = {
    id: string;
    players: Record<string, Player>;
    status: 'waiting' | 'racing';
    hostId: string;
    maxPlayers: number;
  };

  const rooms: Record<string, Room> = {};
  const socketRoomMap: Record<string, string> = {};

  const TRACK_WIDTH = 1200;
  const TRACK_HEIGHT = 850;

  // Helper to generate room code
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).padEnd(6, '0').toUpperCase();
  };

  const COLORS = [
    { name: 'Red', value: 'hsl(0, 70%, 50%)' },
    { name: 'Blue', value: 'hsl(210, 70%, 50%)' },
    { name: 'Green', value: 'hsl(120, 70%, 50%)' },
    { name: 'Yellow', value: 'hsl(60, 70%, 50%)' },
    { name: 'Purple', value: 'hsl(280, 70%, 50%)' },
    { name: 'Orange', value: 'hsl(30, 70%, 50%)' },
    { name: 'Cyan', value: 'hsl(180, 70%, 50%)' },
    { name: 'Pink', value: 'hsl(330, 70%, 50%)' },
  ];

  const createPlayer = (id: string, colorInfo: { name: string, value: string }, index: number): Player => {
    // Starting line is around x=625, y=750, angle=Math.PI (facing left)
    // We want them side-by-side along the y-axis
    // index 0: y=735
    // index 1: y=745
    // index 2: y=755
    // index 3: y=765
    const startY = 735 + (index * 10);
    const startX = 650; // slightly behind the finish line

    return {
      id,
      x: startX,
      y: startY,
      angle: Math.PI,
      color: colorInfo.value,
      name: colorInfo.name,
      speed: 0,
      laps: 0,
      bestLapTime: Infinity,
      lastLapStart: Date.now(),
      nitro: 100,
      drifting: false,
    };
  };

  // Socket.io Logic
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Room Management
    socket.on("createRoom", (payload) => {
      const roomId = generateRoomCode();
      const maxPlayers = payload?.maxPlayers || 4;
      
      rooms[roomId] = {
        id: roomId,
        players: {},
        status: 'waiting',
        hostId: socket.id,
        maxPlayers
      };
      
      socketRoomMap[socket.id] = roomId;
      socket.join(roomId);
      
      socket.emit("roomCreated", { roomId, players: rooms[roomId].players, isHost: true, maxPlayers });

      if (maxPlayers === 1) {
          rooms[roomId].status = 'racing';
          socket.emit("gameStarted", rooms[roomId].players);
      }
    });

    socket.on("joinRoom", (payload) => {
      const roomId = payload?.roomId;
      const cleanRoomId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
      console.log(`[JOIN] Player ${socket.id} attempting to join room: '${cleanRoomId}'`);
      console.log(`[JOIN] Available rooms:`, Object.keys(rooms));

      if (rooms[cleanRoomId]) {
        const room = rooms[cleanRoomId];
        
        if (Object.keys(room.players).length >= room.maxPlayers) {
            socket.emit("error", "Room is full");
            return;
        }

        const usedColors = Object.values(room.players).map(p => p.name);
        const availableColor = COLORS.find(c => !usedColors.includes(c.name)) || COLORS[Math.floor(Math.random() * COLORS.length)];
        
        const playerIndex = Object.keys(room.players).length;
        const newPlayer = createPlayer(socket.id, availableColor, playerIndex);
        
        room.players[socket.id] = newPlayer;
        socketRoomMap[socket.id] = cleanRoomId;
        socket.join(cleanRoomId);
        
        console.log(`[JOIN] Player ${socket.id} successfully joined room ${cleanRoomId}`);
        // Notify the joiner
        socket.emit("roomJoined", { roomId: cleanRoomId, players: room.players, isHost: false, maxPlayers: room.maxPlayers });
        
        // Notify others in the room
        socket.to(cleanRoomId).emit("playerJoinedRoom", newPlayer);

        if (room.status === 'waiting' && Object.keys(room.players).length >= room.maxPlayers) {
            room.status = 'racing';
            io.to(cleanRoomId).emit("gameStarted", room.players);
        } else if (room.status === 'racing') {
           // If the game is already racing, tell the joiner to start the game immediately
           socket.emit("gameStarted", room.players);
        }
      } else {
        console.log(`[JOIN] Failed for room '${cleanRoomId}'. Exists: ${!!rooms[cleanRoomId]}`);
        socket.emit("error", "Room not found");
      }
    });

    socket.on("startGame", () => {
      const roomId = socketRoomMap[socket.id];
      if (roomId && rooms[roomId] && rooms[roomId].hostId === socket.id) {
        rooms[roomId].status = 'racing';
        io.to(roomId).emit("gameStarted", rooms[roomId].players);
      }
    });

    // Game Events (Scoped to Room)
    socket.on("playerMovement", (movementData) => {
      const roomId = socketRoomMap[socket.id];
      if (roomId && rooms[roomId]) {
        const player = rooms[roomId].players[socket.id];
        if (player) {
          player.x = movementData.x;
          player.y = movementData.y;
          player.angle = movementData.angle;
          player.speed = movementData.speed;
          player.nitro = movementData.nitro;
          player.drifting = movementData.drifting;
          
          socket.to(roomId).emit("playerMoved", player);
        }
      }
    });

    socket.on("lapFinished", (lapTime) => {
      const roomId = socketRoomMap[socket.id];
      if (roomId && rooms[roomId]) {
        const player = rooms[roomId].players[socket.id];
        if (player) {
          player.laps += 1;
          if (lapTime < player.bestLapTime) {
            player.bestLapTime = lapTime;
          }
          player.lastLapStart = Date.now();
          io.to(roomId).emit("lapUpdate", { id: player.id, laps: player.laps, bestLapTime: player.bestLapTime });
        }
      }
    });

    socket.on("disconnect", () => {
      const roomId = socketRoomMap[socket.id];
      if (roomId && rooms[roomId]) {
        if (rooms[roomId].hostId === socket.id) {
          // Host left, close the room
          io.to(roomId).emit("error", "Host disconnected. Room closed.");
          delete rooms[roomId];
          // We don't need to clean up socketRoomMap for everyone here, 
          // they will disconnect or leave on their own when they get the error.
        } else {
          // Normal player left
          delete rooms[roomId].players[socket.id];
          delete socketRoomMap[socket.id];
          io.to(roomId).emit("playerDisconnected", socket.id);
          
          if (Object.keys(rooms[roomId].players).length === 0 && rooms[roomId].status === 'racing') {
            // If all players left during a race, maybe end it? 
            // For now, just let the host keep the empty room.
          }
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed later)
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
