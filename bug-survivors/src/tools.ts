// The wave-ladder PostHog tools: Data Pipelines, Batch Exports, Scouts, HogQL, Logs, Replay Vision, AI Observability,
// Revenue Analytics, Endpoints and PostHog Desktop. Same contract as weapons.ts: one function per tool (base LV 1-5 and
// evolved form), damage before might/crit (the scene applies those), drawing in drawTools().
import Phaser from 'phaser';
import { spr } from '@shared/kit';
import { burst, floatText } from '@shared/juice';
import { W, H } from '@shared/ui';
import type { GameScene, Enemy } from './game';
import type { WState } from './weapons';

type Fn = (g: GameScene, w: WState, dt: number) => void;
const GOLD = 0xf8d878;

interface Pipe { x1: number; y1: number; x2: number; y2: number; t: number; life: number; tick: number }
interface Scout { s: Phaser.GameObjects.Image; a: number; t: number }
interface LogLine { x: number; y: number; vx: number; vy: number; life: number; id: number; vert: boolean; len: number; w: number }
interface Scanner { x: number; y: number; a: number; t: number; life: number; kind: number; zap: number }
interface Turret { s: Phaser.GameObjects.Image; t: number; life: number }

/** Distance from (px, py) to the segment (x1,y1)-(x2,y2), and how far along it (0-1). */
function seg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return [Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)), t];
}

/** The direction toward the most bugs near the hog (sampled). */
function crowdDir(g: GameScene, r: number): [number, number] {
  const p = g.player;
  let sx = 0, sy = 0;
  for (const e of g.near(p.x, p.y, r)) {
    if (e.arch === 'crate') continue;
    const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
    sx += dx / d; sy += dy / d;
  }
  const l = Math.hypot(sx, sy);
  if (l < 0.01) { const a = Math.random() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
  return [sx / l, sy / l];
}

// ---------------------------------------------------------------- Data Pipelines
const dataPipelines: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const pipes = w.items as Pipe[];
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 2.6 : 4.6 - 0.35 * L) * s.cd;
    const len = (w.evo ? 190 : 110 + 15 * L) * s.area;
    const n = 1 + (s.amount >= 2 ? 1 : 0);
    let [dx, dy] = crowdDir(g, 170);
    for (let k = 0; k < n; k++) {
      if (k) [dx, dy] = [-dx, -dy];
      pipes.push({ x1: p.x, y1: p.y, x2: p.x + dx * len, y2: p.y + dy * len, t: 0, life: 3.5, tick: 0 });
    }
    g.sfx('vacuum', 0.35, 200);
  }
  const dmg = w.evo ? 26 : 8 + 4 * L, endDmg = w.evo ? 60 : 20 + 8 * L;
  for (let i = pipes.length - 1; i >= 0; i--) {
    const q = pipes[i];
    q.t += dt; q.tick -= dt;
    if (q.t >= q.life) { pipes.splice(i, 1); continue; }
    const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1) || 1;
    const ux = (q.x2 - q.x1) / len, uy = (q.y2 - q.y1) / len;
    // Bugs touching the pipe get sucked along it toward the destination.
    for (const e of g.near((q.x1 + q.x2) / 2, (q.y1 + q.y2) / 2, len / 2 + 12)) {
      if (e.boss || e.arch === 'crate') continue;
      const [d] = seg(e.s.x, e.s.y, q.x1, q.y1, q.x2, q.y2);
      if (d > 10 * s.area + e.r) continue;
      e.kx += ux * 420 * dt * e.kb; e.ky += uy * 420 * dt * e.kb;
      e.hitAt.pipeT = g.elapsed + 0.4;
      if ((e.hitAt.pipe ?? 0) > g.elapsed) continue;
      e.hitAt.pipe = g.elapsed + 0.4;
      g.damage(e, dmg, 0, 0, 'data_pipelines', true);
    }
    if (q.tick <= 0) {
      // The destination end: whatever comes out gets hit hard.
      q.tick = 0.5;
      for (const e of g.near(q.x2, q.y2, 22 * s.area)) g.damage(e, endDmg, ux * 160, uy * 160, 'data_pipelines');
    }
  }
};

