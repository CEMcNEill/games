// Bug Survivors: the survivors-like core loop. All prospect content comes from K.theme; this
// file is never edited per prospect. Content tables live in content.ts, weapons in weapons.ts.
import Phaser from 'phaser';
import { K, spr, anim, finishRun } from '@shared/kit';
import { hooks, sharedDebug } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { achieve, rng, Rng, meta } from '@shared/meta';
import { shake, hitstop, hitstopped, burst, floatText, setJuiceSpeed } from '@shared/juice';
import { text, box, bar, clock, PixelText, W, H } from '@shared/ui';
import products from '../../shared/products.json';
import {
  ProductId, PassiveId, ArchId, EliteMod, EventId, Stats, baseStats, WEAPONS, PASSIVES, ARCH, SPAWN_TABLE, ELITE_MODS,
  ELITES_AT, ELITES_EARLY, HAZARDS, EVENTS, EVENT_TIMES, EVENT_ORDER, OVERTIME_S, BOSS_AT, MAX_LEVEL, SUPER, HEROES, HeroDef,
} from './content';
import { WState, newWeapon, WEAPON_FNS, drawWeapons, aura, resetVisuals } from './weapons';
import { Card, Build, drawCards, botRank, partnersOf } from './cards';
import { save, persist, shopLevel, currentHero, today, heroUnlocked } from './save';

const WORLD_W = 1280;
const WORLD_H = 800;
const MAX_ENEMIES = 320;
const MAX_GEMS = 350;
const MAX_ITEMS = 40;
const HEAL_AMOUNT = 25;
/** HUD, banners and modals sit above the shared juice layer (particles + float text at depth 1000). */
const UI = 1100;
// Where the hero's hat sits on the 24x24 hog (facing right).
const HAT_DX = 9;
const HAT_DY = -3;

/** "Legacy Monolith" -> "the Legacy Monolith"; "The Churn Beetle" stays as is. */
export const theName = (n: string) => (/^the\s/i.test(n) ? n : `the ${n}`);
export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;
const productLine = (id: string) =>
  K.theme.game.product_lines?.[id] || (products as Record<string, { line: string }>)[id]?.line || '';
const bugName = (i: number) => K.theme.game.enemies[i]?.name ?? 'Bug';

const DIFF = {
  easy: { hp: 0.65, dmg: 0.55, spawn: 0.7, boss: 0.6, regen: 0.6 },
  normal: { hp: 1, dmg: 1, spawn: 1, boss: 1, regen: 0.25 },
  hard: { hp: 1.35, dmg: 1.3, spawn: 1.3, boss: 1.4, regen: 0 },
};

/** End-screen lines for the last finished run (main.ts endSummary reads them). */
export const lastRun = { lines: [] as string[] };

export interface Enemy {
  s: Phaser.GameObjects.Sprite;
  arch: ArchId;
  type: number;                // theme enemy index (sprite/name); 3 = boss
  hp: number; maxHp: number; speed: number; dmg: number; xp: number; r: number;
  kx: number; ky: number;      // knockback velocity
  flash: number;               // ms of hit flash left
  slow: number;                // slow factor this frame (1 = none)
  hitAt: Record<string, number>;
  alive: boolean;
  boss?: boolean;
  elite: EliteMod | null;
  mode: number;                // behaviour state (0 walk, 1 telegraph, 2 dash, 3 fuse)
  t: number;                   // behaviour timer
  vx: number; vy: number;      // dash / stampede direction
  acc: number; accT: number; accCrit: boolean; // merged damage numbers
  armour: number; kb: number; tint: number | null;
}

interface Proj {
  s: Phaser.GameObjects.Image;
  vx: number; vy: number;
  dmg: number; life: number; pierce: number;
  homing?: Enemy | null;
  speed?: number;
  chain?: number;
  rt?: number; // homing retarget timer
  src: string;
  hit: Set<Enemy>;
  hostile?: boolean;
}

type ItemKind = 'food' | 'coin' | 'vacuum' | 'hotfix' | 'chest';
interface Item { s: Phaser.GameObjects.Image; kind: ItemKind; pull: boolean; big?: boolean }
interface Gem { s: Phaser.GameObjects.Image; v: number; pull: boolean }

interface Modal { kind: 'levelup' | 'chest'; objs: Phaser.GameObjects.GameObject[]; armed: boolean; cards: Card[]; sel: number }

