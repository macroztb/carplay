import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../services/socket';
import { Player } from '../types';
import { 
  ACCELERATION, MAX_SPEED, NITRO_SPEED, NITRO_ACCEL, FRICTION, TURN_SPEED, 
  TRACK_SEGMENTS, TRACK_RADIUS, getClosestPointOnSegment, distToSegment 
} from '../gameConstants';

export default function ClientScreen({ initialPlayers }: { initialPlayers: Record<string, Player> }) {
  const [myId, setMyId] = useState<string | null>(socket.id || null);
  const [laps, setLaps] = useState(0);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [nitro, setNitro] = useState(100);
  const [wrongWay, setWrongWay] = useState(false);
  const [bestLapTime, setBestLapTime] = useState<number>(Infinity);
  
  // Input state
  const keys = useRef<Record<string, boolean>>({});

  const localPlayer = useRef<{
    x: number;
    y: number;
    angle: number;
    speed: number;
    checkpoint: number;
    nitro: number;
    drifting: boolean;
    wrongWayTimer: number | null;
    lapCount: number;
  }>({
    x: 650,
    y: 750,
    angle: Math.PI,
    speed: 0,
    checkpoint: 3,
    nitro: 100,
    drifting: false,
    wrongWayTimer: null,
    lapCount: 0,
  });

  useEffect(() => {
    if (myId && initialPlayers[myId]) {
      const p = initialPlayers[myId];
      localPlayer.current.x = p.x;
      localPlayer.current.y = p.y;
      localPlayer.current.angle = p.angle;
    }
  }, [myId, initialPlayers]);

  useEffect(() => {
    socket.on('connect', () => setMyId(socket.id || null));
    socket.on('lapUpdate', (data: {id: string, laps: number, bestLapTime: number}) => {
      if (data.id === socket.id) {
        setLaps(data.laps);
        setBestLapTime(data.bestLapTime || Infinity);
      }
    });
    return () => {
      socket.off('connect');
      socket.off('lapUpdate');
    };
  }, []);

  // Physics Loop
  useEffect(() => {
    let animationFrameId: number;

    const updatePhysics = () => {
      const p = localPlayer.current;
      const oldX = p.x;
      const oldY = p.y;
      
      // Acceleration
      if (keys.current['ArrowUp'] || keys.current['KeyW'] || keys.current['Forward']) {
        p.speed += ACCELERATION;
      } else if (keys.current['ArrowDown'] || keys.current['KeyS'] || keys.current['Brake']) {
        p.speed -= ACCELERATION;
      } else {
        p.speed *= FRICTION;
      }

      // Nitro
      if ((keys.current['ShiftLeft'] || keys.current['ShiftRight'] || keys.current['Nitro']) && p.nitro > 0) {
          p.speed += NITRO_ACCEL;
          p.nitro = Math.max(0, p.nitro - 1);
      } else {
          p.nitro = Math.min(100, p.nitro + 0.2);
      }
      setNitro(p.nitro);

      // Drifting Logic
      const isTurning = keys.current['ArrowLeft'] || keys.current['KeyA'] || keys.current['Left'] || keys.current['ArrowRight'] || keys.current['KeyD'] || keys.current['Right'];
      const wantsDrift = keys.current['Space'] || keys.current['Drift'];
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.5) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const isNitroActive = (keys.current['ShiftLeft'] || keys.current['ShiftRight'] || keys.current['Nitro']) && p.nitro > 0;
      const currentMaxSpeed = isNitroActive ? NITRO_SPEED : MAX_SPEED;
      
      if (p.speed > currentMaxSpeed) {
          if (isNitroActive) {
              p.speed = currentMaxSpeed;
          } else {
              p.speed = Math.max(currentMaxSpeed, p.speed * 0.98);
          }
      }
      if (p.speed < -MAX_SPEED / 2) p.speed = -MAX_SPEED / 2;

      // Turning
      if (Math.abs(p.speed) > 0.1) {
        let turn = TURN_SPEED * (p.speed / MAX_SPEED);
        
        if (p.drifting) {
            turn *= 1.5;
            p.speed *= 0.98;
        }

        if (keys.current['ArrowLeft'] || keys.current['KeyA'] || keys.current['Left']) {
          p.angle -= turn;
        }
        if (keys.current['ArrowRight'] || keys.current['KeyD'] || keys.current['Right']) {
          p.angle += turn;
        }
      }

      // Movement
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;

      // Find closest segment for target angle and collision
      let closestPt = {x: p.x, y: p.y};
      let minD2 = Infinity;
      let targetAngle = 0;
      
      TRACK_SEGMENTS.forEach(seg => {
          const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
          const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
          if (d2 < minD2) {
              minD2 = d2;
              closestPt = pt;
              targetAngle = seg.angle;
          }
      });

      // Track Collision
      if (Math.sqrt(minD2) > TRACK_RADIUS) {
        p.speed *= 0.9;
        if (p.speed > 1.2) p.speed = 1.2;
        if (p.speed < -0.75) p.speed = -0.75;
        p.drifting = false;
      }

      // Sector/Lap Logic
      let currentSector = -1;
      const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
      const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
      const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
      const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

      if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
      else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
      else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
      else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
      
      if (currentSector !== -1) {
          const nextCheckpoint = (p.checkpoint + 1) % 4;
          if (currentSector === nextCheckpoint) {
              p.checkpoint = currentSector;
          }
      }

      // Lap Finish Check
      const onFinishStraight = p.y > 700 && p.y < 800;
      if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
          const now = Date.now();
          const lapTime = now - currentLapStart;
          
          setCurrentLapStart(now);
          p.lapCount = (p.lapCount || 0) + 1;
          setLaps(p.lapCount);
          
          if (p.lapCount > 1) {
              setBestLapTime(prev => Math.min(prev, lapTime));
              socket.emit('lapFinished', lapTime);
          }
          
          p.checkpoint = -1;
      }

      // Wrong Way Detection
      let pAngle = p.angle % (Math.PI * 2);
      if (pAngle > Math.PI) pAngle -= Math.PI * 2;
      if (pAngle < -Math.PI) pAngle += Math.PI * 2;
      
      let diff = Math.abs(pAngle - targetAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      
      const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
      
      if (isWrongWayConditionMet) {
          if (p.wrongWayTimer === null) {
              p.wrongWayTimer = Date.now();
          } else if (Date.now() - p.wrongWayTimer > 100) {
              setWrongWay(true);
          }
      } else {
          p.wrongWayTimer = null;
          setWrongWay(false);
      }

      // Send update
      if (socket.connected) {
        socket.emit('playerMovement', {
          x: p.x,
          y: p.y,
          angle: p.angle,
          speed: p.speed,
          nitro: p.nitro,
          drifting: p.drifting
        });
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentLapStart]);

  // Keyboard support for testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleTouchStart = (key: string) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!keys.current[key] && navigator.vibrate) {
      navigator.vibrate(15);
    }
    keys.current[key] = true;
  };

  const handleTouchEnd = (key: string) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    keys.current[key] = false;
  };

  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };

  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now() - currentLapStart), 50);
    return () => clearInterval(interval);
  }, [currentLapStart]);

  return (
    <div className="force-landscape bg-slate-900 flex flex-col text-white select-none touch-none">
      {/* HUD */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-8 p-2 px-6 bg-slate-800/90 rounded-b-3xl border-b border-x border-slate-700 backdrop-blur-md z-10 shadow-lg">
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Laps</div>
          <div className="text-xl font-black">{laps}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Time</div>
          <div className="text-xl font-mono font-bold text-yellow-400">{formatTime(currentTime)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Best</div>
          <div className="text-lg font-mono text-slate-300">{formatTime(bestLapTime)}</div>
        </div>
      </div>

      {wrongWay && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded-full font-bold animate-pulse z-50 shadow-lg">
          WRONG WAY!
        </div>
      )}

      {/* Nitro Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 z-20">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-100"
          style={{ width: `${nitro}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex-1 relative w-full h-full p-4 pointer-events-none">
        
        {/* Left Controls */}
        <div className="absolute left-4 top-16 bottom-4 w-32 flex flex-col gap-2 pointer-events-auto">
          <button 
            className="flex-1 bg-green-500/80 rounded-2xl border-b-4 border-green-800 active:border-b-0 active:translate-y-1 flex items-center justify-center font-bold text-2xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Forward')}
            onMouseUp={handleTouchEnd('Forward')}
            onMouseLeave={handleTouchEnd('Forward')}
            onTouchStart={handleTouchStart('Forward')}
            onTouchEnd={handleTouchEnd('Forward')}
            onTouchCancel={handleTouchEnd('Forward')}
          >
            GAS
          </button>
          <button 
            className="flex-[1.5] bg-slate-800/80 rounded-2xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 flex items-center justify-center text-5xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Left')}
            onMouseUp={handleTouchEnd('Left')}
            onMouseLeave={handleTouchEnd('Left')}
            onTouchStart={handleTouchStart('Left')}
            onTouchEnd={handleTouchEnd('Left')}
            onTouchCancel={handleTouchEnd('Left')}
          >
            ◀
          </button>
          <button 
            className="flex-1 bg-red-600/80 rounded-2xl border-b-4 border-red-900 active:border-b-0 active:translate-y-1 flex items-center justify-center font-bold text-2xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Brake')}
            onMouseUp={handleTouchEnd('Brake')}
            onMouseLeave={handleTouchEnd('Brake')}
            onTouchStart={handleTouchStart('Brake')}
            onTouchEnd={handleTouchEnd('Brake')}
            onTouchCancel={handleTouchEnd('Brake')}
          >
            BRK
          </button>
        </div>

        {/* Right Controls */}
        <div className="absolute right-4 top-16 bottom-4 w-32 flex flex-col gap-2 pointer-events-auto">
          <button 
            className="flex-1 bg-green-500/80 rounded-2xl border-b-4 border-green-800 active:border-b-0 active:translate-y-1 flex items-center justify-center font-bold text-2xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Forward')}
            onMouseUp={handleTouchEnd('Forward')}
            onMouseLeave={handleTouchEnd('Forward')}
            onTouchStart={handleTouchStart('Forward')}
            onTouchEnd={handleTouchEnd('Forward')}
            onTouchCancel={handleTouchEnd('Forward')}
          >
            GAS
          </button>
          <button 
            className="flex-[1.5] bg-slate-800/80 rounded-2xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 flex items-center justify-center text-5xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Right')}
            onMouseUp={handleTouchEnd('Right')}
            onMouseLeave={handleTouchEnd('Right')}
            onTouchStart={handleTouchStart('Right')}
            onTouchEnd={handleTouchEnd('Right')}
            onTouchCancel={handleTouchEnd('Right')}
          >
            ▶
          </button>
          <button 
            className="flex-1 bg-red-600/80 rounded-2xl border-b-4 border-red-900 active:border-b-0 active:translate-y-1 flex items-center justify-center font-bold text-2xl shadow-lg backdrop-blur-sm"
            onMouseDown={handleTouchStart('Brake')}
            onMouseUp={handleTouchEnd('Brake')}
            onMouseLeave={handleTouchEnd('Brake')}
            onTouchStart={handleTouchStart('Brake')}
            onTouchEnd={handleTouchEnd('Brake')}
            onTouchCancel={handleTouchEnd('Brake')}
          >
            BRK
          </button>
        </div>

        {/* Center Nitro */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button 
            className="w-32 h-32 bg-blue-500/90 rounded-full border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 flex items-center justify-center font-bold shadow-lg backdrop-blur-sm text-2xl"
            onMouseDown={handleTouchStart('Nitro')}
            onMouseUp={handleTouchEnd('Nitro')}
            onMouseLeave={handleTouchEnd('Nitro')}
            onTouchStart={handleTouchStart('Nitro')}
            onTouchEnd={handleTouchEnd('Nitro')}
            onTouchCancel={handleTouchEnd('Nitro')}
          >
            NITRO
          </button>
        </div>

      </div>
    </div>
  );
}