/** Hog Transformations: a bug that dies in a pipe fires back out as a homing event (called from kill()). */
export function pipeTransform(g: GameScene, e: Enemy) {
  const w = g.weapons.get('data_pipelines');
  if (!w?.evo || (e.hitAt.pipeT ?? 0) < g.elapsed || g.projs.length > 250) return;
  const t = g.nearest(e.s.x, e.s.y, 200);
  if (!t) return;
  const a = Math.atan2(t.s.y - e.s.y, t.s.x - e.s.x);
  const pr = g.shoot('homing', e.s.x, e.s.y, Math.cos(a) * 220, Math.sin(a) * 220, 34, 1.6, 2, 'data_pipelines');
  pr.homing = t; pr.speed = 220; pr.s.setTint(0xfca044);
}

// ---------------------------------------------------------------- Batch Exports
/** Every hit tags the bug with the damage dealt (called from damage()); the export turns a share of it into a bulk hit. */
export function batchTag(g: GameScene, e: Enemy, d: number) {
  if (g.weapons.has('batch_exports')) e.batch = (e.batch ?? 0) + d;
}

const batchExports: Fn = (g, w, dt) => {
  const L = w.level;
  w.timer -= dt;
  if (w.items.length && w.items[0].at <= g.elapsed) { const b = w.items.shift(); runExport(g, w, b.k, true); }
  if (w.timer > 0) return;
  w.timer = Math.max(5, 10.5 - 0.9 * L) * Math.max(0.6, g.st.cd);
  const k = w.evo ? 0.45 : 0.2 + 0.05 * L;
  runExport(g, w, k, false);
  if (w.evo) w.items.push({ at: g.elapsed + 1, k: k * 0.5 }); // Backfill: the export replays at half strength
};

function runExport(g: GameScene, w: WState, k: number, replay: boolean) {
  let rows = 0;
  for (const e of [...g.enemies]) {
    const b = e.batch ?? 0;
    if (b <= 0 || !e.alive) continue;
    if (!replay) e.batch = 0;
    rows++;
    g.damage(e, b * k * (e.boss ? 0.35 : 1), 0, 0, 'batch_exports', true, true);
  }
  if (!rows) return;
  if (!replay && rows > w.cnt) w.cnt = rows;
  if (rows >= 100) g.earn('batch-exports');
  const p = g.player;
  floatText(g, p.x, p.y - 30, `${replay ? 'BACKFILLED' : 'EXPORTED'} ${rows} ROWS`, 0x3cbcfc, 0.9);
  for (let i = 0; i < Math.min(8, rows); i++) {
    const b = g.add.image(p.x, p.y, spr('crate')).setDepth(19).setScale(0.5);
    const cam = g.cameras.main;
    g.tweens.add({ targets: b, x: cam.scrollX + W + 20, y: cam.scrollY + Phaser.Math.Between(20, H - 20), duration: 600 + i * 40,
      ease: 'Quad.In', onComplete: () => b.destroy() });
  }
  g.sfx('chest', 0.4, 200);
}