export class GameScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Sprite;
  hat: Phaser.GameObjects.Image | null = null;
  hero: HeroDef = HEROES[0];
  st: Stats = baseStats();
  hp = 100;
  invuln = 0;
  facing = new Phaser.Math.Vector2(1, 0);
  enemies: Enemy[] = [];
  pool: Enemy[] = [];
  projs: Proj[] = [];
  gems: Gem[] = [];
  items: Item[] = [];
  grid = new Map<number, Enemy[]>();
  weapons = new Map<ProductId, WState>();
  passives = new Map<PassiveId, number>();
  banished = new Set<string>();
  level = 1;
  xp = 0;
  xpNext = 5;
  kills = 0;
  gold = 0;
  elapsed = 0;
  spawnAcc = 0;
  evQueue: { at: number; id: EventId }[] = [];
  eliteQueue: number[] = [];
  stampede: { dx: number; dy: number; t: number; waves: number } | null = null;
  puddles: { x: number; y: number; r: number; age: number }[] = [];
  blasts: { x: number; y: number; r: number; t: number }[] = [];
  hazT = { crate: 0, puddle: 0 };
  hazG!: Phaser.GameObjects.Graphics;
  seen = new Set<string>();
  boss: Enemy | null = null;
  bossTimer = 0;
  bossPhase = 0;
  bossKills = 0;
  bossLast = '';
  bossAt = 0;     // when the current boss arrived
  nextBossAt = BOSS_AT;
  overtime = -1;
  won = false;
  over = false;
  paused = false;
  modal: Modal | null = null;
  pendingLevels = 0;
  slowmo = 0;
  rerolls = 1; skips = 1; banishes = 1;
  revivesUsed = 0;
  superNova = false;
  heat = 0;
  mode = 'standard';
  R: Rng = rng(1);   // spawns, events, elites (daily: same for everyone)
  RD: Rng = rng(2);  // drops and chests
  RC: Rng = rng(3);  // level-up cards
  dmgBy: Record<string, number> = {};
  run = { elites: 0, chests: 0, evolutions: [] as string[], hotfixes: 0, crits: 0, hurtBy: {} as Record<string, number> };
  numBudget = 10;
  numbers = true;
  fx!: Phaser.GameObjects.Graphics;
  auraG!: Phaser.GameObjects.Graphics;
  warnG!: Phaser.GameObjects.Graphics;
  popCols: number[][] = [];
  hud!: { xp: ReturnType<typeof bar>; hpBar: Phaser.GameObjects.Graphics; time: PixelText; lv: PixelText; kills: PixelText; gold: PixelText;
    icons: Phaser.GameObjects.Container; bossBar: ReturnType<typeof bar> | null; bossName: PixelText | null; arrow: Phaser.GameObjects.Image; chestArrow: Phaser.GameObjects.Image };
  banners: { title: string; body: string }[] = [];
  bannerBusy = false;
  bannerObjs: Phaser.GameObjects.GameObject[] = [];
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  diff = DIFF.normal;
  god = false;
  autopilot = false;
  novice = false; // autopilot style: first card, no rerolls, ignores pickups (first-run approachability checks)
  simSpeed = 1;
  pauseObjs: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Game'); }

  // ---------------------------------------------------------------- setup
  create() {
    // Reset all run state (the scene object is reused between runs).
    Object.assign(this, {
      hp: 100, invuln: 0, enemies: [], pool: [], projs: [], gems: [], items: [], level: 1, xp: 0, xpNext: 5, kills: 0, gold: 0,
      elapsed: 0, spawnAcc: 0, boss: null, bossTimer: 0, bossPhase: 0, bossKills: 0, bossLast: '', nextBossAt: BOSS_AT, overtime: -1,
      won: false, over: false, paused: false, modal: null, pendingLevels: 0, slowmo: 0, banners: [], bannerBusy: false, bannerObjs: [],
      simSpeed: 1, stampede: null, puddles: [], blasts: [], hazT: { crate: HAZARDS.crateFrom, puddle: HAZARDS.puddleFrom }, revivesUsed: 0, superNova: false, dmgBy: {}, numBudget: 10, hat: null,
      run: { elites: 0, chests: 0, evolutions: [], hotfixes: 0, crits: 0, hurtBy: {} },
    });
    setJuiceSpeed(1);
    this.weapons = new Map();
    this.passives = new Map();
    this.banished = new Set();
    this.seen = new Set();
    this.grid = new Map();
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.heat = Math.max(0, Math.min(5, K.run.heat | 0));
    this.mode = ['daily', 'endless'].includes(K.run.mode) ? K.run.mode : 'standard';
    const seed = K.run.seed || 1;
    this.R = rng(seed);
    this.RD = rng(seed ^ 0x9e3779b9);
    this.RC = rng(seed ^ 0x85ebca6b);
    const sv = save();
    this.numbers = sv.numbers;
    this.rerolls = 1 + shopLevel('reroll');
    this.skips = 1 + shopLevel('skip');
    this.banishes = 1 + shopLevel('skip');
    this.hero = this.mode === 'daily' ? HEROES[0] : currentHero();
    hooks.scene = 'Game';
    hooks.state = 'playing';
    hooks.elapsed = 0;
    hooks.score = 0;

    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, spr('tile')).setOrigin(0).setDepth(-10);
    this.add.graphics().setDepth(-9).lineStyle(4, K.ui.panelInt, 1).strokeRect(-2, -2, WORLD_W + 4, WORLD_H + 4);
    this.hazG = this.add.graphics().setDepth(-6);
    this.auraG = this.add.graphics().setDepth(-5);
    this.fx = this.add.graphics().setDepth(20);
    this.warnG = this.add.graphics().setDepth(UI + 85).setScrollFactor(0);
    this.player = this.add.sprite(WORLD_W / 2, WORLD_H / 2, spr('player')).setDepth(10);
    this.player.play(anim('player'));
    this.heroTint();
    if (this.hero.hat >= 0 && this.textures.exists(spr('hat'))) {
      this.hat = this.add.image(0, 0, spr('hat'), this.hero.hat).setOrigin(0).setDepth(10.5);
    }
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.player, true, 0.2, 0.2).setRoundPixels(true);
    this.popCols = [0, 1, 2].map((i) => this.sampleColours(spr(`enemy_${i + 1}`)));
    this.popCols.push(this.sampleColours(spr('boss')));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));

    this.buildHud();
    // Start weapon: daily = seeded pick; heroes bring their own if the theme features it.
    const prods = K.theme.products as ProductId[];
    let start = K.theme.game.starting_product as ProductId;
    if (this.mode === 'daily') start = this.R.pick(prods);
    else start = this.hero.weapons.find((w) => prods.includes(w)) ?? start;
    this.addWeapon(start);
    if (this.hero.passive) this.passives.set(this.hero.passive, 1);
    this.recalc();
    this.hp = this.st.maxHp;
    this.refreshIcons();
    // Events at 1:00/2:00/3:00: fixed order on a first run; ring and stampede swap on heat or daily runs.
    // The elite pack always comes last (an early pack is a coin-flip death for a young build).
    const order = [...EVENT_ORDER];
    if (this.heat > 0 || this.mode === 'daily') {
      const head = this.R.shuffle(order.filter((e) => e !== 'pack'));
      order.splice(0, order.length, ...head, ...EVENT_ORDER.filter((e) => e === 'pack'));
    }
    this.evQueue = EVENT_TIMES.map((at, i) => ({ at, id: order[i] }));
    this.eliteQueue = [...(this.heat >= 3 ? [45, 85, 125, 165] : ELITES_AT)];
    void ELITES_EARLY;
    const sub = this.mode === 'endless' ? 'Endless: how long can you last?' : `Survive ${clock(BOSS_AT)} and beat ${theName(K.theme.game.boss.name)}`;
    this.banner(K.theme.game.arena.name.toUpperCase(), sub);
    this.installDebug();
  }

  /** The two most common non-black colours of frame 0: each bug pops in its own colours. */
  private sampleColours(key: string): number[] {
    try {
      const tex = this.textures.get(key);
      const fr = tex.get(0);
      const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const w = Math.min(64, fr.width), h = Math.min(64, fr.height);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const count = new Map<number, number>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        if (d[i] + d[i + 1] + d[i + 2] < 90) continue; // skip outlines
        const col = ((d[i] & 0xf0) << 16) | ((d[i + 1] & 0xf0) << 8) | (d[i + 2] & 0xf0);
        count.set(col, (count.get(col) ?? 0) + 1);
      }
      const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([col]) => col | 0x080808);
      return top.length ? top : [K.ui.accentInt];
    } catch {
      return [K.ui.accentInt, 0xfcfcfc];
    }
  }

  private heroTint() {
    if (this.hero.tint !== null) this.player.setTint(this.hero.tint); else this.player.clearTint();
  }

  /** Rebuild player numbers from base + shop + passives (+ the vortex's pull). */
  recalc() {
    const s = baseStats();
    s.might *= 1 + 0.05 * shopLevel('might');
    s.maxHp += 10 * shopLevel('hp');
    s.speed *= 1 + 0.04 * shopLevel('speed');
    s.magnet *= 1 + 0.15 * shopLevel('magnet');
    s.luck *= 1 + 0.08 * shopLevel('luck');
    s.revives += shopLevel('revive');
    this.passives.forEach((l, id) => PASSIVES[id].apply(s, l));
    if (this.weapons.get('session_replay')?.evo) s.magnet *= 1.6;
    s.revives = Math.max(0, s.revives - this.revivesUsed);
    const grow = s.maxHp - this.st.maxHp;
    this.st = s;
    if (grow > 0) this.hp += grow;
    this.hp = Math.min(this.hp, s.maxHp);
  }

  build(): Build {
    return { weapons: this.weapons, passives: this.passives, banished: this.banished, products: K.theme.products as ProductId[], luck: this.st.luck };
  }

  sfx(name: string, vol = 1, gap = 40) { K.play(name, vol, gap); }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (this.over) return;
    const m = this.modal;
    if (m) {
      if (m.kind === 'chest') {
        if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat && m.armed) this.closeModal();
        return;
      }
      const n = m.cards.length;
      if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(e.code)) this.selectCard((m.sel + n - 1) % n);
      else if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code)) this.selectCard((m.sel + 1) % n);
      else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const i = +e.code.slice(-1) - 1; if (i < n) { this.selectCard(i); this.pickCard(); } }
      else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat) this.pickCard();
      else if (e.code === 'KeyR' && !e.repeat) this.reroll();
      else if (e.code === 'KeyX' && !e.repeat) this.skip();
      else if (e.code === 'KeyB' && !e.repeat) this.banish();
      return;
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      if (this.paused) this.resume(); else this.pause();
      return;
    }
    if (e.code === 'KeyN' && !e.repeat) {
      this.numbers = !this.numbers;
      save().numbers = this.numbers;
      persist();
      if (this.paused) { this.resume(); this.pause(); }
      return;
    }
    if (this.paused && (e.code === 'Enter' || e.code === 'Space')) this.resume();
    if (this.paused && e.code === 'KeyQ') this.scene.start('Title');
  }

  private pause() {
    this.paused = true;
    hooks.state = 'paused';
    const ui = K.ui;
    const g = box(this, W / 2 - 120, H / 2 - 50, 240, 100, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 100);
    const o: Phaser.GameObjects.GameObject[] = [g];
    o.push(text(this, W / 2, H / 2 - 38, 'PAUSED', { scale: 2, align: 'center', color: ui.accentInt, fixed: true, depth: UI + 101 }));
    o.push(text(this, W / 2, H / 2 - 12, 'ENTER resume   Q quit', { align: 'center', fixed: true, depth: UI + 101 }));
    o.push(text(this, W / 2, H / 2 + 2, `N damage numbers: ${this.numbers ? 'ON' : 'OFF'}`, { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 101 }));
    o.push(text(this, W / 2, H / 2 + 14, 'M mute', { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 101 }));
    const info = [this.heat ? `HEAT ${this.heat}` : '', this.mode !== 'standard' ? this.mode.toUpperCase() : '', `HERO ${this.hero.name.toUpperCase()}`]
      .filter(Boolean).join('   ');
    o.push(text(this, W / 2, H / 2 + 30, info, { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 101 }));
    this.pauseObjs = o;
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
    xp.g.setDepth(UI + 90);
    xp.draw(0);
    const hpBar = this.add.graphics().setDepth(11);
    const time = text(this, W / 2, 10, '0:00', { scale: 2, align: 'center', fixed: true, depth: UI + 90 });
    const lv = text(this, W - 4, 10, 'LV 1', { align: 'right', color: ui.accentInt, fixed: true, depth: UI + 90 });
    const kills = text(this, W - 4, 20, 'BUGS 0', { align: 'right', fixed: true, depth: UI + 90 });
    const gold = text(this, W - 4, 30, 'GOLD 0', { align: 'right', color: 0xf8d878, fixed: true, depth: UI + 90 });
    text(this, 4, 10, K.theme.prospect.short.toUpperCase(), { color: ui.dimInt, fixed: true, depth: UI + 90, maxWidth: 170, maxLines: 1 });
    const tags = [this.heat ? `HEAT ${this.heat}` : '', this.mode === 'daily' ? 'DAILY' : this.mode === 'endless' ? 'ENDLESS' : ''].filter(Boolean);
    if (tags.length) text(this, 4, 20, tags.join(' '), { color: 0xf87858, fixed: true, depth: UI + 90 });
    const icons = this.add.container(4, H - 20).setScrollFactor(0).setDepth(UI + 90);
    const arrow = this.add.image(0, 0, spr('boss_shot')).setScrollFactor(0).setDepth(UI + 95).setVisible(false).setScale(2);
    const chestArrow = this.add.image(0, 0, spr('chest')).setScrollFactor(0).setDepth(UI + 95).setVisible(false);
    this.hud = { xp, hpBar, time, lv, kills, gold, icons, bossBar: null, bossName: null, arrow, chestArrow };
  }

  refreshIcons() {
    const c = this.hud.icons;
    c.removeAll(true);
    let x = 0;
    const add = (key: string, lvl: number, evo: boolean) => {
      if (evo) c.add(this.add.rectangle(x - 1, -1, 18, 18, 0xf8d878).setOrigin(0));
      c.add(this.add.image(x, 0, key).setOrigin(0));
      if (!evo) for (let i = 0; i < lvl; i++) c.add(this.add.rectangle(x + 1 + i * 3, 17, 2, 2, K.ui.accentInt).setOrigin(0));
      x += 19;
    };
    this.weapons.forEach((w, id) => add(spr(`icon_${id}`), w.level, w.evo));
    x += 6;
    this.passives.forEach((l, id) => add(spr(`icon_${id}`), l, false));
  }

  private updateHud() {
    this.hud.xp.draw(this.xp / this.xpNext);
    const t = this.overtime > 0 ? this.overtime : this.elapsed;
    this.hud.time.setText(clock(t)).setColor(this.overtime > 0 ? 0xf87858 : 0xfcfcfc);
    this.hud.lv.setText(`LV ${this.level}`);
    this.hud.kills.setText(`BUGS ${this.kills}`);
    this.hud.gold.setText(`GOLD ${this.gold}`);
    const g = this.hud.hpBar;
    const frac = Math.max(0, this.hp / this.st.maxHp);
    const x = Math.round(this.player.x - 10), y = Math.round(this.player.y + 13);
    g.clear().fillStyle(0x000000).fillRect(x - 1, y - 1, 22, 4).fillStyle(0x7c7c7c).fillRect(x, y, 20, 2)
      .fillStyle(frac > 0.35 ? 0x58d854 : 0xf83800).fillRect(x, y, Math.max(0, Math.round(20 * frac)), 2);
    if (this.hat) {
      const flip = this.player.flipX;
      this.hat.setFlipX(flip).setPosition(Math.round(this.player.x - 12 + (flip ? 24 - HAT_DX - 12 : HAT_DX)),
        Math.round(this.player.y - 12 + HAT_DY + (Number(this.player.frame.name) % 2 || 0))).setAlpha(this.player.alpha);
    }
    if (this.boss && this.hud.bossBar) {
      this.hud.bossBar.draw(this.boss.hp / this.boss.maxHp, 0xf83800);
      const cam = this.cameras.main;
      const bx = this.boss.s.x - cam.scrollX, by = this.boss.s.y - cam.scrollY;
      const off = bx < 0 || bx > W || by < 0 || by > H;
      this.hud.arrow.setVisible(off && Math.floor(this.time.now / 250) % 2 === 0);
      if (off) this.hud.arrow.setPosition(Phaser.Math.Clamp(bx, 10, W - 10), Phaser.Math.Clamp(by, 34, H - 30));
    } else {
      this.hud.arrow.setVisible(false);
    }
    // Off-screen chest: a blinking chest icon on the screen edge, toward the nearest one.
    const cam = this.cameras.main, p = this.player;
    let best: Item | null = null, bd = 1e12;
    for (const it of this.items) {
      if (it.kind !== 'chest') continue;
      const d = (it.s.x - p.x) ** 2 + (it.s.y - p.y) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    const ca = this.hud.chestArrow;
    if (best) {
      const cx = best.s.x - cam.scrollX, cy = best.s.y - cam.scrollY;
      const off = cx < 0 || cx > W || cy < 0 || cy > H;
      ca.setVisible(off && Math.floor(this.time.now / 300) % 2 === 0);
      if (off) ca.setPosition(Phaser.Math.Clamp(cx, 12, W - 12), Phaser.Math.Clamp(cy, 40, H - 32));
    } else {
      ca.setVisible(false);
    }
  }

  /** Queue a two-line banner at the top of the screen (new bugs, events, boss). */
  banner(title: string, body: string) {
    this.banners.push({ title, body });
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner() {
    const b = this.banners.shift();
    if (!b) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    const ui = K.ui;
    const g = box(this, 60, 30, W - 120, 34, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 80);
    const t1 = text(this, W / 2, 35, b.title, { align: 'center', color: ui.accentInt, fixed: true, depth: UI + 81, maxWidth: W - 140, maxLines: 1 });
    const t2 = text(this, W / 2, 48, b.body, { align: 'center', fixed: true, depth: UI + 81, maxWidth: W - 140, maxLines: 1 });
    this.bannerObjs = [g, t1, t2];
    if (this.modal) this.showBanner(false);
    this.time.delayedCall(this.banners.length > 2 ? 1600 : 2600, () => {
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
    if (this.autopilot && this.modal?.armed) this.botModal();
    if (!hitstopped(this)) {
      for (let i = 0; i < this.simSpeed && !this.over; i++) this.step(Math.min(dtMs, 50) / 1000);
    }
    this.draw();
    this.updateHud();
    hooks.elapsed = this.elapsed;
    hooks.score = this.score();
    hooks.stats = {
      hp: Math.round(this.hp), maxHp: this.st.maxHp, level: this.level, enemies: this.enemies.length, kills: this.kills,
      gems: this.gems.length, items: this.items.length, projectiles: this.projs.length, boss: this.boss ? Math.round(this.boss.hp) : null,
      weapons: Object.fromEntries([...this.weapons].map(([k, v]) => [k, v.evo ? 'evo' : v.level])),
      passives: Object.fromEntries(this.passives),
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      gold: this.gold, heat: this.heat, mode: this.mode, hero: this.hero.id, elites: this.run.elites, chests: this.run.chests,
      evolutions: this.run.evolutions, bossKills: this.bossKills, superNova: this.superNova, rerolls: this.rerolls,
      hurtBy: this.run.hurtBy,
      dmg: Object.fromEntries(Object.entries(this.dmgBy).map(([k, v]) => [k, Math.round(v)])),
    };
  }

  private step(dt: number) {
    if (this.paused || this.modal) return;
    if (this.slowmo > 0) {
      // Level-up fanfare: a beat of slow motion, then the cards.
      this.slowmo -= dt;
      dt *= 0.25;
      if (this.slowmo <= 0 && this.pendingLevels > 0) { this.openLevelUp(); return; }
    }
    this.elapsed += dt;
    this.numBudget = Math.min(14, this.numBudget + dt * 40);
    this.invuln = Math.max(0, this.invuln - dt);
    const regen = this.heat >= 4 ? 0 : this.diff.regen;
    this.hp = Math.min(this.st.maxHp, this.hp + regen * dt);
    this.runHazards(dt);
    this.movePlayer(dt);
    this.spawn(dt);
    this.buildGrid();
    this.moveEnemies(dt);
    this.weapons.forEach((w) => WEAPON_FNS[w.id](this, w, dt));
    this.moveProjectiles(dt);
    this.moveGems(dt);
    this.moveItems(dt);
    this.touchPlayer();
    this.runBoss(dt);
    if (this.overtime > 0) {
      this.overtime -= dt;
      if (this.overtime <= 0) this.winNow();
    }
    if (this.mode === 'endless' && this.elapsed >= 600) achieve('endless10');
    if (this.pendingLevels > 0 && !this.modal && this.slowmo <= 0 && !this.over) this.levelFanfare();
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
    const sp = this.st.speed * this.puddleSlow();
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * sp * dt, 12, WORLD_W - 12);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * sp * dt, 12, WORLD_H - 12);
  }

  /** Test bot: flee the local crowd, drift toward gems and pickups, stay away from walls. */
  private autopilotDir(): [number, number] {
    const p = this.player;
    let fx = 0, fy = 0;
    for (const e of this.enemies) {
      if (e.arch === 'crate') continue;
      const dx = p.x - e.s.x, dy = p.y - e.s.y;
      const d2 = dx * dx + dy * dy;
      const reach = e.boss ? (this.hp < this.st.maxHp * 0.5 || e.mode >= 1 ? 160 : 70) : e.mode === 3 ? 70 : e.arch === 'runner' || e.mode >= 1 ? 120 : 90;
      if (d2 < reach * reach && d2 > 1) {
        const w = (e.boss ? 6 : e.mode === 3 ? 5 : e.arch === 'runner' ? 3 : e.elite ? 2 : 1) / d2;
        fx += dx * w; fy += dy * w;
      }
    }
    for (const pr of this.projs) {
      if (!pr.hostile) continue;
      const dx = p.x - pr.s.x, dy = p.y - pr.s.y, d2 = dx * dx + dy * dy;
      if (d2 < 60 * 60 && d2 > 1) { fx += (dx * 2) / d2; fy += (dy * 2) / d2; }
    }
    for (const q of this.puddles) {
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d < q.r + 20) { fx += (dx / d) * 0.02; fy += (dy / d) * 0.02; }
    }
    const danger = Math.hypot(fx, fy);
    // Targets: chests and hotfixes first, food when hurt, then the nearest gem.
    let gx = 0, gy = 0, best = 1e9;
    const hurt = this.hp < this.st.maxHp * 0.6;
    for (const it of this.novice ? [] : this.items) {
      if (it.kind === 'food' && !hurt) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, it.s.x, it.s.y) * (it.kind === 'chest' ? 0.3 : it.kind === 'coin' ? 1.2 : 0.6);
      if (d < best) { best = d; gx = it.s.x - p.x; gy = it.s.y - p.y; }
    }
    for (const g of this.gems) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, g.s.x, g.s.y);
      if (d < best) { best = d; gx = g.s.x - p.x; gy = g.s.y - p.y; }
    }
    const gl = Math.hypot(gx, gy) || 1;
    const edge = (v: number, max: number) => (v < 140 ? (140 - v) / 140 : v > max - 140 ? -(v - (max - 140)) / 140 : 0);
    const wx = edge(p.x, WORLD_W) * 0.05;
    const wy = edge(p.y, WORLD_H) * 0.05;
    const dl = danger || 1;
    const fear = Math.min(1, danger * 70);
    const greed = best < 400 ? 1 - fear * 0.8 : 0;
    let x = (fx / dl) * fear + (gx / gl) * greed + wx * 30;
    let y = (fy / dl) * fear + (gy / gl) * greed + wy * 30;
    if (danger < 0.002 && greed === 0) { x += Math.cos(this.elapsed * 0.8); y += Math.sin(this.elapsed * 0.8); }
    return [x, y];
  }

  // ---------------------------------------------------------------- spawning
  // Named heat modifiers stack (1 more, 2 faster, 3 elites early, 4 less healing, 5 boss rage + overtime). On top, heat
  // adds pressure that ramps in over the first 2:30 (x1.5 by 3:45), so the opening stays fair and the snowball is tested:
  // per level up to +15% bug HP and +10% spawns, plus a flat +8% damage.
  private heatRamp() { return Math.min(1.5, this.elapsed / 150); }
  private heatSpawn() { return (this.heat >= 1 ? 1.3 : 1) * (1 + 0.1 * this.heat * this.heatRamp()); }
  private heatSpeed() { return this.heat >= 2 ? 1.18 : 1; }
  private heatHp() { return 1 + 0.15 * this.heat * this.heatRamp(); }
  private heatDmg() { return 1 + 0.08 * this.heat; }

  private spawn(dt: number) {
    if (this.won) return;
    const t = this.elapsed;
    const R = this.R;
    while (this.evQueue.length && t >= this.evQueue[0].at) this.startEvent(this.evQueue.shift()!.id);
    while (this.eliteQueue.length && t >= this.eliteQueue[0]) {
      this.eliteQueue.shift();
      this.spawnElite(R.pick(['splitter', 'tank', 'charger'] as ArchId[]));
    }
    if (this.mode === 'endless' && this.bossKills > 0 && !this.eliteQueue.length) this.eliteQueue.push(t + 40);
    this.runStampede(dt);
    const angry = this.boss && this.bossPhase >= 2;
    if (this.boss && !angry) return; // quiet while the boss fights, until it's angry
    let rate = (1.1 + Math.min(t, this.mode === 'endless' ? 900 : 420) * 0.034) * this.diff.spawn * this.heatSpawn() * (this.boss ? 0.5 : 1);
    if (this.overtime > 0) rate *= 1.6;
    this.spawnAcc += rate * dt;
    const row = [...SPAWN_TABLE].reverse().find((r) => t >= r.at) ?? SPAWN_TABLE[0];
    const entries = Object.entries(row.w) as [ArchId, number][];
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= MAX_ENEMIES) continue;
      let x = R.next();
      let arch: ArchId = entries[0][0];
      for (const [a, w] of entries) { x -= w; if (x <= 0) { arch = a; break; } }
      const [px, py] = this.offscreenPoint();
      this.addEnemy(arch, px, py);
    }
  }

  /** A point just outside the camera view; if that side is beyond the arena wall, the opposite side. */
  offscreenPoint(): [number, number] {
    const cam = this.cameras.main;
    const cx = cam.scrollX + W / 2, cy = cam.scrollY + H / 2;
    const edge = (ang: number): [number, number] => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const k = 1 / Math.max(Math.abs(c) / (W / 2 + 24), Math.abs(s) / (H / 2 + 24));
      return [cx + c * k, cy + s * k];
    };
    const a = this.R.next() * Math.PI * 2;
    let [x, y] = edge(a);
    if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) [x, y] = edge(a + Math.PI);
    return [Phaser.Math.Clamp(x, 8, WORLD_W - 8), Phaser.Math.Clamp(y, 8, WORLD_H - 8)];
  }

  addEnemy(arch: ArchId, x: number, y: number, elite: EliteMod | null = null): Enemy | null {
    if (this.enemies.length >= MAX_ENEMIES && !elite) return null;
    x = Phaser.Math.Clamp(x, 8, WORLD_W - 8);
    y = Phaser.Math.Clamp(y, 8, WORLD_H - 8);
    const A = ARCH[arch];
    const type = A.sprite;
    // Bugs toughen over time; in endless they ramp up hard after 5:00 so every run ends eventually.
    const over = this.mode === 'endless' ? Math.max(0, (this.elapsed - 300) / 60) : 0; // minutes past 5:00
    const late = over ** 2;
    const scale = 1 + this.elapsed / 150 + late;
    let e = this.pool.pop();
    const key = A.key ? spr(A.key) : spr(`enemy_${type + 1}`);
    if (!e) {
      e = { s: this.add.sprite(x, y, key), arch, type, hp: 0, maxHp: 0, speed: 0, dmg: 0, xp: 0, r: 0, kx: 0, ky: 0, flash: 0, slow: 1,
        hitAt: {}, alive: true, elite: null, mode: 0, t: 0, vx: 0, vy: 0, acc: 0, accT: 0, accCrit: false, armour: 1, kb: 1, tint: null };
    }
    const sc = (A.scale ?? 1) * (elite ? 1.6 : 1);
    e.s.setTexture(key).setPosition(x, y).setActive(true).setVisible(true).setDepth(elite ? 6 : 5).setScale(sc).setAlpha(1);
    if (A.key) e.s.stop().setFrame(0);
    else { e.s.play(anim(`enemy_${type + 1}`)); e.s.anims.setProgress(Math.random()); }
    const tint = elite ? ELITE_MODS[elite].tint : A.tint ?? null;
    const speed = A.speed * Phaser.Math.FloatBetween(0.9, 1.1) * this.heatSpeed() * (elite === 'fast' ? 1.5 : 1) * Math.min(1.8, 1 + 0.08 * over);
    Object.assign(e, { arch, type, hp: A.hp * this.diff.hp * scale * this.heatHp() * (elite ? 9 : 1), speed, dmg: A.dmg * this.diff.dmg * this.heatDmg() * (elite ? 1.4 : 1) * (1 + 0.25 * over),
      xp: A.xp * (elite ? 5 : 1), r: A.r * sc, kx: 0, ky: 0, flash: 0, slow: 1, hitAt: {}, alive: true, boss: false, elite, mode: 0,
      t: Phaser.Math.FloatBetween(1.5, 3.5), vx: 0, vy: 0, acc: 0, accT: 0, accCrit: false, armour: (A.armour ?? 1) * (elite === 'shield' ? 0.45 : 1),
      kb: (A.kb ?? 1) * (elite ? 0.3 : 1), tint });
    e.maxHp = e.hp;
    this.restoreTint(e);
    this.enemies.push(e);
    this.announce(arch, type);
    return e;
  }

  private announce(arch: ArchId, type: number) {
    if (arch === 'mini' || arch === 'runner' || arch === 'crate') return;
    const A = ARCH[arch];
    if (!A.trick) {
      if (this.seen.has(`t${type}`)) return;
      this.seen.add(`t${type}`);
      const info = K.theme.game.enemies[type];
      this.banner(`NEW BUG: ${info.name.toUpperCase()}`, info.pain);
    } else if (!this.seen.has(arch)) {
      this.seen.add(arch);
      this.banner(`NEW TRICK: ${arch.toUpperCase()}`, A.trick.replace('{n}', `${bugName(type)}s`));
    }
  }

  restoreTint(e: Enemy) {
    if (e.tint !== null) e.s.setTint(e.tint); else e.s.clearTint();
  }

  spawnElite(arch: ArchId, x?: number, y?: number) {
    const mod = this.R.pick(['fast', 'shield', 'regen'] as EliteMod[]);
    if (x === undefined || y === undefined) [x, y] = this.offscreenPoint();
    const e = this.addEnemy(arch, x, y, mod);
    if (!e) return null;
    this.banner(`ELITE ${bugName(e.type).toUpperCase()}!`, `${ELITE_MODS[mod].label}. Squash it for a chest!`);
    this.sfx('elite', 0.7, 200);
    return e;
  }

  private startEvent(id: EventId) {
    const ev = EVENTS[id];
    this.banner(ev.title, ev.body.replace('{n0}', bugName(0)).replace('{n1}', bugName(1)));
    const p = this.player;
    if (id === 'ring') {
      const n = Math.round(24 * this.diff.spawn * this.heatSpawn());
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.addEnemy('swarmer', p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 170);
      }
    } else if (id === 'stampede') {
      const [dx, dy] = this.R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      this.stampede = { dx, dy, t: 1.6, waves: 3 };
      this.sfx('charge', 0.6, 100);
    } else {
      const arches: ArchId[] = ['splitter', 'tank', 'charger'];
      arches.forEach((a, i) => {
        const ang = this.R.next() * 0.5 + (i / 3) * Math.PI * 2;
        this.spawnElite(a, p.x + Math.cos(ang) * 210, p.y + Math.sin(ang) * 150);
      });
      for (let i = 0; i < 8; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy('swarmer', x, y); }
    }
    capture('bug_event', { event: id, t: Math.round(this.elapsed) });
  }

  /** Stampede: warning arrows on the entry edge, then waves of runners straight across the screen. */
  private runStampede(dt: number) {
    const st = this.stampede;
    this.warnG.clear();
    if (!st) return;
    st.t -= dt;
    if (st.waves === 3 && st.t > 0 && Math.floor(st.t * 6) % 2 === 0) {
      // Flashing chevrons on the side the herd comes from.
      this.warnG.fillStyle(0xf87858, 1);
      for (let i = 1; i < 6; i++) {
        const ex = st.dx > 0 ? 8 : st.dx < 0 ? W - 8 : (W * i) / 6;
        const ey = st.dy > 0 ? 40 : st.dy < 0 ? H - 30 : (H * i) / 6;
        const ax = st.dx * 8, ay = st.dy * 8;
        const px = -st.dy * 7, py = st.dx * 7;
        this.warnG.fillTriangle(ex + ax, ey + ay, ex - ax + px, ey - ay + py, ex - ax - px, ey - ay - py);
      }
    }
    if (st.t > 0) return;
    const cam = this.cameras.main;
    const n = 12;
    const gap = this.R.int(2, n - 4);
    for (let i = 0; i < n; i++) {
      if (i === gap || i === gap + 1) continue; // always a way through
      const f = (i + 0.5) / n;
      const x = st.dx > 0 ? cam.scrollX - 16 : st.dx < 0 ? cam.scrollX + W + 16 : cam.scrollX + f * W;
      const y = st.dy > 0 ? cam.scrollY - 16 : st.dy < 0 ? cam.scrollY + H + 16 : cam.scrollY + f * H;
      const e = this.addEnemy('runner', x, y);
      if (e) { e.vx = st.dx; e.vy = st.dy; e.t = 9; e.s.setPosition(x, y); }
    }
    st.waves--;
    st.t = 0.9;
    if (st.waves <= 0) this.stampede = null;
  }

  private buildGrid() {
    for (const cell of this.grid.values()) cell.length = 0; // reuse cell arrays (no per-step allocation)
    for (const e of this.enemies) {
      const k = ((e.s.x >> 5) << 8) | (e.s.y >> 5);
      const cell = this.grid.get(k);
      if (cell) cell.push(e); else this.grid.set(k, [e]);
    }
  }

  /** Enemies within r of (x, y), via the 32px grid. */
  near(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    for (let cx = (x - r - 24) >> 5; cx <= (x + r + 24) >> 5; cx++) {
      for (let cy = (y - r - 24) >> 5; cy <= (y + r + 24) >> 5; cy++) {
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

  nearest(x: number, y: number, maxR = 400): Enemy | null {
    let best: Enemy | null = null, bd = maxR * maxR;
    for (const e of this.enemies) {
      if (!e.alive || e.arch === 'crate' || e.arch === 'runner' && e.t > 8.5) continue;
      const d = (e.s.x - x) ** 2 + (e.s.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------- enemy behaviour
  private moveEnemies(dt: number) {
    const px = this.player.x, py = this.player.y;
    const sv = aura(this.weapons.get('surveys'), this.st);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue; // a blast earlier in this loop removed more than one bug
      if (e.boss) { this.moveBoss(e, dt); continue; }
      let dx = px - e.s.x, dy = py - e.s.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      e.slow = sv.r && d < sv.r + e.r ? sv.slow : 1;
      if (e.elite === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);
      let mx = dx, my = dy, sp = e.speed;
      switch (e.arch) {
        case 'crate':
          sp = 0; mx = 0; my = 0;
          break;
        case 'runner':
          mx = e.vx; my = e.vy;
          e.t -= dt;
          if (e.t <= 0 || e.s.x < -40 || e.s.y < -40 || e.s.x > WORLD_W + 40 || e.s.y > WORLD_H + 40) { this.despawn(e, i); continue; }
          break;
        case 'exploder':
          if (e.mode === 0 && d < 30) { e.mode = 3; e.t = 0.8; this.sfx('fuse', 0.4, 120); }
          if (e.mode === 3) {
            sp = 0;
            e.t -= dt;
            if (e.flash <= 0) e.s.setTintFill(Math.floor(e.t * 12) % 2 ? 0xfcfcfc : 0xf83800);
            if (e.t <= 0) { this.explode(e); continue; }
          }
          break;
        case 'charger':
          e.t -= dt;
          if (e.mode === 0 && e.t <= 0 && d < 160) { e.mode = 1; e.t = 0.65; e.vx = dx; e.vy = dy; this.sfx('charge', 0.4, 150); }
          else if (e.mode === 1) { sp = 0; if (e.t <= 0) { e.mode = 2; e.t = 0.5; } }
          else if (e.mode === 2) { mx = e.vx; my = e.vy; sp = 240 * this.heatSpeed(); if (e.t <= 0) { e.mode = 0; e.t = Phaser.Math.FloatBetween(2.2, 3.4); } }
          break;
        case 'spitter':
          e.t -= dt;
          if (d < 100) { mx = -dx; my = -dy; sp *= 0.7; } else if (d < 150) { mx = -dy; my = dx; sp *= 0.5; }
          if (e.t <= 0 && d < 230) {
            e.t = Phaser.Math.FloatBetween(2.4, 3.2);
            this.shoot('boss_shot', e.s.x, e.s.y, dx * 70, dy * 70, 9 * this.diff.dmg, 4, 1, 'spit', true).s.setScale(0.75);
            this.sfx('spit', 0.3, 120);
          }
          break;
      }
      // Separation from neighbours in the same cell keeps swarms readable.
      let sx = 0, sy = 0;
      const cell = this.grid.get(((e.s.x >> 5) << 8) | (e.s.y >> 5));
      if (cell && cell.length > 1 && e.mode !== 2 && e.arch !== 'crate') {
        for (const o of cell) {
          if (o === e) continue;
          const ox = e.s.x - o.s.x, oy = e.s.y - o.s.y;
          const od = ox * ox + oy * oy;
          const min = e.r + o.r;
          if (od < min * min && od > 0.01) { const f = (min - Math.sqrt(od)) / min; sx += ox * f; sy += oy * f; }
        }
      }
      const v = sp * (e.mode === 2 ? 1 : e.slow);
      e.s.x += (mx * v + e.kx + sx * 4) * dt;
      e.s.y += (my * v + e.ky + sy * 4) * dt;
      if (e.arch !== 'runner') {
        e.s.x = Phaser.Math.Clamp(e.s.x, 4, WORLD_W - 4);
        e.s.y = Phaser.Math.Clamp(e.s.y, 4, WORLD_H - 4);
      }
      e.kx *= 0.86; e.ky *= 0.86;
      e.s.setFlipX(mx < 0);
      if (e.flash > -1000) {
        const was = e.flash;
        e.flash -= dt * 1000;
        if (was > 0 && e.flash <= 0 && e.mode !== 3) this.restoreTint(e);
      }
      if (e.acc > 0) { e.accT -= dt; if (e.accT <= 0) this.flushNumber(e); }
    }
  }

  /** Charger telegraph lines and elite shields, drawn each frame. */
  private drawEnemyFx() {
    const g = this.fx;
    for (const e of this.enemies) {
      if (e.arch === 'charger' && e.mode === 1) {
        const on = Math.floor(e.t * 16) % 2 === 0;
        g.lineStyle(1, 0xf83800, on ? 0.9 : 0.4).lineBetween(e.s.x, e.s.y, e.s.x + e.vx * 110, e.s.y + e.vy * 110);
        if (on) e.s.setTintFill(0xf87858); else this.restoreTint(e);
      }
      if (e.arch === 'exploder' && e.mode === 3 && Math.floor(e.t * 10) % 2 === 0) {
        g.lineStyle(1, 0xf83800, 0.8).strokeCircle(e.s.x, e.s.y, 36);
      }
      if (e.elite === 'shield') g.lineStyle(1, 0x78c8f8, 0.8).strokeCircle(e.s.x, e.s.y, e.r + 3);
      if (e.elite && Math.floor(this.time.now / 300) % 2) g.fillStyle(0xf8d878, 1).fillRect(e.s.x - 1, e.s.y - e.r - 6, 3, 3);
    }
  }

  private drawBlasts(dt: number) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / 0.25;
      if (k >= 1) { this.blasts.splice(i, 1); continue; }
      this.fx.fillStyle(k < 0.3 ? 0xfcfcfc : 0xf8b800, 0.6 * (1 - k)).fillCircle(b.x, b.y, b.r * (0.6 + 0.4 * k));
    }
  }

  private explode(e: Enemy) {
    const x = e.s.x, y = e.s.y, R = 36;
    burst(this, x, y, 0xf8b800, 22, { speed: 170, colours: [0xf83800, 0xfcfcfc] });
    this.blasts.push({ x, y, r: R, t: 0 });
    shake(this, 2, 120);
    this.sfx('explode', 0.35, 80);
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < R + 6) this.hurt(16 * this.diff.dmg, 'blast');
    this.kill(e, false, true);
    // Chain reactions: the blast hurts other bugs too.
    for (const o of this.near(x, y, R)) if (o !== e && !o.boss) this.damage(o, 20, 0, 0, 'blast');
  }

  private despawn(e: Enemy, i: number) {
    e.alive = false;
    this.enemies.splice(i, 1);
    e.s.setActive(false).setVisible(false).stop();
    this.pool.push(e);
  }

  // ---------------------------------------------------------------- damage
  damage(e: Enemy, dmg: number, kx = 0, ky = 0, src = '', quiet = false) {
    if (!e.alive) return;
    const crit = !quiet && Math.random() < this.st.crit;
    let d = dmg * this.st.might * e.armour * (crit ? 2 : 1);
    if (e.boss) d *= this.bossVuln();
    d = Math.min(d, Math.max(0, e.hp) + 1);
    e.hp -= d;
    this.dmgBy[src] = (this.dmgBy[src] ?? 0) + d;
    if (crit) this.run.crits++;
    // Flash white on hit; the boss is hit constantly, so it only blinks every so often.
    if (e.mode !== 3 && (!e.boss || e.flash < -120)) { e.flash = 70; e.s.setTintFill(0xffffff); }
    if (!e.boss) { e.kx += kx * e.kb; e.ky += ky * e.kb; }
    if (this.numbers && d >= 1) {
      if (e.acc === 0) e.accT = e.boss ? 0.4 : 0.25;
      e.acc += d;
      e.accCrit ||= crit;
    }
    if (e.hp <= 0) {
      this.kill(e, crit);
    } else {
      this.sfx(crit ? 'crit' : 'hit', 0.5, 60);
    }
  }

  /** Merged damage numbers: one per bug per quarter second, within a global budget. */
  private flushNumber(e: Enemy) {
    const v = Math.round(e.acc);
    const crit = e.accCrit;
    e.acc = 0; e.accCrit = false;
    if (!this.numbers || v < 1 || this.numBudget < 1) return;
    this.numBudget -= 1;
    floatText(this, e.s.x + Phaser.Math.Between(-3, 3), e.s.y - e.r - 6, crit ? `${v}!` : v, crit ? 0xf8d878 : 0xfcfcfc, crit ? 0.8 : 0.55);
  }

  kill(e: Enemy, crit = false, blast = false) {
    if (!e.alive) return;
    e.alive = false;
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    if (e.acc > 0) this.flushNumber(e);
    const cols = this.popCols[e.type] ?? [K.ui.accentInt];
    const big = e.boss || e.elite || e.arch === 'tank';
    burst(this, e.s.x, e.s.y, cols[0], e.boss ? 60 : e.elite ? 30 : big ? 12 : 7,
      { colours: [...cols.slice(1), 0xfcfcfc], speed: e.boss ? 200 : e.elite ? 150 : 100 });
    if (e.boss) { this.bossDown(e); return; }
    e.s.setActive(false).setVisible(false).stop();
    if (e.arch === 'crate') { this.pool.push(e); this.crateLoot(e.s.x, e.s.y); return; }
    this.kills++;
    this.sfx('kill', 0.5, 50);
    if (e.elite) {
      this.run.elites++;
      if (this.run.elites >= 5) achieve('elites5');
      hitstop(this, 70);
      shake(this, 3, 160);
      this.dropItem('chest', e.s.x, e.s.y);
      for (let k = 0; k < 4; k++) this.dropItem('coin', e.s.x + Phaser.Math.Between(-12, 12), e.s.y + Phaser.Math.Between(-12, 12));
    } else if (crit && big) {
      hitstop(this, 35);
    }
    if (e.arch === 'splitter') {
      for (const s of [-1, 1]) {
        const m = this.addEnemy('mini', e.s.x + s * 6, e.s.y + s * 3);
        if (m) { m.kx = s * 120; m.ky = Phaser.Math.Between(-60, 60); }
      }
    }
    if (e.arch !== 'runner' || !blast) this.dropLoot(e);
    this.pool.push(e); // last: the splitter's minis must not reuse this object before its loot is dropped
  }

  private crateLoot(x: number, y: number) {
    burst(this, x, y, 0xac7c00, 12, { colours: [0x503000, 0xf8d878] });
    this.sfx('hit', 0.6);
    const r = this.RD.next() / this.st.luck;
    const heal = this.heat >= 4 ? 0.5 : 1;
    if (r < 0.4 * heal) this.dropItem('food', x, y);
    else if (r < 0.52) this.dropItem('vacuum', x, y);
    else if (r < 0.58) this.dropItem('hotfix', x, y);
    else for (let k = 0; k < 3; k++) this.dropItem('coin', x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8));
  }

  /** Crates to break and tech-debt puddles that spread and slow the hog. */
  private runHazards(dt: number) {
    const H_ = HAZARDS, p = this.player;
    this.hazT.crate -= dt;
    if (this.hazT.crate <= 0) {
      this.hazT.crate = H_.crateEvery;
      if (this.enemies.filter((e) => e.arch === 'crate').length < H_.crateMax) {
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(110, 180);
        this.addEnemy('crate', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
    }
    this.hazT.puddle -= dt;
    if (this.hazT.puddle <= 0) {
      this.hazT.puddle = H_.puddleEvery;
      if (this.puddles.length < H_.puddleMax) {
        const a = this.R.next() * Math.PI * 2, d = 120 + this.R.next() * 80;
        this.puddles.push({ x: Phaser.Math.Clamp(p.x + Math.cos(a) * d, 40, WORLD_W - 40), y: Phaser.Math.Clamp(p.y + Math.sin(a) * d, 40, WORLD_H - 40), r: 6, age: 0 });
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.age += dt;
      const max = H_.puddleR + this.heat * 3;
      q.r = q.age < H_.puddleGrow ? 6 + (max - 6) * (q.age / H_.puddleGrow) : q.age > H_.puddleLife - 3 ? max * Math.max(0, (H_.puddleLife - q.age) / 3) : max;
      if (q.age >= H_.puddleLife) this.puddles.splice(i, 1);
    }
  }

  /** Player speed factor from puddles (1 = dry). */
  private puddleSlow() {
    const p = this.player;
    for (const q of this.puddles) if ((p.x - q.x) ** 2 + ((p.y - q.y) * 1.5) ** 2 < q.r * q.r) return HAZARDS.puddleSlow;
    return 1;
  }

  private drawHazards() {
    const g = this.hazG;
    g.clear();
    for (const q of this.puddles) {
      g.fillStyle(0x305010, 0.75).fillEllipse(q.x, q.y, q.r * 2, q.r * 1.33);
      g.fillStyle(0x587818, 0.8).fillEllipse(q.x - q.r * 0.2, q.y - q.r * 0.1, q.r * 1.2, q.r * 0.7);
      // A few bubbles that pop in and out.
      for (let k = 0; k < 3; k++) {
        const t = (this.time.now / 700 + k * 0.37 + q.x * 0.01) % 1;
        if (t < 0.6) g.fillStyle(0x98b838, 1).fillRect(Math.round(q.x + Math.cos(k * 2.1 + q.y) * q.r * 0.5), Math.round(q.y + Math.sin(k * 2.1 + q.x) * q.r * 0.3), 2, 2);
      }
    }
  }

  private dropLoot(e: Enemy) {
    const R = this.RD, L = this.st.luck;
    this.dropGem(e.s.x, e.s.y, e.xp);
    const healMul = this.heat >= 4 ? 0.5 : 1;
    const small = e.arch === 'swarmer' || e.arch === 'mini' || e.arch === 'runner';
    const roll = R.next();
    const has = (k: ItemKind) => this.items.some((it) => it.kind === k);
    if (roll < (small ? 0.006 : 0.025) * L * healMul) this.dropItem('food', e.s.x, e.s.y);
    else if (roll < 0.04 * L) this.dropItem('coin', e.s.x + 4, e.s.y);
    else if (roll < 0.043 * L && !has('vacuum') && this.elapsed > 30) this.dropItem('vacuum', e.s.x, e.s.y);
    else if (roll < 0.0455 * L && !has('hotfix') && this.elapsed > 45) this.dropItem('hotfix', e.s.x, e.s.y);
  }

  // ---------------------------------------------------------------- gems, items, xp
  private dropGem(x: number, y: number, v: number) {
    if (this.gems.length >= MAX_GEMS) {
      this.gems[Math.floor(Math.random() * this.gems.length)].v += v;
      return;
    }
    const s = this.add.image(x, y, spr('gem')).setDepth(3);
    if (v >= 5) s.setTint(0xf878f8); else if (v >= 2) s.setTint(0x58d854);
    this.gems.push({ s, v, pull: false });
  }

  dropItem(kind: ItemKind, x: number, y: number, big = false) {
    if (this.items.length >= MAX_ITEMS) {
      const old = this.items.findIndex((it) => it.kind === 'coin');
      if (old < 0 || kind === 'coin') return;
      this.items[old].s.destroy();
      this.items.splice(old, 1);
    }
    const key = kind === 'chest' ? 'chest' : kind;
    const s = this.add.image(Phaser.Math.Clamp(x, 10, WORLD_W - 10), Phaser.Math.Clamp(y, 10, WORLD_H - 10), spr(key)).setDepth(kind === 'chest' ? 4 : 3);
    if (big) s.setScale(1.5).setTint(0xf8d878);
    // A little hop so drops read as drops.
    this.tweens.add({ targets: s, y: s.y - 8, duration: 140, yoyo: true, ease: 'Quad.Out' });
    this.items.push({ s, kind, pull: false, big });
  }

  private moveGems(dt: number) {
    const px = this.player.x, py = this.player.y, mag = this.st.magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = px - g.s.x, dy = py - g.s.y, d = Math.hypot(dx, dy);
      if (d < mag) g.pull = true;
      if (g.pull) {
        const sp = (d > 120 ? 420 : 200) * dt;
        g.s.x += (dx / (d || 1)) * Math.min(sp, d);
        g.s.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (d < 9) {
        g.s.destroy();
        this.gems.splice(i, 1);
        this.gainXp(g.v);
      }
    }
  }

  private moveItems(dt: number) {
    const p = this.player, mag = this.st.magnet;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it) continue;
      const dx = p.x - it.s.x, dy = p.y - it.s.y, d = Math.hypot(dx, dy);
      if (it.kind === 'coin' && d < mag) it.pull = true;
      if (it.pull) {
        const sp = 220 * dt;
        it.s.x += (dx / (d || 1)) * Math.min(sp, d);
        it.s.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (it.kind === 'chest') it.s.setFrame(Math.floor(this.time.now / 250) % 2);
      if (it.kind === 'chest' && this.modal) continue; // one chest at a time
      if (d < (it.kind === 'chest' ? 14 : 10)) {
        it.s.destroy();
        this.items.splice(i, 1);
        this.collect(it);
      }
    }
  }

  private collect(it: Item) {
    const p = this.player;
    switch (it.kind) {
      case 'coin': {
        const v = Math.max(1, Math.round((1 + this.heat * 0.1) * (it.big ? 10 : 1)));
        this.gold += v;
        this.sfx('coin', 0.4, 50);
        punchText(this.hud.gold);
        break;
      }
      case 'food': {
        const heal = HEAL_AMOUNT;
        this.hp = Math.min(this.st.maxHp, this.hp + heal);
        floatText(this, p.x, p.y - 18, `+${heal}`, 0x58d854);
        this.sfx('food', 0.6);
        break;
      }
      case 'vacuum':
        // Every gem on the map flies in.
        this.gems.forEach((g) => (g.pull = true));
        this.items.forEach((o) => { if (o.kind === 'coin') o.pull = true; });
        burst(this, p.x, p.y, 0x3cbcfc, 16, { speed: 140, gravity: 0 });
        this.sfx('vacuum', 0.8);
        break;
      case 'hotfix': this.hotfix(); break;
      case 'chest': this.openChest(it.big); break;
    }
  }

  /** Screen-clearing bomb: every bug on screen is squashed; the boss takes a chip. */
  hotfix() {
    const cam = this.cameras.main;
    this.run.hotfixes++;
    achieve('hotfix');
    this.sfx('bomb', 0.9);
    cam.flash(250, 255, 255, 255);
    shake(this, 6, 350);
    hitstop(this, 90);
    for (const e of [...this.enemies]) {
      const onScreen = e.s.x > cam.scrollX - 8 && e.s.x < cam.scrollX + W + 8 && e.s.y > cam.scrollY - 8 && e.s.y < cam.scrollY + H + 8;
      if (!onScreen) continue;
      if (e.boss) this.damage(e, (e.maxHp * 0.06) / this.st.might, 0, 0, 'hotfix', true);
      else this.damage(e, 99999, 0, 0, 'hotfix', true);
    }
  }

  gainXp(v: number) {
    this.sfx(this.pendingLevels ? 'gem3' : this.xp > this.xpNext * 0.6 ? 'gem2' : 'pickup', 0.4, 45);
    this.xp += v * this.st.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.floor(3 + this.level * 2.2 + this.level ** 1.3);
      this.pendingLevels++;
      if (this.level >= 20) achieve('level20');
    }
  }

  // ---------------------------------------------------------------- level-up
  private levelFanfare() {
    const p = this.player;
    this.slowmo = 0.4;
    this.sfx('levelup');
    burst(this, p.x, p.y, K.ui.accentInt, 26, { speed: 170, gravity: 0, colours: [0xfcfcfc, 0xf8d878] });
    floatText(this, p.x, p.y - 22, 'LEVEL UP!', K.ui.accentInt, 0.9);
  }

  private openLevelUp(cards?: Card[]) {
    if (!cards) this.pendingLevels--;
    this.modal?.objs.forEach((o) => o.destroy());
    cards ??= drawCards(this.build(), () => this.RC.next());
    hooks.state = 'levelup';
    const ui = K.ui;
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.showBanner(false);
    objs.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setScrollFactor(0).setDepth(UI + 100));
    objs.push(text(this, W / 2, 20, 'LEVEL UP!', { scale: 2, align: 'center', color: ui.accentInt, fixed: true, depth: UI + 101 }));
    objs.push(text(this, W / 2, 40, 'Pick a PostHog product or upgrade', { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 101 }));
    const cw = 136, gap = 12, x0 = (W - (cw * cards.length + gap * (cards.length - 1))) / 2;
    const partners = partnersOf(this.build());
    cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap), y = 56;
      objs.push(box(this, x, y, cw, 156, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
      const iconKey = c.kind === 'heal' ? spr('food') : c.kind === 'gold' ? spr('coin') : spr(`icon_${c.id}`);
      objs.push(this.add.image(x + cw / 2, y + 24, iconKey).setScale(2).setScrollFactor(0).setDepth(UI + 102));
      let name: string, tag: string, line: string, hint = '';
      if (c.kind === 'weapon') {
        const w = this.weapons.get(c.id as ProductId);
        const evo = WEAPONS[c.id as ProductId].evo;
        name = productName(c.id);
        tag = w ? (w.level + 1 >= MAX_LEVEL ? 'LV MAX' : `LV ${w.level + 1}`) : 'NEW!';
        line = w ? WEAPONS[c.id as ProductId].upgrade : productLine(c.id);
        hint = `Evolves with ${PASSIVES[evo.passive].name}`;
      } else if (c.kind === 'passive') {
        const id = c.id as PassiveId;
        const l = this.passives.get(id) ?? 0;
        name = PASSIVES[id].name;
        tag = l ? `LV ${l + 1}` : 'NEW!';
        line = PASSIVES[id].line;
        const w = [...this.weapons.values()].find((x) => !x.evo && WEAPONS[x.id].evo.passive === id);
        if (w && partners.has(id)) hint = `Evolves ${productName(w.id)}`;
      } else if (c.kind === 'heal') { name = 'Snack'; tag = ''; line = 'Heal 30 HP'; }
      else { name = 'Bonus'; tag = ''; line = '+10 gold'; }
      objs.push(text(this, x + cw / 2, y + 44, name, { align: 'center', color: ui.textInt, fixed: true, depth: UI + 102, maxWidth: cw - 12, maxLines: 2 }));
      objs.push(text(this, x + cw / 2, y + 68, tag, { align: 'center', color: ui.accentInt, fixed: true, depth: UI + 102 }));
      objs.push(text(this, x + cw / 2, y + 82, line, { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 102, maxWidth: cw - 14, maxLines: 4 }));
      if (hint) objs.push(text(this, x + cw / 2, y + 128, hint, { align: 'center', color: 0xf8d878, fixed: true, depth: UI + 102, maxWidth: cw - 10, maxLines: 2 }));
    });
    const sel = this.add.graphics().setScrollFactor(0).setDepth(UI + 103);
    objs.push(sel);
    const acts = [`R REROLL ${this.rerolls}`, `X SKIP ${this.skips}`, `B BANISH ${this.banishes}`];
    objs.push(text(this, W / 2, 222, acts.join('    '), { align: 'center', color: ui.textInt, fixed: true, depth: UI + 101 }));
    objs.push(text(this, W / 2, 238, 'LEFT/RIGHT choose   ENTER pick', { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 101 }));
    const m: Modal = { kind: 'levelup', cards, sel: 0, objs, armed: false };
    this.modal = m;
    // Ignore Enter for a moment so a held key doesn't pick blindly.
    this.time.delayedCall(350, () => (m.armed = true));
    this.selectCard(0, true);
  }

  private selectCard(i: number, silent = false) {
    const m = this.modal;
    if (!m || m.kind !== 'levelup') return;
    m.sel = i;
    const n = m.cards.length;
    const cw = 136, gap = 12, x0 = (W - (cw * n + gap * (n - 1))) / 2;
    const g = m.objs.find((o) => o instanceof Phaser.GameObjects.Graphics && o.depth === UI + 103) as Phaser.GameObjects.Graphics;
    g.clear().lineStyle(2, K.ui.accentInt, 1).strokeRect(x0 + i * (cw + gap) - 2, 54, cw + 4, 160);
    if (!silent) this.sfx('move', 0.5);
  }

  private reroll() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.rerolls <= 0) { this.sfx('hurt', 0.3, 100); return; }
    this.rerolls--;
    this.sfx('select');
    this.openLevelUp(drawCards(this.build(), () => this.RC.next()));
  }

  private skip() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.skips <= 0) { this.sfx('hurt', 0.3, 100); return; }
    this.skips--;
    this.gold += 3;
    this.closeModal();
  }

  private banish() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed || this.banishes <= 0) { this.sfx('hurt', 0.3, 100); return; }
    const c = m.cards[m.sel];
    if (c.kind !== 'weapon' && c.kind !== 'passive') return;
    this.banishes--;
    this.banished.add(c.id);
    this.sfx('explode', 0.3);
    this.openLevelUp(drawCards(this.build(), () => this.RC.next()));
  }

  private pickCard() {
    const m = this.modal;
    if (!m || m.kind !== 'levelup' || !m.armed) return;
    const c = m.cards[m.sel];
    this.sfx('select');
    this.applyCard(c);
    this.closeModal();
  }

  applyCard(c: Card) {
    if (c.kind === 'weapon') {
      const w = this.weapons.get(c.id as ProductId);
      if (w) w.level = Math.min(MAX_LEVEL, w.level + 1); else this.addWeapon(c.id as ProductId);
      capture('product_picked', { product: c.id, level: this.weapons.get(c.id as ProductId)!.level, player_level: this.level });
      if ([...this.weapons.values()].filter((x) => x.level >= MAX_LEVEL).length >= 3) achieve('full_stack');
    } else if (c.kind === 'passive') {
      const id = c.id as PassiveId;
      this.passives.set(id, Math.min(PASSIVES[id].max, (this.passives.get(id) ?? 0) + 1));
    } else if (c.kind === 'heal') {
      this.hp += 30;
    } else {
      this.gold += 10;
    }
    this.recalc();
    this.refreshIcons();
    this.checkReady();
  }

  /** One banner the moment a weapon can evolve, so players know to go hunting for a chest. */
  private checkReady() {
    for (const w of this.weapons.values()) {
      const pid = WEAPONS[w.id].evo.passive;
      if (w.evo || w.level < MAX_LEVEL || !this.passives.has(pid) || this.seen.has(`ready:${w.id}`)) continue;
      this.seen.add(`ready:${w.id}`);
      this.banner('EVOLUTION READY!', `${productName(w.id)}: open a chest from an elite`);
    }
  }

  private closeModal() {
    const m = this.modal;
    if (!m) return;
    m.objs.forEach((o) => o.destroy());
    this.modal = null;
    this.showBanner(true);
    hooks.state = this.boss ? 'boss' : 'playing';
    this.refreshIcons();
  }

  /** Autopilot at a modal: close chests, pick the best card (reroll a weak hand once). */
  private botModal() {
    const m = this.modal!;
    if (m.kind === 'chest') { this.closeModal(); return; }
    if (this.novice) { this.selectCard(0, true); this.pickCard(); return; }
    const b = this.build();
    const ranks = m.cards.map((c) => botRank(c, b));
    const best = Math.max(...ranks);
    if (best < 5 && this.rerolls > 0) { this.reroll(); return; }
    this.selectCard(ranks.indexOf(best), true);
    this.pickCard();
  }

  // ---------------------------------------------------------------- chests + evolutions
  private openChest(big = false) {
    const R = this.RD;
    this.run.chests++;
    const sv = save();
    sv.chests++;
    const lines: [string, string, number][] = []; // [title, line, colour]
    let title = 'CHEST!';
    const ready = [...this.weapons.values()].filter((w) => !w.evo && w.level >= MAX_LEVEL && this.passives.has(WEAPONS[w.id].evo.passive));
    const a = this.weapons.get(SUPER.a), b = this.weapons.get(SUPER.b);
    if (ready.length) {
      const w = R.pick(ready);
      this.evolve(w);
      title = 'EVOLUTION!';
      lines.push([WEAPONS[w.id].evo.name, WEAPONS[w.id].evo.line, 0xf8d878]);
    } else if (a?.evo && b?.evo && !this.superNova) {
      this.superNova = true;
      title = 'FUSION!';
      lines.push([SUPER.name, SUPER.line, 0xf878f8]);
      achieve('super');
      this.codex(SUPER.name);
    } else {
      // No evolution ready: level up 1-3 things you own, plus gold.
      const n = 1 + (R.next() < 0.25 * this.st.luck ? 1 : 0) + (big || R.next() < 0.08 * this.st.luck ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const opts: Card[] = [
          ...[...this.weapons.values()].filter((w) => w.level < MAX_LEVEL).map((w) => ({ kind: 'weapon' as const, id: w.id })),
          ...[...this.passives].filter(([id, l]) => l < PASSIVES[id].max).map(([id]) => ({ kind: 'passive' as const, id })),
        ];
        if (!opts.length) break;
        const c = R.pick(opts);
        this.applyCard(c);
        const nm = c.kind === 'weapon' ? productName(c.id) : PASSIVES[c.id as PassiveId].name;
        const lv = c.kind === 'weapon' ? this.weapons.get(c.id as ProductId)!.level : this.passives.get(c.id as PassiveId)!;
        lines.push([nm, `now level ${lv}`, 0xfcfcfc]);
      }
      if (!lines.length) { this.hp = this.st.maxHp; lines.push(['Full heal', 'Back to full HP', 0x58d854]); }
    }
    const g = Math.round((big ? 40 : 10 + R.int(0, 12)) * this.st.luck * (1 + this.heat * 0.1));
    this.gold += g;
    lines.push([`+${g} gold`, '', 0xf8d878]);
    persist();
    this.showChest(title, lines);
  }

  evolve(w: WState) {
    w.evo = true;
    w.level = MAX_LEVEL;
    resetVisuals(w);
    const name = WEAPONS[w.id].evo.name;
    this.run.evolutions.push(name);
    achieve('evolve');
    this.codex(name);
    this.recalc();
    this.refreshIcons();
    capture('weapon_evolved', { product: w.id, evolution: name, t: Math.round(this.elapsed) });
  }

  private codex(name: string) {
    const sv = save();
    if (!sv.codex.includes(name)) { sv.codex.push(name); persist(); }
  }

  private showChest(title: string, lines: [string, string, number][]) {
    const ui = K.ui;
    const evo = title !== 'CHEST!';
    this.sfx(evo ? 'evolve' : 'chest', 0.9);
    const p = this.player;
    burst(this, p.x, p.y, 0xf8d878, evo ? 40 : 20, { speed: evo ? 220 : 150, gravity: 0, colours: [0xfcfcfc, K.ui.accentInt] });
    if (evo) { shake(this, 4, 250); this.cameras.main.flash(200, 255, 240, 180); }
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.showBanner(false);
    const h = 44 + lines.length * 20;
    const y0 = Math.round(H / 2 - h / 2);
    objs.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setScrollFactor(0).setDepth(UI + 100));
    objs.push(box(this, W / 2 - 130, y0, 260, h, ui.bgInt, 0xf8d878, ui.panelInt).setScrollFactor(0).setDepth(UI + 101));
    objs.push(this.add.image(W / 2 - 110, y0 + 16, spr('chest'), 1).setScale(2).setScrollFactor(0).setDepth(UI + 102));
    objs.push(text(this, W / 2 + 10, y0 + 9, title, { scale: 2, align: 'center', color: 0xf8d878, fixed: true, depth: UI + 102 }));
    lines.forEach(([a, b, col], i) => {
      const y = y0 + 34 + i * 20;
      objs.push(text(this, W / 2, y, a, { align: 'center', color: col, fixed: true, depth: UI + 102, maxWidth: 240, maxLines: 1 }));
      if (b) objs.push(text(this, W / 2, y + 9, b, { align: 'center', color: ui.dimInt, fixed: true, depth: UI + 102, maxWidth: 240, maxLines: 1 }));
    });
    hooks.state = 'chest';
    const m: Modal = { kind: 'chest', cards: [], sel: 0, objs, armed: false };
    this.modal = m;
    this.time.delayedCall(this.autopilot ? 250 : 500, () => (m.armed = true));
    this.time.delayedCall(this.autopilot ? 400 : 2600, () => { if (this.modal === m) this.closeModal(); });
  }

  // ---------------------------------------------------------------- weapons + projectiles
  addWeapon(id: ProductId) {
    if (this.weapons.has(id)) return;
    this.weapons.set(id, newWeapon(id));
    this.refreshIcons();
  }

  shoot(key: string, x: number, y: number, vx: number, vy: number, dmg: number, life: number, pierce: number, src: string, hostile = false): Proj {
    const s = this.add.image(x, y, spr(key)).setDepth(hostile ? 12 : 8);
    const pr: Proj = { s, vx, vy, dmg, life, pierce, src, hit: new Set(), hostile };
    this.projs.push(pr);
    return pr;
  }

  zapLine(x1: number, y1: number, x2: number, y2: number, col = 0xfcfcfc) {
    const g = this.add.graphics().setDepth(19);
    g.lineStyle(1, col, 1).beginPath().moveTo(x1, y1);
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
      if (!pr) continue;
      pr.life -= dt;
      if (pr.homing !== undefined) {
        if (!pr.homing || !pr.homing.alive) {
          pr.rt = (pr.rt ?? 0) - dt;
          pr.homing = null;
          if (pr.rt <= 0) { pr.rt = 0.15; pr.homing = this.nearest(pr.s.x, pr.s.y, 200); }
        }
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
        if (Phaser.Math.Distance.Between(pr.s.x, pr.s.y, p.x, p.y) < 9) { this.hurt(pr.dmg, pr.src); dead = true; }
      } else if (!dead) {
        for (const e of this.near(pr.s.x, pr.s.y, 3)) {
          if (pr.hit.has(e)) continue;
          pr.hit.add(e);
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          this.damage(e, pr.dmg, (pr.vx / sp) * 60, (pr.vy / sp) * 60, pr.src);
          if (!e.alive && pr.chain && this.projs.length < 260) {
            // Stack Trace Storm: a kill spawns a fresh trace from the body.
            const t = this.nearest(e.s.x, e.s.y, 160);
            if (t) {
              const a = Math.atan2(t.s.y - e.s.y, t.s.x - e.s.x);
              const np = this.shoot('homing', e.s.x, e.s.y, Math.cos(a) * pr.speed!, Math.sin(a) * pr.speed!, pr.dmg, 1.4, 1, pr.src);
              np.homing = t; np.speed = pr.speed; np.chain = pr.chain - 1; np.s.setTint(0xf8d878);
            }
          }
          if (--pr.pierce <= 0) { dead = true; break; }
        }
      }
      if (dead) { pr.s.destroy(); this.projs.splice(i, 1); }
    }
  }

  private touchPlayer() {
    if (this.invuln > 0) return;
    for (const e of this.near(this.player.x, this.player.y, 7)) {
      if (e.dmg <= 0) continue;
      this.hurt(e.dmg, e.boss ? 'boss' : e.elite ? 'elite' : e.arch);
      break;
    }
  }

  hurt(dmg: number, src = '') {
    if (this.invuln > 0 || this.over || this.won) return;
    this.invuln = 0.55;
    const d = dmg * Math.max(0.3, 1 - this.st.armour);
    this.run.hurtBy[src] = Math.round((this.run.hurtBy[src] ?? 0) + d);
    if (!this.god) this.hp -= d;
    this.sfx('hurt', 0.8);
    shake(this, 2.5, 120);
    this.player.setTintFill(0xf83800);
    this.time.delayedCall(90, () => { if (!this.over) this.heroTint(); });
    if (this.hp <= 0) {
      if (this.st.revives > 0) this.revive();
      else this.finish(false);
    }
  }

  /** Rollback: back to half HP, a shockwave clears space. */
  private revive() {
    this.revivesUsed++;
    this.recalc();
    this.hp = this.st.maxHp * 0.5;
    this.invuln = 2;
    const p = this.player;
    this.banner('ROLLBACK!', 'Restored from the last good deploy');
    this.cameras.main.flash(300, 120, 200, 255);
    burst(this, p.x, p.y, 0x3cbcfc, 40, { speed: 220, gravity: 0 });
    for (const e of this.near(p.x, p.y, 90)) {
      const dx = e.s.x - p.x, dy = e.s.y - p.y, d = Math.hypot(dx, dy) || 1;
      this.damage(e, 60, (dx / d) * 400, (dy / d) * 400, 'rollback', true);
    }
    this.sfx('evolve');
  }

  // ---------------------------------------------------------------- boss
  private runBoss(dt: number) {
    if (!this.boss && this.elapsed >= this.nextBossAt && this.overtime < 0 && !this.won) this.spawnBoss();
    const b = this.boss;
    if (!b || !b.alive) return;
    this.bossTimer -= dt;
    // Angry at half HP, or after 50 s so a weak build still finishes the fight in good time.
    if (this.bossPhase === 1 && (b.hp < b.maxHp * 0.5 || this.elapsed - this.bossAt > 50)) {
      this.bossPhase = 2;
      this.banner(`${K.theme.game.boss.name.toUpperCase()} IS ANGRY!`, 'It is calling in more bugs');
    }
    if (!b.hitAt.crumble && this.elapsed - this.bossAt > 50) {
      b.hitAt.crumble = 1;
      this.banner(`${K.theme.game.boss.name.toUpperCase()} IS CRUMBLING!`, 'Your fixes are landing. Keep going!');
    }
    if (this.bossPhase === 2 && this.heat >= 5 && b.hp < b.maxHp * 0.25) {
      this.bossPhase = 3;
      this.banner(`${K.theme.game.boss.name.toUpperCase()} RAGES!`, 'Faster attacks. Hang in there!');
      b.s.setTint(0xf87858);
      b.tint = 0xf87858;
    }
    if (this.bossTimer > 0) return;
    this.bossAttack(b);
  }

  /** A long boss fight wears the boss down: from 50 s it takes more and more damage (+5%/s, max x8), so a weak first-run
   * build still finishes in good time. */
  private bossVuln() {
    const t = this.elapsed - this.bossAt - 50;
    return t > 0 ? Math.min(8, 1 + t / 20) : 1;
  }

  /** Boss movement: walk, telegraphed dash, spiral spin. */
  private moveBoss(b: Enemy, dt: number) {
    const px = this.player.x, py = this.player.y;
    const dx = px - b.s.x, dy = py - b.s.y, d = Math.hypot(dx, dy) || 1;
    if (b.mode === 1) { // dash telegraph
      b.t -= dt;
      if (b.t <= 0) { b.mode = 2; b.t = 0.7; }
    } else if (b.mode === 2) {
      b.t -= dt;
      b.s.x += b.vx * 175 * dt;
      b.s.y += b.vy * 175 * dt;
      if (b.t <= 0) { b.mode = 0; this.restoreTint(b); }
    } else if (b.mode === 4) { // spiral
      b.t -= dt;
      b.vx += dt;
      if (b.vx >= 0.09) {
        b.vx = 0;
        const base = this.elapsed * 3.2;
        for (const off of [0, Math.PI]) {
          const a = base + off;
          this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 80, Math.sin(a) * 80, 10 * this.diff.dmg, 5, 1, 'boss', true);
        }
      }
      if (b.t <= 0) b.mode = 0;
    } else if (this.bossPhase > 0) {
      // Angry: 1.5x. Crumbling (long fight): keeps speeding up toward the hog's pace so kiting can't stall the fight.
      const crumble = Math.max(0, this.elapsed - this.bossAt - 50);
      const sp = b.speed * b.slow * (this.bossPhase >= 2 ? 1.5 : 1) * Math.min(3.2, 1 + crumble / 40);
      b.s.x += (dx / d) * sp * dt;
      b.s.y += (dy / d) * sp * dt;
    }
    b.s.x = Phaser.Math.Clamp(b.s.x, 32, WORLD_W - 32);
    b.s.y = Phaser.Math.Clamp(b.s.y, 32, WORLD_H - 32);
    if (b.flash > -1000) {
      const was = b.flash;
      b.flash -= dt * 1000;
      if (was > 0 && b.flash <= 0 && b.mode !== 1) this.restoreTint(b);
    }
    if (b.acc > 0) { b.accT -= dt; if (b.accT <= 0) this.flushNumber(b); }
    if (b.mode === 1) {
      this.fx.lineStyle(2, 0xf83800, Math.floor(b.t * 14) % 2 ? 0.9 : 0.3).lineBetween(b.s.x, b.s.y, b.s.x + b.vx * 150, b.s.y + b.vy * 150);
    }
  }

  /** Boss attack library; the pool grows with heat and phase. */
  private bossAttack(b: Enemy) {
    const angry = this.bossPhase >= 2, rage = this.bossPhase >= 3;
    const pool = ['ring', 'charge'];
    if (this.heat >= 2 || this.bossKills > 0 || angry) pool.push('spiral');
    if (angry) pool.push('summon');
    const pick = Phaser.Utils.Array.GetRandom(pool.filter((p) => p !== this.bossLast)) ?? 'ring';
    this.bossLast = pick;
    const pace = rage ? 0.65 : angry ? 0.8 : 1;
    const px = this.player.x, py = this.player.y;
    if (pick === 'ring') {
      const n = angry ? 18 : 12;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        this.shoot('boss_shot', b.s.x, b.s.y, Math.cos(a) * 72, Math.sin(a) * 72, 12 * this.diff.dmg, 5, 1, 'boss', true);
      }
      this.sfx('bossshot', 0.7);
      this.bossTimer = 2.6 * pace;
    } else if (pick === 'charge') {
      const d = Math.hypot(px - b.s.x, py - b.s.y) || 1;
      b.mode = 1; b.t = 0.55; b.vx = (px - b.s.x) / d; b.vy = (py - b.s.y) / d;
      b.s.setTintFill(0xf83800);
      this.sfx('charge', 0.7);
      this.bossTimer = 2.4 * pace;
    } else if (pick === 'spiral') {
      b.mode = 4; b.t = 1.6; b.vx = 0;
      this.sfx('bossshot', 0.7);
      this.bossTimer = 2.8 * pace;
    } else {
      for (let i = 0; i < 6; i++) this.addEnemy(i % 2 ? 'splitter' : 'swarmer', b.s.x + Phaser.Math.Between(-40, 40), b.s.y + Phaser.Math.Between(-40, 40));
      this.bossTimer = 1.4 * pace;
    }
  }

  private spawnBoss() {
    const [x, y] = this.offscreenPoint();
    const s = this.add.sprite(x, y, spr('boss')).setDepth(6);
    s.play(anim('boss'));
    const n = this.bossKills;
    const hp = 900 * this.diff.boss * (1 + Math.min(this.level, 25) / 25) * (1 + this.heat * 0.12) * 2 ** n;
    const b: Enemy = { s, arch: 'tank', type: 3, hp, maxHp: hp, speed: 24 * (1 + 0.1 * n), dmg: 20 * this.diff.dmg * (1 + 0.15 * n), xp: 0, r: 22,
      kx: 0, ky: 0, flash: 0, slow: 1, hitAt: {}, alive: true, boss: true, elite: null, mode: 0, t: 0, vx: 0, vy: 0, acc: 0, accT: 0,
      accCrit: false, armour: 1, kb: 0, tint: null };
    if (n > 0) { b.tint = n % 2 ? 0xf8b8f8 : 0xf8d878; s.setTint(b.tint); }
    this.enemies.push(b);
    this.boss = b;
    this.bossPhase = 1;
    this.bossAt = this.elapsed;
    this.bossTimer = 2.5;
    hooks.state = 'boss';
    this.sfx('boss');
    shake(this, 6, 500);
    hitstop(this, 120);
    const name = K.theme.game.boss.name.toUpperCase();
    this.banner(n ? `${name} IS BACK!` : name, n ? `Round ${n + 1}. Stronger than ever.` : `"${K.theme.game.boss.taunt}"`);
    if (!this.hud.bossBar) {
      const bb = bar(this, 250, H - 9, W - 256, 5, 0xf83800, 0x000000, K.ui.textInt);
      bb.g.setDepth(UI + 90);
      this.hud.bossBar = bb;
      this.hud.bossName = text(this, W - 6, H - 21, K.theme.game.boss.name, { align: 'right', color: K.ui.accentInt, fixed: true, depth: UI + 90,
        maxWidth: W - 256, maxLines: 1 });
    }
    this.hud.bossBar.g.setVisible(true);
    this.hud.bossName?.setVisible(true);
  }

  private bossDown(b: Enemy) {
    this.kills++;
    this.bossKills++;
    this.sfx('explode');
    shake(this, 8, 700);
    hitstop(this, 220);
    this.cameras.main.flash(300, 255, 255, 255);
    this.tweens.add({ targets: b.s, alpha: 0, scale: 1.6, duration: 900, onComplete: () => b.s.destroy() });
    this.boss = null;
    this.hud.bossBar?.g.setVisible(false);
    this.hud.bossName?.setVisible(false);
    for (let k = 0; k < 8; k++) this.dropItem('coin', b.s.x + Phaser.Math.Between(-24, 24), b.s.y + Phaser.Math.Between(-24, 24));
    if (this.mode === 'endless') {
      // Endless: the boss comes back every 2:00, stronger each time.
      this.nextBossAt = this.elapsed + 120;
      this.dropItem('chest', b.s.x, b.s.y, true);
      this.banner('ENDLESS', 'The next boss arrives in 2:00');
      hooks.state = 'playing';
      return;
    }
    if (this.heat >= 5) {
      this.overtime = OVERTIME_S;
      this.dropItem('chest', b.s.x, b.s.y, true);
      this.banner('OVERTIME!', `Survive ${clock(OVERTIME_S)} more to ship it`);
      hooks.state = 'playing';
      return;
    }
    this.winNow();
  }

  private winNow() {
    this.won = true;
    // Expire hostile shots (don't splice: this can run inside the projectile loop, when a shot kills the boss).
    for (const pr of this.projs) if (pr.hostile) { pr.life = 0; pr.s.setVisible(false); }
    for (const e of [...this.enemies]) if (!e.boss) this.kill(e);
    this.time.delayedCall(1600, () => this.finish(true));
  }

  // ---------------------------------------------------------------- drawing & end
  private draw() {
    this.fx.clear();
    drawWeapons(this, this.fx, this.auraG);
    this.drawHazards();
    this.drawEnemyFx();
    this.drawBlasts(hitstopped(this) ? 0 : 1 / 60);
    if (this.invuln > 0) this.player.setAlpha(Math.floor(this.time.now / 60) % 2 ? 0.4 : 1);
    else this.player.setAlpha(1);
  }

  score() {
    const base = this.kills * 10 + (this.level - 1) * 100 + Math.floor(this.elapsed) * 5;
    return Math.round((base + (this.won ? 5000 : 0) + this.bossKills * 2000) * (1 + this.heat * 0.2));
  }

  finish(won: boolean) {
    if (this.over) return;
    this.over = true;
    if (this.mode === 'endless') won = this.bossKills > 0;
    this.won = won;
    const score = this.score();
    const survived = clock(this.elapsed);
    const heroesBefore = HEROES.filter((h) => heroUnlocked(h.id)).map((h) => h.id);
    // Bank gold and lifetime totals, then check run achievements.
    const sv = save();
    sv.kills += this.kills;
    sv.gold += this.gold;
    try { meta.bank(this.gold); } catch { /* storage trouble: the gold is lost, the game goes on */ }
    if (this.mode === 'daily') {
      const d = today();
      if (sv.daily.date !== d) sv.daily = { date: d, best: 0 };
      sv.daily.best = Math.max(sv.daily.best, score);
      achieve('daily');
    }
    persist();
    if (sv.kills >= 2000) achieve('kills_2000');
    if (sv.gold >= 500) achieve('rich');
    if (won) achieve('first_win');
    if (won && this.heat >= 2) achieve('heat2');
    if (won && this.heat >= 5) achieve('heat5');
    const newHeroes = HEROES.filter((h) => heroUnlocked(h.id) && !heroesBefore.includes(h.id));
    // End-screen lines: damage split, gold, unlocks.
    const total = Object.entries(this.dmgBy).filter(([k]) => k !== 'debug').reduce((a, [, b]) => a + b, 0) || 1;
    const label = (k: string) => (WEAPONS as Record<string, { short: string }>)[k]?.short ?? (k === 'super' ? 'Nova' : k.charAt(0).toUpperCase() + k.slice(1));
    const top = Object.entries(this.dmgBy).filter(([k]) => k !== 'debug').sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${label(k)} ${Math.round((v / total) * 100)}%`);
    // Two lines at most so the shared HEAT UNLOCKED / NEW achievement lines still fit.
    lastRun.lines = [];
    if (top.length) lastRun.lines.push(`DAMAGE  ${top.join('  ')}`);
    const evos = [...this.run.evolutions, ...(this.superNova ? [SUPER.name] : [])];
    if (newHeroes.length) lastRun.lines.push(`NEW HERO: ${newHeroes.map((h) => h.name.toUpperCase()).join(', ')} (pick one in the SHOP)`);
    else if (this.mode === 'daily') lastRun.lines.push(`DAILY BEST TODAY ${sv.daily.best}`);
    else if (evos.length) lastRun.lines.push(`EVOLVED  ${evos.join(', ')}`);
    const products = [...this.weapons.keys()];
    finishRun({ won, score, stats: { kills: this.kills, level: this.level } });
    this.time.delayedCall(won ? 200 : 900, () => this.scene.start('End', {
      won, score,
      headline: this.mode === 'endless' ? 'SHIFT OVER' : won ? 'BUGS SQUASHED!' : 'GAME OVER',
      stats: [['Survived', survived], ['Bugs squashed', this.kills], ['Level', this.level], ['Gold', `+${this.gold} (bank ${meta.data.coins})`]],
      props: { level: this.level, kills: this.kills, products, gold: this.gold, hero: this.hero.id, evolutions: this.run.evolutions,
        elites: this.run.elites, boss_kills: this.bossKills },
    }));
    if (!won) {
      this.player.setTintFill(0xf83800);
      this.tweens.add({ targets: this.player, angle: 360, alpha: 0, duration: 800 });
      this.hat?.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    const prods = () => K.theme.products as ProductId[];
    const evolveAll = () => {
      this.weapons.forEach((w) => {
        if (w.evo) return;
        w.level = MAX_LEVEL;
        const pid = WEAPONS[w.id].evo.passive;
        if (!this.passives.has(pid)) this.passives.set(pid, 1);
        this.evolve(w);
      });
      this.recalc();
      this.refreshIcons();
    };
    hooks.debug = {
      warp: (s: number) => { this.elapsed = s; this.evQueue = this.evQueue.filter((e) => e.at > s); this.eliteQueue = this.eliteQueue.filter((t) => t > s); },
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); setJuiceSpeed(this.simSpeed); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true, style = '') => { this.autopilot = !!on; this.novice = style === 'novice'; },
      spawnBoss: () => { this.elapsed = Math.max(this.elapsed, this.nextBossAt); },
      hurtBoss: (frac = 1) => { if (this.boss) this.damage(this.boss, (this.boss.maxHp * frac) / this.st.might, 0, 0, 'debug', true); },
      giveAll: () => { prods().forEach((id) => this.addWeapon(id)); },
      maxAll: () => { this.weapons.forEach((w) => (w.level = MAX_LEVEL)); this.refreshIcons(); },
      evolveAll,
      evolve: (id: ProductId) => { const w = this.weapons.get(id); if (w) { this.passives.set(WEAPONS[id].evo.passive, 1); w.level = MAX_LEVEL; this.evolve(w); } },
      superNova: () => { this.superNova = true; },
      passives: (lvl = 1) => {
        (Object.keys(PASSIVES) as PassiveId[]).slice(0, 6).forEach((id) => this.passives.set(id, Math.min(PASSIVES[id].max, lvl)));
        this.recalc(); this.refreshIcons();
      },
      chest: (big = false) => { this.dropItem('chest', this.player.x + 20, this.player.y, !!big); },
      pickup: (kind: ItemKind = 'vacuum') => { this.dropItem(kind, this.player.x + 20, this.player.y); },
      hotfix: () => this.hotfix(),
      crate: () => { this.addEnemy('crate', this.player.x + 40, this.player.y); },
      puddle: () => { this.puddles.push({ x: this.player.x + 60, y: this.player.y, r: 6, age: 0 }); },
      elite: (arch: ArchId = 'tank') => { this.spawnElite(arch); },
      event: (id: EventId = 'stampede') => this.startEvent(id),
      spawn: (arch: ArchId = 'charger', n = 5) => { for (let i = 0; i < n; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy(arch, x, y); } },
      heat: (n: number) => { this.heat = Math.max(0, Math.min(5, n | 0)); },
      gold: (n = 100) => { this.gold += n; },
      numbers: (on = true) => { this.numbers = !!on; },
      xp: (n: number) => this.gainXp(n),
      flood: (n = 300) => { for (let i = 0; i < n; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy((['swarmer', 'splitter', 'tank'] as ArchId[])[i % 3], x, y); } },
      lose: () => this.finish(false),
      // For the gameplay GIF: a mid-game swarm with evolved weapons going.
      showcase: () => {
        this.elapsed = 150;
        // Level 15 so level-up cards interrupt the GIF less often.
        this.level = 15;
        this.xpNext = Math.floor(3 + this.level * 2.2 + this.level ** 1.3);
        this.evQueue = this.evQueue.filter((e) => e.at > 150);
        this.eliteQueue = [];
        prods().slice(0, 4).forEach((id) => this.addWeapon(id));
        evolveAll();
        this.hp = this.st.maxHp;
        for (let i = 0; i < 150; i++) { const [x, y] = this.offscreenPoint(); this.addEnemy((['swarmer', 'splitter', 'tank', 'charger', 'exploder'] as ArchId[])[i % 5], x, y); }
        this.spawnElite('tank');
      },
      win: () => { this.heat = Math.min(this.heat, 4); this.mode = this.mode === 'endless' ? 'standard' : this.mode;
        this.elapsed = Math.max(this.elapsed, this.nextBossAt); this.runBoss(0);
        if (this.boss) this.damage(this.boss, this.boss.maxHp * 2, 0, 0, 'debug', true);
        else if (!this.won) this.winNow(); },
      unlockAll: () => { const r = sharedDebug.unlockAll?.(); return r; },
    };
  }
}

function punchText(t: PixelText) {
  if (t.scale !== 1) return;
  t.scene.tweens.add({ targets: t, scale: 1.25, duration: 60, yoyo: true, onComplete: () => t.setScale(1) });
}
