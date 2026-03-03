import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../services/socket';
import { Player } from '../types';
import { 
  ACCELERATION, MAX_SPEED, NITRO_SPEED, NITRO_ACCEL, FRICTION, TURN_SPEED, 
  TRACK_SEGMENTS, TRACK_RADIUS, getClosestPointOnSegment, distToSegment 
} from '../gameConstants';

export default function ClientScreen({ initialPlayers, countdown }: { initialPlayers: Record<string, Player>, countdown: number | null }) {
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
    isNitroActive: boolean;
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
    isNitroActive: false,
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
      if (countdown === null) {
        if (keys.current['ArrowUp'] || keys.current['KeyW'] || keys.current['Forward']) {
          p.speed += ACCELERATION;
        } else if (keys.current['ArrowDown'] || keys.current['KeyS'] || keys.current['Brake']) {
          p.speed -= ACCELERATION;
        } else {
          p.speed *= FRICTION;
        }
      } else {
        p.speed *= FRICTION;
      }

      // Nitro
      if (countdown === null && (keys.current['ShiftLeft'] || keys.current['ShiftRight'] || keys.current['Nitro']) && p.nitro > 0) {
          p.speed += NITRO_ACCEL;
          p.nitro = Math.max(0, p.nitro - 1);
      } else {
          p.nitro = Math.min(100, p.nitro + 0.2);
      }
      setNitro(p.nitro);

      // Drifting Logic
      const isTurning = countdown === null && (keys.current['ArrowLeft'] || keys.current['KeyA'] || keys.current['Left'] || keys.current['ArrowRight'] || keys.current['KeyD'] || keys.current['Right']);
      const wantsDrift = countdown === null && (keys.current['Space'] || keys.current['Drift']);
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.5) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const isNitroActive = (keys.current['ShiftLeft'] || keys.current['ShiftRight'] || keys.current['Nitro']) && p.nitro > 0;
      p.isNitroActive = isNitroActive;
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

        if (countdown === null) {
          if (keys.current['ArrowLeft'] || keys.current['KeyA'] || keys.current['Left']) {
            p.angle -= turn;
          }
          if (keys.current['ArrowRight'] || keys.current['KeyD'] || keys.current['Right']) {
            p.angle += turn;
          }
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
          isNitroActive: p.isNitroActive,
          drifting: p.drifting
        });
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentLapStart, countdown]);

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
    if (countdown !== null) return;
    const interval = setInterval(() => setCurrentTime(Date.now() - currentLapStart), 50);
    return () => clearInterval(interval);
  }, [currentLapStart, countdown]);

  useEffect(() => {
    if (countdown === 0) {
      setCurrentLapStart(Date.now());
    }
  }, [countdown]);

  // Audio cues for countdown
  useEffect(() => {
    if (countdown !== null) {
      const isGo = countdown === 0;
      const freq = isGo ? 880 : 440;
      const duration = isGo ? 0.5 : 0.1;
      
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        // Audio context might be blocked by browser policy, ignore
      }
    }
  }, [countdown]);

  const BlockArrowLeft = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="transparent" stroke="#22405D" strokeWidth="4" strokeLinejoin="round">
      <polygon points="45,25 15,50 45,75 45,60 85,60 85,40 45,40" />
    </svg>
  );

  const BlockArrowRight = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="transparent" stroke="#22405D" strokeWidth="4" strokeLinejoin="round">
      <polygon points="55,25 85,50 55,75 55,60 15,60 15,40 55,40" />
    </svg>
  );

  const BlockArrowUp = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="transparent" stroke="#22405D" strokeWidth="4" strokeLinejoin="round">
      <polygon points="50,20 20,50 40,50 40,80 60,80 60,50 80,50" />
    </svg>
  );

  const BlockArrowDown = () => (
    <svg width="80" height="80" viewBox="0 0 100 100" fill="transparent" stroke="#22405D" strokeWidth="4" strokeLinejoin="round">
      <polygon points="50,80 20,50 40,50 40,20 60,20 60,50 80,50" />
    </svg>
  );

  return (
    <div className="force-landscape flex flex-col text-white select-none touch-none" style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }}>
      {/* HUD */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-8 p-2 px-6 bg-slate-800/90 rounded-b-3xl border-b border-x border-slate-700 backdrop-blur-md z-10 shadow-lg pointer-events-none">
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">圈数</div>
          <div className="text-xl font-black">{laps}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">时间</div>
          <div className="text-xl font-mono font-bold text-yellow-400">{formatTime(currentTime)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-400 uppercase font-bold">最佳</div>
          <div className="text-lg font-mono text-slate-300">{formatTime(bestLapTime)}</div>
        </div>
      </div>

      {wrongWay && countdown === null && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded-full font-bold animate-pulse z-50 shadow-lg pointer-events-none">
          反向行驶！
        </div>
      )}

      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
          <div className="text-9xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)] animate-bounce">
            {countdown > 0 ? countdown : '开始！'}
          </div>
        </div>
      )}

      {/* Nitro Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 z-20 pointer-events-none">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-100"
          style={{ width: `${nitro}%` }}
        />
      </div>

      {/* Controls Layout */}
      {/* Top Row */}
      <div style={{ display: 'flex', flex: 1 }}>
        <div 
          style={{ flex: 1, backgroundColor: '#E87A3E', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '2px solid #000', borderBottom: '2px solid #000' }}
          onMouseDown={handleTouchStart('Brake')} onMouseUp={handleTouchEnd('Brake')} onMouseLeave={handleTouchEnd('Brake')}
          onTouchStart={handleTouchStart('Brake')} onTouchEnd={handleTouchEnd('Brake')} onTouchCancel={handleTouchEnd('Brake')}
        >
          <BlockArrowLeft />
        </div>
        <div 
          style={{ flex: 1, backgroundColor: '#5CD05A', display: 'flex', justifyContent: 'center', alignItems: 'center', borderBottom: '2px solid #000' }}
          onMouseDown={handleTouchStart('Forward')} onMouseUp={handleTouchEnd('Forward')} onMouseLeave={handleTouchEnd('Forward')}
          onTouchStart={handleTouchStart('Forward')} onTouchEnd={handleTouchEnd('Forward')} onTouchCancel={handleTouchEnd('Forward')}
        >
          <BlockArrowRight />
        </div>
      </div>

      {/* Middle Row */}
      <div style={{ display: 'flex', height: '25vh', backgroundColor: '#000', justifyContent: 'space-around', alignItems: 'center' }}>
        <div 
          style={{ width: '18vh', height: '18vh', borderRadius: '50%', backgroundColor: '#FFF000', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '4px solid #22405D' }}
          onMouseDown={handleTouchStart('Nitro')} onMouseUp={handleTouchEnd('Nitro')} onMouseLeave={handleTouchEnd('Nitro')}
          onTouchStart={handleTouchStart('Nitro')} onTouchEnd={handleTouchEnd('Nitro')} onTouchCancel={handleTouchEnd('Nitro')}
        >
          <span style={{ color: '#E87A3E', fontSize: '10vh', fontWeight: '900', transform: 'rotate(-90deg)', fontFamily: 'sans-serif' }}>B</span>
        </div>
        <div 
          style={{ width: '18vh', height: '18vh', borderRadius: '50%', backgroundColor: '#63C5F1', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '4px solid #22405D' }}
          onMouseDown={handleTouchStart('Nitro')} onMouseUp={handleTouchEnd('Nitro')} onMouseLeave={handleTouchEnd('Nitro')}
          onTouchStart={handleTouchStart('Nitro')} onTouchEnd={handleTouchEnd('Nitro')} onTouchCancel={handleTouchEnd('Nitro')}
        >
          <span style={{ color: '#22405D', fontSize: '10vh', fontWeight: '900', transform: 'rotate(-90deg)', fontFamily: 'sans-serif' }}>A</span>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div 
          style={{ flex: 1, backgroundColor: '#7030A0', display: 'flex', justifyContent: 'center', alignItems: 'center', borderTop: '2px solid #000', borderBottom: '2px solid #000' }}
          onMouseDown={handleTouchStart('Left')} onMouseUp={handleTouchEnd('Left')} onMouseLeave={handleTouchEnd('Left')}
          onTouchStart={handleTouchStart('Left')} onTouchEnd={handleTouchEnd('Left')} onTouchCancel={handleTouchEnd('Left')}
        >
          <BlockArrowUp />
        </div>
        <div 
          style={{ flex: 1, backgroundColor: '#5E215B', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onMouseDown={handleTouchStart('Right')} onMouseUp={handleTouchEnd('Right')} onMouseLeave={handleTouchEnd('Right')}
          onTouchStart={handleTouchStart('Right')} onTouchEnd={handleTouchEnd('Right')} onTouchCancel={handleTouchEnd('Right')}
        >
          <BlockArrowDown />
        </div>
      </div>

    </div>
  );
}
