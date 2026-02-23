import React, { useEffect, useState, useMemo } from 'react';
import { socket } from '../services/socket';
import { Player } from '../types';
import GameRenderer from './GameRenderer';

export default function HostScreen({ initialPlayers }: { initialPlayers: Record<string, Player> }) {
  const [players, setPlayers] = useState<Record<string, Player>>(initialPlayers);

  useEffect(() => {
    socket.on('playerJoinedRoom', (player: unknown) => {
      const p = player as Player;
      setPlayers((prev) => ({ ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } }));
    });

    socket.on('playerMoved', (player: unknown) => {
      const p = player as Player;
      setPlayers((prev) => ({ ...prev, [p.id]: { ...p, bestLapTime: p.bestLapTime || Infinity } }));
    });
    
    socket.on('lapUpdate', (data: {id: string, laps: number, bestLapTime: number}) => {
        setPlayers(prev => {
            if (!prev[data.id]) return prev;
            const serverBest = data.bestLapTime || Infinity;
            return {
                ...prev,
                [data.id]: {
                    ...prev[data.id],
                    laps: data.laps,
                    bestLapTime: serverBest
                }
            };
        });
    });

    socket.on('playerDisconnected', (id: string) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      socket.off('playerJoinedRoom');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('lapUpdate');
    };
  }, []);

  const playerList = Object.values(players);
  
  // Determine grid columns based on player count
  let gridClass = 'grid-cols-1 grid-rows-1';
  if (playerList.length === 2) gridClass = 'grid-cols-2 grid-rows-1';
  else if (playerList.length >= 3 && playerList.length <= 4) gridClass = 'grid-cols-2 grid-rows-2';
  else if (playerList.length > 4 && playerList.length <= 6) gridClass = 'grid-cols-3 grid-rows-2';
  else if (playerList.length > 6) gridClass = 'grid-cols-4 grid-rows-2';

  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10">
        <h1 className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 transform -skew-x-12">
          TURBO RACE - HOST VIEW
        </h1>
        <div className="flex flex-wrap gap-2 justify-end">
          {playerList.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 bg-slate-700 px-3 py-1 rounded-full">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
              <span className="font-bold text-sm">{p.name}</span>
              <span className="text-xs text-slate-400 ml-2">Laps: {p.laps}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className={`flex-1 grid ${gridClass} gap-2 p-2 bg-black min-h-0`}>
        {playerList.length === 0 ? (
          <div className="flex items-center justify-center text-slate-500 text-2xl h-full w-full col-span-full">
            Waiting for players...
          </div>
        ) : (
          playerList.map(p => (
            <div key={p.id} className="relative w-full h-full rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900">
              <GameRenderer players={players} followId={p.id} />
              <div className="absolute top-4 left-4 bg-black/60 text-white px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
                <div className="font-bold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                  {p.name}
                </div>
                <div className="text-xs text-slate-300 mt-1">
                  Best: {formatTime(p.bestLapTime)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