// ---------------------------------------------------------------- Scouts
const scouts: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const troop = w.items as Scout[];
  const n = Math.min(8, 1 + L + s.amount + (w.evo ? 2 : 0));
  while (troop.length < n) troop.push({ s: g.add.image(p.x, p.y, spr('drone')).setDepth(11).setTint(w.evo ? GOLD : 0x3cbcfc), a: Math.random() * 6.28, t: Math.random() });
  const flagFor = w.major ? 8 : 4;
  troop.forEach((sc, i) => {
    sc.a += dt * (0.8 + (i % 3) * 0.2);
    const r = 60 + 30 * Math.sin(g.elapsed * 0.7 + i * 1.7);
    const tx = p.x + Math.cos(sc.a + i) * r, ty = p.y + Math.sin(sc.a * 1.3 + i) * r * 0.8;
    sc.s.x += (tx - sc.s.x) * Math.min(1, dt * 3);
    sc.s.y += (ty - sc.s.y) * Math.min(1, dt * 3);
    sc.t -= dt;
    if (sc.t > 0) return;
    sc.t = Math.max(0.4, 1.3 - 0.12 * L) * s.cd;
    // Flag the nearest unflagged bug: flagged bugs take +40% from everything.
    let best: Enemy | null = null, bd = 90 * 90 * s.area * s.area;
    for (const e of g.near(sc.s.x, sc.s.y, 90 * s.area)) {
      if (e.arch === 'crate' || (e.flagT ?? 0) > g.elapsed) continue;
      const d = (e.s.x - sc.s.x) ** 2 + (e.s.y - sc.s.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    best.flagT = g.elapsed + flagFor;
    g.zapLine(sc.s.x, sc.s.y, best.s.x, best.s.y, 0x3cbcfc);
    g.damage(best, 6 + 2 * L, 0, 0, 'scouts', true);
    w.cnt++;
    if (w.evo && w.cnt % 12 === 0) prLaser(g);
  });
};

/** Troop of 90: twelve signals make a report, and the report opens a PR: a laser through the flagged bugs. */
function prLaser(g: GameScene) {
  const p = g.player;
  let far: Enemy | null = null, fd = 0;
  for (const e of g.enemies) {
    if ((e.flagT ?? 0) < g.elapsed) continue;
    const d = (e.s.x - p.x) ** 2 + (e.s.y - p.y) ** 2;
    if (d > fd && d < 320 * 320) { fd = d; far = e; }
  }
  if (!far) return;
  const a = Math.atan2(far.s.y - p.y, far.s.x - p.x), ex = p.x + Math.cos(a) * 340, ey = p.y + Math.sin(a) * 340;
  for (const e of g.near((p.x + ex) / 2, (p.y + ey) / 2, 175)) {
    if (seg(e.s.x, e.s.y, p.x, p.y, ex, ey)[0] < 10 + e.r) g.damage(e, 90, Math.cos(a) * 120, Math.sin(a) * 120, 'scouts');
  }
  const fx = g.add.graphics().setDepth(19);
  fx.lineStyle(7, 0x3cbcfc, 0.35).lineBetween(p.x, p.y, ex, ey).lineStyle(2, 0xfcfcfc, 1).lineBetween(p.x, p.y, ex, ey);
  g.tweens.add({ targets: fx, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
  floatText(g, p.x, p.y - 26, 'PR MERGED', 0x3cbcfc, 0.8);
  g.sfx('bossshot', 0.5, 150);
}

// ---------------------------------------------------------------- HogQL
export const hogqlThreshold = (w: WState) => (w.evo ? 0.15 : 0.05 + 0.01 * w.level);

const hogql: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.items.length && w.items[0] <= g.elapsed) { w.items.shift(); runQuery(g, w); }
  if (w.timer > 0) return;
  w.timer = (w.evo ? 3 : Math.max(3.5, 6.5 - 0.5 * w.level)) * Math.max(0.6, g.st.cd);
  runQuery(g, w);
  if (w.major) w.items.push(g.elapsed + 0.6);
};

function runQuery(g: GameScene, w: WState) {
  const thr = hogqlThreshold(w);
  const cam = g.cameras.main;
  let n = 0;
  for (const e of [...g.enemies]) {
    if (!e.alive || e.arch === 'crate') continue;
    if (e.s.x < cam.scrollX - 8 || e.s.x > cam.scrollX + W + 8 || e.s.y < cam.scrollY - 8 || e.s.y > cam.scrollY + H + 8) continue;
    if (e.reaper) continue;
    if (e.boss || e.twin) { g.damage(e, e.maxHp * 0.008, 0, 0, 'hogql', true, true); continue; }
    if (e.hp < e.maxHp * thr) { n++; g.damage(e, e.hp + 1, 0, 0, 'hogql', true, true); }
  }
  const p = g.player;
  floatText(g, p.x, p.y - 34, `DELETE FROM bugs WHERE hp < ${Math.round(thr * 100)}%`, 0x58d854, 0.55);
  if (n) floatText(g, p.x, p.y - 24, `${n} rows deleted`, 0xfcfcfc, 0.5);
  g.hogqlFlash = 0.18;
  g.sfx('zap', 0.4, 200);
}

// ---------------------------------------------------------------- Logs
let logId = 1;
const logs: Fn = (g, w, dt) => {
  const s = g.st, L = w.level;
  const lines = w.items as LogLine[];
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 1.8 : 2.8 - 0.2 * L) * s.cd;
    const cam = g.cameras.main;
    const n = (w.evo ? 2 : 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0)) + Math.min(1, s.amount);
    const thick = 5 * s.area * (w.major ? 2 : 1);
    for (let k = 0; k < n; k++) {
      const fromTop = (logId + k) % 2 === 0;
      const y = fromTop ? cam.scrollY - 6 - k * 26 : cam.scrollY + H + 6 + k * 26;
      lines.push({ x: cam.scrollX, y, vx: 0, vy: fromTop ? 110 : -110, life: 3, id: logId++, vert: false, len: W, w: thick });
      if (w.evo) {
        const fromLeft = k % 2 === 0;
        const x = fromLeft ? cam.scrollX - 6 - k * 26 : cam.scrollX + W + 6 + k * 26;
        lines.push({ x, y: cam.scrollY, vx: fromLeft ? 160 : -160, vy: 0, life: 3.4, id: logId++, vert: true, len: H, w: thick });
      }
    }
  }
  const dmg = w.evo ? 22 : 7 + 3 * L;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    l.life -= dt;
    l.x += l.vx * dt; l.y += l.vy * dt;
    if (l.life <= 0) { lines.splice(i, 1); continue; }
    const key = `log${l.id}`;
    const cx = l.vert ? l.x : l.x + l.len / 2, cy = l.vert ? l.y + l.len / 2 : l.y;
    for (const e of g.near(cx, cy, l.len / 2 + 6)) {
      const d = l.vert ? Math.abs(e.s.x - l.x) : Math.abs(e.s.y - l.y);
      if (d > l.w + e.r || e.hitAt[key]) continue;
      e.hitAt[key] = 1;
      g.damage(e, dmg, l.vx * 0.4, l.vy * 0.4, 'logs');
    }
  }
};

