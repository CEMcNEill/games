// Weapon behaviours: one entry per PostHog product, each with its base (levels 1-5) and evolved form.
// Damage passed to g.damage() is before might/crit; the scene applies those.
import Phaser from 'phaser';
import { spr } from '@shared/kit';
import { burst } from '@shared/juice';
import type { GameScene, Enemy } from './game';
import type { ProductId, Stats } from './content';

export interface Flag { s: Phaser.GameObjects.Image; life: number; zap: number }
export interface Ring { r: number; max: number; hit: Set<Enemy>; x: number; y: number; dmg: number; kb: number }

export interface WState {
  id: ProductId;
  level: number;
  evo: boolean;
  timer: number;
  angle: number;
  flags: Flag[];
  orbs: Phaser.GameObjects.Image[];
  rings: Ring[];
  nova: number; // super evolution timer
}

export const newWeapon = (id: ProductId): WState => ({ id, level: 1, evo: false, timer: 0.3, angle: 0, flags: [], orbs: [], rings: [], nova: 1 });

const GOLD = 0xf8d878;

/** Survey aura radius and slow factor (also read by enemy movement and drawing). */
export function aura(w: WState | undefined, s: Stats) {
  if (!w) return { r: 0, slow: 1 };
  return w.evo ? { r: 88 * s.area, slow: 0.3 } : { r: (40 + 8 * w.level) * s.area, slow: 0.6 - 0.05 * w.level };
}

type Fn = (g: GameScene, w: WState, dt: number) => void;

const experiments: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  if (w.evo) {
    w.timer = 0.45 * s.cd;
    w.angle += 0.37;
    const per = 1 + Math.min(2, s.amount);
    for (let d = 0; d < 8; d++) {
      for (let i = 0; i < per; i++) {
        const a = w.angle + (d * Math.PI) / 4 + (i - (per - 1) / 2) * 0.13;
        g.shoot('shot', p.x, p.y, Math.cos(a) * 240, Math.sin(a) * 240, 30, 0.9, 3, 'experiments').s.setTintFill(d % 2 ? 0x3cbcfc : GOLD);
      }
    }
  } else {
    w.timer = (0.95 - 0.08 * L) * s.cd;
    const per = 1 + Math.floor(L / 2) + s.amount;
    const base = Math.atan2(g.facing.y, g.facing.x);
    for (const side of [0, Math.PI]) {
      for (let i = 0; i < per; i++) {
        const a = base + side + (i - (per - 1) / 2) * 0.2;
        g.shoot('shot', p.x, p.y, Math.cos(a) * 210, Math.sin(a) * 210, 9 + 3 * L, 0.85, L >= 4 ? 2 : 1, 'experiments');
      }
    }
  }
  g.sfx('shoot', 0.35, 70);
};

const errorTracking: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  const s = g.st, p = g.player, L = w.level;
  const target = g.nearest(p.x, p.y, w.evo ? 320 : 260);
  if (!target) { w.timer = 0.2; return; }
  w.timer = (w.evo ? 0.6 : 1.05 - 0.1 * L) * s.cd; // was 1.3 - 0.15L: too weak as a starting weapon
  const n = (w.evo ? 3 : L >= 5 ? 2 : 1) + s.amount;
  const sp = w.evo ? 210 : 150 + 15 * L;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(target.s.y - p.y, target.s.x - p.x) + (i - (n - 1) / 2) * 0.6;
    const pr = g.shoot('homing', p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, w.evo ? 42 : 16 + 6 * L, 2.4, w.evo ? 2 : L >= 3 ? 3 : 2,
      'error_tracking');
    pr.homing = target; pr.speed = sp;
    if (w.evo) { pr.chain = 2; pr.s.setTint(GOLD); }
  }
  g.sfx('shoot', 0.3, 70);
};

