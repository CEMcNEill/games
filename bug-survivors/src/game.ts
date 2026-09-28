// Bug Survivors: the survivors-like core loop. All prospect content comes from K.theme; this
// file is never edited per prospect.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, bar, clock, PixelText, W, H } from '@shared/ui';
import { onKeys } from '@shared/scenes';
import products from '../../shared/products.json';

const WORLD_W = 1280;
const WORLD_H = 800;
const BOSS_AT = 210; // seconds (3:30)
const MAX_ENEMIES = 320;
const MAX_GEMS = 350;
const MAX_LEVEL = 5;

type ProductId = 'session_replay' | 'feature_flags' | 'experiments' | 'error_tracking' | 'product_analytics' | 'surveys';
type PassiveId = 'speed' | 'magnet' | 'maxhp' | 'cooldown';

/** "Legacy Monolith" -> "the Legacy Monolith"; "The Churn Beetle" stays as is. */
export const theName = (n: string) => (/^the\s/i.test(n) ? n : `the ${n}`);

export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;
const productLine = (id: string) =>
  K.theme.game.product_lines?.[id] || (products as Record<string, { line: string }>)[id]?.line || '';

const DIFF = {
  easy: { hp: 0.65, dmg: 0.55, spawn: 0.7, boss: 0.6, regen: 0.6 },
  normal: { hp: 1, dmg: 1, spawn: 1, boss: 1, regen: 0.25 },
  hard: { hp: 1.35, dmg: 1.3, spawn: 1.3, boss: 1.4, regen: 0 },
};
const HEAL_CHANCE = 0.03;
const HEAL_AMOUNT = 20;

const ENEMY = [
  { hp: 6, speed: 54, dmg: 6, xp: 1, r: 6 },
  { hp: 16, speed: 38, dmg: 10, xp: 2, r: 7 },
  { hp: 42, speed: 28, dmg: 14, xp: 5, r: 7 },
];

const UPGRADE_TEXT: Record<ProductId, string> = {
  session_replay: '+1 replay orb, wider orbit',
  feature_flags: 'More flags, faster zaps',
  experiments: 'More shots per variant',
  error_tracking: 'Faster, pierces more bugs',
  product_analytics: 'Bigger, more frequent pulse',
  surveys: 'Wider area, stronger slow',
};

const PASSIVES: Record<PassiveId, { name: string; line: string }> = {
  speed: { name: 'Hedgehog Sprint', line: '+10% move speed' },
  magnet: { name: 'Autocapture', line: '+35% gem pickup range' },
  maxhp: { name: 'Snack Break', line: '+20 max HP and heal 20' },
  cooldown: { name: 'Hot Reload', line: 'Weapons fire 8% faster' },
};

interface Enemy {
  s: Phaser.GameObjects.Sprite;
  type: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  xp: number;
  r: number;
  kx: number; ky: number;      // knockback velocity
  flash: number;               // ms of hit flash left
  slow: number;                // slow factor this frame (1 = none)
  hitAt: Record<string, number>; // per-weapon hit cooldowns
  alive: boolean;
  boss?: boolean;
}

interface Proj {
  s: Phaser.GameObjects.Image;
  vx: number; vy: number;
  dmg: number;
  life: number;
  pierce: number;
  homing?: Enemy | null;
  speed?: number;
  hit: Set<Enemy>;
  hostile?: boolean;
}

