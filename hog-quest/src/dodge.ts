// The enemy-turn simulation: soul movement (normal or heavy), bullets, lasers, warning marks, a box
// that can shrink, grazing and gems. The battle scene owns the menus; this owns the bullet box.
import Phaser from 'phaser';
import { K, spr } from '@shared/kit';
import { Box, BulletKind, PatternCtx, PATTERNS, SpawnOpts } from './patterns';

export const SOUL_SPEED = 90;
const GRAVITY = 480, JUMP = 175;
const HIT = 5, GRAZE = 11, GEM = 8;
export const BLUE = 0x3cbcfc;

interface Bullet { s: Phaser.GameObjects.Image; vx: number; vy: number; ay: number; life: number; age: number; kind: BulletKind | 'gem';
  bounce: boolean; gemAt: number; grazed: boolean }
interface Laser { horiz: boolean; pos: number; w: number; t: number; warn: number; dur: number; grazed: boolean }
interface Mark { x: number; y: number; t: number; secs: number }

export interface DodgeHooks {
  hit: (x: number, y: number) => void;     // the soul took a hit (dodge already set invulnerability)
  graze: (x: number, y: number) => void;
  gem: (x: number, y: number) => void;
}

export class Dodge {
  box: Box;
  bullets: Bullet[] = [];
  lasers: Laser[] = [];
  marks: Mark[] = [];
  heavy = false;
  invuln = 0;
  moved = false;
  t = 0;
  grazes = 0;
  hits = 0;
  private vy = 0;
  private target = { w: 0, h: 0 };
  private emitters: ((t: number, dt: number) => void)[] = [];
  private g: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, public soul: Phaser.GameObjects.Image, public base: Box, private on: DodgeHooks) {
    this.box = { ...base };
    this.g = scene.add.graphics().setDepth(16);
    if (!scene.textures.exists('hq-gem')) {
      const gg = scene.add.graphics();
      gg.fillStyle(0x000000, 1).fillPoints([{ x: 4, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 4 }], true);
      gg.fillStyle(K.ui.accentInt, 1).fillPoints([{ x: 4, y: 1 }, { x: 7, y: 4 }, { x: 4, y: 7 }, { x: 1, y: 4 }], true);
      gg.fillStyle(0xfcfcfc, 1).fillRect(3, 2, 2, 2);
      gg.generateTexture('hq-gem', 9, 9);
      gg.destroy();
    }
  }

  /** Begin a turn with one or more patterns running together. */
  start(pats: string[], o: { speed: number; density: number; boss: boolean }) {
    this.clear();
    this.box = { ...this.base };
    this.target = { w: this.base.w, h: this.base.h };
    this.t = 0;
    this.vy = 0;
    this.soul.setPosition(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2).setVisible(true).setTint(0xffffff).clearTint();
    const ctx: PatternCtx = {
      box: this.box, soul: this.soul, speed: o.speed, density: o.density / Math.sqrt(Math.max(1, pats.length)), boss: o.boss,
      spawn: (x, y, vx, vy, so) => this.spawn(x, y, vx, vy, so),
      laser: (horiz, pos, w, warn = 0.7, dur = 0.35) => this.lasers.push({ horiz, pos, w, t: 0, warn, dur, grazed: false }),
      gravity: (on) => { this.heavy = on; if (on) this.soul.setTintFill(BLUE); else this.soul.clearTint(); },
      resize: (w, h) => { this.target = { w, h }; },
      mark: (x, y, secs) => this.marks.push({ x, y, t: 0, secs }),
    };
    this.emitters = pats.filter((p) => PATTERNS[p]).map((p) => PATTERNS[p](ctx));
    if (!this.emitters.length) this.emitters = [PATTERNS.rain(ctx)];
  }

  private spawn(x: number, y: number, vx: number, vy: number, o: SpawnOpts = {}) {
    if (this.bullets.length > 180) return;
    const s = this.scene.add.image(x, y, spr('bullet')).setDepth(15);
    const kind = o.kind ?? 'norm';
    if (kind === 'blue') s.setTintFill(BLUE);
    this.bullets.push({ s, vx, vy, ay: o.ay ?? 0, life: o.life ?? 9, age: 0, kind, bounce: !!o.bounce, gemAt: o.gemAt ?? -1, grazed: false });
  }

  clear() {
    this.bullets.forEach((b) => b.s.destroy());
    this.bullets = [];
    this.lasers = [];
    this.marks = [];
    this.emitters = [];
    this.heavy = false;
    this.soul.clearTint();
    this.g.clear();
    this.box = { ...this.base };
  }

  /** One simulation step. `dx, dy` is the input direction; `jump` is UP while heavy. */
  step(dt: number, dx: number, dy: number, jump: boolean) {
    this.t += dt;
    for (const e of this.emitters) e(this.t, dt);
    // The box eases towards its target size, staying centred on the base box.
    const cx = this.base.x + this.base.w / 2, cy = this.base.y + this.base.h / 2;
    const k = Math.min(1, dt * 1.6);
    this.box.w += (this.target.w - this.box.w) * k;
    this.box.h += (this.target.h - this.box.h) * k;
    this.box.x = cx - this.box.w / 2;
    this.box.y = cy - this.box.h / 2;
    const box = this.box;
    // Soul movement.
    const s = this.soul, ox = s.x, oy = s.y;
    const len = Math.hypot(dx, heavyY(this.heavy, dy));
    if (this.heavy) {
      s.x += (dx ? Math.sign(dx) : 0) * SOUL_SPEED * dt;
      const floor = box.y + box.h - 6;
      if (jump && s.y >= floor - 0.5) this.vy = -JUMP;
      this.vy += GRAVITY * dt;
      s.y += this.vy * dt;
      if (s.y >= floor) { s.y = floor; this.vy = 0; }
    } else if (len > 0) {
      s.x += (dx / len) * SOUL_SPEED * dt;
      s.y += (dy / len) * SOUL_SPEED * dt;
    }
    s.x = Phaser.Math.Clamp(s.x, box.x + 6, box.x + box.w - 6);
    s.y = Phaser.Math.Clamp(s.y, box.y + 6, box.y + box.h - 6);
    if (s.y <= box.y + 6 && this.vy < 0) this.vy = 0;
    this.moved = Math.hypot(s.x - ox, s.y - oy) > 0.05;
    this.invuln = Math.max(0, this.invuln - dt);
    s.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 ? 0.25 : 1);
    this.stepBullets(dt);
    if (this.emitters.length) this.stepLasers(dt);
  }

  private stepBullets(dt: number) {
    const box = this.box, s = this.soul;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) return; // cleared mid-step (the soul died)
      b.vy += b.ay * dt;
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      b.life -= dt;
      b.age += dt;
      if (b.bounce) {
        if (b.s.x < box.x + 3 || b.s.x > box.x + box.w - 3) b.vx = -b.vx;
        if (b.s.y < box.y + 3 || b.s.y > box.y + box.h - 3) b.vy = -b.vy;
      }
      if (b.gemAt >= 0 && b.age >= b.gemAt && b.kind !== 'gem') {
        b.kind = 'gem';
        b.s.setTexture('hq-gem').clearTint();
        b.vy *= 0.3;
        b.vx *= 0.3;
      }
      const inside = b.s.x > box.x + 2 && b.s.x < box.x + box.w - 2 && b.s.y > box.y + 2 && b.s.y < box.y + box.h - 2;
      b.s.setVisible(inside);
      const far = b.s.x < box.x - 60 || b.s.x > box.x + box.w + 60 || b.s.y < box.y - 60 || b.s.y > box.y + box.h + 60;
      if (b.life <= 0 || far) { this.kill(i); continue; }
      if (!inside) continue;
      const ax = Math.abs(b.s.x - s.x), ay = Math.abs(b.s.y - s.y);
      if (b.kind === 'gem') {
        if (ax < GEM && ay < GEM) { this.on.gem(b.s.x, b.s.y); this.kill(i); }
        continue;
      }
      const harmful = b.kind !== 'blue' || this.moved;
      if (ax < HIT && ay < HIT && harmful && this.invuln <= 0) {
        this.hits++;
        this.invuln = 1;
        this.kill(i);
        this.on.hit(s.x, s.y);
        if (!this.emitters.length) return;
        continue;
      }
      if (!b.grazed && this.invuln <= 0 && ax < GRAZE && ay < GRAZE && (ax >= HIT || ay >= HIT || !harmful)) {
        b.grazed = true;
        this.grazes++;
        this.on.graze(b.s.x, b.s.y);
      }
    }
  }

  private kill(i: number) {
    this.bullets[i].s.destroy();
    this.bullets.splice(i, 1);
  }

  private stepLasers(dt: number) {
    const g = this.g.clear(), box = this.box, s = this.soul;
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i];
      if (!L) return;
      L.t += dt;
      if (L.t > L.warn + L.dur) { this.lasers.splice(i, 1); continue; }
      const firing = L.t >= L.warn;
      const half = firing ? L.w / 2 * Math.min(1, (L.t - L.warn) * 12) : 0.5;
      const col = firing ? 0xfcfcfc : K.ui.accentInt;
      if (!firing && Math.floor(L.t * 16) % 2) continue;
      if (L.horiz) {
        g.fillStyle(col, firing ? 1 : 0.8).fillRect(box.x + 2, L.pos - half, box.w - 4, Math.max(1, half * 2));
        if (firing) g.fillStyle(K.ui.accentInt, 1).fillRect(box.x + 2, L.pos - half, box.w - 4, 1).fillRect(box.x + 2, L.pos + half - 1, box.w - 4, 1);
      } else {
        g.fillStyle(col, firing ? 1 : 0.8).fillRect(L.pos - half, box.y + 2, Math.max(1, half * 2), box.h - 4);
        if (firing) g.fillStyle(K.ui.accentInt, 1).fillRect(L.pos - half, box.y + 2, 1, box.h - 4).fillRect(L.pos + half - 1, box.y + 2, 1, box.h - 4);
      }
      if (!firing) continue;
      const d = Math.abs((L.horiz ? s.y : s.x) - L.pos);
      if (d < L.w / 2 + 2 && this.invuln <= 0) {
        this.hits++;
        this.invuln = 1;
        this.on.hit(s.x, s.y);
      } else if (!L.grazed && d < L.w / 2 + 10 && this.invuln <= 0) {
        L.grazed = true;
        this.grazes++;
        this.on.graze(s.x, s.y);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      if (m.t >= m.secs) { this.marks.splice(i, 1); continue; }
      if (Math.floor(m.t * 10) % 2) continue;
      g.fillStyle(K.ui.accentInt, 1);
      for (let k = -3; k <= 3; k++) { g.fillRect(m.x + k, m.y + k, 1, 1); g.fillRect(m.x + k, m.y - k, 1, 1); }
    }
  }

  // ---------------------------------------------------------------- autopilot
  /** A decent dodger: repelled by bullets and beams, pulled to gems, freezes for blue, jumps when heavy. */
  bot(): [number, number, boolean] {
    const s = this.soul, box = this.box;
    let fx = 0, fy = 0, blueNear = false, threat = false, jump = false;
    for (const b of this.bullets) {
      const px = b.s.x + b.vx * 0.12, py = b.s.y + b.vy * 0.12;
      const dx = s.x - px, dy = s.y - py, d2 = dx * dx + dy * dy;
      if (b.kind === 'gem') { if (d2 < 50 * 50) { fx -= dx * 0.00012; fy -= dy * 0.00012; } continue; }
      if (b.kind === 'blue') { if (d2 < 34 * 34) blueNear = true; continue; }
      if (d2 < 30 * 30 && d2 > 0.01) { fx += dx / d2; fy += dy / d2; if (d2 < 18 * 18) threat = true; }
      if (this.heavy && Math.abs(b.s.y - s.y) < 9 && Math.abs(b.s.x - s.x) < 30 && Math.sign(b.vx) === Math.sign(s.x - b.s.x)) jump = true;
    }
    for (const L of this.lasers) {
      const d = (L.horiz ? s.y : s.x) - L.pos;
      if (Math.abs(d) > L.w / 2 + 10) continue;
      const mid = L.horiz ? box.y + box.h / 2 : box.x + box.w / 2;
      const dir = Math.abs(d) < 1 ? Math.sign((L.horiz ? s.y : s.x) - mid) || 1 : Math.sign(d);
      // Move away along the laser's normal, towards the roomier side.
      const room = L.horiz ? (dir > 0 ? box.y + box.h - s.y : s.y - box.y) : (dir > 0 ? box.x + box.w - s.x : s.x - box.x);
      const go = room < L.w + 6 ? -dir : dir;
      if (L.horiz) fy += go * 0.2; else fx += go * 0.2;
      threat = true;
    }
    if (blueNear && !threat) return [0, 0, false];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    fx += (cx - s.x) * 0.0006;
    fy += (cy - s.y) * 0.0006;
    const m = Math.hypot(fx, fy);
    if (m < 0.004) return [0, 0, jump];
    return [fx / m, this.heavy ? 0 : fy / m, jump];
  }
}

const heavyY = (heavy: boolean, dy: number) => (heavy ? 0 : dy);