const sessionReplay: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const n = (w.evo ? 6 : Math.min(5, 1 + L)) + s.amount;
  const orbs = w.orbs;
  while (orbs.length < n) {
    const o = g.add.image(p.x, p.y, spr('orb')).setDepth(9);
    if (w.evo) o.setScale(1.5);
    orbs.push(o);
  }
  const rad = (w.evo ? 50 + 18 * Math.sin(g.elapsed * 2.2) : 26 + 4 * L) * s.area;
  const spin = g.elapsed * (w.evo ? 3.4 : 2.6 + 0.2 * L);
  const dmg = w.evo ? 28 : 7 + 3 * L, hitCd = w.evo ? 0.22 : 0.35, kb = w.evo ? 140 : 90, hitR = w.evo ? 8 : 5;
  orbs.forEach((o, i) => {
    const a = spin + (i / n) * Math.PI * 2;
    o.setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad);
    for (const e of g.near(o.x, o.y, hitR)) {
      if ((e.hitAt.orb ?? 0) > g.elapsed) continue;
      e.hitAt.orb = g.elapsed + hitCd;
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      g.damage(e, dmg, (dx / d) * kb, (dy / d) * kb, 'session_replay');
    }
  });
  // Super evolution: the orbs also fire stack traces.
  if (g.superNova) {
    w.nova -= dt;
    if (w.nova <= 0) {
      w.nova = 1.1 * s.cd;
      for (const o of orbs) {
        const t = g.nearest(o.x, o.y, 220);
        if (!t) continue;
        const a = Math.atan2(t.s.y - o.y, t.s.x - o.x);
        const pr = g.shoot('homing', o.x, o.y, Math.cos(a) * 220, Math.sin(a) * 220, 40, 1.6, 2, 'super');
        pr.homing = t; pr.speed = 220; pr.s.setTint(0xf878f8);
      }
    }
  }
};

const featureFlags: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const flags = w.flags;
  w.timer -= dt;
  const max = (w.evo ? 6 : L + 1) + s.amount;
  if (w.timer <= 0 && flags.length < max) {
    w.timer = (w.evo ? 0.8 : 2.4 - 0.3 * L) * s.cd;
    const f = g.add.image(p.x, p.y + 4, spr('flag')).setOrigin(0.15, 1).setDepth(4);
    if (w.evo) f.setTint(GOLD);
    flags.push({ s: f, life: w.evo ? 6 : 4.5, zap: 0.1 });
  }
  const range = (w.evo ? 96 : 72) * s.area;
  const dmg = w.evo ? 32 : 11 + 4 * L;
  for (let i = flags.length - 1; i >= 0; i--) {
    const f = flags[i];
    f.life -= dt; f.zap -= dt;
    f.s.setAlpha(f.life < 1 ? (Math.floor(f.life * 10) % 2 ? 1 : 0.3) : 1);
    if (f.zap <= 0) {
      const fx = f.s.x + 4, fy = f.s.y - 14;
      if (w.evo) {
        const ts = g.near(f.s.x, f.s.y - 10, range);
        f.zap = ts.length ? 0.3 : 0.1;
        if (ts.length) {
          ts.sort((a, b) => ((a.s.x - fx) ** 2 + (a.s.y - fy) ** 2) - ((b.s.x - fx) ** 2 + (b.s.y - fy) ** 2));
          let lx = fx, ly = fy;
          for (const t of ts.slice(0, 3)) {
            g.zapLine(lx, ly, t.s.x, t.s.y, GOLD);
            g.damage(t, dmg, 0, 0, 'feature_flags');
            lx = t.s.x; ly = t.s.y;
          }
          g.sfx('zap', 0.3, 90);
        }
      } else {
        const t = g.nearest(f.s.x, f.s.y - 10, range);
        f.zap = t ? Math.max(0.25, 0.5 - 0.04 * L) : 0.1;
        if (t) {
          g.zapLine(fx, fy, t.s.x, t.s.y);
          g.damage(t, dmg, 0, 0, 'feature_flags');
          g.sfx('zap', 0.3, 90);
        }
      }
    }
    if (f.life <= 0) { f.s.destroy(); flags.splice(i, 1); }
  }
};

