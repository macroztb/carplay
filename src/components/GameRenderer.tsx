import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Player } from '../types';
import { TRACK_WIDTH, TRACK_HEIGHT, TRACK_RADIUS, TRACK_SEGMENTS, isPointOnTrackMath } from '../gameConstants';

// 3D Components
const CarModel = ({ color, isLocal, drifting }: { color: string, isLocal?: boolean, drifting?: boolean }) => {
  return (
    <group scale={[4, 4, 4]}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.2, -0.5]} castShadow>
        <boxGeometry args={[1.8, 0.8, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Wheels */}
      <mesh position={[1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Headlights */}
      <mesh position={[0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      {/* Taillights */}
      <mesh position={[0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      <mesh position={[-0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      
      {/* Drift Smoke Particles */}
      {drifting && (
        <>
          <mesh position={[1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
          <mesh position={[-1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {isLocal && (
        <pointLight position={[0, 2, 4]} intensity={10} distance={20} color="white" />
      )}
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 6, 8]} />
        <meshStandardMaterial color="#4d2926" />
      </mesh>
      <mesh position={[0, 9, 0]} castShadow>
        <coneGeometry args={[4, 10, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      <mesh position={[0, 13, 0]} castShadow>
        <coneGeometry args={[3, 7, 8]} />
        <meshStandardMaterial color="#3a7532" />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#666" roughness={0.9} />
    </mesh>
  );
};

const Building = ({ position, scale = 1, height = 10 }: { position: [number, number, number], scale?: number, height?: number }) => {
  const isGlass = useMemo(() => Math.random() > 0.5, []);
  const color = useMemo(() => {
    const colors = ['#1e293b', '#334155', '#475569', '#0f172a'];
    return colors[Math.floor(Math.random() * colors.length)];
  }, []);

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, height, 4]} />
        <meshStandardMaterial 
          color={color} 
          roughness={isGlass ? 0.1 : 0.8} 
          metalness={isGlass ? 0.8 : 0.2} 
        />
      </mesh>
      {/* Roof detail */}
      <mesh position={[0, height + 0.5, 0]} castShadow>
        <boxGeometry args={[3.5, 1, 3.5]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
};

const TrackMesh = () => {
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      <mesh position={[TRACK_WIDTH/2, TRACK_HEIGHT/2, -0.1]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#1a472a" roughness={1} />
      </mesh>
      
      {segments.map((seg) => (
        <mesh key={seg.id} position={[seg.centerX, seg.centerY, 0.1]} rotation={[0, 0, seg.angle]} receiveShadow>
          <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}

      {corners.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, 0.1]} receiveShadow>
          <circleGeometry args={[TRACK_RADIUS, 32]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}
      
      <mesh position={[625, 750, 0.11]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, TRACK_RADIUS * 2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
};

const GameScene = ({ 
  players, 
  followId 
}: { 
  players: Record<string, Player>, 
  followId: string | null 
}) => {
  const { camera } = useThree();

  const decorations = useMemo(() => {
    const items: { type: 'tree' | 'rock' | 'building', pos: [number, number, number], scale: number, height?: number }[] = [];
    const count = 450;
    const seed = 42;
    const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    let s = seed;

    for (let i = 0; i < count; i++) {
      const x = rng(s++) * 2400 - 800; 
      const z = rng(s++) * 2200 - 800;
      
      if (!isPointOnTrackMath(x, z, 30)) {
        const rand = rng(s++);
        let type: 'tree' | 'rock' | 'building';
        let scale = 1;
        let height = 10;

        if (rand > 0.7) {
          type = 'building';
          scale = 3 + rng(s++) * 4;
          height = 15 + rng(s++) * 40;
        } else if (rand > 0.3) {
          type = 'tree';
          scale = 2.5 + rng(s++) * 3.5;
        } else {
          type = 'rock';
          scale = 3 + rng(s++) * 5;
        }
        
        items.push({ type, pos: [x, 0, z], scale, height });
      }
    }
    return items;
  }, []);
  
  useFrame(() => {
    if (followId && players[followId]) {
      const p = players[followId];
      
      const dist = 40;
      const height = 20;
      const angle = p.angle;
      
      const targetCamX = p.x - Math.cos(angle) * dist;
      const targetCamZ = p.y - Math.sin(angle) * dist;
      
      camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
      camera.lookAt(p.x, 0, p.y);
    }
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight skyColor="#ffffff" groundColor="#ffffff" intensity={1.0} />
      <directionalLight 
        position={[600, 300, 425]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-700}
        shadow-camera-right={700}
        shadow-camera-top={700}
        shadow-camera-bottom={-700}
        shadow-camera-far={1500}
        shadow-bias={-0.0001}
      />
      
      <TrackMesh />
      
      {decorations.map((item, i) => {
        if (item.type === 'tree') return <Tree key={i} position={item.pos} scale={item.scale} />;
        if (item.type === 'rock') return <Rock key={i} position={item.pos} scale={item.scale} />;
        if (item.type === 'building') return <Building key={i} position={item.pos} scale={item.scale} height={item.height} />;
        return null;
      })}
      
      {Object.values(players).map(p => {
        return (
          <group key={p.id} position={[p.x, 0, p.y]} rotation={[0, -p.angle + Math.PI/2, 0]}>
            <CarModel color={p.color} drifting={p.drifting} isLocal={p.id === followId} />
            <Text position={[0, 10, 0]} rotation={[0, Math.PI, 0]} fontSize={3} color="white" anchorX="center" anchorY="middle" outlineWidth={0.2} outlineColor="black">
              {p.name}
            </Text>
          </group>
        );
      })}
    </>
  );
};

export default function GameRenderer({ players, followId }: { players: Record<string, Player>, followId: string | null }) {
  return (
    <Canvas shadows>
      <color attach="background" args={['#0f172a']} />
      <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={60} far={1000} />
      <fog attach="fog" args={['#0f172a', 100, 900]} />
      <GameScene players={players} followId={followId} />
      <OrbitControls enabled={false} />
    </Canvas>
  );
}
