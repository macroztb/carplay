/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import HostScreen from './components/HostScreen';
import ClientScreen from './components/ClientScreen';
import { socket } from './services/socket';
import { Player } from './types';

export default function App() {
  const [view, setView] = useState<'landing' | 'lobby' | 'game'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players, isHost, maxPlayers: mp }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setMaxPlayers(mp);
      setView('lobby');
      setError('');
    });

    socket.on('roomJoined', ({ roomId, players, isHost, maxPlayers: mp }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setMaxPlayers(mp);
      setView('lobby');
      setError('');
    });

    socket.on('playerJoinedRoom', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('gameStarted', (initialPlayers) => {
      setPlayers(initialPlayers);
      setView('game');
      setCountdown(3);
    });

    socket.on('error', (msg) => {
      setError(msg);
      if (msg === "Host disconnected. Room closed." || msg === "Room not found") {
        setView('landing');
        setRoomCode('');
        setPlayers({});
        setIsHost(false);
      }
    });
    
    socket.on('hostMigrated', (newHostId) => {
        if (socket.id === newHostId) {
            setIsHost(true);
        }
    });

    socket.on('disconnect', () => {
      setView('landing');
      setError('Disconnected from server. Please try again.');
      setRoomCode('');
      setPlayers({});
      setIsHost(false);
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('playerJoinedRoom');
      socket.off('playerDisconnected');
      socket.off('gameStarted');
      socket.off('error');
      socket.off('hostMigrated');
      socket.off('disconnect');
    };
  }, []);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleCreate = () => {
    socket.emit('createRoom', { maxPlayers });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
        setError('Please enter a valid 6-character room code');
        return;
    }
    socket.emit('joinRoom', { roomId: code });
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  if (view === 'game') {
    return isHost ? <HostScreen initialPlayers={players} countdown={countdown} /> : <ClientScreen initialPlayers={players} countdown={countdown} />;
  }

  return (
    <div className={`min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans text-slate-100`}>
      <header className={`w-full max-w-4xl mx-auto p-6 flex justify-between items-center transition-all`}>
        <h1 className={`text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 transform -skew-x-12 transition-all`}>
          TURBO RACE
        </h1>
      </header>

      <main className={`flex-1 w-full flex flex-col items-center p-4 transition-all`}>
        {view === 'landing' && (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center">Start Your Engines</h2>
            
            <div className="space-y-6">
              {error && <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{error}</div>}

              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-400 uppercase">Max Players</label>
                  <select 
                    value={maxPlayers} 
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white font-bold focus:ring-2 focus:ring-yellow-500 outline-none"
                  >
                    <option value={1}>1 Player (Practice)</option>
                    <option value={2}>2 Players</option>
                    <option value={3}>3 Players</option>
                    <option value={4}>4 Players</option>
                  </select>
                </div>

                <button
                  onClick={handleCreate}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                >
                  CREATE RACE (HOST)
                </button>
                
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-slate-800 text-slate-500">Or join as player</span>
                    </div>
                </div>

                <form onSubmit={handleJoin} className="flex gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white uppercase tracking-widest font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="CODE"
                        maxLength={6}
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                    >
                        JOIN
                    </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {view === 'lobby' && (
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl w-full">
                <div className="text-center mb-8">
                    <h2 className="text-xl text-slate-400 mb-2">Room Code</h2>
                    <div className="text-6xl font-mono font-black tracking-widest text-yellow-400 bg-black/30 p-4 rounded-xl inline-block border-2 border-dashed border-slate-600 select-all">
                        {roomCode}
                    </div>
                    <p className="text-sm text-slate-500 mt-2">Share this code with your friends!</p>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                        <span>Racers ({Object.keys(players).length} / {maxPlayers})</span>
                        {isHost && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">You are Host</span>}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {Object.values(players).map(p => (
                            <div key={p.id} className="bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-600">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                                <span className="font-bold truncate">{p.name}</span>
                                {p.id === socket.id && <span className="text-xs text-slate-400">(You)</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {isHost ? (
                    <button
                        onClick={handleStartGame}
                        disabled={Object.keys(players).length < maxPlayers}
                        className={`w-full font-bold py-4 rounded-xl shadow-lg text-xl tracking-wide transition-transform ${
                          Object.keys(players).length < maxPlayers 
                            ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
                            : 'bg-green-600 hover:bg-green-500 text-white active:scale-95 animate-pulse'
                        }`}
                    >
                        {Object.keys(players).length < maxPlayers ? 'WAITING FOR PLAYERS...' : 'START RACE'}
                    </button>
                ) : (
                    <div className="text-center text-slate-400 italic animate-pulse">
                        Waiting for host to start the race...
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
}
