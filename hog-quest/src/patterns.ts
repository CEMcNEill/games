// Fixed library of bullet patterns. The theme picks 1-3 per enemy by name and the kit adds one
// "lesson" pattern per enemy slot (see choreo.ts); nothing else about a pattern is configurable, so
// every combination is known to be dodgeable. Each pattern returns an emitter run every frame.
export interface Box { x: number; y: number; w: number; h: number }

export type BulletKind = 'norm' | 'blue' | 'floor';

export interface SpawnOpts {
  kind?: BulletKind; // blue: only hurts while the soul moves
  bounce?: boolean;  // bounces off the box walls
  ay?: number;       // vertical acceleration
  gemAt?: number;    // seconds until it turns into a collectible gem
  life?: number;
}

export interface PatternCtx {
  box: Box;          // live: squeeze changes it
  soul: { x: number; y: number };
  speed: number;     // difficulty x product effects x mood
  density: number;
  boss: boolean;
  spawn: (x: number, y: number, vx: number, vy: number, o?: SpawnOpts) => void;
  laser: (horiz: boolean, pos: number, width: number, warn?: number, dur?: number) => void;
  gravity: (on: boolean) => void;
  resize: (w: number, h: number) => void; // target size, the box eases towards it (stays centred)
  mark: (x: number, y: number, secs: number) => void; // blinking warning cross
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
  // A few bullets that bounce around the box.
  bounce: (c) => every(0.9 / c.density, (n) => {
    if (n > (c.boss ? 6 : 4)) return;
    const a = rnd(0.5, 1.2) * (n % 2 ? 1 : -1);
    c.spawn(c.box.x + c.box.w / 2, c.box.y + 6, Math.sin(a) * 60 * c.speed, Math.cos(a) * 60 * c.speed, { bounce: true, life: 4.5 });
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

  // ---------------------------------------------------------------- new rules
  // Warning lines, then beams: across the box, then down it. Stand where the line isn't.
  laser: (c) => every(1.1 / Math.min(1.4, c.density), (n) => {
    const horiz = n % 2 === 0;
    const span = horiz ? c.box.h : c.box.w;
    const lo = horiz ? c.box.y : c.box.x;
    const pos = lo + 10 + ((n * 0.37 + Math.random() * 0.3) % 1) * (span - 20);
    c.laser(horiz, pos, 12, 0.75 / Math.max(0.8, c.speed), 0.35);
  }),
  // Columns fall with a gap that snakes left and right: thread the needle.
  thread: (c) => {
    let gx = c.box.x + c.box.w / 2, dir = 1;
    return every(0.52 / Math.min(1.2, c.density), () => {
      gx += dir * rnd(6, 14);
      if (gx < c.box.x + 22 || gx > c.box.x + c.box.w - 22) { dir = -dir; gx = Math.max(c.box.x + 22, Math.min(c.box.x + c.box.w - 22, gx)); }
      for (let x = c.box.x + 4; x < c.box.x + c.box.w; x += 11) {
        if (Math.abs(x - gx) < 20) continue;
        c.spawn(x, c.box.y - 4, 0, 48 * c.speed);
      }
    });
  },
  // Slow bullets that turn into gems halfway down: touch a gem for TP.
  gems: (c) => every(0.3 / c.density, (n) => {
    const gem = n % 3 !== 2;
    c.spawn(rnd(c.box.x + 6, c.box.x + c.box.w - 6), c.box.y - 4, 0, 50 * c.speed, gem ? { gemAt: rnd(0.8, 1.3) } : {});
  }),
  // Blue walls: they only hurt if you move. Stay still and they pass right through you.
  stoplight: (c) => every(1.5 / Math.min(1.3, c.density), (n) => {
    const left = n % 2 === 0;
    for (let y = c.box.y + 4; y < c.box.y + c.box.h; y += 7) {
      c.spawn(left ? c.box.x - 4 : c.box.x + c.box.w + 4, y, (left ? 60 : -60) * c.speed, 0, { kind: 'blue' });
    }
    // A few ordinary bullets from the top keep you honest.
    if (n % 2 === 1) c.spawn(rnd(c.box.x + 10, c.box.x + c.box.w - 10), c.box.y - 4, 0, 45 * c.speed);
  }),
  // Your soul gets heavy: UP jumps. Bullets slide along the floor.
  gravity: (c) => {
    c.gravity(true);
    return every(0.95 / Math.min(1.3, c.density), (n) => {
      const left = n % 2 === 0;
      const y = c.box.y + c.box.h - 6;
      c.spawn(left ? c.box.x - 4 : c.box.x + c.box.w + 4, y, (left ? 62 : -62) * c.speed, 0, { kind: 'floor' });
      if (n % 3 === 2) c.spawn(left ? c.box.x - 4 : c.box.x + c.box.w + 4, y - 22, (left ? 62 : -62) * c.speed, 0);
    });
  },
  // The box shrinks while rain falls.
  squeeze: (c) => {
    c.resize(Math.max(64, c.box.w * 0.5), Math.max(48, c.box.h * 0.65));
    return every(0.3 / c.density, () => {
      c.spawn(rnd(c.box.x + 4, c.box.x + c.box.w - 4), c.box.y - 4, 0, 56 * c.speed);
    });
  },
  // Bullets fly in, stop, and pop into small rings.
  burst: (c) => {
    const pops: { t: number; x: number; y: number }[] = [];
    let time = 0;
    const emit = every(0.9 / Math.min(1.4, c.density), () => {
      const x = rnd(c.box.x + 20, c.box.x + c.box.w - 20), y = rnd(c.box.y + 14, c.box.y + c.box.h - 14);
      pops.push({ t: time + 0.8, x, y });
      c.mark(x, y, 0.8); // a blinking cross shows where it will pop
    });
    return (t, dt) => {
      time = t;
      emit(t, dt);
      for (let i = pops.length - 1; i >= 0; i--) {
        if (pops[i].t > t) continue;
        const p = pops.splice(i, 1)[0];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + (p.x % 1);
          c.spawn(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, Math.cos(a) * 42 * c.speed, Math.sin(a) * 42 * c.speed);
        }
      }
    };
  },
};

export const PATTERN_IDS = Object.keys(PATTERNS);