// ---------------------------------------------------------------- Replay Vision
const replayVision: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const sc = w.items as Scanner[];
  w.timer -= dt;
  const max = (w.evo ? 4 : 1 + Math.floor(L / 2)) + Math.min(1, s.amount);
  if (w.timer <= 0 && sc.length < max) {
    w.timer = (w.evo ? 1.5 : 3.2 - 0.25 * L) * s.cd;
    sc.push({ x: p.x, y: p.y, a: Math.random() * 6.28, t: 0, life: w.evo ? 8 : 6, kind: w.cnt++ % 4, zap: 0.2 });
  }
  const range = (w.evo ? 120 : 85 + 5 * L) * s.area, half = (0.45 + 0.04 * L) * (w.evo ? 1.3 : 1);
  const dmg = w.evo ? 30 : 12 + 5 * L;
  for (let i = sc.length - 1; i >= 0; i--) {
    const q = sc[i];
    q.t += dt; q.a += dt * 1.6; q.zap -= dt;
    if (q.t >= q.life) { sc.splice(i, 1); continue; }
    const inCone = g.near(q.x, q.y, range).filter((e) => {
      if (e.arch === 'crate') return false;
      const a = Math.atan2(e.s.y - q.y, e.s.x - q.x);
      return Math.abs(Phaser.Math.Angle.Wrap(a - q.a)) < half;
    });
    for (const e of inCone) e.hitAt.seen = g.elapsed + 0.3; // reveals Heisenbugs
    if (q.zap > 0 || !inCone.length) continue;
    q.zap = w.major ? 0.2 : 0.4;
    // Sees Everything: Monitor zaps the nearest, Scorer the toughest (x2), Classifier slows, Summarizer pulls gems.
    const kind = w.evo ? q.kind : 0;
    let t = inCone[0];
    if (kind === 1) t = inCone.reduce((a, b) => (b.hp > a.hp ? b : a), t);
    else t = inCone.reduce((a, b) => ((b.s.x - q.x) ** 2 + (b.s.y - q.y) ** 2 < (a.s.x - q.x) ** 2 + (a.s.y - q.y) ** 2 ? b : a), t);
    g.zapLine(q.x, q.y, t.s.x, t.s.y, kind === 1 ? GOLD : 0xa4e4fc);
    g.damage(t, dmg * (kind === 1 ? 2 : 1), 0, 0, 'replay_vision');
    if (kind === 2) for (const e of inCone) e.hitAt.slowUntil = g.elapsed + 0.8;
    if (kind === 3) g.pullGems(q.x, q.y, range);
  }
};

