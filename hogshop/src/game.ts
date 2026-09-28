// HogShop: the back-room packing loop. Orders arrive as tickets; items ride two conveyor belts; the hog grabs
// items, packs each order's box at a table and carries the sealed box to the right shipping door before the
// customer runs out of patience. All prospect content comes from K.theme; the fixed tables (tools, days,
// heat, endings) live in content.ts. This file is never edited per prospect.
import Phaser from 'phaser';
import { K, spr, anim, meta, achieve } from '@shared/kit';
import { hooks, sharedDebug } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, wrap, W, H, PixelText } from '@shared/ui';
import { rng, randomSeed, dailySeed, Rng } from '@shared/meta';
import { burst, floatText, shake, punch, hitstop, hitstopped, setJuiceSpeed, toast } from '@shared/juice';
import products from '../../shared/products.json';
import {
  TOOLS, ToolId, Ship, DAYS, DayRule, DIFF, PATIENCE, HEAT, Heat, LOSS, grade, gradeColor, ENDINGS, Ending, pickEnding, fill,
} from './content';

export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;
const productColour = (id: string) => parseInt(((products as Record<string, { color: string }>)[id]?.color ?? '#fcfcfc').slice(1), 16);

// ---------------------------------------------------------------- layout (480x270)
const TICKET_Y = 15, TICKET_W = 92, TICKET_H = 40;
const TOP_BELT = 70, BOT_BELT = 230;        // item centre y on each belt
const BELT_X0 = -10, BELT_X1 = 438;         // items enter/leave here (top belt runs right, bottom runs left)
const PX0 = 10, PX1 = 428, PY0 = 90, PY1 = 212; // where the hog can walk
const STATIONS = [{ x: 170, y: 150 }, { x: 236, y: 150 }, { x: 302, y: 150 }];
const DOCK_X = 456;
const DOCKS: Record<Ship, number> = { std: 104, exp: 152, intl: 200 };
const WRAP = { x: 34, y: 132 }, BIN = { x: 34, y: 176 };
const LEVERS = [{ x: 14, y: 94 }, { x: 14, y: 206 }];
const SHIP_COL: Record<Ship, number> = { std: 0x3cbcfc, exp: 0xf87858, intl: 0xb8f818 };
const SHIP_TAG: Record<Ship, string> = { std: 'STD', exp: 'EXP', intl: 'INT' };
const ORDER_COLS = [0xf8b800, 0x58d854, 0xf85898, 0x3cbcfc, 0xfca044, 0x9878f8];
const RED = 0xf83800, GREEN = 0x58d854, GOLD = 0xf8b800;
const SPEED = 92;
const MAX_OPEN = 5;
const HOT = -1;

type Mode = 'intro' | 'playing' | 'summary' | 'done';
type RunMode = 'week' | 'endless' | 'daily';
type Held = { kind: 'item'; idx: number } | { kind: 'box'; order: Order } | { kind: 'wrap' } | { kind: 'return' } | null;

interface Order {
  id: number; customer: string; items: number[]; packed: boolean[]; ship: Ship; patience: number; max: number;
  station: number; needsWrap: boolean; wrapped: boolean; sealed: boolean; colour: number; hotSpawns: number;
}
interface BeltThing { spr: Phaser.GameObjects.Sprite; belt: 0 | 1; x: number; idx: number; ret: boolean; glow?: Phaser.GameObjects.Rectangle }
interface Station { x: number; y: number; order: Order | null; box: Phaser.GameObjects.Sprite; label: PixelText; tag: PixelText; shown: number[] }
interface DayStats { shipped: number; onTime: number; expired: number; wrongDoor: number; returnsLost: number; returnsBinned: number; express: number }
const emptyStats = (): DayStats => ({ shipped: 0, onTime: 0, expired: 0, wrongDoor: 0, returnsLost: 0, returnsBinned: 0, express: 0 });

export interface KitSave extends Record<string, unknown> { endings: string[]; bestGrade: Record<string, string>; endlessBest: number }
export function kitSave(): KitSave {
  const s = meta.kitData<KitSave>({ endings: [], bestGrade: {}, endlessBest: 0 });
  if (!Array.isArray(s.endings)) s.endings = [];
  s.endings = s.endings.filter((e) => typeof e === 'string').slice(0, 20);
  if (!s.bestGrade || typeof s.bestGrade !== 'object' || Array.isArray(s.bestGrade)) s.bestGrade = {};
  for (const [k, v] of Object.entries(s.bestGrade)) if (!/^[0-5]$/.test(k) || typeof v !== 'string' || !'SABCD'.includes(v) || v.length !== 1) delete s.bestGrade[k];
  if (typeof s.endlessBest !== 'number' || !Number.isFinite(s.endlessBest)) s.endlessBest = 0;
  return s;
}
export const lastEnd = { ending: null as Ending | null, grade: '', endless: false, daily: false, orders: 0, newBestGrade: false, names: {} as Record<string, string> };

export function names(): Record<string, string> {
  const g = K.theme.game;
  return { store: g.store.name, manager: g.manager.name, jam: g.jam.name, rush: g.rush.name, hot: g.hot_item.name,
    std: g.docks.standard, exp: g.docks.express, intl: g.docks.international, company: K.theme.prospect.name };
}

