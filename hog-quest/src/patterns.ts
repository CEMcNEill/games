// Fixed library of bullet patterns. The theme picks 1-3 per enemy by name; nothing else about a
// pattern is configurable, so every combination is known to be dodgeable.
export interface Box { x: number; y: number; w: number; h: number }

export interface PatternCtx {
  box: Box;
  soul: { x: number; y: number };
  speed: number;   // difficulty x product effects
  density: number;
  spawn: (x: number, y: number, vx: number, vy: number) => void;
  boss: boolean;
}

export type Pattern = (ctx: PatternCtx) => (t: number, dt: number) => void;

/** Returns an emitter that fires `fn` every `every` seconds of pattern time. */
function every(interval: number, fn: (n: number, t: number) => void) {
  let acc = interval * 0.5, n = 0;
  return (t: number, dt: number) => {
    acc += dt;
    while (acc >= interval) { acc -= interval; fn(n++, t); }
  };
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const PATTERNS: Record<string, Pattern> = {
  // Bullets fall from the top at random x.
  rain: (c) => every(0.28 / c.density, () => {
    c.spawn(rnd(c.box.x + 4, c.box.x + c.box.w - 4), c.box.y - 4, rnd(-6, 6), 62 * c.speed);
  }),
  // Rows slide in from alternating sides.
  sweep: (c) => every(0.55 / c.density, (n) => {
    const left = n % 2 === 0;
    const y = c.box.y + 8 + ((n * 23) % Math.max(8, c.box.h - 16));
    for (let i = 0; i < 3; i++) c.spawn(left ? c.box.x - 4 - i * 10 : c.box.x + c.box.w + 4 + i * 10, y, (left ? 70 : -70) * c.speed, 0);
  }),
  // Rotating radial spray from the top centre.
  spiral: (c) => every(0.12 / c.density, (n) => {
    const a = n * 0.55;
    const ox = c.box.x + c.box.w / 2, oy = c.box.y - 2;
    const vy = Math.abs(Math.sin(a)) * 55 + 20;
    c.spawn(ox, oy, Math.cos(a) * 55 * c.speed, vy * c.speed);
  }),
  // A few bullets that bounce around the box (handled by the battle scene's bounce flag via vx sign).
  bounce: (c) => every(0.9 / c.density, (n) => {
    if (n > (c.boss ? 6 : 4)) return;
    const a = rnd(0.5, 1.2) * (n % 2 ? 1 : -1);
    c.spawn(c.box.x + c.box.w / 2, c.box.y + 6, Math.sin(a) * 60 * c.speed, Math.cos(a) * 60 * c.speed);
  }),
  // Bullets from the edges, aimed at the soul.
  aimed: (c) => every(0.5 / c.density, (n) => {
    const side = n % 4;
    const x = side === 0 ? c.box.x - 4 : side === 1 ? c.box.x + c.box.w + 4 : rnd(c.box.x, c.box.x + c.box.w);
    const y = side >= 2 ? (side === 2 ? c.box.y - 4 : c.box.y + c.box.h + 4) : rnd(c.box.y, c.box.y + c.box.h);
    const dx = c.soul.x - x, dy = c.soul.y - y, d = Math.hypot(dx, dy) || 1;
    c.spawn(x, y, (dx / d) * 60 * c.speed, (dy / d) * 60 * c.speed);
  }),
  // A vertical wall with a gap sweeps across.
  wall: (c) => every(1.3 / Math.min(1.3, c.density), () => {
    const gap = rnd(c.box.y + 10, c.box.y + c.box.h - 22);
    for (let y = c.box.y + 3; y < c.box.y + c.box.h; y += 8) {
      if (y > gap && y < gap + 22) continue;
      c.spawn(c.box.x - 4, y, 55 * c.speed, 0);
    }
  }),
  // A ring closes in on the box centre, with a gap.
  orbit: (c) => every(1.6 / Math.min(1.3, c.density), () => {
    const cx = c.box.x + c.box.w / 2, cy = c.box.y + c.box.h / 2, r = c.box.w * 0.62;
    const gapAt = Math.random() * Math.PI * 2;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.abs(((a - gapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.45) continue;
      c.spawn(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.cos(a) * 34 * c.speed, -Math.sin(a) * 34 * c.speed);
    }
  }),
};

export const PATTERN_IDS = Object.keys(PATTERNS);