// ---------------------------------------------------------------- AI Observability
const aiObservability: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const root = g.nearest(p.x, p.y, 200 * s.area);
  if (!root) { w.timer = 0.2; return; }
  w.timer = (w.evo ? 0.9 : 1.7 - 0.15 * L) * s.cd;
  const depth = (L >= 4 ? 3 : 2) + (w.evo ? 1 : 0), branch = 2 + (w.major ? 1 : 0) + Math.min(1, s.amount);
  const hit = new Set<Enemy>([root]);
  const fx = g.add.graphics().setDepth(19);
  const dmg0 = w.evo ? 40 : 18 + 6 * L;
  const spanHit = (e: Enemy, dmg: number) => {
    // Evaluations: a span on a bug that was already traced lands as a crit.
    const again = w.evo && (e.hitAt.trace ?? 0) > g.elapsed;
    e.hitAt.trace = g.elapsed + 3;
    g.damage(e, dmg * (again ? g.st.critMul : 1), 0, 0, 'ai_observability', again);
  };
  spanHit(root, dmg0);
  let frontier = [root];
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: Enemy[] = [];
    for (const n of frontier) {
      const kids = g.near(n.s.x, n.s.y, 70 * s.area).filter((e) => !hit.has(e) && e.arch !== 'crate')
        .sort((a, b) => ((a.s.x - n.s.x) ** 2 + (a.s.y - n.s.y) ** 2) - ((b.s.x - n.s.x) ** 2 + (b.s.y - n.s.y) ** 2)).slice(0, branch);
      for (const k of kids) {
        hit.add(k);
        fx.lineStyle(1, 0xd800cc, 0.9).lineBetween(n.s.x, n.s.y, k.s.x, k.s.y);
        spanHit(k, dmg0 * 0.75 ** d);
        next.push(k);
      }
    }
    frontier = next;
  }
  fx.fillStyle(0xf878f8, 1).fillCircle(root.s.x, root.s.y, 3);
  g.tweens.add({ targets: fx, alpha: 0, duration: 220, onComplete: () => fx.destroy() });
  g.sfx('zap', 0.3, 90);
};

// ---------------------------------------------------------------- Revenue Analytics
export const mrrMul = (g: GameScene, w: WState) => Math.min(6, 1 + g.goldGrabbed / 150) * (w.evo ? 1.25 ** Math.max(0, g.wave - 1) : 1);

const revenue: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const t = g.nearest(p.x, p.y, 240);
  if (!t) { w.timer = 0.2; return; }
  w.timer = (1.6 - 0.12 * L) * s.cd;
  const n = 1 + Math.min(2, s.amount);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(t.s.y - p.y, t.s.x - p.x) + (i - (n - 1) / 2) * 0.25;
    const pr = g.shoot('coin', p.x, p.y, Math.cos(a) * 170, Math.sin(a) * 170, (20 + 6 * L) * mrrMul(g, w), 1.8, 3, 'revenue');
    pr.s.setScale(1.6);
    if (w.major) pr.boom = 30;
  }
  g.sfx('coin', 0.35, 90);
};