export class GameScene extends Phaser.Scene {
  private r!: Rng;
  private runMode: RunMode = 'week';
  private heatN = 0;
  private heat: Heat = HEAT[0];
  private diff = DIFF.normal;
  private items: { name: string; fragile: boolean }[] = [];
  private tools: ToolId[] = [];
  private cd = new Map<ToolId, number>();
  private active = new Map<ToolId, number>();
  private shield = false;
  private mode: Mode = 'intro';
  private day = 0;
  private rule: DayRule = DAYS[0];
  private clock = 0;
  private dayLen = 70;
  private t = 0;
  private overlayT = 0;
  private rating = 5;
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private orderId = 0;
  private orders: Order[] = [];
  private lost: { order: Order; loss: number }[] = [];
  private nextOrder = 0;
  private nextSpawn = [0, 0];
  private jammed = [false, false];
  private nextJam = 0;
  private belt: BeltThing[] = [];
  private stations: Station[] = [];
  private held: Held = null;
  private heldSpr: Phaser.GameObjects.Sprite | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private dir: 'down' | 'up' | 'left' | 'right' = 'down';
  private stats: DayStats = emptyStats();
  private total: DayStats = emptyStats();
  private grades: string[] = [];
  private hotShipped = 0;
  private hotTotal = 0;
  private toolsUsed = 0;
  private quota = 5;
  private quotaTotal = 0;
  private simSpeed = 1;
  private god = false;
  private autopilot = false;
  private botT = 0;
  private botToolT = 0;
  private botGoal: { x: number; y: number; why: string } | null = null;
  private finished = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private belts: Phaser.GameObjects.TileSprite[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private hudText: Record<string, PixelText> = {};
  private tickets!: Phaser.GameObjects.Graphics;
  private ticketObjs: Phaser.GameObjects.GameObject[] = [];
  private ticketsDirty = true;
  private toolObjs: { icon: Phaser.GameObjects.Image; label: PixelText; shade: Phaser.GameObjects.Rectangle }[] = [];
  private jamSigns: PixelText[] = [];
  private levers: Phaser.GameObjects.Sprite[] = [];
  private docks: Partial<Record<Ship, Phaser.GameObjects.Sprite>> = {};
  private dockSigns: Partial<Record<Ship, PixelText>> = {};
  private wrapRoll!: Phaser.GameObjects.Image;
  private binImg!: Phaser.GameObjects.Image;
  private speech!: PixelText;
  private speechT = 0;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private banner: PixelText | null = null;
  private lastTick = 0;

  constructor() { super('Game'); }

  create() {
    const run = K.run;
    this.runMode = run.mode === 'endless' ? 'endless' : run.mode === 'daily' ? 'daily' : 'week';
    this.heatN = Math.max(0, Math.min(5, run.heat | 0));
    this.heat = HEAT[this.heatN];
    this.r = rng(this.runMode === 'daily' ? dailySeed() : run.seed || randomSeed());
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.items = (K.theme.game.items as { name: string; fragile?: boolean }[]).slice(0, 8).map((i) => ({ name: i.name, fragile: !!i.fragile }));
    if (!this.items.some((i) => i.fragile) && this.items.length >= 5) { this.items[4].fragile = true; } // day 3 needs something fragile
    this.tools = (K.theme.products as string[]).filter((p): p is ToolId => p in TOOLS).slice(0, 4);
    Object.assign(this, {
      mode: 'intro', day: 0, clock: 0, t: 0, overlayT: 0, rating: 5, score: 0, combo: 0, bestCombo: 0, orderId: 0, orders: [], lost: [],
      nextOrder: 0, nextSpawn: [0, 0], jammed: [false, false], nextJam: 0, belt: [], stations: [], held: null, heldSpr: null,
      stats: emptyStats(), total: emptyStats(), grades: [], hotShipped: 0, hotTotal: 0, toolsUsed: 0, quotaTotal: 0, simSpeed: 1,
      finished: false, shield: false, overlay: [], timers: [], ticketObjs: [], toolObjs: [], jamSigns: [], levers: [], docks: {},
      dockSigns: {}, banner: null, botGoal: null,
    });
    this.cd = new Map(this.tools.map((t) => [t, 0]));
    this.active = new Map();
    hooks.scene = 'Game';
    hooks.elapsed = 0;
    hooks.score = 0;
    setJuiceSpeed(1);
    this.buildRoom();
    const kb = this.input.keyboard!;
    kb.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.installDebug();
    if (this.runMode === 'endless') this.startEndless();
    else this.showIntro();
  }

  // ---------------------------------------------------------------- the room
  private buildRoom() {
    const ui = K.ui;
    this.cameras.main.setBackgroundColor(ui.bg);
    this.add.tileSprite(0, 80, W, 144, spr('floor')).setOrigin(0).setDepth(-10);
    // belts: a dark frame, the moving surface, rollers at the ends
    for (const [i, y] of [TOP_BELT, BOT_BELT].entries()) {
      const g = this.add.graphics().setDepth(-5);
      g.fillStyle(0x000000, 1).fillRect(0, y - 10, BELT_X1 + 8, 20);
      g.fillStyle(0x7c7c7c, 1).fillRect(0, y - 10, BELT_X1 + 8, 1).fillRect(0, y + 9, BELT_X1 + 8, 1);
      const b = this.add.tileSprite(0, y - 8, BELT_X1 + 8, 16, spr('belt')).setOrigin(0).setDepth(-4);
      this.belts[i] = b;
      // chutes: where unclaimed stock goes back
      const cx = i === 0 ? BELT_X1 + 8 : 0;
      g.fillStyle(0x000000, 1).fillRect(i === 0 ? cx : cx, y - 12, 14, 24);
      g.fillStyle(0x503000, 1).fillRect(i === 0 ? cx + 2 : cx + 2, y - 10, 10, 20);
    }
    // docks on the right wall, with their names
    const n = names();
    for (const s of ['std', 'exp', 'intl'] as Ship[]) {
      const y = DOCKS[s];
      this.docks[s] = this.add.sprite(DOCK_X, y, spr('dock'), 0).setDepth(-3);
      this.add.rectangle(DOCK_X - 17, y, 3, 36, SHIP_COL[s]).setDepth(-2);
      this.dockSigns[s] = text(this, DOCK_X - 21, y - 4, s === 'std' ? n.std : s === 'exp' ? n.exp : n.intl,
        { align: 'right', color: SHIP_COL[s], depth: 3, maxWidth: 60, maxLines: 1 });
    }
    // tables
    this.stations = STATIONS.map((p, i) => {
      this.add.image(p.x, p.y + 4, spr('table')).setDepth(2);
      text(this, p.x, p.y + 17, `T${i + 1}`, { align: 'center', color: ui.dimInt, depth: 3 });
      const bx = this.add.sprite(p.x, p.y - 6, spr('box'), 0).setDepth(4).setVisible(false);
      const label = text(this, p.x, p.y - 26, '', { align: 'center', depth: 6 });
      const tag = text(this, p.x, p.y - 36, '', { align: 'center', depth: 6 });
      return { x: p.x, y: p.y, order: null, box: bx, label, tag, shown: [] };
    });
    this.wrapRoll = this.add.image(WRAP.x, WRAP.y, spr('wrap_roll')).setDepth(2);
    text(this, WRAP.x, WRAP.y + 13, 'WRAP', { align: 'center', color: ui.dimInt, depth: 3 });
    this.binImg = this.add.image(BIN.x, BIN.y, spr('bin')).setDepth(2);
    text(this, BIN.x, BIN.y + 13, 'RETURNS', { align: 'center', color: ui.dimInt, depth: 3 });
    this.levers = LEVERS.map((p) => this.add.sprite(p.x, p.y, spr('lever'), 0).setDepth(2));
    this.jamSigns = LEVERS.map((p, i) => text(this, p.x + 10, i === 0 ? p.y - 4 : p.y - 4, '', { color: RED, depth: 20 }));
    this.player = this.add.sprite(236, 186, spr('player'), 0).setDepth(10);
    for (const [d, f] of Object.entries({ down: 0, up: 2, left: 4, right: 6 })) {
      const k = `hs-walk-${d}`;
      if (!this.anims.exists(k)) this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(spr('player'), { start: f, end: f + 1 }), frameRate: 7, repeat: -1 });
    }
    // HUD strip, tickets rail, tool bar
    this.hud = this.add.graphics().setDepth(50);
    this.tickets = this.add.graphics().setDepth(50);
    this.hudText.day = text(this, 4, 3, '', { color: ui.textInt, depth: 51 });
    this.hudText.orders = text(this, 150, 3, '', { color: ui.textInt, depth: 51 });
    this.hudText.score = text(this, W - 4, 3, '', { align: 'right', color: ui.accentInt, depth: 51 });
    this.hudText.rating = text(this, 262, 3, '', { color: GOLD, depth: 51 });
    const g = this.add.graphics().setDepth(49);
    g.fillStyle(ui.bgInt, 1).fillRect(0, 240, W, 30);
    g.fillStyle(ui.panelInt, 1).fillRect(0, 240, W, 1);
    this.tools.forEach((id, i) => {
      const x = 6 + i * 51;
      const icon = this.add.image(x + 8, 250, spr(`icon_${id}`)).setDepth(51);
      const shade = this.add.rectangle(x, 242, 16, 16, 0x000000, 0.65).setOrigin(0).setDepth(52).setVisible(false);
      const label = text(this, x + 19, 246, `${i + 1}`, { color: ui.accentInt, depth: 51 });
      text(this, x, 259, TOOLS[id].name, { color: productColour(id), depth: 51, maxWidth: 48, maxLines: 1 });
      this.toolObjs.push({ icon, label, shade });
    });
    this.speech = text(this, 210, 245, '', { color: ui.textInt, depth: 51, maxWidth: W - 214, maxLines: 2 });
    this.refreshDocks();
  }

  private refreshDocks() {
    for (const s of ['std', 'exp', 'intl'] as Ship[]) {
      const open = this.rule.ships.includes(s) || this.runMode === 'endless';
      this.docks[s]?.setAlpha(open ? 1 : 0.35);
      this.dockSigns[s]?.setAlpha(open ? 1 : 0.35);
    }
    const wrapOn = this.rule.fragile || this.runMode === 'endless';
    this.wrapRoll.setAlpha(wrapOn ? 1 : 0.35);
  }

  private say(msg: string, col = K.ui.textInt, secs = 4) {
    this.speech.setText(msg).setColor(col);
    this.speechT = secs;
  }

  // ---------------------------------------------------------------- HUD
  private drawHud() {
    const ui = K.ui;
    const g = this.hud.clear();
    g.fillStyle(ui.bgInt, 1).fillRect(0, 0, W, 13);
    g.fillStyle(ui.panelInt, 1).fillRect(0, 13, W, 1);
    const endless = this.runMode === 'endless';
    this.hudText.day.setText(endless ? `ENDLESS ${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}` : `DAY ${this.day + 1}/5`);
    if (!endless) { // clock bar
      const frac = Math.max(0, this.clock / this.dayLen);
      g.fillStyle(0xfcfcfc, 1).fillRect(61, 4, 72, 6);
      g.fillStyle(0x000000, 1).fillRect(62, 5, 70, 4);
      const col = this.clock <= 10 ? (Math.floor(this.t * 4) % 2 ? RED : 0xfcfcfc) : frac < 0.2 ? RED : ui.accentInt;
      g.fillStyle(col, 1).fillRect(62, 5, Math.round(70 * frac), 4);
    }
    const met = !endless && this.stats.shipped >= this.quota;
    this.hudText.orders.setText(endless ? `SHIPPED ${this.total.shipped}` : `SHIPPED ${this.stats.shipped}/${this.quota}`).setColor(met ? GREEN : ui.textInt);
    this.hudText.rating.setText(this.rating.toFixed(1));
    // five stars after the number
    for (let i = 0; i < 5; i++) {
      const x = 286 + i * 9, y = 3;
      const f = Phaser.Math.Clamp(this.rating - i, 0, 1);
      this.star(g, x, y, 0x503000, 1);
      if (f > 0) this.star(g, x, y, this.rating < 1.5 ? RED : GOLD, f);
    }
    this.hudText.score.setText(`${this.score}${this.combo >= 3 ? `  x${this.combo}` : ''}`);
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number, frac: number) {
    const rows = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
    const cut = Math.round(7 * frac);
    g.fillStyle(col, 1);
    rows.forEach((r, yy) => { for (let xx = 0; xx < Math.min(7, cut); xx++) if (r[xx] === '#') g.fillRect(x + xx, y + yy, 1, 1); });
  }

  private drawTickets() {
    const ui = K.ui;
    const g = this.tickets.clear();
    const open = this.orders.slice(0, MAX_OPEN);
    if (this.ticketsDirty) {
      this.ticketObjs.forEach((o) => o.destroy());
      this.ticketObjs = [];
      open.forEach((o, i) => {
        const x = 4 + i * (TICKET_W + 3), y = TICKET_Y;
        this.ticketObjs.push(text(this, x + 4, y + 5, `#${o.id} ${o.customer}`.slice(0, 11), { color: 0x000000, shadow: null, depth: 52 }));
        this.ticketObjs.push(text(this, x + TICKET_W - 4, y + 5, SHIP_TAG[o.ship], { align: 'right', color: 0x000000, shadow: null, depth: 52 }));
        o.items.forEach((idx, j) => {
          const im = this.add.image(x + 12 + j * 18, y + 22, spr(idx === HOT ? 'hot_item' : `item_${idx + 1}`)).setDepth(52);
          this.ticketObjs.push(im);
          if (idx !== HOT && this.items[idx]?.fragile && this.rule.fragile) {
            this.ticketObjs.push(text(this, x + 18 + j * 18, y + 13, '!', { color: RED, depth: 53 }));
          }
        });
      });
      this.ticketsDirty = false;
    }
    open.forEach((o, i) => {
      const x = 4 + i * (TICKET_W + 3), y = TICKET_Y;
      const frac = Math.max(0, o.patience / o.max);
      const urgent = frac < 0.25 && Math.floor(this.t * 5) % 2 === 0;
      g.fillStyle(urgent ? RED : 0xfcfcfc, 1).fillRect(x, y, TICKET_W, TICKET_H);
      g.fillStyle(0xe4dcc8, 1).fillRect(x + 1, y + 1, TICKET_W - 2, TICKET_H - 2);
      g.fillStyle(o.colour, 1).fillRect(x + 1, y + 1, TICKET_W - 2, 3);
      g.fillStyle(SHIP_COL[o.ship], 1).fillRect(x + TICKET_W - 24, y + 4, 21, 9);
      // packed items get a green tick box, the wrap state a small badge
      o.items.forEach((_, j) => {
        if (o.packed[j]) {
          g.fillStyle(0x000000, 0.45).fillRect(x + 4 + j * 18, y + 14, 16, 16);
          g.fillStyle(GREEN, 1).fillRect(x + 13 + j * 18, y + 25, 6, 2).fillRect(x + 11 + j * 18, y + 23, 2, 2).fillRect(x + 17 + j * 18, y + 21, 2, 4);
        }
      });
      if (o.needsWrap && this.rule.fragile) {
        g.fillStyle(o.wrapped ? GREEN : 0x3cbcfc, 1).fillRect(x + TICKET_W - 20, y + 17, 16, 5);
        g.fillStyle(0xfcfcfc, 1).fillRect(x + TICKET_W - 18, y + 18, 2, 3).fillRect(x + TICKET_W - 13, y + 18, 2, 3).fillRect(x + TICKET_W - 8, y + 18, 2, 3);
      }
      // table badge
      g.fillStyle(o.station >= 0 ? 0x000000 : 0x7c7c7c, 1).fillRect(x + TICKET_W - 21, y + 23, 18, 10);
      const pc = frac > 0.5 ? GREEN : frac > 0.25 ? GOLD : RED;
      g.fillStyle(0x000000, 1).fillRect(x + 3, y + TICKET_H - 6, TICKET_W - 6, 4);
      g.fillStyle(pc, 1).fillRect(x + 4, y + TICKET_H - 5, Math.round((TICKET_W - 8) * frac), 2);
    });
    // table badge text (cheap: drawn each frame with a small pool)
    this.badges.forEach((b, i) => {
      const o = open[i];
      if (!o) { b.setVisible(false); return; }
      b.setVisible(true).setPosition(4 + i * (TICKET_W + 3) + TICKET_W - 12, TICKET_Y + 24).setText(o.station >= 0 ? `T${o.station + 1}` : '..');
    });
    if (this.orders.length > MAX_OPEN) {
      this.more.setVisible(true).setText(`+${this.orders.length - MAX_OPEN}`);
    } else this.more.setVisible(false);
    void ui;
  }
  private badges: PixelText[] = [];
  private more!: PixelText;

  private drawTools() {
    this.tools.forEach((id, i) => {
      const o = this.toolObjs[i];
      if (!o) return;
      const left = this.cd.get(id) ?? 0;
      const on = (this.active.get(id) ?? 0) > 0 || (id === 'error_tracking' && this.shield);
      o.shade.setVisible(left > 0 && !on);
      o.label.setText(on ? 'ON' : left > 0 ? `${Math.ceil(left)}` : `${i + 1}`).setColor(on ? GREEN : left > 0 ? K.ui.dimInt : K.ui.accentInt);
      o.icon.setAlpha(left > 0 && !on ? 0.5 : 1);
    });
  }

  // ---------------------------------------------------------------- overlays
  private clearOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.overlayT = 0;
  }

  private panel(title: string) {
    this.clearOverlay();
    const ui = K.ui;
    this.overlay.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setDepth(100));
    this.overlay.push(box(this, 20, 14, W - 40, H - 28, ui.bgInt, ui.textInt, ui.panelInt).setDepth(101));
    this.overlay.push(text(this, W / 2, 22, title, { scale: 2, align: 'center', color: ui.accentInt, depth: 102, shadow: ui.panelInt }));
  }

  private prompt(msg: string, y = H - 30) {
    const p = text(this, W / 2, y, msg, { align: 'center', color: K.ui.accentInt, depth: 102 });
    this.overlay.push(p);
    this.timers.push(this.time.addEvent({ delay: 500, loop: true, callback: () => p.setVisible(!p.visible) }));
  }

  private add_<T extends Phaser.GameObjects.GameObject>(t: T) { this.overlay.push(t); return t; }

  private managerSays(line: string, y = 48, maxLines = 4): number {
    const ui = K.ui;
    const m = K.theme.game.manager;
    const face = this.add.sprite(36, y, spr('manager')).setOrigin(0).setScale(2).setDepth(102);
    face.play(anim('manager'));
    this.overlay.push(face);
    this.overlay.push(text(this, 68, y + 68, m.name, { align: 'center', color: ui.accentInt, depth: 102, maxWidth: 90, maxLines: 1 }));
    this.overlay.push(text(this, 68, y + 80, m.title, { align: 'center', color: ui.dimInt, depth: 102, maxWidth: 96, maxLines: 2 }));
    const lines = wrap(line, 52, maxLines, 'manager');
    const full = lines.join('\n');
    const t = text(this, 118, y + 4, '', { depth: 102, color: ui.textInt });
    this.overlay.push(t);
    let i = 0;
    this.timers.push(this.time.addEvent({ delay: 22, repeat: full.length, callback: () => {
      i++;
      t.setText(full.slice(0, i));
      if (i >= full.length) face.stop().setFrame(0);
    } }));
    return y + 4 + lines.length * 10;
  }

  // ---------------------------------------------------------------- days
  private setRule(d: number) {
    const base = DAYS[Math.min(d, DAYS.length - 1)];
    this.rule = { ...base, jams: base.jams || (this.heat.earlyJams && d >= 1) };
  }

  private showIntro() {
    this.mode = 'intro';
    hooks.state = 'dayintro';
    this.setRule(this.day);
    this.refreshDocks();
    this.clearBelts();
    this.panel(`DAY ${this.day + 1}`);
    const ui = K.ui;
    const n = names();
    const tag = [this.runMode === 'daily' ? `DAILY ${new Date().toISOString().slice(0, 10)}` : '', this.heatN ? `HEAT ${this.heatN}` : '']
      .filter(Boolean).join(' - ');
    this.add_(text(this, W / 2, 42, tag ? `${n.store} - ${tag}` : `${n.store} back room`, { align: 'center', color: tag ? GOLD : ui.dimInt, depth: 102, maxWidth: W - 60, maxLines: 1 }));
    const y = Math.max(this.managerSays(K.theme.game.days[this.day]?.intro ?? 'Back to the belts!', 58) + 10, 116);
    this.add_(text(this, 118, y, this.day === 0 ? 'HOW IT WORKS' : 'NEW TODAY', { color: ui.accentInt, depth: 102 }));
    const news = this.add_(text(this, 118, y + 12, fill(this.rule.news, n), { depth: 102, maxWidth: W - 150, maxLines: 3, color: ui.textInt }));
    let ry = y + 14 + news.lineCount * 10;
    this.quota = this.diff.quota + this.heat.quota + (this.day >= 3 ? 1 : 0) + (this.rule.rush ? 2 : 0);
    this.add_(text(this, 118, ry + 4, `Ship ${this.quota} orders today. Keep the stars up.`, { color: GOLD, depth: 102, maxWidth: W - 150, maxLines: 1 }));
    ry += 16;
    if (this.day === 0) this.add_(text(this, 118, Math.max(ry + 4, 194), 'Arrows move   SPACE grab / pack / ship   1-4 tools', { color: ui.dimInt, depth: 102 }));
    this.prompt('ENTER: OPEN THE DOORS');
    this.drawHud();
    this.say(this.day === 0 ? `First day at ${n.store}. Let's ship some happiness!` : 'Coffee? Coffee. Back to the belts.');
  }

  private startShift() {
    this.clearOverlay();
    this.mode = 'playing';
    hooks.state = 'playing';
    this.stats = emptyStats();
    this.dayLen = this.rule.len * (this.diff === DIFF.easy ? 1.05 : 1);
    this.clock = this.dayLen;
    this.nextOrder = 0.5;
    this.nextSpawn = [0.2, 0.9];
    this.nextJam = this.r.float(12, 20);
    this.hotLeft = this.rule.hot;
    this.hotTotal += this.rule.hot;
    this.combo = 0;
    for (const t of this.tools) this.cd.set(t, 0);
    this.active.clear();
    capture('day_started', { day: this.day + 1, heat: this.heatN, mode: this.runMode });
    if (this.rule.rush) this.showBanner(`${K.theme.game.rush.name}! -20% ALL DAY`);
  }
  private hotLeft = 0;

  private startEndless() {
    this.day = 4;
    this.setRule(4);
    this.rule = { ...this.rule, every: 9, rush: false };
    this.quota = 0;
    this.refreshDocks();
    this.startShift();
    this.hotLeft = 0;
    this.say(`Endless shift at ${K.theme.game.store.name}. How long can you keep the stars up?`);
  }

  private showBanner(msg: string) {
    this.banner?.destroy();
    this.banner = text(this, W / 2, 86, msg, { scale: 2, align: 'center', color: GOLD, depth: 60, shadow: 0x000000 });
    const b = this.banner;
    this.tweens.add({ targets: b, alpha: 0, delay: 1800, duration: 500, onComplete: () => b.destroy() });
  }

  private endDay() {
    this.mode = 'summary';
    hooks.state = 'summary';
    K.play('dayend');
    // unfinished orders are cancelled (they cost nothing extra; the quota is the pressure)
    for (const o of [...this.orders]) this.removeOrder(o);
    this.dropHeld(true);
    this.clearBelts();
    this.jammed = [false, false];
    const s = this.stats;
    const missing = Math.max(0, this.quota - s.shipped);
    if (missing === 0) this.score += 200;
    else this.loseStars(missing * LOSS.quotaPer, null, true);
    this.quotaTotal += this.quota;
    const mistakes = s.expired + s.wrongDoor + s.returnsLost;
    const g = grade(s.shipped, this.quota, mistakes);
    this.grades.push(g);
    if (this.rule.rush && s.shipped >= 12) achieve('rush12');
    this.drawSummary(missing, g);
    this.drawHud();
    if (this.rating <= 0 && !this.god) this.time.delayedCall(900, () => this.finish(false));
  }

  private drawSummary(missing: number, g: string) {
    const last = this.day + 1 >= DAYS.length;
    this.panel(`END OF DAY ${this.day + 1}`);
    const ui = K.ui;
    const s = this.stats;
    const rows: [string, string, number?][] = [
      ['Orders shipped', String(s.shipped)],
      ['On time (fast)', String(s.onTime)],
      ['Orders lost', String(s.expired), s.expired ? RED : undefined],
      ['Wrong door', String(s.wrongDoor), s.wrongDoor ? RED : undefined],
      ['Returns binned', `${s.returnsBinned}${s.returnsLost ? ` (${s.returnsLost} lost)` : ''}`, s.returnsLost ? RED : undefined],
      ['Daily target', missing ? `MISSED by ${missing}` : 'MET (+200)', missing ? RED : GREEN],
      ['Customer rating', `${this.rating.toFixed(1)} stars`],
      ['Score', String(this.score)],
    ];
    rows.forEach(([k, v, c], i) => {
      this.add_(text(this, 156, 50 + i * 14, k, { align: 'right', color: ui.dimInt, depth: 102 }));
      this.add_(text(this, 164, 50 + i * 14, v, { color: c ?? ui.textInt, depth: 102 }));
    });
    this.add_(text(this, 318, 50, 'GRADE', { color: ui.dimInt, depth: 102 }));
    this.add_(text(this, 364, 44, g, { scale: 3, color: gradeColor(g), depth: 102, shadow: ui.panelInt }));
    const tips = [
      'Tip: pick up items before their order has a table. The ticket says what is coming.',
      'Tip: EXP orders go to the orange door. Wrong door means a return.',
      'Tip: grab wrap first, then the fragile item. One trip less.',
      'Tip: a jammed belt freezes its items. The lever is on the left wall.',
      '',
    ];
    const next = last ? 'That was the whole week.' : tips[this.day] ?? '';
    if (next) this.add_(text(this, 300, 86, next, { color: ui.textInt, depth: 102, maxWidth: 150, maxLines: 6 }));
    this.prompt(last ? 'ENTER: CLOSE UP SHOP' : 'ENTER: NEXT DAY');
  }

  private nextDay() {
    this.clearOverlay();
    if (this.day + 1 >= DAYS.length) { this.finish(this.rating > 0 || this.god); return; }
    this.day++;
    this.showIntro();
  }

  // ---------------------------------------------------------------- orders
  private newOrder() {
    if (this.orders.length >= MAX_OPEN + 1) return;
    const n = 1 + Math.floor(this.r.next() * this.rule.maxItems * (this.rule.maxItems > 2 ? 0.8 : 1));
    const count = Math.max(1, Math.min(this.rule.maxItems, n));
    const pool = this.items.map((_, i) => i);
    const items: number[] = [];
    const hot = this.hotLeft > 0 && this.clock < this.dayLen * 0.8 && this.r.chance(0.35);
    if (hot) { items.push(HOT); this.hotLeft--; }
    while (items.length < (hot ? Math.min(2, count) : count)) items.push(this.r.pick(pool));
    const ship = this.r.pick(this.rule.ships.length > 1 && this.r.chance(0.45) ? this.rule.ships.slice(1) : [this.rule.ships[0]]) as Ship;
    const max = PATIENCE[ship] * this.diff.patience * this.heat.patience * (hot ? 1.3 : 1) + items.length * 4;
    const needsWrap = this.rule.fragile && items.some((i) => i !== HOT && this.items[i]?.fragile);
    const customers = K.theme.game.customers as string[];
    const o: Order = { id: ++this.orderId, customer: customers[this.orderId % customers.length] ?? 'Guest', items, packed: items.map(() => false), ship,
      patience: max, max, station: -1, needsWrap, wrapped: false, sealed: false, colour: ORDER_COLS[this.orderId % ORDER_COLS.length], hotSpawns: 0 };
    this.orders.push(o);
    this.ticketsDirty = true;
    this.assignTables();
    K.play('ding', 0.6);
  }

  private assignTables() {
    for (const [i, st] of this.stations.entries()) {
      if (st.order) continue;
      const o = this.orders.find((x) => x.station === -1); // -2 = in the hog's arms
      if (!o) break;
      o.station = i;
      st.order = o;
      st.box.setVisible(true).setFrame(0).setAlpha(1);
      punch(st.box, 0.3);
      this.redrawStation(st);
    }
  }

  private redrawStation(st: Station) {
    const o = st.order;
    if (!o) { st.box.setVisible(false); st.label.setText(''); st.tag.setText(''); return; }
    st.box.setFrame(o.sealed ? 2 : o.packed.some(Boolean) || o.wrapped ? 1 : 0);
    st.label.setText(`#${o.id}`).setColor(o.colour);
    st.tag.setText(o.sealed ? SHIP_TAG[o.ship] : '').setColor(SHIP_COL[o.ship]);
  }

  private removeOrder(o: Order) {
    this.orders = this.orders.filter((x) => x !== o);
    if (o.station >= 0) {
      const st = this.stations[o.station];
      if (st.order === o) { st.order = null; this.redrawStation(st); }
    }
    if (this.held?.kind === 'box' && this.held.order === o) this.dropHeld(true);
    this.ticketsDirty = true;
    this.assignTables();
  }

  /** What still has to go into boxes that are on tables (item idx -> count), for spawning and the bot. */
  private needs(): Map<number, number> {
    const m = new Map<number, number>();
    for (const o of this.orders) {
      o.items.forEach((idx, j) => { if (!o.packed[j]) m.set(idx, (m.get(idx) ?? 0) + (o.station >= 0 ? 1 : 0.6)); });
    }
    return m;
  }

  private expire(o: Order) {
    this.stats.expired++;
    this.total.expired++;
    this.combo = 0;
    K.play('expire');
    shake(this, 3, 150);
    const i = this.orders.indexOf(o);
    floatText(this, 4 + Math.max(0, i) * (TICKET_W + 3) + TICKET_W / 2, TICKET_Y + TICKET_H + 4, 'ORDER LOST', RED, 1.2);
    const loss = this.loseStars(LOSS.expired, o);
    this.lost.push({ order: o, loss });
    this.say(`${o.customer} gave up waiting. -${loss.toFixed(1)} stars`, RED);
    capture('order_lost', { day: this.day + 1, ship: o.ship, items: o.items.length });
    this.removeOrder(o);
  }

  /** Lose stars (scaled by difficulty and heat). Error Tracking's shield eats one mistake. Returns the loss. */
  private loseStars(base: number, o: Order | null, noShield = false): number {
    if (this.shield && !noShield) {
      this.shield = false;
      floatText(this, this.player.x, this.player.y - 20, 'CAUGHT!', GREEN, 1);
      this.say('Error Tracking caught that one. No stars lost.', GREEN);
      return 0;
    }
    const loss = Math.round(base * this.diff.loss * this.heat.loss * 10) / 10;
    if (!this.god) this.rating = Math.max(0, this.rating - loss);
    void o;
    return loss;
  }

  // ---------------------------------------------------------------- belts
  private clearBelts() {
    this.belt.forEach((b) => { b.spr.destroy(); b.glow?.destroy(); });
    this.belt = [];
  }

  private spawnOn(belt: 0 | 1) {
    const need = this.needs();
    const onBelt = new Map<number, number>();
    for (const b of this.belt) if (!b.ret) onBelt.set(b.idx, (onBelt.get(b.idx) ?? 0) + 1);
    if (this.held?.kind === 'item') onBelt.set(this.held.idx, (onBelt.get(this.held.idx) ?? 0) + 1);
    // limited stock: the hot item only comes for a hot order on a table, twice at most
    const hotOrder = this.orders.find((o) => o.station >= 0 && o.items.some((i, j) => i === HOT && !o.packed[j]));
    if (hotOrder && hotOrder.hotSpawns < 2 && !(onBelt.get(HOT) ?? 0) && this.r.chance(0.5)) {
      hotOrder.hotSpawns++;
      this.addToBelt(belt, HOT);
      return;
    }
    const wanted = [...need.entries()].filter(([idx, n]) => idx !== HOT && n > (onBelt.get(idx) ?? 0) * 0.9);
    let idx: number;
    if (wanted.length && this.r.chance(0.72)) {
      const total = wanted.reduce((a, [, n]) => a + n, 0);
      let x = this.r.next() * total;
      idx = wanted[0][0];
      for (const [i, n] of wanted) { x -= n; if (x <= 0) { idx = i; break; } }
    } else idx = this.r.int(0, this.items.length - 1);
    this.addToBelt(belt, idx);
  }

  private addToBelt(belt: 0 | 1, idx: number, ret = false, x?: number) {
    const sx = x ?? (belt === 0 ? BELT_X0 : BELT_X1 + 8);
    const key = ret ? 'return_box' : idx === HOT ? 'hot_item' : `item_${idx + 1}`;
    const s = this.add.sprite(sx, belt === 0 ? TOP_BELT : BOT_BELT, spr(key)).setDepth(8);
    this.belt.push({ spr: s, belt, x: sx, idx, ret });
  }

  private beltSpeed(i: number) {
    if (this.jammed[i]) return 0;
    const slow = (this.active.get('feature_flags') ?? 0) > 0 ? 0.4 : 1;
    return this.rule.belt * this.heat.belt * slow;
  }

  private jam(i: number) {
    if (this.jammed[i]) return;
    this.jammed[i] = true;
    K.play('jam');
    shake(this, 2, 120);
    this.say(`${K.theme.game.jam.name}! Pull the lever on the left wall.`, RED);
  }

  private unjam(i: number, byTool = false) {
    if (!this.jammed[i]) return;
    this.jammed[i] = false;
    this.levers[i].setFrame(1);
    this.time.delayedCall(400, () => this.levers[i]?.setFrame(0));
    K.play('fix');
    burst(this, LEVERS[i].x, LEVERS[i].y, GREEN, 8);
    if (!byTool) floatText(this, LEVERS[i].x + 14, LEVERS[i].y - 12, 'FIXED', GREEN);
  }

  // ---------------------------------------------------------------- the hog's hands
  private setHeld(h: Held) {
    this.held = h;
    this.heldSpr?.destroy();
    this.heldSpr = null;
    if (!h) return;
    const key = h.kind === 'item' ? (h.idx === HOT ? 'hot_item' : `item_${h.idx + 1}`) : h.kind === 'box' ? 'box' : h.kind === 'wrap' ? 'wrap' : 'return_box';
    this.heldSpr = this.add.sprite(this.player.x, this.player.y - 13, spr(key), h.kind === 'box' ? 2 : 0).setDepth(11);
    punch(this.heldSpr, 0.35);
  }

  private dropHeld(silent = false) {
    if (!this.held) return;
    if (!silent) K.play('wrong', 0.4);
    this.setHeld(null);
  }

  /** What SPACE would do right now: where, a one-word label for the hint marker, and the action (or why not). */
  private action(): { x: number; y: number; label: string; warn?: boolean; below?: boolean; run: () => void } | { nope: string } {
    const p = this.player;
    const near = (x: number, y: number, r: number) => Phaser.Math.Distance.Between(p.x, p.y, x, y) <= r;
    const atBelt = (): 0 | 1 | -1 => (p.y <= PY0 + 10 ? 0 : p.y >= PY1 - 10 ? 1 : -1);
    const h = this.held;
    // stations first: they're the heart of the loop
    const st = this.stations.filter((s) => near(s.x, s.y, 30)).sort((a, b) => Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y) - Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y))[0];
    if (h?.kind === 'box') {
      const dock = (['std', 'exp', 'intl'] as Ship[]).find((s) => p.x >= PX1 - 22 && Math.abs(p.y - DOCKS[s]) <= 22);
      if (dock) {
        // Error Tracking's CATCH also spots a box about to go through the wrong door
        if (this.shield && dock !== h.order.ship) return { x: DOCK_X, y: DOCKS[dock] - 22, label: 'WRONG DOOR', warn: true, run: () => {
          this.nope(`Error Tracking: #${h.order.id} is ${SHIP_TAG[h.order.ship]}, not this door.`);
        } };
        return { x: DOCK_X, y: DOCKS[dock] - 22, label: 'SHIP', run: () => this.ship(h.order, dock) };
      }
      return { nope: 'Carry the box to a shipping door on the right.' };
    }
    if (h && st?.order && !st.order.sealed) return { x: st.x, y: st.y - 20, label: h.kind === 'wrap' ? 'WRAP' : 'PACK', run: () => this.pack(st, h) };
    if (h?.kind === 'return' && near(BIN.x, BIN.y, 26)) return { x: BIN.x, y: BIN.y - 16, label: 'BIN', run: () => {
      this.setHeld(null);
      this.stats.returnsBinned++;
      this.total.returnsBinned++;
      this.score += 30;
      K.play('pack');
      floatText(this, BIN.x, BIN.y - 16, '+30 RETURN', GREEN);
    } };
    const b = atBelt();
    if (h && (h.kind === 'item' || h.kind === 'return') && b >= 0) { // put it back on the belt
      return { x: p.x, y: b === 0 ? TOP_BELT + 11 : BOT_BELT - 12, below: b === 0, label: 'PUT BACK', run: () => {
        this.addToBelt(b as 0 | 1, h.kind === 'item' ? h.idx : 0, h.kind === 'return', p.x);
        this.setHeld(null);
        K.play('move');
      } };
    }
    if (h?.kind === 'wrap' && near(WRAP.x, WRAP.y, 26)) return { x: WRAP.x, y: WRAP.y - 16, label: 'PUT BACK', run: () => { this.setHeld(null); K.play('move'); } };
    if (h) return { nope: h.kind === 'return' ? 'Returns go in the RETURNS bin.' : 'Pack it at a table with its order, or put it back on a belt.' };
    // empty hands
    if (st?.order?.sealed) {
      const o = st.order;
      return { x: st.x, y: st.y - 20, label: 'LIFT', run: () => {
        st.order = null;
        this.redrawStation(st);
        o.station = -2; // in the hog's arms
        this.setHeld({ kind: 'box', order: o });
        K.play('pick');
        this.assignTables();
      } };
    }
    if (b >= 0) {
      const thing = this.belt.filter((t) => t.belt === b && Math.abs(t.x - p.x) <= 14).sort((x, y) => Math.abs(x.x - p.x) - Math.abs(y.x - p.x))[0];
      const what = thing ? (thing.ret ? 'RETURN' : thing.idx === HOT ? K.theme.game.hot_item.name : this.items[thing.idx]?.name ?? 'GRAB') : '';
      if (thing) return { x: thing.x, y: b === 0 ? thing.spr.y + 11 : thing.spr.y - 12, below: b === 0, label: String(what).toUpperCase(), run: () => {
        if (!this.belt.includes(thing)) return;
        this.belt = this.belt.filter((t) => t !== thing);
        thing.spr.destroy();
        thing.glow?.destroy();
        this.setHeld(thing.ret ? { kind: 'return' } : { kind: 'item', idx: thing.idx });
        K.play('pick');
      } };
    }
    for (const [i, l] of LEVERS.entries()) if (near(l.x, l.y, 22) && this.jammed[i]) return { x: l.x, y: l.y - 12, label: 'FIX', run: () => this.unjam(i) };
    if (near(WRAP.x, WRAP.y, 26)) {
      if (!this.rule.fragile && this.runMode !== 'endless') return { nope: 'No fragile orders yet.' };
      return { x: WRAP.x, y: WRAP.y - 16, label: 'WRAP', run: () => { this.setHeld({ kind: 'wrap' }); K.play('pick'); } };
    }
    if (st?.order && !st.order.sealed) return { nope: `Order #${st.order.id} needs its items first.` };
    return { nope: 'Nothing to grab here.' };
  }

  private interact() {
    if (this.mode !== 'playing') return;
    const a = this.action();
    if ('nope' in a) this.nope(a.nope);
    else a.run();
  }

  /** The bouncing hint over whatever SPACE would act on. */
  private drawHint() {
    const a = this.mode === 'playing' ? this.action() : null;
    if (!a || 'nope' in a) { this.hint.setVisible(false); this.hintArrow.setVisible(false); return; }
    const bob = Math.floor(this.t * 4) % 2;
    const col = a.warn ? RED : GOLD;
    const x = Phaser.Math.Clamp(Math.round(a.x), 4 + a.label.length * 3, W - 4 - a.label.length * 3);
    if (a.below) { // under the top belt: the ticket rail sits above it
      this.hintArrow.setVisible(true).setText('▲').setColor(col).setPosition(Math.round(a.x), Math.round(a.y - 2 + bob));
      this.hint.setVisible(true).setText(a.label).setColor(col).setPosition(x, Math.round(a.y + 5 + bob));
      return;
    }
    this.hint.setVisible(true).setText(a.label).setColor(col).setPosition(x, Math.round(a.y - 12 - bob));
    this.hintArrow.setVisible(true).setText('▼').setColor(col).setPosition(Math.round(a.x), Math.round(a.y - 3 - bob));
  }
  private hint!: PixelText;
  private hintArrow!: PixelText;

  private nope(msg: string) {
    K.play('wrong', 0.35, 120);
    this.say(msg, K.ui.dimInt, 2.5);
  }

  private pack(st: Station, h: NonNullable<Held>) {
    const o = st.order!;
    if (h.kind === 'wrap') {
      if (!o.needsWrap || o.wrapped) { this.nope(o.wrapped ? 'Already wrapped.' : 'Nothing fragile in this order.'); return; }
      o.wrapped = true;
      this.setHeld(null);
      K.play('seal', 0.6);
      punch(st.box, 0.3);
      floatText(this, st.x, st.y - 24, 'WRAPPED', 0x3cbcfc);
    } else if (h.kind === 'item') {
      const j = o.items.findIndex((idx, k) => idx === h.idx && !o.packed[k]);
      if (j < 0) { this.nope(`#${o.id} doesn't need that. Check the ticket.`); shake(this, 1, 80); return; }
      const fragile = h.idx !== HOT && this.items[h.idx]?.fragile && this.rule.fragile;
      if (fragile && !o.wrapped) { this.nope('Fragile! Put bubble wrap in the box first.'); return; }
      o.packed[j] = true;
      this.setHeld(null);
      K.play('pack');
      punch(st.box, 0.35);
      burst(this, st.x, st.y - 8, o.colour, 6, { speed: 60 });
      this.score += 10;
    } else { this.nope('That goes in the RETURNS bin.'); return; }
    this.ticketsDirty = true;
    if (o.packed.every(Boolean) && (!o.needsWrap || o.wrapped)) {
      o.sealed = true;
      K.play('seal');
      hitstop(this, 40);
      floatText(this, st.x, st.y - 30, `SEALED: ${SHIP_TAG[o.ship]}`, SHIP_COL[o.ship], 1);
    }
    this.redrawStation(st);
  }

  private ship(o: Order, dock: Ship) {
    this.setHeld(null);
    const door = this.docks[dock]!;
    door.setFrame(1);
    this.time.delayedCall(450, () => door.setFrame(0));
    if (dock !== o.ship) { // wrong door: it comes back as a return
      this.stats.wrongDoor++;
      this.total.wrongDoor++;
      this.combo = 0;
      K.play('wrong');
      shake(this, 3, 140);
      const loss = this.loseStars(LOSS.wrongDoor, o);
      floatText(this, DOCK_X - 30, DOCKS[dock] - 18, 'WRONG DOOR', RED, 1.2);
      this.say(`That was a ${SHIP_TAG[o.ship]} order. It will come back as a return.${loss ? ` -${loss.toFixed(1)} stars` : ''}`, RED);
      this.lost.push({ order: o, loss });
      this.time.delayedCall(Math.round(4000 / this.simSpeed), () => { if (this.mode === 'playing') this.addToBelt(this.r.chance(0.5) ? 0 : 1, 0, true); });
      this.orders = this.orders.filter((x) => x !== o);
      this.ticketsDirty = true;
      capture('order_misdelivered', { day: this.day + 1, ship: o.ship, door: dock });
      return;
    }
    const frac = o.patience / o.max;
    const fast = frac >= 0.5;
    const base = 100 + (o.ship === 'exp' ? 50 : o.ship === 'intl' ? 60 : 0) + (o.items.includes(HOT) ? 150 : 0);
    const speedBonus = Math.round(frac * 60 * (this.rule.rush ? 2 : 1));
    this.combo = fast ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.combo >= 8) achieve('combo8');
    const pts = base + speedBonus + (this.combo >= 3 ? this.combo * 10 : 0);
    this.score += pts;
    this.stats.shipped++;
    this.total.shipped++;
    if (fast) { this.stats.onTime++; this.total.onTime++; this.rating = Math.min(5, this.rating + 0.1); }
    else this.rating = Math.min(5, this.rating + 0.03);
    if (o.ship === 'exp') { this.stats.express++; this.total.express++; }
    if (o.items.includes(HOT)) this.hotShipped++;
    K.play('ship');
    burst(this, DOCK_X - 16, DOCKS[dock], SHIP_COL[dock], 16, { colours: [o.colour, 0xfcfcfc] });
    floatText(this, DOCK_X - 34, DOCKS[dock] - 20, `+${pts}`, GOLD, 1);
    if (this.stats.shipped === this.quota && this.runMode !== 'endless') { this.say('Daily target met! Everything else is bonus.', GREEN); K.play('power', 0.6); }
    this.orders = this.orders.filter((x) => x !== o);
    this.ticketsDirty = true;
    capture('order_shipped', { day: this.day + 1, ship: o.ship, items: o.items.length, fast });
  }

  // ---------------------------------------------------------------- tools
  private useTool(i: number) {
    const id = this.tools[i];
    if (!id || this.mode !== 'playing') return;
    if ((this.cd.get(id) ?? 0) > 0) { this.nope(`${TOOLS[id].name} is recharging.`); return; }
    const T = TOOLS[id];
    if (id === 'session_replay') {
      const last = this.lost.pop();
      if (!last) { this.nope('Nothing to rewind yet. Good!'); return; }
      const o = last.order;
      o.patience = o.max * 0.8;
      o.packed = o.items.map(() => false);
      o.wrapped = false;
      o.sealed = false;
      o.station = -1;
      this.orders.unshift(o);
      this.rating = Math.min(5, this.rating + last.loss);
      this.ticketsDirty = true;
      this.assignTables();
      this.say(`Replay showed what went wrong. #${o.id} is back, stars restored.`, GREEN);
    } else if (id === 'surveys') {
      for (const o of this.orders) o.patience = Math.min(o.max, o.patience + o.max * 0.4);
      this.rating = Math.min(5, this.rating + 0.2);
      this.say('Customers said they can wait a bit longer. +0.2 stars', GREEN);
    } else if (id === 'error_tracking') {
      this.shield = true;
      this.say('Error Tracking is watching: your next mistake is caught.', GREEN);
    } else {
      this.active.set(id, T.dur);
      if (id === 'feature_flags') { this.unjam(0, true); this.unjam(1, true); this.say('Flag flipped: belts slowed, jams cleared.', GREEN); }
      if (id === 'product_analytics') this.say('Insights: the items your orders need are glowing.', GREEN);
      if (id === 'experiments') this.say('Variant B wins: you move 50% faster.', GREEN);
    }
    this.cd.set(id, T.cd * this.diff.cd * this.heat.cd);
    this.toolsUsed++;
    K.play('power');
    const o = this.toolObjs[i];
    if (o) { punch(o.icon, 0.5); burst(this, o.icon.x, o.icon.y, productColour(id), 10); }
    capture('tool_used', { tool: id, day: this.day + 1 });
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    const c = e.code;
    if (this.mode === 'intro' && ['Enter', 'Space', 'NumpadEnter'].includes(c) && this.overlayT > 0.3) { K.play('select'); this.startShift(); return; }
    if (this.mode === 'summary' && ['Enter', 'Space', 'NumpadEnter'].includes(c) && this.overlayT > 0.5) {
      if (this.rating <= 0 && !this.god) return;
      K.play('select');
      this.nextDay();
      return;
    }
    if (this.mode !== 'playing') return;
    if (c === 'Space' || c === 'KeyE' || c === 'Enter' || c === 'KeyJ') this.interact();
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(c);
    if (n >= 0) this.useTool(n);
  }

  // ---------------------------------------------------------------- loop
  update(_t: number, dtMs: number) {
    if (this.finished) return;
    if (hitstopped(this)) return;
    const dt = (Math.min(dtMs, 50) / 1000) * this.simSpeed;
    this.t += dt;
    this.overlayT += dt;
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech.setText(''); }
    if (this.mode === 'playing') this.tick(dt);
    if (this.autopilot) this.bot(dt);
    else if (this.mode === 'playing') this.movePlayer(dt, this.inputDir());
    this.heldSpr?.setPosition(this.player.x, this.player.y - 13);
    this.drawHud();
    this.drawTickets();
    this.drawTools();
    this.drawHint();
    hooks.score = this.score;
    hooks.stats = {
      day: this.day + 1, mode: this.mode, runMode: this.runMode, heat: this.heatN, rating: Math.round(this.rating * 10) / 10, score: this.score,
      clock: Math.round(this.clock), shipped: this.total.shipped, dayShipped: this.stats.shipped, quota: this.quota, expired: this.total.expired,
      wrongDoor: this.total.wrongDoor, returnsLost: this.total.returnsLost, open: this.orders.length, belt: this.belt.length,
      held: this.held?.kind ?? null, jams: this.jammed.filter(Boolean).length, combo: this.combo, grades: [...this.grades], tools: this.toolsUsed,
    };
  }

  private inputDir() {
    const k = this.keys;
    const x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    const y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    return { x, y };
  }

  private movePlayer(dt: number, d: { x: number; y: number }) {
    const p = this.player;
    if (!d.x && !d.y) { p.anims.stop(); p.setFrame({ down: 0, up: 2, left: 4, right: 6 }[this.dir]); return; }
    const len = Math.hypot(d.x, d.y) || 1;
    const sp = SPEED * this.diff.speed * ((this.active.get('experiments') ?? 0) > 0 ? 1.5 : 1);
    p.x = Phaser.Math.Clamp(p.x + (d.x / len) * sp * dt, PX0, PX1);
    p.y = Phaser.Math.Clamp(p.y + (d.y / len) * sp * dt, PY0, PY1);
    const nd = Math.abs(d.x) > Math.abs(d.y) ? (d.x > 0 ? 'right' : 'left') : d.y > 0 ? 'down' : 'up';
    if (nd !== this.dir || !p.anims.isPlaying) { this.dir = nd; p.play(`hs-walk-${nd}`, true); }
  }

  private tick(dt: number) {
    const endless = this.runMode === 'endless';
    hooks.elapsed += dt;
    if (!endless) {
      this.clock -= dt;
      const step = this.clock <= 5 ? Math.ceil(this.clock * 2) : Math.ceil(this.clock);
      if (this.clock <= 10 && step !== this.lastTick && this.clock > 0) K.play('tick', this.clock <= 5 ? 0.9 : 0.6, 0);
      this.lastTick = step;
      if (this.clock <= 0) { this.clock = 0; this.endDay(); return; }
    } else this.rule.every = Math.max(3.4, 9 - this.t / 35);
    if (this.rating <= 0 && !this.god) { this.say('Out of stars...', RED); this.finish(false); return; }
    // tools
    for (const [id, v] of this.cd) if (v > 0) this.cd.set(id, Math.max(0, v - dt));
    for (const [id, v] of this.active) { if (v > 0) this.active.set(id, Math.max(0, v - dt)); }
    // new orders
    this.nextOrder -= dt;
    if (this.nextOrder <= 0 && this.clock > 8 || (this.nextOrder <= 0 && endless)) {
      const busy = this.orders.length;
      if (busy < MAX_OPEN) this.newOrder();
      const early = this.stats.shipped + this.stats.expired < 2 ? 0.6 : 1;
      this.nextOrder = this.rule.every * this.heat.every * early * this.r.float(0.8, 1.2) * (busy === 0 ? 0.4 : 1);
    }
    // patience
    for (const o of [...this.orders]) {
      if (o.station === -2) { o.patience -= dt * 0.5; } // in your arms: nearly there
      else o.patience -= dt;
      if (o.patience <= 0) this.expire(o);
    }
    // belts
    for (const i of [0, 1] as const) {
      const v = this.beltSpeed(i);
      this.belts[i].tilePositionX += (i === 0 ? -v : v) * dt;
      this.nextSpawn[i] -= dt * (v > 0 ? 1 : 0);
      if (this.nextSpawn[i] <= 0) {
        this.spawnOn(i);
        this.nextSpawn[i] = (34 / Math.max(10, v)) * this.r.float(0.9, 1.5);
      }
    }
    const glow = (this.active.get('product_analytics') ?? 0) > 0;
    const need = glow ? this.needs() : null;
    for (const b of [...this.belt]) {
      const v = this.beltSpeed(b.belt);
      b.x += (b.belt === 0 ? v : -v) * dt;
      b.spr.x = Math.round(b.x);
      const lit = !!need && !b.ret && (need.get(b.idx) ?? 0) > 0;
      if (lit && !b.glow) b.glow = this.add.rectangle(b.spr.x, b.spr.y, 18, 18).setStrokeStyle(1, 0xb8f818).setDepth(7);
      if (!lit && b.glow) { b.glow.destroy(); b.glow = undefined; }
      b.glow?.setPosition(b.spr.x, b.spr.y).setAlpha(Math.floor(this.t * 6) % 2 ? 1 : 0.5);
      const gone = b.belt === 0 ? b.x > BELT_X1 + 10 : b.x < -8;
      if (gone) {
        b.spr.destroy();
        b.glow?.destroy();
        this.belt = this.belt.filter((x) => x !== b);
        if (b.ret) {
          this.stats.returnsLost++;
          this.total.returnsLost++;
          const loss = this.loseStars(LOSS.returnLost, null);
          if (loss) this.say(`A return slipped away. -${loss.toFixed(1)} stars`, RED);
        }
      }
    }
    // jams
    if (this.rule.jams) {
      this.nextJam -= dt;
      if (this.nextJam <= 0) { this.jam(this.r.int(0, 1)); this.nextJam = this.r.float(15, 24) * this.heat.every; }
    }
    this.jamSigns.forEach((s, i) => {
      s.setText(this.jammed[i] ? K.theme.game.jam.name : '').setVisible(Math.floor(this.t * 3) % 2 === 0);
      if (this.jammed[i] && Math.floor(this.t * 5) !== Math.floor((this.t - dt) * 5)) burst(this, 40 + this.r.int(0, 380), i === 0 ? TOP_BELT : BOT_BELT, 0xfca044, 3, { speed: 50 });
    });
    this.levers.forEach((l, i) => l.setTint(this.jammed[i] && Math.floor(this.t * 4) % 2 ? 0xff8080 : 0xffffff));
  }

  // ---------------------------------------------------------------- autopilot
  private bot(dt: number) {
    this.botT += dt;
    if (this.mode === 'intro' && this.overlayT > 0.6) { this.startShift(); return; }
    if (this.mode === 'summary' && this.overlayT > 0.8) { if (this.rating > 0 || this.god) this.nextDay(); return; }
    if (this.mode !== 'playing') return;
    // tools now and then
    this.botToolT += dt;
    if (this.botToolT > 9 && this.tools.length) {
      this.botToolT = 0;
      const ready = this.tools.map((id, i) => ({ id, i })).filter(({ id }) => (this.cd.get(id) ?? 0) <= 0);
      const pick = ready.find(({ id }) => (id === 'feature_flags' && this.jammed.some(Boolean)) || (id === 'session_replay' && this.lost.length)
        || (id === 'surveys' && this.orders.some((o) => o.patience / o.max < 0.3)) || id === 'product_analytics' || id === 'experiments' || id === 'error_tracking');
      if (pick) this.useTool(pick.i);
    }
    const goal = this.botPlan();
    if (!goal) { this.movePlayer(dt, { x: 0, y: 0 }); return; }
    const p = this.player;
    const gx = Phaser.Math.Clamp(goal.x, PX0, PX1), gy = Phaser.Math.Clamp(goal.y, PY0, PY1);
    const dx = gx - p.x, dy = gy - p.y;
    const dist = Math.hypot(dx, dy);
    const sp = SPEED * this.diff.speed * ((this.active.get('experiments') ?? 0) > 0 ? 1.5 : 1);
    if (dist > sp * dt) this.movePlayer(dt, { x: dx / dist, y: dy / dist });
    else { p.setPosition(gx, gy); this.movePlayer(dt, { x: 0, y: 0 }); }
    if (Math.hypot(gx - p.x, gy - p.y) <= 6 && this.botT > 0.18) { this.botT = 0; this.interact(); }
  }

  /** Where the bot wants to stand next (it presses SPACE when it gets there). */
  private botPlan(): { x: number; y: number } | null {
    const h = this.held;
    const stationOf = (pred: (o: Order) => boolean) => this.stations.find((s) => s.order && !s.order.sealed && pred(s.order));
    if (h?.kind === 'box') return { x: PX1, y: DOCKS[h.order.ship] };
    if (h?.kind === 'return') return { x: BIN.x + 18, y: BIN.y };
    if (h?.kind === 'wrap') {
      const s = stationOf((o) => o.needsWrap && !o.wrapped);
      return s ? { x: s.x, y: s.y + 20 } : { x: WRAP.x + 18, y: WRAP.y };
    }
    if (h?.kind === 'item') {
      const s = stationOf((o) => o.items.some((i, j) => i === h.idx && !o.packed[j]) && (!(h.idx !== HOT && this.items[h.idx]?.fragile && this.rule.fragile) || o.wrapped));
      if (s) return { x: s.x, y: s.y + 20 };
      const needsWrapFirst = stationOf((o) => o.items.some((i, j) => i === h.idx && !o.packed[j]));
      if (needsWrapFirst) return { x: this.player.x, y: PY0 }; // put it back; wrap first
      return { x: this.player.x, y: this.player.y < 150 ? PY0 : PY1 };
    }
    // empty hands: sealed box > jam > wrap > return > needed item on a belt
    const sealed = this.stations.find((s) => s.order?.sealed);
    if (sealed) return { x: sealed.x, y: sealed.y + 20 };
    const j = this.jammed.findIndex(Boolean);
    if (j >= 0) return { x: LEVERS[j].x + 10, y: LEVERS[j].y };
    const wrapNeeded = stationOf((o) => o.needsWrap && !o.wrapped);
    if (wrapNeeded) return { x: WRAP.x + 18, y: WRAP.y };
    const ret = this.belt.find((b) => b.ret);
    if (ret) return this.intercept(ret);
    const need = new Map<number, number>();
    for (const s of this.stations) {
      const o = s.order;
      if (!o || o.sealed) continue;
      o.items.forEach((idx, k) => { if (!o.packed[k]) need.set(idx, Math.max(need.get(idx) ?? 0, 1 + (1 - o.patience / o.max) * 3)); });
    }
    let best: { b: BeltThing; score: number } | null = null;
    for (const b of this.belt) {
      if (b.ret || !(need.get(b.idx) ?? 0)) continue;
      const tgt = this.intercept(b);
      if (!tgt) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, tgt.x, tgt.y);
      const sc = (need.get(b.idx) ?? 1) * 100 - d;
      if (!best || sc > best.score) best = { b, score: sc };
    }
    if (best) return this.intercept(best.b);
    return { x: 236, y: this.player.y < 150 ? PY0 + 4 : PY1 - 4 };
  }

  private intercept(b: BeltThing): { x: number; y: number } | null {
    const v = this.beltSpeed(b.belt) * (b.belt === 0 ? 1 : -1);
    const y = b.belt === 0 ? PY0 : PY1;
    const sp = SPEED * this.diff.speed * ((this.active.get('experiments') ?? 0) > 0 ? 1.5 : 1);
    let t = 0;
    for (let k = 0; k < 6; k++) {
      const x = b.x + v * t;
      t = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) / sp;
    }
    const x = b.x + v * (t + 0.15);
    if (x < PX0 + 2 || x > PX1 - 2) return null;
    return { x, y };
  }

  // ---------------------------------------------------------------- the end
  private finish(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.mode = 'done';
    const save = kitSave();
    Object.assign(lastEnd, { ending: null, grade: '', endless: false, daily: this.runMode === 'daily', orders: 0, newBestGrade: false, names: names() });
    if (this.runMode === 'endless') {
      const n = this.total.shipped;
      lastEnd.endless = true;
      lastEnd.orders = n;
      if (n > save.endlessBest) save.endlessBest = n;
      meta.save();
      if (n >= 30) achieve('endless30');
      this.time.delayedCall(700, () => this.scene.start('End', {
        won: false, score: this.score, headline: 'SHIFT OVER',
        stats: [['Orders shipped', n], ['Lasted', `${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}`], ['Best combo', this.bestCombo]],
        props: { mode: 'endless', orders: n },
      }));
      return;
    }
    const weekGrade = this.grades.length ? this.grades.slice().sort((a, b) => 'SABCD'.indexOf(a) - 'SABCD'.indexOf(b))[Math.floor(this.grades.length / 2)] : 'D';
    if (won) this.score += Math.round(this.rating * 200);
    const ending = pickEnding({ won, rating: this.rating, shipped: this.total.shipped, quotaTotal: this.quotaTotal });
    lastEnd.ending = ending;
    lastEnd.grade = won ? weekGrade : '';
    if (!save.endings.includes(ending.id)) save.endings.push(ending.id);
    const key = String(this.heatN);
    if (won && (!save.bestGrade[key] || 'SABCD'.indexOf(weekGrade) < 'SABCD'.indexOf(save.bestGrade[key]))) { save.bestGrade[key] = weekGrade; lastEnd.newBestGrade = true; }
    meta.save();
    if (won && this.grades.length >= DAYS.length) {
      achieve('first_week');
      if (this.rating >= 4.5) achieve('five_star');
      if (this.total.wrongDoor === 0) achieve('no_wrong');
      if (this.total.express >= 10) achieve('express10');
      if (this.hotTotal > 0 && this.hotShipped >= this.hotTotal) achieve('hot');
      if (this.heatN >= 3) achieve('heat3');
      if (this.heatN >= 5) achieve('heat5');
      if (this.runMode === 'daily') achieve('daily');
      if (this.toolsUsed === 0) achieve('no_tools');
    }
    capture('ending_reached', { ending: ending.id, grade: weekGrade, heat: this.heatN, mode: this.runMode, rating: Math.round(this.rating * 10) / 10 });
    this.time.delayedCall(won ? 300 : 700, () => this.scene.start('End', {
      won, score: this.score, headline: ending.name,
      stats: [['Orders shipped', this.total.shipped], ['Customer rating', `${this.rating.toFixed(1)} stars`],
        ['Week grade', won ? `${weekGrade}${this.grades.length ? `  (days ${this.grades.join('')})` : ''}` : '-']],
      props: { day: this.day + 1, shipped: this.total.shipped, rating: Math.round(this.rating * 10) / 10, tools: this.tools, ending: ending.id,
        grade: weekGrade, heat: this.heatN, mode: this.runMode },
    }));
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    this.badges = Array.from({ length: MAX_OPEN }, () => text(this, 0, 0, '', { align: 'center', color: 0xfcfcfc, shadow: null, depth: 53 }).setVisible(false));
    this.more = text(this, W - 6, TICKET_Y + TICKET_H + 2, '', { align: 'right', color: GOLD, depth: 53 }).setVisible(false);
    this.hint = text(this, 0, 0, '', { align: 'center', color: GOLD, depth: 30 }).setVisible(false);
    this.hintArrow = text(this, 0, 0, '', { align: 'center', color: GOLD, depth: 30 }).setVisible(false);
    hooks.debug = {
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); setJuiceSpeed(this.simSpeed); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true) => { this.autopilot = !!on; },
      lose: () => this.finish(false),
      win: () => this.finish(true),
      skipDay: () => { if (this.mode === 'playing') this.clock = 0.01; },
      day: (n: number) => { this.clearOverlay(); this.orders.forEach((o) => this.removeOrder(o)); this.day = Math.max(0, Math.min(4, (n | 0) - 1)); this.showIntro(); },
      rating: (v: number) => { this.rating = Math.max(0, Math.min(5, Number(v) || 0)); },
      jam: (i = 0) => this.jam(i ? 1 : 0),
      /** Put the hog somewhere (screenshots, tests). */
      hog: (x: number, y: number) => { this.player.setPosition(Phaser.Math.Clamp(+x || 0, PX0, PX1), Phaser.Math.Clamp(+y || 0, PY0, PY1)); },
      hint: () => { const a = this.action(); return 'nope' in a ? `nope: ${a.nope}` : a.label; },
      tool: (i = 0) => this.useTool(i | 0),
      orders: () => this.orders.map((o) => ({ id: o.id, items: o.items, packed: o.packed, ship: o.ship, station: o.station, sealed: o.sealed, wrap: o.needsWrap && !o.wrapped })),
      heat: (n: number) => { K.run.heat = Math.max(0, Math.min(5, n | 0)); K.run.choices.heat = K.run.heat; this.scene.restart(); },
      mode: (m: string) => { K.run.mode = m; K.run.choices.mode = m; this.scene.restart(); },
      unlockAll: () => { const s = kitSave(); s.endings = ENDINGS.map((e) => e.id); s.bestGrade = { 0: 'A', 1: 'B', 2: 'B', 3: 'C', 4: 'C', 5: 'D' }; return sharedDebug.unlockAll?.(); },
      endings: () => kitSave().endings,
      // Load test: the sale day at top speed with every order slot full.
      flood: () => {
        hooks.debug.showcase();
        this.rule = { ...this.rule, every: 1.5 };
        this.simSpeed = 8;
        setJuiceSpeed(8);
        this.autopilot = true;
        this.god = true;
      },
      // For the gameplay GIF: a busy day-4 shift, orders on every table, a jam on the bottom belt.
      showcase: () => {
        if (this.finished) return;
        this.clearOverlay();
        this.day = 3;
        this.setRule(3);
        this.refreshDocks();
        this.startShift();
        this.score = Math.max(this.score, 1840);
        this.rating = Math.min(this.rating, 4.3);
        this.total.shipped += 11;
        this.stats.shipped = 3;
        this.clock = this.dayLen * 0.55;
        for (let i = 0; i < 4; i++) this.newOrder();
        const o = this.orders[0];
        if (o) { o.packed = o.items.map(() => true); if (o.needsWrap) o.wrapped = true; o.sealed = true; this.redrawStation(this.stations[o.station]); }
        for (let x = 20; x < 420; x += 44) { this.addToBelt(0, this.r.int(0, this.items.length - 1), false, x); this.addToBelt(1, this.r.int(0, this.items.length - 1), false, x + 20); }
        this.setHeld({ kind: 'item', idx: this.orders[1]?.items[0] ?? 0 });
        this.player.setPosition(200, 170);
        this.jam(1);
        this.combo = 4;
      },
    };
  }
}