interface Card { kind: 'weapon' | 'passive' | 'heal'; id: string; }

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private hp = 100;
  private maxHp = 100;
  private speed = 80;
  private magnet = 48;
  private cdMul = 1;
  private invuln = 0;
  private facing = new Phaser.Math.Vector2(1, 0);
  private enemies: Enemy[] = [];
  private pool: Enemy[] = [];
  private projs: Proj[] = [];
  private gems: { s: Phaser.GameObjects.Image; v: number; pull: boolean; heal?: boolean }[] = [];
  private grid = new Map<number, Enemy[]>();
  private weapons = new Map<ProductId, { level: number; timer: number; state: any }>();
  private passives = new Map<PassiveId, number>();
  private level = 1;
  private xp = 0;
  private xpNext = 5;
  private kills = 0;
  private elapsed = 0;
  private spawnAcc = 0;
  private swarmsDone = new Set<number>();
  private seen = new Set<number>();
  private boss: Enemy | null = null;
  private bossTimer = 0;
  private bossPhase = 0;
  private won = false;
  private over = false;
  private paused = false;
  private levelUp: { cards: Card[]; sel: number; objs: Phaser.GameObjects.GameObject[] } | null = null;
  private pendingLevels = 0;
  private fx!: Phaser.GameObjects.Graphics;
  private aura!: Phaser.GameObjects.Graphics;
  private hud!: { xp: ReturnType<typeof bar>; hpBar: Phaser.GameObjects.Graphics; time: PixelText; lv: PixelText; kills: PixelText;
    icons: Phaser.GameObjects.Container; bossBar: ReturnType<typeof bar> | null; bossName: PixelText | null; arrow: Phaser.GameObjects.Image };
  private banners: { title: string; body: string }[] = [];
  private bannerBusy = false;
  private bannerObjs: Phaser.GameObjects.GameObject[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private diff = DIFF.normal;
  private god = false;
  private autopilot = false;
  private simSpeed = 1;
  private pauseObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Game'); }

  create() {
    // Reset all run state (the scene object is reused between runs).
    Object.assign(this, {
      hp: 100, maxHp: 100, speed: 80, magnet: 48, cdMul: 1, invuln: 0, enemies: [], pool: [], projs: [], gems: [],
      level: 1, xp: 0, xpNext: 5, kills: 0, elapsed: 0, spawnAcc: 0, boss: null, bossTimer: 0, bossPhase: 0,
      won: false, over: false, paused: false, levelUp: null, pendingLevels: 0, banners: [], bannerBusy: false, simSpeed: 1,
    });
    this.weapons = new Map();
    this.passives = new Map();
    this.swarmsDone = new Set();
    this.seen = new Set();
    this.grid = new Map();
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    hooks.scene = 'Game';
    hooks.state = 'playing';
    hooks.elapsed = 0;
    hooks.score = 0;

    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, spr('tile')).setOrigin(0).setDepth(-10);
    // Arena edge
    this.add.graphics().setDepth(-9).lineStyle(4, K.ui.panelInt, 1).strokeRect(-2, -2, WORLD_W + 4, WORLD_H + 4);
    this.aura = this.add.graphics().setDepth(-5);
    this.fx = this.add.graphics().setDepth(20);
    this.player = this.add.sprite(WORLD_W / 2, WORLD_H / 2, spr('player')).setDepth(10);
    this.player.play(anim('player'));
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.player, true, 0.2, 0.2).setRoundPixels(true);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));

    this.buildHud();
    this.addWeapon(K.theme.game.starting_product as ProductId);
    this.banner(K.theme.game.arena.name.toUpperCase(), `Survive ${clock(BOSS_AT)} and beat ${theName(K.theme.game.boss.name)}`);
    this.installDebug();
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (this.over) return;
    if (this.levelUp) {
      const n = this.levelUp.cards.length;
      if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(e.code)) this.selectCard((this.levelUp.sel + n - 1) % n);
      else if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code)) this.selectCard((this.levelUp.sel + 1) % n);
      else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const i = +e.code.slice(-1) - 1; if (i < n) { this.selectCard(i); this.pickCard(); } }
      else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat) this.pickCard();
      return;
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      if (this.paused) this.resume(); else this.pause();
      return;
    }
    if (this.paused && (e.code === 'Enter' || e.code === 'Space')) this.resume();
    if (this.paused && e.code === 'KeyQ') this.scene.start('Title');
  }

  private pause() {
    this.paused = true;
    hooks.state = 'paused';
    const g = box(this, W / 2 - 110, H / 2 - 40, 220, 80, K.ui.bgInt, K.ui.textInt, K.ui.panelInt).setScrollFactor(0).setDepth(100);
    const t1 = text(this, W / 2, H / 2 - 28, 'PAUSED', { scale: 2, align: 'center', color: K.ui.accentInt, fixed: true, depth: 101 });
    const t2 = text(this, W / 2, H / 2 + 2, 'ENTER resume   Q quit', { align: 'center', fixed: true, depth: 101 });
    const t3 = text(this, W / 2, H / 2 + 16, 'M mute', { align: 'center', color: K.ui.dimInt, fixed: true, depth: 101 });
    this.pauseObjs = [g, t1, t2, t3];
  }

  private resume() {
    this.paused = false;
    hooks.state = this.boss ? 'boss' : 'playing';
    this.pauseObjs.forEach((o) => o.destroy());
    this.pauseObjs = [];
  }

  // ---------------------------------------------------------------- HUD
  private buildHud() {
    const ui = K.ui;
    const xp = bar(this, 2, 2, W - 4, 4, ui.accentInt, 0x000000, ui.panelInt);
    xp.g.setDepth(90);
    xp.draw(0);
    const hpBar = this.add.graphics().setDepth(11);
    const time = text(this, W / 2, 10, '0:00', { scale: 2, align: 'center', fixed: true, depth: 90 });
    const lv = text(this, W - 4, 10, 'LV 1', { align: 'right', color: ui.accentInt, fixed: true, depth: 90 });
    const kills = text(this, W - 4, 20, 'BUGS 0', { align: 'right', fixed: true, depth: 90 });
    text(this, 4, 10, K.theme.prospect.short.toUpperCase(), { color: ui.dimInt, fixed: true, depth: 90 });
    const icons = this.add.container(4, H - 20).setScrollFactor(0).setDepth(90);
    const arrow = this.add.image(0, 0, spr('boss_shot')).setScrollFactor(0).setDepth(95).setVisible(false).setScale(2);
    this.hud = { xp, hpBar, time, lv, kills, icons, bossBar: null, bossName: null, arrow };
  }

  private refreshIcons() {
    const c = this.hud.icons;
    c.removeAll(true);
    let x = 0;
    const add = (key: string, lvl: number) => {
      c.add(this.add.image(x, 0, key).setOrigin(0));
      for (let i = 0; i < lvl; i++) c.add(this.add.rectangle(x + 1 + i * 3, 17, 2, 2, K.ui.accentInt).setOrigin(0));
      x += 19;
    };
    this.weapons.forEach((w, id) => add(spr(`icon_${id}`), w.level));
    x += 6;
    this.passives.forEach((l, id) => add(spr(`icon_${id}`), l));
  }

  private updateHud() {
    this.hud.xp.draw(this.xp / this.xpNext);
    this.hud.time.setText(clock(this.elapsed));
    this.hud.lv.setText(`LV ${this.level}`);
    this.hud.kills.setText(`BUGS ${this.kills}`);
    const g = this.hud.hpBar;
    const frac = Math.max(0, this.hp / this.maxHp);
    const x = Math.round(this.player.x - 10), y = Math.round(this.player.y + 13);
    g.clear().fillStyle(0x000000).fillRect(x - 1, y - 1, 22, 4).fillStyle(0x7c7c7c).fillRect(x, y, 20, 2)
      .fillStyle(frac > 0.35 ? 0x58d854 : 0xf83800).fillRect(x, y, Math.max(0, Math.round(20 * frac)), 2);
    if (this.boss && this.hud.bossBar) {
      this.hud.bossBar.draw(this.boss.hp / this.boss.maxHp, 0xf83800);
      // Off-screen boss arrow
      const cam = this.cameras.main;
      const bx = this.boss.s.x - cam.scrollX, by = this.boss.s.y - cam.scrollY;
      const off = bx < 0 || bx > W || by < 0 || by > H;
      this.hud.arrow.setVisible(off && Math.floor(this.time.now / 250) % 2 === 0);
      if (off) this.hud.arrow.setPosition(Phaser.Math.Clamp(bx, 10, W - 10), Phaser.Math.Clamp(by, 34, H - 30));
    }
  }

  /** Queue a two-line banner at the top of the screen (new bugs, swarms, boss). */
  private banner(title: string, body: string) {
    this.banners.push({ title, body });
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner() {
    const b = this.banners.shift();
    if (!b) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    const ui = K.ui;
    const g = box(this, 60, 30, W - 120, 34, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(80);
    const t1 = text(this, W / 2, 35, b.title, { align: 'center', color: ui.accentInt, fixed: true, depth: 81, maxWidth: W - 140, maxLines: 1 });
    const t2 = text(this, W / 2, 48, b.body, { align: 'center', fixed: true, depth: 81, maxWidth: W - 140, maxLines: 1 });
    this.bannerObjs = [g, t1, t2];
    if (this.levelUp) this.showBanner(false);
    this.time.delayedCall(2600, () => {
      [g, t1, t2].forEach((o) => o.destroy());
      this.bannerObjs = [];
      this.time.delayedCall(200, () => this.nextBanner());
    });
  }

  private showBanner(on: boolean) {
    this.bannerObjs.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
  }

  // ---------------------------------------------------------------- main loop
  update(_t: number, dtMs: number) {
    if (this.over) return;
    if (this.autopilot && this.levelUp && (this.levelUp as any).armed) {
      const rank = (c: Card) => (c.kind === 'weapon' ? (this.weapons.has(c.id as ProductId) ? 3 : 2) : c.kind === 'passive' ? 1 : 0);
      const cards = this.levelUp.cards;
      this.selectCard(cards.indexOf([...cards].sort((a, b) => rank(b) - rank(a))[0]), true);
      this.pickCard();
    }
    const steps = this.simSpeed;
    for (let i = 0; i < steps && !this.over; i++) this.step(Math.min(dtMs, 50) / 1000);
    this.draw();
    this.updateHud();
    hooks.elapsed = this.elapsed;
    hooks.score = this.score();
    hooks.stats = {
      hp: Math.round(this.hp), maxHp: this.maxHp, level: this.level, enemies: this.enemies.length, kills: this.kills,
      gems: this.gems.length, projectiles: this.projs.length, boss: this.boss ? Math.round(this.boss.hp) : null,
      weapons: Object.fromEntries([...this.weapons].map(([k, v]) => [k, v.level])),
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
    };
  }

  private step(dt: number) {
    if (this.paused || this.levelUp) return;
    this.elapsed += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hp = Math.min(this.maxHp, this.hp + this.diff.regen * dt);
    this.movePlayer(dt);
    this.spawn(dt);
    this.buildGrid();
    this.moveEnemies(dt);
    this.runWeapons(dt);
    this.moveProjectiles(dt);
    this.moveGems(dt);
    this.touchPlayer();
    this.runBoss(dt);
    if (this.pendingLevels > 0 && !this.levelUp && !this.over) this.openLevelUp();
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (this.autopilot && dx === 0 && dy === 0) [dx, dy] = this.autopilotDir();
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      this.facing.set(dx, dy);
      if (dx !== 0) this.player.setFlipX(dx < 0);
      this.player.anims.timeScale = 1;
    } else {
      this.player.anims.timeScale = 0.25;
    }
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * this.speed * dt, 12, WORLD_W - 12);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * this.speed * dt, 12, WORLD_H - 12);
  }

  /** Test bot: flee the local crowd, drift toward gems, stay away from walls. */
  private autopilotDir(): [number, number] {
    const p = this.player;
    let fx = 0, fy = 0;
    for (const e of this.enemies) {
      const dx = p.x - e.s.x, dy = p.y - e.s.y;
      const d2 = dx * dx + dy * dy;
      const reach = e.boss ? 160 : 90;
      if (d2 < reach * reach && d2 > 1) { const w = (e.boss ? 6 : 1) / d2; fx += dx * w; fy += dy * w; }
    }
    for (const pr of this.projs) {
      if (!pr.hostile) continue;
      const dx = p.x - pr.s.x, dy = p.y - pr.s.y, d2 = dx * dx + dy * dy;
      if (d2 < 60 * 60 && d2 > 1) { fx += (dx * 2) / d2; fy += (dy * 2) / d2; }
    }
    const danger = Math.hypot(fx, fy);
    let gx = 0, gy = 0;
    let best = 1e9;
    for (const g of this.gems) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, g.s.x, g.s.y);
      if (d < best) { best = d; gx = g.s.x - p.x; gy = g.s.y - p.y; }
    }
    const gl = Math.hypot(gx, gy) || 1;
    // Walls: push toward the centre when near an edge.
    const edge = (v: number, max: number) => (v < 140 ? (140 - v) / 140 : v > max - 140 ? -(v - (max - 140)) / 140 : 0);
    const wx = edge(p.x, WORLD_W) * 0.05;
    const wy = edge(p.y, WORLD_H) * 0.05;
    const dl = danger || 1;
    // Flee hard when crowded, otherwise go collect gems (a human would).
    const fear = Math.min(1, danger * 70);
    const greed = best < 400 ? 1 - fear * 0.8 : 0;
    let x = (fx / dl) * fear + (gx / gl) * greed + wx * 30;
    let y = (fy / dl) * fear + (gy / gl) * greed + wy * 30;
    // Circle-strafe when nothing is close.
    if (danger < 0.002 && greed === 0) { x += Math.cos(this.elapsed * 0.8); y += Math.sin(this.elapsed * 0.8); }
    return [x, y];
  }

  // ---------------------------------------------------------------- enemies
  private spawn(dt: number) {
    const t = this.elapsed;
    // Swarm rings at 1:00, 2:00, 3:00.
    for (const at of [60, 120, 180]) {
      if (t >= at && !this.swarmsDone.has(at)) {
        this.swarmsDone.add(at);
        this.banner('SWARM INCOMING!', `A wave of ${K.theme.game.enemies[0].name}s`);
        const n = Math.round(22 * this.diff.spawn);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.addEnemy(0, this.player.x + Math.cos(a) * 250, this.player.y + Math.sin(a) * 170);
        }
      }
    }
    if (this.boss && this.bossPhase < 2) return; // quiet while the boss fights, until it's angry
    const rate = (1.1 + t * 0.034) * this.diff.spawn * (this.boss ? 0.5 : 1);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= MAX_ENEMIES) continue;
      const r = Math.random();
      const type = t < 40 ? 0 : t < 100 ? (r < 0.6 ? 0 : 1) : t < 170 ? (r < 0.35 ? 0 : r < 0.75 ? 1 : 2) : (r < 0.25 ? 0 : r < 0.65 ? 1 : 2);
      const [x, y] = this.offscreenPoint();
      this.addEnemy(type, x, y);
    }
  }

  private offscreenPoint(): [number, number] {
    const a = Math.random() * Math.PI * 2;
    let x = this.player.x + Math.cos(a) * (W / 2 + 24);
    let y = this.player.y + Math.sin(a) * (H / 2 + 24);
    x = Phaser.Math.Clamp(x, 8, WORLD_W - 8);
    y = Phaser.Math.Clamp(y, 8, WORLD_H - 8);
    return [x, y];
  }

  private addEnemy(type: number, x: number, y: number): Enemy | null {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    x = Phaser.Math.Clamp(x, 8, WORLD_W - 8);
    y = Phaser.Math.Clamp(y, 8, WORLD_H - 8);
    const base = ENEMY[type];
    const scale = 1 + this.elapsed / 150;
    let e = this.pool.pop();
    if (!e) {
      e = { s: this.add.sprite(x, y, spr(`enemy_${type + 1}`)), type, hp: 0, maxHp: 0, speed: 0, dmg: 0, xp: 0, r: 0, kx: 0, ky: 0,
        flash: 0, slow: 1, hitAt: {}, alive: true };
    }
    e.s.setTexture(spr(`enemy_${type + 1}`)).setPosition(x, y).setActive(true).setVisible(true).setDepth(5).clearTint().setScale(1);
    e.s.play(anim(`enemy_${type + 1}`));
    e.s.anims.setProgress(Math.random());
    Object.assign(e, { type, hp: base.hp * this.diff.hp * scale, speed: base.speed * Phaser.Math.FloatBetween(0.9, 1.1),
      dmg: base.dmg * this.diff.dmg, xp: base.xp, r: base.r, kx: 0, ky: 0, flash: 0, slow: 1, hitAt: {}, alive: true, boss: false });
    e.maxHp = e.hp;
    this.enemies.push(e);
    if (!this.seen.has(type)) {
      this.seen.add(type);
      const info = K.theme.game.enemies[type];
      this.banner(`NEW BUG: ${info.name.toUpperCase()}`, info.pain);
    }
    return e;
  }

  private buildGrid() {
    this.grid.clear();
    for (const e of this.enemies) {
      const k = ((e.s.x >> 5) << 8) | (e.s.y >> 5);
      const cell = this.grid.get(k);
      if (cell) cell.push(e); else this.grid.set(k, [e]);
    }
  }

  /** Enemies within r of (x, y), via the 32px grid. */
  private near(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    for (let cx = (x - r) >> 5; cx <= (x + r) >> 5; cx++) {
      for (let cy = (y - r) >> 5; cy <= (y + r) >> 5; cy++) {
        const cell = this.grid.get((cx << 8) | cy);
        if (!cell) continue;
        for (const e of cell) {
          const dx = e.s.x - x, dy = e.s.y - y;
          if (e.alive && dx * dx + dy * dy <= (r + e.r) * (r + e.r)) out.push(e);
        }
      }
    }
    return out;
  }

  private nearest(x: number, y: number, maxR = 400): Enemy | null {
    let best: Enemy | null = null, bd = maxR * maxR;
    for (const e of this.enemies) {
      const d = (e.s.x - x) ** 2 + (e.s.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private moveEnemies(dt: number) {
    const px = this.player.x, py = this.player.y;
    const surveys = this.weapons.get('surveys');
    const auraR = surveys ? 40 + 8 * surveys.level : 0;
    const slowF = surveys ? 0.6 - 0.05 * surveys.level : 1;
    for (const e of this.enemies) {
      let dx = px - e.s.x, dy = py - e.s.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      e.slow = auraR && d < auraR + e.r ? slowF : 1;
      // Separation from neighbours in the same cell keeps swarms readable.
      let sx = 0, sy = 0;
      const cell = this.grid.get(((e.s.x >> 5) << 8) | (e.s.y >> 5));
      if (cell && cell.length > 1) {
        for (const o of cell) {
          if (o === e) continue;
          const ox = e.s.x - o.s.x, oy = e.s.y - o.s.y;
          const od = ox * ox + oy * oy;
          const min = e.r + o.r;
          if (od < min * min && od > 0.01) { const f = (min - Math.sqrt(od)) / min; sx += ox * f; sy += oy * f; }
        }
      }
      const sp = e.speed * e.slow;
      e.s.x += (dx * sp + e.kx + sx * 4) * dt;
      e.s.y += (dy * sp + e.ky + sy * 4) * dt;
      e.s.x = Phaser.Math.Clamp(e.s.x, 4, WORLD_W - 4);
      e.s.y = Phaser.Math.Clamp(e.s.y, 4, WORLD_H - 4);
      e.kx *= 0.86; e.ky *= 0.86;
      e.s.setFlipX(dx < 0);
      if (e.flash > -1000) {
        const was = e.flash;
        e.flash -= dt * 1000;
        if (was > 0 && e.flash <= 0) e.s.clearTint();
      }
    }
  }

  private damage(e: Enemy, dmg: number, kx = 0, ky = 0) {
    if (!e.alive) return;
    e.hp -= dmg;
    // Flash white on hit; the boss is hit constantly, so it only blinks every so often.
    if (!e.boss || e.flash < -120) { e.flash = 70; e.s.setTintFill(0xffffff); }
    if (!e.boss) { e.kx += kx; e.ky += ky; }
    if (e.hp <= 0) this.kill(e);
    else K.play('hit', 0.5, 60);
  }

  private kill(e: Enemy) {
    e.alive = false;
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    this.puff(e.s.x, e.s.y, e.boss ? 40 : 5, e.boss ? 3 : 1);
    if (e.boss) { this.bossDown(e); return; }
    e.s.setActive(false).setVisible(false).stop();
    this.pool.push(e);
    this.kills++;
    K.play('kill', 0.5, 50);
    if (e.type > 0 && Math.random() < HEAL_CHANCE) {
      this.gems.push({ s: this.add.image(e.s.x, e.s.y, spr('icon_maxhp')).setDepth(3).setScale(0.75), v: 0, pull: false, heal: true });
    } else {
      this.dropGem(e.s.x, e.s.y, e.xp);
    }
  }

  private puff(x: number, y: number, n: number, size: number) {
    const cols = [K.ui.accentInt, 0xfcfcfc, K.ui.panelInt];
    for (let i = 0; i < n; i++) {
      const r = this.add.rectangle(x, y, size * 2, size * 2, cols[i % 3]).setDepth(15);
      const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(6, 14) * size;
      this.tweens.add({ targets: r, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 260 + size * 120,
        onComplete: () => r.destroy() });
    }
  }

  // ---------------------------------------------------------------- gems & xp
  private dropGem(x: number, y: number, v: number) {
    if (this.gems.length >= MAX_GEMS) {
      const g = this.gems[Math.floor(Math.random() * this.gems.length)];
      if (!g.heal) g.v += v;
      return;
    }
    const s = this.add.image(x, y, spr('gem')).setDepth(3);
    if (v >= 5) s.setTint(0xf878f8); else if (v >= 2) s.setTint(0x58d854);
    this.gems.push({ s, v, pull: false });
  }

  private moveGems(dt: number) {
    const px = this.player.x, py = this.player.y;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = px - g.s.x, dy = py - g.s.y, d = Math.hypot(dx, dy);
      if (d < this.magnet) g.pull = true;
      if (g.pull) {
        const sp = 190 * dt;
        g.s.x += (dx / (d || 1)) * Math.min(sp, d);
        g.s.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (d < 9) {
        g.s.destroy();
        this.gems.splice(i, 1);
        if (g.heal) { this.hp = Math.min(this.maxHp, this.hp + HEAL_AMOUNT); K.play('levelup', 0.4); }
        else this.gainXp(g.v);
      }
    }
  }

  private gainXp(v: number) {
    K.play('pickup', 0.4, 45);
    this.xp += v;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.floor(3 + this.level * 2.2 + this.level ** 1.3);
      this.pendingLevels++;
    }
  }

  // ---------------------------------------------------------------- level-up cards
  private choices(): Card[] {
    const pool: Card[] = [];
    for (const id of K.theme.products as ProductId[]) {
      const w = this.weapons.get(id);
      if (!w) pool.push({ kind: 'weapon', id }, { kind: 'weapon', id }); // new weapons twice as likely
      else if (w.level < MAX_LEVEL) pool.push({ kind: 'weapon', id });
    }
    for (const id of Object.keys(PASSIVES) as PassiveId[]) if ((this.passives.get(id) ?? 0) < MAX_LEVEL) pool.push({ kind: 'passive', id });
    Phaser.Utils.Array.Shuffle(pool);
    const out: Card[] = [];
    for (const c of pool) if (!out.some((o) => o.id === c.id)) out.push(c);
    if (out.length === 0) out.push({ kind: 'heal', id: 'heal' });
    return out.slice(0, 3);
  }

  private openLevelUp() {
    this.pendingLevels--;
    const cards = this.choices();
    hooks.state = 'levelup';
    K.play('levelup');
    const ui = K.ui;
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.showBanner(false);
    const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setScrollFactor(0).setDepth(100);
    objs.push(shade);
    objs.push(text(this, W / 2, 26, 'LEVEL UP!', { scale: 2, align: 'center', color: ui.accentInt, fixed: true, depth: 101 }));
    objs.push(text(this, W / 2, 46, 'Pick a PostHog product or upgrade', { align: 'center', color: ui.dimInt, fixed: true, depth: 101 }));
    const cw = 136, gap = 12, x0 = (W - (cw * cards.length + gap * (cards.length - 1))) / 2;
    cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap), y = 64;
      const frame = box(this, x, y, cw, 150, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(101);
      frame.setData('card', i);
      objs.push(frame);
      const iconKey = c.kind === 'weapon' ? spr(`icon_${c.id}`) : c.kind === 'passive' ? spr(`icon_${c.id}`) : spr('icon_maxhp');
      objs.push(this.add.image(x + cw / 2, y + 26, iconKey).setScale(2).setScrollFactor(0).setDepth(102));
      let name: string, tag: string, line: string;
      if (c.kind === 'weapon') {
        const w = this.weapons.get(c.id as ProductId);
        name = productName(c.id);
        tag = w ? `LV ${w.level + 1}` : 'NEW!';
        line = w ? UPGRADE_TEXT[c.id as ProductId] : productLine(c.id);
      } else if (c.kind === 'passive') {
        const l = this.passives.get(c.id as PassiveId) ?? 0;
        name = PASSIVES[c.id as PassiveId].name;
        tag = l ? `LV ${l + 1}` : 'NEW!';
        line = PASSIVES[c.id as PassiveId].line;
      } else { name = 'Snack'; tag = ''; line = 'Heal 30 HP'; }
      objs.push(text(this, x + cw / 2, y + 50, name, { align: 'center', color: ui.textInt, fixed: true, depth: 102, maxWidth: cw - 12, maxLines: 2 }));
      objs.push(text(this, x + cw / 2, y + 74, tag, { align: 'center', color: ui.accentInt, fixed: true, depth: 102 }));
      objs.push(text(this, x + cw / 2, y + 90, line, { align: 'center', color: ui.dimInt, fixed: true, depth: 102, maxWidth: cw - 14, maxLines: 4 }));
    });
    const sel = this.add.graphics().setScrollFactor(0).setDepth(103);
    objs.push(sel);
    objs.push(text(this, W / 2, H - 20, 'LEFT/RIGHT choose   ENTER pick', { align: 'center', color: ui.textInt, fixed: true, depth: 101 }));
    this.levelUp = { cards, sel: 0, objs };
    // Ignore Enter for a moment so a held key doesn't pick blindly.
    const lu = this.levelUp;
    (lu as any).armed = false;
    this.time.delayedCall(350, () => ((lu as any).armed = true));
    this.selectCard(0, true);
  }

  private selectCard(i: number, silent = false) {
    if (!this.levelUp) return;
    this.levelUp.sel = i;
    const n = this.levelUp.cards.length;
    const cw = 136, gap = 12, x0 = (W - (cw * n + gap * (n - 1))) / 2;
    const g = this.levelUp.objs.find((o) => o instanceof Phaser.GameObjects.Graphics && o.depth === 103) as Phaser.GameObjects.Graphics;
    g.clear().lineStyle(2, K.ui.accentInt, 1).strokeRect(x0 + i * (cw + gap) - 2, 62, cw + 4, 154);
    if (!silent) K.play('move', 0.5);
  }

  private pickCard() {
    const lu = this.levelUp;
    if (!lu || !(lu as any).armed) return;
    const c = lu.cards[lu.sel];
    K.play('select');
    if (c.kind === 'weapon') {
      const w = this.weapons.get(c.id as ProductId);
      if (w) w.level++; else this.addWeapon(c.id as ProductId);
      capture('product_picked', { product: c.id, level: this.weapons.get(c.id as ProductId)!.level, player_level: this.level });
    } else if (c.kind === 'passive') {
      const l = (this.passives.get(c.id as PassiveId) ?? 0) + 1;
      this.passives.set(c.id as PassiveId, l);
      if (c.id === 'speed') this.speed = 80 * (1 + 0.1 * l);
      if (c.id === 'magnet') this.magnet = 48 * (1 + 0.35 * l);
      if (c.id === 'maxhp') { this.maxHp = 100 + 20 * l; this.hp = Math.min(this.maxHp, this.hp + 20); }
      if (c.id === 'cooldown') this.cdMul = 1 - 0.08 * l;
    } else {
      this.hp = Math.min(this.maxHp, this.hp + 30);
    }
    lu.objs.forEach((o) => o.destroy());
    this.levelUp = null;
    this.showBanner(true);
    hooks.state = this.boss ? 'boss' : 'playing';
    this.refreshIcons();
  }

  // ---------------------------------------------------------------- weapons
  private addWeapon(id: ProductId) {
    if (this.weapons.has(id)) return;
    this.weapons.set(id, { level: 1, timer: 0.3, state: { flags: [], orbs: [], rings: [] } });
    this.refreshIcons();
  }

  private runWeapons(dt: number) {
    const p = this.player;
    this.weapons.forEach((w, id) => {
      const L = w.level;
      w.timer -= dt;
      switch (id) {
        case 'experiments': {
          if (w.timer > 0) break;
          w.timer = (0.95 - 0.08 * L) * this.cdMul;
          const per = 1 + Math.floor(L / 2);
          const base = Math.atan2(this.facing.y, this.facing.x);
          for (const side of [0, Math.PI]) {
            for (let i = 0; i < per; i++) {
              const a = base + side + (i - (per - 1) / 2) * 0.2;
              this.shoot('shot', p.x, p.y, Math.cos(a) * 210, Math.sin(a) * 210, 9 + 3 * L, 0.85, L >= 4 ? 2 : 1);
            }
          }
          K.play('shoot', 0.35, 70);
          break;
        }
        case 'error_tracking': {
          if (w.timer > 0) break;
          const target = this.nearest(p.x, p.y, 260);
          if (!target) { w.timer = 0.2; break; }
          w.timer = (1.3 - 0.15 * L) * this.cdMul;
          const n = L >= 5 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(target.s.y - p.y, target.s.x - p.x) + (i ? 0.6 : 0);
            const sp = 150 + 15 * L;
            const pr = this.shoot('homing', p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, 16 + 6 * L, 2.2, L >= 3 ? 3 : 1);
            pr.homing = target; pr.speed = sp;
          }
          K.play('shoot', 0.3, 70);
          break;
        }
        case 'session_replay': {
          const n = Math.min(5, 1 + L);
          const orbs: Phaser.GameObjects.Image[] = w.state.orbs;
          while (orbs.length < n) orbs.push(this.add.image(p.x, p.y, spr('orb')).setDepth(9));
          const rad = 26 + 4 * L;
          const spin = this.elapsed * (2.6 + 0.2 * L);
          orbs.forEach((o, i) => {
            const a = spin + (i / n) * Math.PI * 2;
            o.setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad);
            for (const e of this.near(o.x, o.y, 5)) {
              if ((e.hitAt.orb ?? 0) > this.elapsed) continue;
              e.hitAt.orb = this.elapsed + 0.35;
              const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
              this.damage(e, 7 + 3 * L, (dx / d) * 90, (dy / d) * 90);
            }
          });
          break;
        }
        case 'feature_flags': {
          const flags: { s: Phaser.GameObjects.Image; life: number; zap: number }[] = w.state.flags;
          if (w.timer <= 0 && flags.length < L + 1) {
            w.timer = (2.4 - 0.3 * L) * this.cdMul;
            flags.push({ s: this.add.image(p.x, p.y + 4, spr('flag')).setOrigin(0.15, 1).setDepth(4), life: 4.5, zap: 0.1 });
          }
          for (let i = flags.length - 1; i >= 0; i--) {
            const f = flags[i];
            f.life -= dt; f.zap -= dt;
            f.s.setAlpha(f.life < 1 ? (Math.floor(f.life * 10) % 2 ? 1 : 0.3) : 1);
            if (f.zap <= 0) {
              const t = this.nearest(f.s.x, f.s.y - 10, 72);
              f.zap = t ? Math.max(0.25, 0.5 - 0.04 * L) : 0.1;
              if (t) {
                this.zapLine(f.s.x + 4, f.s.y - 14, t.s.x, t.s.y);
                this.damage(t, 11 + 4 * L);
                K.play('zap', 0.3, 90);
              }
            }
            if (f.life <= 0) { f.s.destroy(); flags.splice(i, 1); }
          }
          break;
        }
        case 'product_analytics': {
          const rings: { r: number; max: number; hit: Set<Enemy>; x: number; y: number }[] = w.state.rings;
          if (w.timer <= 0) {
            w.timer = (3.2 - 0.35 * L) * this.cdMul;
            rings.push({ r: 4, max: 60 + 10 * L, hit: new Set(), x: p.x, y: p.y });
            K.play('pulse', 0.5);
          }
          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.x = p.x; r.y = p.y;
            r.r += dt * r.max * 2.6;
            for (const e of this.near(r.x, r.y, r.r)) {
              if (r.hit.has(e)) continue;
              const d = Math.hypot(e.s.x - r.x, e.s.y - r.y);
              if (d < r.r - 14) continue; // only the ring's edge hurts
              r.hit.add(e);
              this.damage(e, 13 + 5 * L, ((e.s.x - r.x) / (d || 1)) * 140, ((e.s.y - r.y) / (d || 1)) * 140);
            }
            if (r.r >= r.max) rings.splice(i, 1);
          }
          break;
        }
        case 'surveys': {
          if (w.timer > 0) break;
          w.timer = 0.5;
          for (const e of this.near(p.x, p.y, 40 + 8 * L)) this.damage(e, 2 + 2 * L);
          break;
        }
      }
    });
  }

  private shoot(key: string, x: number, y: number, vx: number, vy: number, dmg: number, life: number, pierce: number, hostile = false): Proj {
    const s = this.add.image(x, y, spr(key)).setDepth(hostile ? 12 : 8);
    const pr: Proj = { s, vx, vy, dmg, life, pierce, hit: new Set(), hostile };
    this.projs.push(pr);
    return pr;
  }

  private zapLine(x1: number, y1: number, x2: number, y2: number) {
    const g = this.add.graphics().setDepth(19);
    g.lineStyle(1, 0xfcfcfc, 1).beginPath().moveTo(x1, y1);
    const n = 4;
    for (let i = 1; i < n; i++) {
      g.lineTo(x1 + ((x2 - x1) * i) / n + Phaser.Math.Between(-4, 4), y1 + ((y2 - y1) * i) / n + Phaser.Math.Between(-4, 4));
    }
    g.lineTo(x2, y2).strokePath();
    g.lineStyle(1, 0x58d854, 1).strokeCircle(x2, y2, 4);
    this.time.delayedCall(80, () => g.destroy());
  }

  private moveProjectiles(dt: number) {
    const p = this.player;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.life -= dt;
      if (pr.homing) {
        if (!pr.homing.alive) pr.homing = this.nearest(pr.s.x, pr.s.y, 200);
        if (pr.homing) {
          const a = Math.atan2(pr.homing.s.y - pr.s.y, pr.homing.s.x - pr.s.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const na = Phaser.Math.Angle.RotateTo(cur, a, 6 * dt);
          pr.vx = Math.cos(na) * pr.speed!; pr.vy = Math.sin(na) * pr.speed!;
        }
        pr.s.setRotation(Math.atan2(pr.vy, pr.vx));
      }
      pr.s.x += pr.vx * dt;
      pr.s.y += pr.vy * dt;
      let dead = pr.life <= 0 || pr.s.x < -20 || pr.s.y < -20 || pr.s.x > WORLD_W + 20 || pr.s.y > WORLD_H + 20;
      if (!dead && pr.hostile) {
        if (Phaser.Math.Distance.Between(pr.s.x, pr.s.y, p.x, p.y) < 9) { this.hurt(pr.dmg); dead = true; }
      } else if (!dead) {
        for (const e of this.near(pr.s.x, pr.s.y, 3)) {
          if (pr.hit.has(e)) continue;
          pr.hit.add(e);
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          this.damage(e, pr.dmg, (pr.vx / sp) * 60, (pr.vy / sp) * 60);
          if (--pr.pierce <= 0) { dead = true; break; }
        }
      }
      if (dead) { pr.s.destroy(); this.projs.splice(i, 1); }
    }
  }

  private touchPlayer() {
    if (this.invuln > 0) return;
    for (const e of this.near(this.player.x, this.player.y, 7)) {
      this.hurt(e.dmg);
      break;
    }
  }

  private hurt(dmg: number) {
    if (this.invuln > 0 || this.over) return;
    this.invuln = 0.55;
    if (!this.god) this.hp -= dmg;
    K.play('hurt', 0.8);
    this.cameras.main.shake(120, 0.006);
    this.player.setTintFill(0xf83800);
    this.time.delayedCall(90, () => this.player.clearTint());
    if (this.hp <= 0) this.finish(false);
  }

  // ---------------------------------------------------------------- boss
  private runBoss(dt: number) {
    if (!this.boss && this.elapsed >= BOSS_AT) this.spawnBoss();
    const b = this.boss;
    if (!b || !b.alive) return;
    this.bossTimer -= dt;
    if (this.bossPhase === 1 && b.hp < b.maxHp * 0.5) {
      this.bossPhase = 2;
      this.banner(`${K.theme.game.boss.name.toUpperCase()} IS ANGRY!`, 'It is calling in more bugs');
    }
    const dash = (b as any).dash as number | undefined;
    if (dash && dash > 0) {
      (b as any).dash -= dt;
      b.s.x += (b as any).dvx * dt;
      b.s.y += (b as any).dvy * dt;
    }
    b.s.x = Phaser.Math.Clamp(b.s.x, 32, WORLD_W - 32);
    b.s.y = Phaser.Math.Clamp(b.s.y, 32, WORLD_H - 32);
    if (this.bossTimer > 0) return;
    const angry = this.bossPhase === 2;
    const attack = (b as any).n = (((b as any).n ?? 0) + 1) % 3;
    if (attack === 1) {
      const n = angry ? 18 : 12;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 72, Math.sin(a) * 72, 12 * this.diff.dmg, 5, 1, true);
      }
      K.play('bossshot', 0.7);
      this.bossTimer = angry ? 2.0 : 2.6;
    } else if (attack === 2) {
      const a = Math.atan2(this.player.y - b.s.y, this.player.x - b.s.x);
      (b as any).dash = 0.7;
      (b as any).dvx = Math.cos(a) * 170;
      (b as any).dvy = Math.sin(a) * 170;
      b.s.setTint(0xf83800);
      this.time.delayedCall(700, () => b.alive && b.s.clearTint());
      this.bossTimer = angry ? 1.8 : 2.4;
    } else {
      if (angry) for (let i = 0; i < 6; i++) this.addEnemy(i % 2, b.s.x + Phaser.Math.Between(-40, 40), b.s.y + Phaser.Math.Between(-40, 40));
      this.bossTimer = 1.4;
    }
  }

  private spawnBoss() {
    const [x, y] = this.offscreenPoint();
    const s = this.add.sprite(x, y, spr('boss')).setDepth(6);
    s.play(anim('boss'));
    const hp = 950 * this.diff.boss * (1 + this.level / 20);
    const b: Enemy = { s, type: 3, hp, maxHp: hp, speed: 24, dmg: 20 * this.diff.dmg, xp: 0, r: 22, kx: 0, ky: 0, flash: 0, slow: 1,
      hitAt: {}, alive: true, boss: true };
    this.enemies.push(b);
    this.boss = b;
    this.bossPhase = 1;
    this.bossTimer = 2.5;
    hooks.state = 'boss';
    K.play('boss');
    this.cameras.main.shake(400, 0.01);
    this.banner(K.theme.game.boss.name.toUpperCase(), `"${K.theme.game.boss.taunt}"`);
    const bb = bar(this, 250, H - 9, W - 256, 5, 0xf83800, 0x000000, K.ui.textInt);
    bb.g.setDepth(90);
    this.hud.bossBar = bb;
    this.hud.bossName = text(this, W - 6, H - 21, K.theme.game.boss.name, { align: 'right', color: K.ui.accentInt, fixed: true, depth: 90 });
  }

  private bossDown(b: Enemy) {
    this.won = true;
    this.kills++;
    K.play('explode');
    this.cameras.main.shake(700, 0.015);
    this.cameras.main.flash(300, 255, 255, 255);
    this.tweens.add({ targets: b.s, alpha: 0, scale: 1.6, duration: 900 });
    for (const e of [...this.enemies]) if (!e.boss) this.kill(e);
    this.time.delayedCall(1600, () => this.finish(true));
  }

  // ---------------------------------------------------------------- drawing & end
  private draw() {
    const surveys = this.weapons.get('surveys');
    this.aura.clear();
    if (surveys) {
      const r = 40 + 8 * surveys.level + Math.sin(this.time.now / 200) * 2;
      this.aura.fillStyle(0xf85898, 0.12).fillCircle(this.player.x, this.player.y, r)
        .lineStyle(1, 0xf85898, 0.6).strokeCircle(this.player.x, this.player.y, r);
    }
    this.fx.clear();
    const pa = this.weapons.get('product_analytics');
    if (pa) {
      for (const r of pa.state.rings as { r: number; x: number; y: number; max: number }[]) {
        // A ring of little bar-chart columns.
        const n = 24;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const h = 2 + ((i * 7) % 5);
          this.fx.fillStyle(i % 3 ? 0x3cbcfc : 0x0058f8, 1 - r.r / r.max / 1.5)
            .fillRect(Math.round(r.x + Math.cos(a) * r.r) - 1, Math.round(r.y + Math.sin(a) * r.r) - h, 3, h);
        }
      }
    }
    if (this.invuln > 0) this.player.setAlpha(Math.floor(this.time.now / 60) % 2 ? 0.4 : 1);
    else this.player.setAlpha(1);
  }

  private score() {
    return this.kills * 10 + (this.level - 1) * 100 + Math.floor(this.elapsed) * 5 + (this.won ? 5000 : 0);
  }

  private finish(won: boolean) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    const score = this.score();
    const survived = clock(this.elapsed);
    const products = [...this.weapons.keys()].map(productName);
    this.time.delayedCall(won ? 200 : 900, () => this.scene.start('End', {
      won, score,
      headline: won ? 'BUGS SQUASHED!' : 'GAME OVER',
      stats: [['Survived', survived], ['Bugs squashed', this.kills], ['Level', this.level], ['Products', products.length]],
      props: { level: this.level, kills: this.kills, products: [...this.weapons.keys()] },
    }));
    if (!won) {
      this.player.setTintFill(0xf83800);
      this.tweens.add({ targets: this.player, angle: 360, alpha: 0, duration: 800 });
    }
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    hooks.debug = {
      warp: (s: number) => { this.elapsed = s; },
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true) => { this.autopilot = !!on; },
      spawnBoss: () => { this.elapsed = Math.max(this.elapsed, BOSS_AT); },
      hurtBoss: (frac = 1) => { if (this.boss) this.damage(this.boss, this.boss.maxHp * frac); },
      giveAll: () => { (K.theme.products as ProductId[]).forEach((id) => this.addWeapon(id)); },
      maxAll: () => { this.weapons.forEach((w) => (w.level = MAX_LEVEL)); this.refreshIcons(); },
      xp: (n: number) => this.gainXp(n),
      flood: (n = 300) => { for (let i = 0; i < n; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy(i % 3, x, y); } },
      lose: () => this.finish(false),
      // For the gameplay GIF: mid-game swarm with a few weapons going.
      showcase: () => {
        this.elapsed = 150;
        (K.theme.products as ProductId[]).slice(0, 4).forEach((id) => this.addWeapon(id));
        this.weapons.forEach((w) => (w.level = 3));
        this.refreshIcons();
        for (let i = 0; i < 140; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy(i % 3, x, y); }
      },
      win: () => { this.elapsed = Math.max(this.elapsed, BOSS_AT); this.runBoss(0); if (this.boss) this.damage(this.boss, this.boss.maxHp * 2); },
    };
  }
}