// ---------------------------------------------------------------- Endpoints
const endpoints: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const tur = w.items as Turret[];
  const max = w.evo ? 3 : 1 + (w.major ? 1 : 0);
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 4 : 7 - 0.6 * L) * s.cd;
    if (tur.length >= max) tur.shift()!.s.destroy();
    const im = g.add.image(p.x, p.y + 4, g.crestKey(), g.crestFrameOf('platform-features')).setDepth(4);
    tur.push({ s: im, t: 0.3, life: w.evo ? Infinity : 9 });
    g.tweens.add({ targets: im, y: im.y - 6, duration: 120, yoyo: true });
  }
  const dmg = w.evo ? 34 : 14 + 6 * L, rate = Math.max(0.3, 0.9 - 0.08 * L) * s.cd * (w.evo ? 0.7 : 1);
  for (let i = tur.length - 1; i >= 0; i--) {
    const q = tur[i];
    q.life -= dt; q.t -= dt;
    if (q.life <= 0) { q.s.destroy(); tur.splice(i, 1); continue; }
    if (q.life < 1.5) q.s.setAlpha(Math.floor(q.life * 10) % 2 ? 1 : 0.4);
    if (q.t > 0) continue;
    const t = g.nearest(q.s.x, q.s.y, 200);
    if (!t) { q.t = 0.2; continue; }
    q.t = rate;
    const a = Math.atan2(t.s.y - q.s.y, t.s.x - q.s.x);
    g.shoot('shot', q.s.x, q.s.y - 4, Math.cos(a) * 240, Math.sin(a) * 240, dmg, 1, 2, 'endpoints').s.setTintFill(0x9878f8);
  }
};

// ---------------------------------------------------------------- PostHog Desktop
const desktop: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const n = Math.min(9, (w.evo ? 9 : 2 + L) + s.amount);
  while (w.orbs.length < n) w.orbs.push(g.add.image(p.x, p.y, spr('ai_bolt')).setDepth(9).setTint(w.evo ? GOLD : 0xd8b8f8));
  while (w.orbs.length > n) w.orbs.pop()!.destroy();
  if (n >= 9) g.earn('posthog-desktop');
  const rad = 34 * s.area, spin = g.elapsed * 1.2;
  w.orbs.forEach((o, i) => o.setPosition(p.x + Math.cos(spin + (i / n) * 6.283) * rad, p.y + Math.sin(spin + (i / n) * 6.283) * rad * 0.8));
  w.timer -= dt;
  w.nova -= dt;
  const dmg = w.evo ? 22 : 8 + 3 * L;
  const fire = (o: Phaser.GameObjects.Image, volley: number) => {
    const t = g.nearest(o.x, o.y, 220);
    if (!t) return;
    for (let k = 0; k < volley; k++) {
      const a = Math.atan2(t.s.y - o.y, t.s.x - o.x) + (k - (volley - 1) / 2) * 0.3;
      const pr = g.shoot('ai_bolt', o.x, o.y, Math.cos(a) * 230, Math.sin(a) * 230, dmg, 1.4, 1, 'desktop');
      pr.homing = t; pr.speed = 230;
    }
  };
  if (w.timer <= 0) {
    // One agent at a time, round the ring.
    w.timer = (1.8 / n) * s.cd * (w.major ? 0.5 : 1);
    const o = w.orbs[w.cnt++ % n];
    if (o) fire(o, 1);
  }
  if (w.evo && w.nova <= 0) {
    // Dopamine Mode: every 5 s all nine fire a volley.
    w.nova = 5 * Math.max(0.5, s.cd);
    w.orbs.forEach((o) => fire(o, 3));
    burst(g, p.x, p.y, 0xd8b8f8, 16, { speed: 140, gravity: 0 });
    g.sfx('zap', 0.5, 150);
  }
};

