export const TRACK_WIDTH = 1200;
export const TRACK_HEIGHT = 850;

// Car physics constants
export const ACCELERATION = 0.04;
export const MAX_SPEED = 1.8;
export const NITRO_SPEED = 3.2;
export const NITRO_ACCEL = 0.08;
export const FRICTION = 0.96;
export const TURN_SPEED = 0.035;
export const DRIFT_FACTOR = 0.94;

// Track Geometry
export const TRACK_RADIUS = 50; // Slightly narrower for more technical turns
export const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
export function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

export function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

export function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

export const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};