const productAnalytics: Fn = (g, w, dt) => {
  const s = g.st, p = g.player, L = w.level;
  const rings = w.rings;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = (w.evo ? 1.5 : 3.2 - 0.35 * L) * s.cd;
    const max = (w.evo ? 125 : 60 + 10 * L) * s.area;
    const dmg = w.evo ? 44 : 13 + 5 * L, kb = w.evo ? 260 : 140;
    rings.push({ r: 4, max, hit: new Set(), x: p.x, y: p.y, dmg, kb });
    if (w.evo) rings.push({ r: -50, max, hit: new Set(), x: p.x, y: p.y, dmg, kb });
    g.sfx('pulse', 0.5);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.x = p.x; r.y = p.y;
    r.r += dt * r.max * 2.6;
    if (r.r > 0) {
      for (const e of g.near(r.x, r.y, r.r)) {
        if (r.hit.has(e)) continue;
        const d = Math.hypot(e.s.x - r.x, e.s.y - r.y);
        if (d < r.r - 14) continue; // only the ring's edge hurts
        r.hit.add(e);
        g.damage(e, r.dmg, ((e.s.x - r.x) / (d || 1)) * r.kb, ((e.s.y - r.y) / (d || 1)) * r.kb, 'product_analytics');
      }
    }
    if (r.r >= r.max) rings.splice(i, 1);
  }
};

const surveys: Fn = (g, w, dt) => {
  w.timer -= dt;
  if (w.timer > 0) return;
  w.timer = w.evo ? 0.3 : 0.5;
  const { r } = aura(w, g.st);
  const dmg = w.evo ? 12 : 2 + 2 * w.level;
  for (const e of g.near(g.player.x, g.player.y, r)) g.damage(e, dmg, 0, 0, 'surveys', true);
  if (w.evo) burst(g, g.player.x + Phaser.Math.Between(-r, r) * 0.7, g.player.y + Phaser.Math.Between(-r, r) * 0.7, 0xfcfcfc, 2,
    { speed: 25, gravity: 20, life: 0.6, size: 1 });
};

export const WEAPON_FNS: Record<ProductId, Fn> = {
  experiments, error_tracking: errorTracking, session_replay: sessionReplay, feature_flags: featureFlags,
  product_analytics: productAnalytics, surveys,
};

/** Rings (analytics) and the survey aura, drawn each frame. */
export function drawWeapons(g: GameScene, fx: Phaser.GameObjects.Graphics, auraG: Phaser.GameObjects.Graphics) {
  const sv = g.weapons.get('surveys');
  auraG.clear();
  if (sv) {
    const { r: r0 } = aura(sv, g.st);
    const r = r0 + Math.sin(g.time.now / 200) * 2;
    const col = sv.evo ? 0x78c8f8 : 0xf85898;
    auraG.fillStyle(col, sv.evo ? 0.16 : 0.12).fillCircle(g.player.x, g.player.y, r)
      .lineStyle(1, col, 0.6).strokeCircle(g.player.x, g.player.y, r);
  }
  const pa = g.weapons.get('product_analytics');
  if (pa) {
    for (const r of pa.rings) {
      if (r.r <= 0) continue;
      const n = pa.evo ? 36 : 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = 2 + ((i * 7) % 5) + (pa.evo ? 2 : 0);
        const c = pa.evo ? (i % 3 ? GOLD : 0xf87858) : (i % 3 ? 0x3cbcfc : 0x0058f8);
        fx.fillStyle(c, 1 - r.r / r.max / 1.5).fillRect(Math.round(r.x + Math.cos(a) * r.r) - 1, Math.round(r.y + Math.sin(a) * r.r) - h, 3, h);
      }
    }
  }
}

/** Tidy up a weapon's display objects (on evolution the orbs/flags are rebuilt in the new style). */
export function resetVisuals(w: WState) {
  w.orbs.forEach((o) => o.destroy());
  w.orbs = [];
  w.flags.forEach((f) => f.s.destroy());
  w.flags = [];
}