export const TOOL_FNS: Record<string, Fn> = {
  data_pipelines: dataPipelines, batch_exports: batchExports, scouts, hogql, logs, replay_vision: replayVision,
  ai_observability: aiObservability, revenue, endpoints, desktop,
};

/** Pipes, log lines and scanner cones, drawn each frame. */
export function drawTools(g: GameScene, fx: Phaser.GameObjects.Graphics) {
  const t = g.time.now;
  const dp = g.weapons.get('data_pipelines');
  if (dp) {
    for (const q of dp.items as Pipe[]) {
      const k = q.t < 0.2 ? q.t / 0.2 : q.t > q.life - 0.4 ? (q.life - q.t) / 0.4 : 1;
      const x2 = q.x1 + (q.x2 - q.x1) * Math.min(1, q.t / 0.2), y2 = q.y1 + (q.y2 - q.y1) * Math.min(1, q.t / 0.2);
      fx.lineStyle(9, 0x7c7c7c, 0.55 * k).lineBetween(q.x1, q.y1, x2, y2);
      fx.lineStyle(5, dp.evo ? 0xf8b800 : 0xe45c10, 0.8 * k).lineBetween(q.x1, q.y1, x2, y2);
      for (let i = 0; i < 6; i++) {
        const f = (t / 300 + i / 6) % 1;
        fx.fillStyle(0xfcfcfc, k).fillRect(Math.round(q.x1 + (x2 - q.x1) * f) - 1, Math.round(q.y1 + (y2 - q.y1) * f) - 1, 2, 2);
      }
      fx.fillStyle(0x3c3c3c, k).fillCircle(x2, y2, 5).lineStyle(1, 0xfca044, k).strokeCircle(x2, y2, 7);
    }
  }
  const lg = g.weapons.get('logs');
  if (lg) {
    for (const l of lg.items as LogLine[]) {
      const a = Math.min(1, l.life);
      if (l.vert) fx.fillStyle(0x58d854, 0.07 * a).fillRect(l.x - l.w, l.y, l.w * 2, l.len);
      else fx.fillStyle(0x58d854, 0.07 * a).fillRect(l.x, l.y - l.w, l.len, l.w * 2);
      // "Text": a row of little glyph blocks.
      for (let i = 0; i < 30; i++) {
        const h = ((l.id * 7 + i * 13) % 5);
        if (h < 2) continue;
        const col = h === 4 ? 0xf8d878 : 0xb8f818;
        if (l.vert) fx.fillStyle(col, 0.7 * a).fillRect(Math.round(l.x) - 1, Math.round(l.y + i * (l.len / 30)), 2, h + 1);
        else fx.fillStyle(col, 0.7 * a).fillRect(Math.round(l.x + i * (l.len / 30)), Math.round(l.y) - 1, h + 1, 2);
      }
    }
  }
  const rv = g.weapons.get('replay_vision');
  if (rv) {
    const range = (rv.evo ? 120 : 85 + 5 * rv.level) * g.st.area, half = (0.45 + 0.04 * rv.level) * (rv.evo ? 1.3 : 1);
    for (const q of rv.items as Scanner[]) {
      const a = Math.min(1, (q.life - q.t) / 0.5);
      const col = rv.evo ? [0xa4e4fc, GOLD, 0x58d854, 0xf878f8][q.kind] : 0xa4e4fc;
      fx.fillStyle(col, 0.08 * a).slice(q.x, q.y, range, q.a - half, q.a + half).fillPath();
      fx.lineStyle(1, col, 0.4 * a).beginPath().arc(q.x, q.y, range, q.a - half, q.a + half).strokePath();
      fx.fillStyle(0xfcfcfc, a).fillCircle(q.x, q.y, 3).fillStyle(0x151515, a).fillCircle(q.x + Math.cos(q.a) * 1.5, q.y + Math.sin(q.a) * 1.5, 1.5);
    }
  }
}
