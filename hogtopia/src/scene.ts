// Hogtopia's map scene: rendering, keyboard input and turn flow. Rules live in world.ts, the AI in ai.ts,
// modal panels in menus.ts, run setup (map, personality, heat) in setup.ts.
import Phaser from 'phaser';
import { K, spr } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture as track } from '@shared/analytics';
import { achieve } from '@shared/meta';
import { burst, floatText, shake, hitstop, toast, flash, punch, setJuiceSpeed } from '@shared/juice';
import { text, box, PixelText, W, H } from '@shared/ui';
import { dist, toInt } from '@shared/palette';
import { World, MAX_TURNS, UNITS, TECHS, Unit, City, Owner, UnitType, cheb, foes } from './world';
import { aiTurn, Action, dangerMap } from './ai';
import { UNIT_ORDER, TRAINABLE, LEVEL_REWARDS, MONUMENTS, PERSONALITIES, PERSONALITY_IDS, VET_KILLS } from './data';
import { MAP_TYPES } from './mapgen';
import { productName, techName, techGrid, drawTech, drawTrain, drawReward, drawTruce } from './menus';
import { chooseSetup, RunSetup } from './setup';
import { grade, checkAchievements } from './progress';

export { productName };
const T = 16;
const MX = 4;
const MY = 18;
const VW = 18 * T; // map viewport (the largest map fills it; smaller maps are centred)
const VH = 12 * T;
const SX = MX + VW + 6; // sidebar x
const SW = W - SX - 4;
const BIOMES = ['meadow', 'desert', 'tundra', 'circuit'];

export const PLAYER_UNIT_NAMES: Record<UnitType, string> = { scout: 'Intern', warrior: 'Engineer', archer: 'Analyst', defender: 'Flag Guard', catcher: 'Bug Catcher', catapult: 'Catapult', giant: 'Giant' };
const RIVAL_UNIT_NAMES: Record<UnitType, string> = { scout: 'Stray Cron', warrior: 'Tech Debt', archer: 'Spam Alert', defender: 'Firewall', catcher: 'Monolith Bot', catapult: 'Spam Cannon', giant: 'Behemoth' };
const PERSONA_TIPS: Record<string, string> = {
  aggressor: 'Scouts say this rival is an AGGRESSOR. Expect an early attack: guard your capital!',
  expander: 'This rival is an EXPANDER: it races for villages. Grab the ones near you fast!',
  turtle: 'This rival is a TURTLE: slow to attack, hard to crack. Out-grow it on score!',
  opportunist: 'This rival is an OPPORTUNIST: it hunts hurt units. Heal them in your cities.',
};
const REWARD_SAY: Record<string, string> = {
  workshop: 'A workshop! +1 star every turn.', explorer: 'An explorer joins you.', wall: 'City walls up: units here defend x2.',
  stockpile: '+6 stars in the bank.', borders: 'The borders grow: new land and resources!', growth: 'Pop boom!',
  park: 'A park! +250 score.', giant: 'A GIANT joins your side!',
};

/** Same rule as art.py: the rival colour is the candidate most unlike the brand primary. */
export function rivalColour(primary: string) {
  return ['#940084', '#a80020', '#4428bc', '#7c7c7c'].reduce((b, c) => (dist(c, primary) > dist(b, primary) ? c : b));
}

type Menu =
  | { kind: 'train'; sel: number; city: City; objs: Phaser.GameObjects.GameObject[] }
  | { kind: 'tech'; row: number; col: number; objs: Phaser.GameObjects.GameObject[] }
  | { kind: 'reward'; sel: number; city: City; level: number; objs: Phaser.GameObjects.GameObject[] }
  | { kind: 'truce'; sel: number; objs: Phaser.GameObjects.GameObject[] };

export class MapScene extends Phaser.Scene {
  private w!: World;
  private setup!: RunSetup;
  private ox = MX;
  private oy = MY;
  private terrain: Phaser.GameObjects.Image[] = [];
  private res: Phaser.GameObjects.Image[] = [];
  private deco: Phaser.GameObjects.Image[] = [];
  private cityImgs: Phaser.GameObjects.Image[] = [];
  private crowns: Phaser.GameObjects.Image[] = [];
  private walls: Phaser.GameObjects.Image[] = [];
  private fog: Phaser.GameObjects.Image[] = [];
  private unitSprites = new Map<number, Phaser.GameObjects.Image>();
  private boats = new Map<number, Phaser.GameObjects.Image>();
  private hpG!: Phaser.GameObjects.Graphics;
  private borderG!: Phaser.GameObjects.Graphics;
  private hlG!: Phaser.GameObjects.Graphics;
  private curG!: Phaser.GameObjects.Graphics;
  private cx = 0;
  private cy = 0;
  private sel: Unit | null = null;
  private busy = false;
  private alive = true;
  private menu: Menu | null = null;
  private top!: PixelText;
  private turnTxt!: PixelText;
  private starsTxt!: PixelText;
  private info!: PixelText;
  private advName!: PixelText;
  private advTxt!: PixelText;
  private advImg!: Phaser.GameObjects.Image;
  private ctx1!: PixelText;
  private ctx2!: PixelText;
  private msg!: PixelText;
  private animMs = 160;
  private autopilot = false;
  private water = 0;
  private teamCol = 0;
  private rivalCol = 0;
  private rival2Col = 0;
  private tauntsUsed = new Set<number>();
  private firstBlood = false;
  private summary: string[] = [];
  private truceOffered = false;
  private warned = -1; // city the last massing warning was about
  private runStats = { lostUnits: 0, battles: 0 };

  constructor() { super('Map'); }

  create(data: Partial<RunSetup> = {}) {
    const g = K.theme.game;
    this.alive = true;
    this.busy = false;
    this.sel = null;
    this.menu = null;
    this.autopilot = false;
    this.animMs = 160;
    setJuiceSpeed(1);
    this.tauntsUsed = new Set();
    this.firstBlood = false;
    this.truceOffered = false;
    this.warned = -1;
    this.summary = [];
    this.runStats = { lostUnits: 0, battles: 0 };
    this.unitSprites = new Map();
    this.boats = new Map();
    this.terrain = []; this.res = []; this.deco = []; this.cityImgs = []; this.crowns = []; this.walls = []; this.fog = [];
    this.events.once('shutdown', () => (this.alive = false));
    const rivalShort = String(g.rival.name).replace(/^the\s+/i, '').split(/\s+/).pop() || 'Rival';
    this.setup = chooseSetup(data && typeof data === 'object' ? data : {});
    const s = this.setup;
    this.w = new World({
      seed: s.seed, biome: g.biome, difficulty: g.difficulty, products: K.theme.products, map: s.map, heat: s.heat, personality: s.personality, firstGame: s.runIndex === 0 && !s.daily && s.heat === 0,
      names: { capital: g.faction.capital, cities: g.cities, rivalCapital: g.rival.capital || `${rivalShort} HQ`.slice(0, 14), rivalShort },
    });
    const w = this.w;
    this.ox = MX + Math.floor((VW - w.W * T) / 2);
    this.oy = MY + Math.floor((VH - w.H * T) / 2);
    this.capital(0)!.name = w.names.capital;
    this.capital(1)!.name = w.names.rivalCapital;
    w.cities.forEach((c) => { if (!c.capital && c.owner === -1) c.name = 'Village'; });
    w.onEvent = (e, d) => this.onWorldEvent(e, d);
    // Borders must stand out from the ground: fall back to the accent (or white) when the brand
    // colour is too close to this biome's plains.
    const ground = ({ meadow: '#007800', desert: '#f8d878', tundra: '#bcbcbc', circuit: '#004058' } as Record<string, string>)[g.biome] ?? '#007800';
    const pickVisible = (...cs: string[]) => cs.find((c) => dist(c, ground) > 180) ?? '#fcfcfc';
    this.teamCol = toInt(pickVisible(K.ui.primary, K.ui.accent));
    this.rivalCol = toInt(pickVisible(rivalColour(K.theme.palette.primary), '#d800cc'));
    this.rival2Col = toInt(pickVisible('#00e8d8', '#3cbcfc', '#fcfcfc'));
    hooks.scene = 'Map';
    hooks.state = 'playing';
    hooks.elapsed = 0;
    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.buildMap();
    this.buildUi();
    const cap = w.capital(0)!;
    this.cx = cap.x; this.cy = cap.y;
    this.input.keyboard!.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKey, this));
    this.time.addEvent({ delay: 600, loop: true, callback: () => { this.water ^= 1; this.drawTerrain(); this.pulseTurn(); } });
    this.installDebug();
    track('hogtopia_setup', { map: s.map, personality: s.personality, heat: s.heat, daily: s.daily, run_index: s.runIndex });
    this.startPlayerTurn(true);
  }

  update(_t: number, dt: number) {
    if (!this.w.over) hooks.elapsed += dt / 1000;
    this.drawCursor();
  }

  private capital(o: Owner) { return this.w.capital(o); }
  private px(x: number) { return this.ox + x * T; }
  private py(y: number) { return this.oy + y * T; }
  private fast() { return this.animMs === 0; }

  // ---------------------------------------------------------------- map drawing
  private buildMap() {
    const w = this.w;
    const bi = Math.max(0, BIOMES.indexOf(w.biome));
    if (w.W * T < VW || w.H * T < VH) this.add.rectangle(MX, MY, VW, VH, 0x000000).setOrigin(0).setDepth(-1);
    for (let i = 0; i < w.W * w.H; i++) {
      const x = this.px(i % w.W), y = this.py((i / w.W) | 0);
      this.terrain.push(this.add.image(x, y, spr('terrain'), bi * 8).setOrigin(0).setDepth(0));
      this.res.push(this.add.image(x, y, spr('res'), 0).setOrigin(0).setDepth(1).setVisible(false));
      this.deco.push(this.add.image(x, y, spr('extra'), 3).setOrigin(0).setDepth(3).setVisible(false));
      this.fog.push(this.add.image(x, y, spr('terrain'), bi * 8 + 7).setOrigin(0).setDepth(8).setVisible(!w.tiles[i].seen));
    }
    for (const c of w.cities) {
      this.cityImgs[c.id] = this.add.image(this.px(c.x), this.py(c.y), spr('city'), 0).setOrigin(0).setDepth(3);
      this.walls[c.id] = this.add.image(this.px(c.x), this.py(c.y) + 11, spr('extra'), 4).setOrigin(0).setDepth(3.5).setVisible(false);
      this.crowns[c.id] = this.add.image(this.px(c.x), this.py(c.y) - 5, spr('city'), 7).setOrigin(0).setDepth(6).setVisible(false);
    }
    this.borderG = this.add.graphics().setDepth(2);
    this.hlG = this.add.graphics().setDepth(4);
    this.hpG = this.add.graphics().setDepth(7);
    this.curG = this.add.graphics().setDepth(9);
    this.add.graphics().setDepth(9).lineStyle(1, K.ui.textInt, 1).strokeRect(this.ox - 1.5, this.oy - 1.5, w.W * T + 3, w.H * T + 3);
  }

  private drawTerrain() {
    const bi = Math.max(0, BIOMES.indexOf(this.w.biome));
    this.w.tiles.forEach((t, i) => {
      const x = i % this.w.W, y = (i / this.w.W) | 0;
      const f = t.t === 'water' ? 4 + this.water : t.t === 'forest' ? 2 : t.t === 'mountain' ? 3 : t.ruins ? 6 : (x * 7 + y * 3) % 5 === 0 ? 1 : 0;
      this.terrain[i].setFrame(bi * 8 + f);
    });
  }

  private ownerCol(o: number) { return o === 0 ? this.teamCol : o === 2 ? this.rival2Col : this.rivalCol; }

  private redraw() {
    const w = this.w;
    this.drawTerrain();
    w.tiles.forEach((t, i) => {
      this.res[i].setVisible(!!t.res && t.seen).setFrame(t.res === 'fruit' ? 1 : t.res === 'fish' ? 2 : 0);
      this.deco[i].setVisible(!!t.monument && t.seen);
      // Fog lifts with a short fade instead of popping.
      const f = this.fog[i];
      if (t.seen && f.visible && !this.tweens.isTweening(f)) {
        if (this.fast()) f.setVisible(false);
        else this.tweens.add({ targets: f, alpha: 0, duration: 380, onComplete: () => f.setVisible(false).setAlpha(1) });
      } else if (!t.seen) f.setVisible(true);
    });
    for (const c of w.cities) {
      const f = c.owner === -1 ? 0 : c.owner === 0 ? Math.min(3, c.level) : 3 + Math.min(3, c.level);
      const seen = w.tile(c.x, c.y).seen;
      this.cityImgs[c.id].setFrame(f);
      if (c.owner === 2) this.cityImgs[c.id].setTint(0xa0fff0); else this.cityImgs[c.id].clearTint();
      this.crowns[c.id].setVisible(c.capital && c.owner >= 0 && seen);
      this.walls[c.id].setVisible(c.perks.includes('wall') && c.owner >= 0 && seen);
      if (c.perks.includes('park')) this.deco[w.idx(c.x, c.y)].setVisible(false);
    }
    // Territory borders.
    const g = this.borderG.clear();
    const ownerAt = (x: number, y: number) => {
      if (!w.inMap(x, y)) return -2;
      const t = w.tile(x, y);
      return t.terr >= 0 ? w.cities[t.terr].owner : -2;
    };
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const o = ownerAt(x, y);
      if (o < 0 || !w.tile(x, y).seen) continue;
      g.fillStyle(this.ownerCol(o), 1);
      const px = this.px(x), py = this.py(y);
      if (ownerAt(x, y - 1) !== o) g.fillRect(px, py, T, 2);
      if (ownerAt(x, y + 1) !== o) g.fillRect(px, py + T - 2, T, 2);
      if (ownerAt(x - 1, y) !== o) g.fillRect(px, py, 2, T);
      if (ownerAt(x + 1, y) !== o) g.fillRect(px + T - 2, py, 2, T);
    }
    this.syncUnits();
    this.drawHighlights();
    this.refreshUi();
  }

  private unitFrame(u: Unit): [string, number] {
    if (u.type === 'giant') return [spr('extra'), u.owner === 0 ? 0 : 1];
    if (u.type === 'catapult') return [spr('extra'), u.owner === 0 ? 8 : 9];
    return [spr('units'), (u.owner === 0 ? 0 : 5) + UNIT_ORDER.indexOf(u.type)];
  }

  private syncUnits() {
    const w = this.w;
    const live = new Set(w.units.map((u) => u.id));
    for (const [id, s] of this.unitSprites) if (!live.has(id)) { s.destroy(); this.unitSprites.delete(id); this.boats.get(id)?.destroy(); this.boats.delete(id); }
    this.hpG.clear();
    for (const u of w.units) {
      let s = this.unitSprites.get(u.id);
      const [key, frame] = this.unitFrame(u);
      if (!s) {
        s = this.add.image(this.px(u.x), this.py(u.y), key, frame).setOrigin(0).setDepth(5);
        if (u.owner === 2) s.setTint(0xa0fff0);
        this.unitSprites.set(u.id, s);
        if (!this.fast() && w.tile(u.x, u.y).seen) { s.setScale(0.2); this.tweens.add({ targets: s, scale: 1, duration: 180, ease: 'Back.Out' }); }
      }
      if (!this.tweens.isTweening(s) || s.scale !== 1) {
        if (!this.tweens.getTweensOf(s).some((tw) => tw.hasTarget(s) && (tw as any).data?.some?.((d: any) => d.key === 'x'))) s.setPosition(this.px(u.x), this.py(u.y));
      }
      s.setFlipX(u.owner !== 0);
      const seen = w.tile(u.x, u.y).seen;
      s.setVisible(seen);
      s.setAlpha(u.owner === 0 && u.done && hooks.state === 'playing' ? 0.55 : 1);
      const onWater = w.tile(u.x, u.y).t === 'water';
      let b = this.boats.get(u.id);
      if (onWater && !b) { b = this.add.image(0, 0, spr('extra'), 2).setOrigin(0).setDepth(5.5); this.boats.set(u.id, b); }
      if (b) b.setVisible(onWater && seen).setPosition(this.px(u.x), this.py(u.y));
      if (!seen) continue;
      const frac = u.hp / u.maxHp;
      const bx = this.px(u.x) + 2, by = this.py(u.y) + T - 2;
      this.hpG.fillStyle(0x000000).fillRect(bx - 1, by - 1, 14, 3)
        .fillStyle(this.ownerCol(u.owner)).fillRect(bx, by, Math.max(1, Math.round(12 * frac)), 1);
      if (u.vet) {
        // Veteran chevron, top-left.
        const cx = this.px(u.x) + 1, cy = this.py(u.y) + 1;
        this.hpG.fillStyle(0x000000).fillRect(cx, cy, 7, 5).fillStyle(0xf8b800)
          .fillRect(cx + 1, cy + 1, 1, 1).fillRect(cx + 2, cy + 2, 1, 1).fillRect(cx + 3, cy + 3, 1, 1).fillRect(cx + 4, cy + 2, 1, 1).fillRect(cx + 5, cy + 1, 1, 1);
      }
    }
  }

  private drawHighlights() {
    const g = this.hlG.clear();
    const w = this.w;
    // Heatmaps: red corner ticks on your units a rival can hit next turn.
    if (w.has(0, 'heatmaps') && hooks.state === 'playing') {
      const d = dangerMap(w, 0);
      for (const u of w.myUnits(0)) if (d[w.idx(u.x, u.y)] > 0) {
        g.fillStyle(0xf83800, 1).fillRect(this.px(u.x) + T - 4, this.py(u.y), 4, 2).fillRect(this.px(u.x) + T - 2, this.py(u.y), 2, 4);
      }
    }
    const u = this.sel;
    if (!u || !w.units.includes(u)) return;
    for (const i of w.reachable(u).keys()) {
      g.fillStyle(0xfcfcfc, 0.28).fillRect(this.px(i % w.W) + 1, this.py((i / w.W) | 0) + 1, T - 2, T - 2);
    }
    for (const t of w.targets(u)) g.lineStyle(2, 0xf83800, 1).strokeRect(this.px(t.x) + 1, this.py(t.y) + 1, T - 2, T - 2);
    g.lineStyle(1, K.ui.accentInt, 1).strokeRect(this.px(u.x) + 0.5, this.py(u.y) + 0.5, T - 1, T - 1);
  }

  private drawCursor() {
    const g = this.curG.clear();
    if (this.menu || this.w.over) return;
    // The city the rival is massing against shows a blinking red "!" badge.
    const tc = this.w.cities[this.warned];
    if (tc && tc.owner === 0 && Math.floor(this.time.now / 300) % 3 !== 0) {
      const x0 = this.px(tc.x) + T - 5, y0 = this.py(tc.y) - 3;
      g.fillStyle(0x000000, 1).fillRect(x0 - 1, y0 - 1, 7, 11).fillStyle(0xf83800, 1).fillRect(x0, y0, 5, 9)
        .fillStyle(0xfcfcfc, 1).fillRect(x0 + 2, y0 + 1, 1, 4).fillRect(x0 + 2, y0 + 7, 1, 1);
    }
    const on = Math.floor(this.time.now / 300) % 3 !== 0;
    const x = this.px(this.cx), y = this.py(this.cy);
    g.lineStyle(1, on ? K.ui.accentInt : 0xfcfcfc, 1);
    for (const [ax, ay, bx, by] of [[0, 0, 4, 0], [0, 0, 0, 4], [T - 1, 0, T - 5, 0], [T - 1, 0, T - 1, 4], [0, T - 1, 4, T - 1], [0, T - 1, 0, T - 5], [T - 1, T - 1, T - 5, T - 1], [T - 1, T - 1, T - 1, T - 5]]) {
      g.lineBetween(x + ax + 0.5, y + ay + 0.5, x + bx + 0.5, y + by + 0.5);
    }
  }

  // ---------------------------------------------------------------- side panels
  private buildUi() {
    const ui = K.ui;
    this.add.rectangle(0, 0, W, 15, 0x000000).setOrigin(0).setDepth(20);
    this.turnTxt = text(this, 4, 3, '', { depth: 21, color: ui.textInt });
    this.top = text(this, 76, 3, '', { depth: 21, color: ui.textInt });
    this.add.image(W - 118, 3, spr('star')).setOrigin(0).setDepth(21);
    this.starsTxt = text(this, W - 108, 3, '', { depth: 21, color: ui.accentInt });
    box(this, SX, MY - 1, SW, 104, ui.bgInt, ui.textInt, ui.panelInt).setDepth(20);
    this.info = text(this, SX + 6, MY + 5, '', { depth: 21, maxWidth: SW - 12, maxLines: 9 });
    box(this, SX, MY + 107, SW, 88, ui.bgInt, ui.textInt, ui.panelInt).setDepth(20);
    this.advImg = this.add.image(SX + 5, MY + 112, spr('advisor')).setOrigin(0).setDepth(21);
    this.advName = text(this, SX + 34, MY + 113, 'Max the Hedgehog', { depth: 21, color: ui.accentInt, maxWidth: SW - 40, maxLines: 1 });
    this.advTxt = text(this, SX + 34, MY + 124, '', { depth: 21, maxWidth: SW - 40, maxLines: 7 });
    this.add.rectangle(0, MY + VH + 3, W, H - (MY + VH + 3), 0x000000).setOrigin(0).setDepth(20);
    this.ctx1 = text(this, 6, H - 50, '', { depth: 21, color: ui.accentInt, maxWidth: W - 12, maxLines: 1 });
    this.ctx2 = text(this, 6, H - 38, '', { depth: 21, color: ui.dimInt, maxWidth: W - 12, maxLines: 1 });
    this.msg = text(this, 6, H - 24, '', { depth: 21, color: ui.textInt, maxWidth: W - 12, maxLines: 2 });
  }

  /** The last turns pulse the turn counter so the clock is felt. */
  private pulseTurn() {
    const w = this.w;
    if (!this.turnTxt || w.over) return;
    const left = MAX_TURNS - w.turn;
    if (left <= 4) {
      this.turnTxt.setColor(this.water ? 0xf83800 : K.ui.textInt);
      if (this.water && !this.fast()) punch(this.turnTxt, 0.12, 160);
    } else this.turnTxt.setColor(K.ui.textInt);
  }

  private say(who: 'advisor' | 'rival', s: string) {
    if (who === 'advisor') {
      this.advImg.setTexture(spr('advisor')).setDisplaySize(24, 24);
      this.advName.setText('Max, your advisor');
    } else {
      this.advImg.setTexture(spr('rival')).setDisplaySize(24, 24);
      this.advName.setText(K.theme.game.rival.name);
    }
    this.advTxt.setText(who === 'rival' ? `"${s}"` : s);
  }

  private taunt(i: number) {
    const ts: string[] = K.theme.game.rival.taunts;
    if (!ts.length || this.tauntsUsed.has(i)) return;
    this.tauntsUsed.add(i);
    this.say('rival', ts[i % ts.length]);
  }

  /** A line in the rival's personality voice (fixed kit lines), once in a while. */
  private personaLine() {
    const lines = this.w.f[this.lead()].persona.lines;
    if (lines.length) this.say('rival', lines[(this.w.turn >> 2) % lines.length]);
  }

  private unitName(u: { owner: Owner; type: UnitType }) {
    return u.owner === 0 ? (K.theme.game.units?.[u.type] || PLAYER_UNIT_NAMES[u.type]) : RIVAL_UNIT_NAMES[u.type];
  }

  private ownerName(o: number) {
    return o === 0 ? K.theme.game.faction.name : o === 1 ? K.theme.game.rival.name : o === 2 ? `${this.w.names.rivalShort} Annex` : 'Neutral village';
  }

  private refreshUi() {
    const w = this.w;
    this.turnTxt.setText(`TURN ${Math.min(w.turn, MAX_TURNS)}/${MAX_TURNS}`);
    this.top.setText(`YOU ${w.score(0)} : ${w.rivalScore()} RIVAL`);
    this.starsTxt.setText(`${w.f[0].stars} (+${w.income(0)})`);
    // Tile info
    const t = w.tile(this.cx, this.cy);
    const lines: string[] = [];
    if (!t.seen) lines.push('Unexplored', '', 'Move units here to see', 'what is out there.');
    else {
      const c = w.cityAt(this.cx, this.cy);
      const u = w.unitAt(this.cx, this.cy);
      if (c) {
        lines.push(`${c.name}${c.capital ? ' (capital)' : ''}`, this.ownerName(c.owner));
        if (c.owner !== -1) lines.push(`Level ${c.level}  pop ${c.pop}/${w.popNeeded(c)}  +${w.cityIncome(c)}/turn`);
        else lines.push('Stand a unit here a turn', 'to capture it.');
        if (c.perks.length) lines.push(c.perks.map((p) => LEVEL_REWARDS[[2, 3, 4, 5].find((l) => LEVEL_REWARDS[l].some((r) => r.id === p))!]?.find((r) => r.id === p)?.name ?? p).join(', '));
      } else {
        const names = { plain: 'Plains', forest: 'Forest (+defence)', mountain: 'Mountains (climb: +def)', water: 'Water' };
        const mon = t.monument ? MONUMENTS.find((m) => m.id === t.monument) : null;
        lines.push(mon ? `${mon.name} (monument)` : t.ruins ? 'Data ruins: explore!' : names[t.t]);
        if (t.res) lines.push(`${t.res === 'data' ? 'Data crystal' : t.res === 'fruit' ? 'Insight berries' : 'Fish'}: harvest 2 stars`);
      }
      if (u) {
        const s = w.stats(u);
        lines.push('', `${this.unitName(u)} (${u.owner === 0 ? 'yours' : 'rival'})${u.vet ? ' VET' : ''}`, `HP ${u.hp}/${u.maxHp}  ATK ${s.atk} DEF ${s.def}`,
          `MOVE ${s.move}  RANGE ${s.range}  KO ${u.kills}${u.vet ? '' : `/${VET_KILLS}`}`);
      }
    }
    this.info.setText(lines.join('\n'));
    this.ctx1.setText(this.context());
    const keys = ['TAB next unit', 'T tech', 'E end turn'];
    if (this.sel && w.has(0, 'session_replay') && this.sel.prev && !w.f[0].undoUsed) keys.unshift('U rewind');
    if (this.sel && w.canCapture(this.sel)) keys.unshift('C capture');
    this.ctx2.setText(keys.join(' - ') + ' - ESC cancel');
    hooks.stats = {
      turn: w.turn, stars: w.f[0].stars, income: w.income(0), techs: [...w.f[0].techs],
      cities: w.myCities(0).length, rivalCities: w.cities.filter((c) => c.owner > 0).length,
      neutral: w.cities.filter((c) => c.owner === -1).length, units: w.myUnits(0).length,
      rivalUnits: w.units.filter((u) => u.owner > 0).length, score: w.score(0), rivalScore: w.rivalScore(),
      map: w.mapType, mapSize: `${w.W}x${w.H}`, firstGame: this.setup.runIndex === 0 && !this.setup.daily, personality: w.f[1].persona.id, heat: w.heat, rivals: w.rivals().length, daily: this.setup.daily,
      runIndex: this.setup.runIndex, vets: w.units.filter((u) => u.vet && u.owner === 0).length, rivalVets: w.units.filter((u) => u.vet && u.owner > 0).length,
      monuments: w.monuments.filter((m) => m.o === 0).map((m) => m.id), rivalMonuments: w.monuments.filter((m) => m.o > 0).map((m) => m.id),
      perks: w.myCities(0).flatMap((c) => c.perks), pending: w.pending.length, truce: w.truce, battlesWon: w.f[0].wins,
      kills: w.f[0].kills, lost: w.f[0].lost, scoreParts: w.scoreParts(0), assault: w.f[1].ai.assault,
    };
    hooks.score = w.score(0);
  }

  private context(): string {
    const w = this.w;
    if (this.busy) return hooks.state === 'aiturn' ? `${K.theme.game.rival.name} is moving...` : '...';
    if (this.menu) {
      return { tech: 'ARROWS choose - ENTER research - ESC close', train: 'UP/DOWN choose - ENTER train - ESC close', reward: 'LEFT/RIGHT choose - ENTER take it', truce: 'LEFT/RIGHT choose - ENTER answer' }[this.menu.kind];
    }
    const u = w.unitAt(this.cx, this.cy);
    const i = w.idx(this.cx, this.cy);
    if (this.sel) {
      const tgt = w.targets(this.sel).find((t) => t.x === this.cx && t.y === this.cy);
      if (tgt) { const f = w.forecast(this.sel, tgt); return `ENTER: attack (deal ${f.dmg}${f.kills ? ', defeats it' : `, take ${f.ret}`})`; }
      if (w.reachable(this.sel).has(i)) return 'ENTER: move here';
      if (u === this.sel) return w.canCapture(u) ? 'ENTER/C: capture this city' : 'ENTER: deselect';
      return 'Pick a highlighted tile, or ESC';
    }
    if (u && u.owner === 0 && !u.done) return w.canCapture(u) ? `ENTER: select ${this.unitName(u)} (can capture)` : `ENTER: select ${this.unitName(u)}`;
    const c = w.cityAt(this.cx, this.cy);
    if (c && c.owner === 0) return u ? 'ENTER: invest in the city (a unit stands here)' : 'ENTER: train a unit or invest';
    if (w.tile(this.cx, this.cy).res && w.tile(this.cx, this.cy).seen) {
      return w.canHarvest(0, this.cx, this.cy) ? `ENTER: harvest for 2 stars (+${w.has(0, 'experiments') ? 2 : 1} pop)` : 'Harvest: needs your territory and 2 stars';
    }
    if (w.truce > 0) return `Truce: ${w.truce} turn${w.truce > 1 ? 's' : ''} left. Grow while you can!`;
    return 'Move the cursor with the ARROW KEYS';
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (this.busy || !this.alive || this.w.over) return;
    const code = e.code;
    if (this.menu) { this.menuKey(code, e.repeat); return; }
    const mv: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    };
    if (mv[code]) {
      this.cx = Phaser.Math.Clamp(this.cx + mv[code][0], 0, this.w.W - 1);
      this.cy = Phaser.Math.Clamp(this.cy + mv[code][1], 0, this.w.H - 1);
      K.play('move', 0.25, 30);
      this.refreshUi();
      return;
    }
    if (e.repeat) return;
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') this.confirm();
    else if (code === 'Escape') { this.sel = null; this.redraw(); }
    else if (code === 'Tab') { e.preventDefault(); this.nextUnit(); }
    else if (code === 'KeyT') this.openTech();
    else if (code === 'KeyE') void this.endTurn();
    else if (code === 'KeyC' && this.sel) this.doCapture(this.sel);
    else if (code === 'KeyU' && this.sel) {
      if (this.w.undo(this.sel)) { K.play('select'); this.say('advisor', 'Rewound, like a session replay. Try again!'); this.redraw(); }
    }
  }

  private nextUnit() {
    const mine = this.w.units.filter((u) => u.owner === 0 && !u.done);
    if (!mine.length) { this.say('advisor', 'Everyone has moved. Press E to end your turn.'); return; }
    const cur = this.sel ? mine.indexOf(this.sel) : -1;
    const u = mine[(cur + 1) % mine.length];
    this.sel = u; this.cx = u.x; this.cy = u.y;
    K.play('select', 0.6);
    this.redraw();
  }

  private confirm() {
    const w = this.w;
    const u = w.unitAt(this.cx, this.cy);
    if (this.sel) {
      const s = this.sel;
      const tgt = w.targets(s).find((t) => t.x === this.cx && t.y === this.cy);
      if (tgt) { void this.act(() => this.doAttack(s, tgt)); return; }
      if (w.reachable(s).has(w.idx(this.cx, this.cy))) { void this.act(() => this.doMove(s, this.cx, this.cy)); return; }
      if (u === s && w.canCapture(s)) { this.doCapture(s); return; }
      this.sel = null;
      this.redraw();
      if (!(u && u.owner === 0 && u !== s && !u.done)) return;
    }
    if (u && u.owner === 0 && !u.done) { this.sel = u; K.play('select', 0.6); this.redraw(); return; }
    const c = w.cityAt(this.cx, this.cy);
    if (c && c.owner === 0 && (!u || (u.owner === 0 && u.done))) { this.openTrain(c); return; }
    if (w.canHarvest(0, this.cx, this.cy)) {
      const r = w.harvest(0, this.cx, this.cy)!;
      K.play(r.grew ? 'levelup' : 'harvest');
      if (!this.fast()) burst(this, this.px(this.cx) + 8, this.py(this.cy) + 8, K.ui.accentInt, 8, { speed: 70 });
      this.say('advisor', r.grew ? `${r.city.name} grew to level ${r.city.level}! More stars every turn.` : `Harvested. ${r.city.name} is growing.`);
      this.redraw();
      this.openPendingReward();
    }
  }

  /** The player's own move/attack: input is ignored until its animation has resolved. */
  private async act(fn: () => Promise<void>) {
    this.busy = true;
    try { await fn(); } finally { if (this.alive && !this.w.over) this.busy = false; }
    this.openPendingReward();
  }

  private async doMove(u: Unit, x: number, y: number) {
    const s = this.unitSprites.get(u.id);
    const from = { x: u.x, y: u.y };
    const ok = this.w.move(u, x, y);
    if (!ok) return;
    K.play('step', 0.5);
    if (s && !this.fast() && this.w.tile(x, y).seen) {
      s.setPosition(this.px(from.x), this.py(from.y));
      await new Promise<void>((r) => this.tweens.add({ targets: s, x: this.px(u.x), y: this.py(u.y), duration: this.animMs * (1 + cheb(from.x, from.y, x, y) * 0.25), ease: 'Sine.InOut', onComplete: () => r() }));
    }
    if (u.owner === 0 && !(this.w.targets(u).length || this.w.canCapture(u))) this.sel = null;
    this.redraw();
  }

  private async doAttack(a: Unit, d: Unit) {
    const sa = this.unitSprites.get(a.id), sd = this.unitSprites.get(d.id);
    const seen = this.w.tile(a.x, a.y).seen || this.w.tile(d.x, d.y).seen;
    // Lunge: the attacker leans in, then the hit lands.
    if (sa && !this.fast() && seen) {
      const dx = Math.sign(d.x - a.x) * 5, dy = Math.sign(d.y - a.y) * 5;
      await new Promise<void>((r) => this.tweens.add({ targets: sa, x: this.px(a.x) + dx, y: this.py(a.y) + dy, duration: 70, yoyo: true, ease: 'Quad.Out', onYoyo: () => r(), onComplete: () => sa.setPosition(this.px(a.x), this.py(a.y)) }));
    }
    const res = this.w.attack(a, d);
    if (!res) return;
    this.runStats.battles++;
    K.play('attack');
    this.float(d.x, d.y, `-${res.dmg}`, 0xf83800);
    if (res.ret) this.float(res.from.x, res.from.y, `-${res.ret}`, 0xfca044);
    if (sd && seen) flash(sd, 0xffffff, 90);
    if (res.ret && sa && seen) this.time.delayedCall(90, () => sa.active && flash(sa, 0xffffff, 70));
    if (res.died.length) {
      K.play('die');
      for (const x of res.died) {
        if (x.owner === 0) this.runStats.lostUnits++;
        if (!this.fast() && this.w.tile(x.x, x.y).seen) burst(this, this.px(x.x) + 8, this.py(x.y) + 8, this.ownerCol(x.owner), 16, { colours: [0xfcfcfc] });
        if (x.owner > 0 && a.owner !== 0) this.summary.push(`lost a ${this.unitName(x)}`);
      }
      if (!this.fast() && seen) { shake(this, 2, 110); hitstop(this, 45); }
    }
    if (a.owner === 0 && res.died.some((x) => x.owner > 0) && !this.firstBlood) { this.firstBlood = true; this.taunt(2); }
    if (a.owner > 0 && res.died.some((x) => x.owner === 0)) this.summary.push(`defeated your ${this.unitName(res.died.find((x) => x.owner === 0)!)}`);
    if (a.owner === 0) this.sel = null;
    await this.wait(this.animMs * 1.5);
    this.redraw();
  }

  private doCapture(u: Unit) {
    const c = this.w.capture(u);
    if (!c) return;
    this.sel = null;
    this.redraw();
    this.openPendingReward();
    this.checkOver();
  }

  private float(x: number, y: number, s: string, col: number) {
    if (!this.w.tile(x, y).seen) return;
    floatText(this, this.px(x) + 8, this.py(y) - 2, s, col, Math.max(0.35, this.animMs / 200));
  }

  private onWorldEvent(e: string, d: any) {
    const w = this.w;
    const g = K.theme.game;
    if (e === 'capture') {
      const c: City = d.city;
      K.play(d.by === 0 ? 'capture' : 'lost');
      if (d.by === 0) {
        this.say('advisor', c.capital ? String(g.rival.defeat || 'Their capital is ours!') : `${c.name} joins ${g.faction.name}! More stars every turn.`);
        if (d.from > 0) this.taunt(2);
      } else {
        this.taunt(1);
        this.summary.push(`took ${c.name}`);
      }
      if (!this.fast() && w.tile(c.x, c.y).seen) {
        const x = this.px(c.x) + 8, y = this.py(c.y) + 8;
        burst(this, x, y, this.ownerCol(d.by), 22, { colours: [K.ui.accentInt, 0xfcfcfc], speed: 130 });
        floatText(this, x, y - 12, d.by === 0 ? 'CAPTURED!' : 'LOST!', d.by === 0 ? K.ui.accentInt : 0xf83800, 0.9);
        punch(this.cityImgs[c.id], 0.35, 200);
        if (d.by !== 0) shake(this, 3, 160);
      }
      this.msg.setText(`${this.ownerName(d.by)} captured ${c.name}.`);
    } else if (e === 'ruins' && d.u.owner === 0) {
      K.play('levelup');
      const m = d.kind === 'tech' ? `The ruins held old notes on ${techName(d.tech)}. Free tech!` : d.kind === 'map' ? 'The ruins held a map of the area, and 2 stars.' : 'The ruins held 5 stars!';
      this.say('advisor', m);
    } else if (e === 'levelup') {
      const c: City = d.city;
      if (!this.fast() && w.tile(c.x, c.y).seen) {
        burst(this, this.px(c.x) + 8, this.py(c.y) + 6, K.ui.accentInt, 18, { colours: [0xfcfcfc, this.ownerCol(c.owner)], gravity: 60 });
        // Your own level-ups get the reward panel instead of a floating label.
        if (c.owner !== 0 || this.autopilot) floatText(this, this.px(c.x) + 8, this.py(c.y) - 4, `LEVEL ${c.level}`, K.ui.accentInt, 0.9);
      }
      if (c.owner > 0 && c.level >= 3) this.summary.push(`grew ${c.name} to ${c.level}`);
    } else if (e === 'reward') {
      if (d.city.owner === 0 && !this.autopilot) this.say('advisor', `${d.city.name}: ${REWARD_SAY[d.id] ?? d.id}`);
      if (d.city.owner > 0 && (d.id === 'giant' || d.id === 'wall')) this.summary.push(d.id === 'giant' ? 'raised a Behemoth' : `walled ${d.city.name}`);
    } else if (e === 'veteran') {
      const u: Unit = d.u;
      this.float(u.x, u.y - 1, 'VETERAN!', 0xf8b800);
      if (!this.fast() && w.tile(u.x, u.y).seen) burst(this, this.px(u.x) + 8, this.py(u.y) + 8, 0xf8b800, 12, { gravity: -40 });
      if (u.owner === 0) { K.play('levelup', 0.7); this.say('advisor', `Your ${this.unitName(u)} is a veteran now: healed and tougher!`); }
      else this.summary.push('promoted a veteran');
    } else if (e === 'monument') {
      const m = MONUMENTS.find((x) => x.id === d.id)!;
      if (d.o === 0) {
        toast(this, `MONUMENT: ${m.name.toUpperCase()}`);
        this.say('advisor', `${m.desc}: you built the ${m.name}! +150 score.`);
      } else this.summary.push(`built the ${m.name}`);
      if (d.at >= 0 && !this.fast() && w.tiles[d.at].seen) burst(this, this.px(d.at % w.W) + 8, this.py((d.at / w.W) | 0) + 8, K.ui.accentInt, 20, { gravity: -30 });
    } else if (e === 'eliminated') {
      toast(this, `${this.ownerName(d.o).toUpperCase()} IS OUT!`);
    }
  }

  // ---------------------------------------------------------------- menus
  private closeMenu() {
    this.menu?.objs.forEach((o) => o.destroy());
    this.menu = null;
    hooks.state = 'playing';
    this.redraw();
    this.openPendingReward();
  }

  private drawMenu() {
    const m = this.menu!;
    m.objs.forEach((o) => o.destroy());
    const nm = (t: UnitType) => this.unitName({ owner: 0, type: t });
    m.objs = m.kind === 'train' ? drawTrain(this, this.w, m.city, m.sel, nm)
      : m.kind === 'tech' ? drawTech(this, this.w, m.row, m.col)
      : m.kind === 'reward' ? drawReward(this, m.city, m.level, m.sel)
      : drawTruce(this, K.theme.game.rival.name, m.sel);
    this.refreshUi();
  }

  private openTrain(c: City) {
    if (this.menu) { this.menu.objs.forEach((o) => o.destroy()); this.menu = null; }
    this.menu = { kind: 'train', sel: 0, city: c, objs: [] };
    hooks.state = 'menu';
    this.drawMenu();
  }

  private openTech() {
    if (this.menu) { this.menu.objs.forEach((o) => o.destroy()); this.menu = null; }
    this.sel = null;
    // Start on the first product you can research (or the first row).
    const grid = techGrid(this.w);
    let row = 1, col = 0;
    for (let r = 1; r < grid.length; r++) { const c = grid[r].findIndex((id) => this.w.canResearch(0, id)); if (c >= 0) { row = r; col = c; break; } }
    if (row >= grid.length) row = 0;
    this.menu = { kind: 'tech', row, col, objs: [] };
    hooks.state = 'tech';
    this.drawMenu();
  }

  /** A city levelled up: the player picks one of two rewards before anything else. */
  private openPendingReward() {
    const w = this.w;
    if (this.menu || w.over || !w.pending.length) return;
    if (this.autopilot) { while (w.pending.length) { const p = w.pending.shift()!; w.applyReward(p.city, w.pickReward(0, p.city, p.level)); } this.redraw(); return; }
    const p = w.pending[0];
    this.menu = { kind: 'reward', sel: 0, city: p.city, level: p.level, objs: [] };
    hooks.state = 'levelup';
    K.play('levelup', 0.8);
    this.cx = p.city.x; this.cy = p.city.y;
    this.drawMenu();
  }

  private menuKey(code: string, repeat: boolean) {
    const m = this.menu!;
    const w = this.w;
    const up = ['ArrowUp', 'KeyW'].includes(code), down = ['ArrowDown', 'KeyS'].includes(code);
    const left = ['ArrowLeft', 'KeyA'].includes(code), right = ['ArrowRight', 'KeyD'].includes(code);
    const ok = !repeat && ['Enter', 'Space', 'NumpadEnter'].includes(code);
    if (m.kind === 'reward' || m.kind === 'truce') {
      if (left || right) { m.sel ^= 1; K.play('move', 0.3); this.drawMenu(); return; }
      if (code === 'Digit1' || code === 'Digit2') { m.sel = code === 'Digit1' ? 0 : 1; this.drawMenu(); }
      else if (!ok) return;
      if (m.kind === 'reward') {
        const p = w.pending.shift();
        if (p) {
          const r = LEVEL_REWARDS[p.level][m.sel];
          w.applyReward(p.city, r.id);
          track('hogtopia_reward', { reward: r.id, level: p.level });
          K.play('capture', 0.8);
          if (!this.fast()) burst(this, this.px(p.city.x) + 8, this.py(p.city.y) + 8, K.ui.accentInt, 16);
        }
      } else this.answerTruce(m.sel === 0);
      this.closeMenu();
      return;
    }
    if (code === 'Escape' || (code === 'KeyT' && m.kind === 'tech')) { this.closeMenu(); return; }
    if (m.kind === 'train') {
      const n = TRAINABLE.length + 1;
      if (up || down) { m.sel = (m.sel + (up ? n - 1 : 1)) % n; K.play('move', 0.3); this.drawMenu(); return; }
      if (!ok) return;
      if (m.sel === TRAINABLE.length) {
        const r = w.invest(0, m.city);
        if (!r) { K.play('error'); return; }
        K.play(r.grew ? 'levelup' : 'harvest');
        if (r.grew) { this.say('advisor', `${r.city.name} grew to level ${r.city.level}!`); this.closeMenu(); return; }
        this.drawMenu();
        return;
      }
      const u = w.train(0, m.city, TRAINABLE[m.sel]);
      if (!u) { K.play('error'); return; }
      K.play('train');
      this.closeMenu();
      return;
    }
    // Tech grid
    const grid = techGrid(w);
    if (up || down) {
      m.row = (m.row + (up ? grid.length - 1 : 1)) % grid.length;
      m.col = Math.min(m.col, grid[m.row].length - 1);
      K.play('move', 0.3); this.drawMenu(); return;
    }
    if (left || right) { m.col = (m.col + (left ? grid[m.row].length - 1 : 1)) % grid[m.row].length; K.play('move', 0.3); this.drawMenu(); return; }
    if (!ok) return;
    const id = grid[m.row][m.col];
    if (!w.research(0, id)) { K.play('error'); return; }
    K.play('levelup');
    track('product_picked', { product: id, turn: w.turn, tier: TECHS[id].tier });
    this.say('advisor', `${techName(id)} researched! ${TECHS[id].effect}`);
    if (!this.fast()) burst(this, 240, 110, K.ui.accentInt, 20, { colours: [0xfcfcfc] });
    this.closeMenu();
  }

  private answerTruce(accept: boolean) {
    const w = this.w;
    const lead = this.lead();
    const p = w.f[lead].persona = { ...w.f[lead].persona };
    if (accept) { w.truce = 5; p.expand += 0.6; p.aggroTurn += 2; this.say('rival', 'A wise choice. For now.'); }
    else { p.risk -= 1; p.aggroTurn = Math.min(p.aggroTurn, w.turn); p.mass = Math.max(2, p.mass - 1); this.say('rival', 'Then we fight. Starting now.'); }
    track('hogtopia_truce', { accept });
  }

  // ---------------------------------------------------------------- turns
  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(Math.max(0, ms), () => r()));
  }

  private startPlayerTurn(first = false) {
    const w = this.w;
    w.startTurn(0);
    w.autoPlayer = this.autopilot;
    hooks.state = 'playing';
    this.busy = false;
    this.sel = null;
    const tips: string[] = K.theme.game.tips;
    if (first) this.say('advisor', `Welcome to ${K.theme.game.faction.capital}! ${tips[0] ?? ''}`);
    if (first && (this.setup.runIndex > 0 || this.setup.daily || w.heat > 0) && !this.fast()) {
      const mt = MAP_TYPES[w.mapType]?.name ?? w.mapType;
      this.time.delayedCall(300, () => this.banner(`${this.setup.daily ? 'DAILY ' : ''}${mt.toUpperCase()} MAP${w.heat ? ` - HEAT ${w.heat}` : ''}${w.rivals().length > 1 ? ' - TWO RIVALS' : ''}`));
    }
    else if (w.turn === 2) this.say('advisor', PERSONA_TIPS[w.f[1].persona.id] ?? tips[0]);
    else if (w.turn === MAX_TURNS) this.say('advisor', 'Last turn! Grab every point you can.');
    else if (w.turn % 3 === 0 && tips.length) this.say('advisor', tips[(w.turn / 3) % tips.length | 0]);
    const rname = String(K.theme.game.rival.name);
    const who = rname.length > 16 ? 'Rival' : rname;
    // Most important first: fights and captures, then growth news.
    const big = /^(took|defeated|is attacking|is massing)/;
    const items = [...new Set(this.summary)].sort((a, b) => Number(big.test(b)) - Number(big.test(a)));
    const sum = items.length ? `${who} ${items.slice(0, 3).join(', ')}.` : '';
    this.msg.setText(`Turn ${w.turn}: +${w.income(0)} stars. ${sum || (w.turn === 1 ? 'Press T to research PostHog tech.' : '')}`);
    const loud = items.filter((s) => big.test(s)).slice(0, 2);
    if (loud.length && !this.fast()) this.banner(`${who} ${loud.join(', ')}.`);
    const mass = this.summary.some((s) => s.startsWith('is massing') || s.startsWith('is attacking'));
    if (mass && !first && w.cities[this.warned]) this.say('advisor', `Heads up: rival units are gathering near ${w.cities[this.warned].name}. Guard it from cities and forests.`);
    this.summary = [];
    this.redraw();
    // P2: at turn 8 the rival offers a truce (not in the first game, and not on your very first turns).
    if (w.turn === 8 && !this.truceOffered && this.setup.runIndex > 0 && w.rivals().length === 1 && !w.over) {
      this.truceOffered = true;
      if (this.autopilot) this.answerTruce(false);
      else { this.menu = { kind: 'truce', sel: 1, objs: [] }; hooks.state = 'truce'; this.drawMenu(); return; }
    }
    this.openPendingReward();
    if (this.autopilot) void this.playerAuto();
  }

  /** The rival that speaks for the rivals: rival 1, or rival 2 once rival 1 is out. */
  private lead() { return this.w.rivals()[0] ?? 1; }

  /** Tell the player what the rival is up to: an army gathering near one of their cities. */
  private readRival() {
    const w = this.w;
    const r = w.f[this.lead()];
    const tgt = w.cities[r.ai.target];
    if (!tgt || tgt.owner !== 0) { this.warned = -1; return; }
    const near = w.units.filter((u) => u.owner > 0 && cheb(u.x, u.y, tgt.x, tgt.y) <= 4).length;
    if (near >= 2 && (this.warned !== tgt.id || r.ai.assault)) {
      this.summary.unshift(r.ai.assault ? `is attacking ${tgt.name} with ${near} units` : `is massing ${near} units near ${tgt.name}`);
      this.warned = tgt.id;
    }
  }

  /** Rival turn summary, big enough to notice. */
  private banner(s: string) {
    const ui = K.ui;
    const t = text(this, this.ox + (this.w.W * T) / 2, MY + 80, s, { align: 'center', color: 0xfcfcfc, depth: 41, maxWidth: 270, maxLines: 3 });
    const bw = Math.min(284, t.textWidth + 14), bh = t.textHeight + 10;
    const b = box(this, Math.round(t.x - bw / 2), MY + 75, Math.round(bw), bh, ui.bgInt, 0xf83800, ui.panelInt).setDepth(40);
    this.tweens.add({ targets: [t, b], alpha: 0, delay: 1500, duration: 400, onComplete: () => { t.destroy(); b.destroy(); } });
  }

  private async playerAuto() {
    if (this.busy || !this.alive) return;
    if (this.menu) this.closeMenu();
    await this.runAi(0);
    if (!this.alive) return;
    if (this.w.over) this.checkOver();
    else await this.endTurn(true);
  }

  private async runAi(o: Owner) {
    this.busy = true;
    const gen = aiTurn(this.w, o);
    let guard = 0;
    for (let a = gen.next(); !a.done && this.alive && guard < 400; a = gen.next(), guard++) {
      const shown = o === 0 || this.visible(a.value);
      await this.apply(a.value, o);
      if (this.w.over) break;
      // Rival moves hidden in the fog don't make you wait.
      if ((!this.fast() && shown) || guard % 8 === 0) await this.wait(shown ? this.animMs : 0);
    }
    this.redraw();
  }

  private visible(a: Action) {
    const seen = (x: number, y: number) => this.w.tile(x, y)?.seen;
    switch (a.kind) {
      case 'move': return seen(a.u.x, a.u.y) || seen(a.x, a.y);
      case 'attack': return seen(a.u.x, a.u.y) || seen(a.target.x, a.target.y);
      case 'capture': return seen(a.u.x, a.u.y);
      case 'harvest': return seen(a.x, a.y);
      case 'train': case 'invest': return seen(a.city.x, a.city.y);
      default: return false;
    }
  }

  private async apply(a: Action, o: Owner) {
    const w = this.w;
    switch (a.kind) {
      case 'research': if (w.research(o, a.tech) && o === 0) track('product_picked', { product: a.tech, turn: w.turn, auto: true }); break;
      case 'harvest': w.harvest(o, a.x, a.y); break;
      case 'train': w.train(o, a.city, a.type); break;
      case 'move': await this.doMove(a.u, a.x, a.y); break;
      case 'attack': await this.doAttack(a.u, a.target); break;
      case 'capture': w.capture(a.u); break;
      case 'invest': w.invest(o, a.city); break;
    }
    this.redraw();
  }

  private async endTurn(auto = false) {
    if (this.busy && !auto) return;
    const w = this.w;
    this.sel = null;
    if (this.menu) { this.menu.objs.forEach((o) => o.destroy()); this.menu = null; }
    // Unchosen rewards are taken for you (never lose a level-up).
    while (w.pending.length) { const p = w.pending.shift()!; w.applyReward(p.city, w.pickReward(0, p.city, p.level)); }
    w.endTurn(0);
    if (this.checkOver()) return;
    hooks.state = 'aiturn';
    this.busy = true;
    this.redraw();
    for (const o of w.owners().slice(1)) {
      if (!w.f[o].alive) { if (o === w.f.length - 1) w.endTurn(o); continue; }
      w.startTurn(o);
      if (o === this.lead()) {
        if (w.turn === 1) this.taunt(0);
        else if (w.turn === MAX_TURNS - 4) this.taunt(3);
        else if (w.turn % 5 === 0) this.personaLine();
      }
      await this.runAi(o);
      if (!this.alive) return;
      if (this.checkOver()) return;
      w.endTurn(o);
    }
    if (this.checkOver()) return;
    this.readRival();
    await this.wait(this.animMs);
    this.startPlayerTurn();
  }

  private checkOver() {
    const o = this.w.over;
    if (!o) return false;
    this.busy = true;
    hooks.state = 'over'; // the End scene sets win/lose once it is on screen
    const w = this.w;
    const headline = o.reason === 'capital' ? 'VICTORY!' : o.reason === 'score' ? 'YOU OUTGREW THEM!' : o.reason === 'debug' ? (o.won ? 'VICTORY!' : 'DEFEAT') : o.reason === 'outscored' ? 'OUT OF TURNS' : 'CAPITAL LOST';
    if (o.won && o.reason === 'capital') this.say('advisor', String(K.theme.game.rival.defeat || 'Their capital is ours!'));
    this.redraw();
    const parts = w.scoreParts(0);
    const final = w.score(0) + o.bonus;
    const gr = grade(final, w, o);
    checkAchievements(w, o, this.setup, this.runStats);
    if (o.won && !this.fast()) { burst(this, W / 2, H / 2, K.ui.accentInt, 40, { colours: [0xfcfcfc, this.teamCol], speed: 160 }); }
    this.time.delayedCall(Math.max(300, this.animMs * 4), () => this.scene.start('End', {
      won: o.won,
      score: final,
      headline,
      stats: [
        ['Result', o.reason === 'capital' ? `Domination, turn ${Math.min(w.turn, MAX_TURNS)}` : o.reason === 'debug' ? '-' : `Score at turn ${MAX_TURNS}`],
        ['Cities / levels', `${w.myCities(0).length} / ${w.myCities(0).reduce((s, c) => s + c.level, 0)}`],
        ['Rival', `${w.f[1].persona.name}, ${MAP_TYPES[w.mapType]?.name ?? w.mapType} map${w.heat ? `, heat ${w.heat}` : ''}`],
        ['Final score', `${final} vs ${w.rivalScore()}   GRADE ${gr}`],
      ],
      props: { turns: w.turn, techs: [...w.f[0].techs], reason: o.reason, grade: gr, map: w.mapType, personality: w.f[1].persona.id, heat: w.heat,
        breakdown: { ...parts, speed: o.bonus } },
    }));
    return true;
  }

  // ---------------------------------------------------------------- debug hooks
  private installDebug() {
    const w = () => this.w;
    hooks.debug = {
      autopilot: (on = true) => {
        this.autopilot = !!on;
        w().autoPlayer = this.autopilot;
        if (this.autopilot && this.menu && this.menu.kind !== 'tech' && this.menu.kind !== 'train') {
          if (this.menu.kind === 'truce') this.answerTruce(false);
          this.menu.objs.forEach((o) => o.destroy()); this.menu = null; hooks.state = 'playing';
        }
        if (this.autopilot) this.openPendingReward();
        if (this.autopilot && !this.busy && !w().over) void this.playerAuto();
      },
      speed: (n: number) => { this.animMs = n >= 4 ? 0 : Math.round(160 / Math.max(1, n)); setJuiceSpeed(n); },
      god: (on = true) => { w().god = !!on; },
      lose: () => { if (!w().over) { w().over = { won: false, reason: 'debug', bonus: 0 }; this.checkOver(); } },
      win: () => { if (!w().over) { w().over = { won: true, reason: 'debug', bonus: 0 }; this.checkOver(); } },
      reveal: () => { w().tiles.forEach((t) => (t.seen = true)); this.redraw(); },
      stars: (n = 20) => { w().f[0].stars += n; this.redraw(); },
      showcase: () => this.showcase(),
      // Hogtopia systems
      setup: () => ({ ...this.setup, map: w().mapType, size: `${w().W}x${w().H}` }),
      restart: (over: Partial<RunSetup> = {}) => { this.scene.restart(over); },
      map: (type: string) => this.scene.restart({ map: type }),
      personality: (id: string) => {
        if (!PERSONALITIES[id]) return PERSONALITY_IDS;
        w().f[1].persona = { ...PERSONALITIES[id] }; this.refreshUi(); return id;
      },
      heat: (n: number) => this.scene.restart({ heat: Math.max(0, Math.min(5, Math.floor(n))) }),
      levelUp: (cityId?: number) => {
        const c = w().cities.find((x) => x.id === cityId) ?? w().capital(0)!;
        if (c.owner !== 0 || c.level >= 5) return false;
        w().grow(c, w().popNeeded(c) - c.pop);
        this.redraw(); this.openPendingReward();
        return c.level;
      },
      reward: (i = 0) => { if (this.menu?.kind === 'reward') { this.menu.sel = i ? 1 : 0; this.menuKey('Enter', false); return true; } return false; },
      vet: () => {
        const u = this.sel ?? w().myUnits(0)[0];
        if (!u) return false;
        while (!u.vet) (w() as any).creditKill(u);
        this.redraw(); return true;
      },
      monument: (id = 'warlord') => {
        const f = w().f[0];
        if (id === 'warlord') f.wins = Math.max(f.wins, 10);
        else if (id === 'explorer') w().tiles.forEach((t) => (t.seen = true));
        else if (id === 'scholar') for (const t of w().techList) if (f.techs.length < 6 && !f.techs.includes(t)) f.techs.push(t);
        else if (id === 'metro') w().myCities(0).forEach((c) => (c.level = Math.max(c.level, 3)));
        w().checkMonuments(); this.redraw();
        return w().monuments;
      },
      truce: () => {
        if (this.menu) { this.menu.objs.forEach((o) => o.destroy()); this.menu = null; }
        this.truceOffered = true; this.menu = { kind: 'truce', sel: 1, objs: [] }; hooks.state = 'truce'; this.drawMenu();
      },
      // Three rival units gather near your capital, as if the rival had massed there (tests the warning + marker).
      mass: () => {
        const W0 = w(), cap = W0.capital(0)!;
        let n = 0;
        for (let r = 3; r <= 4 && n < 3; r++) for (let dy = -r; dy <= r && n < 3; dy++) for (let dx = -r; dx <= r && n < 3; dx++) {
          const x = cap.x + dx, y = cap.y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !W0.inMap(x, y) || W0.unitAt(x, y) || W0.cityAt(x, y) || !(W0.tile(x, y).t === 'plain' || W0.tile(x, y).t === 'forest')) continue;
          W0.addUnit(1, (['warrior', 'archer', 'catcher'] as UnitType[])[n], x, y); W0.tile(x, y).seen = true; n++;
        }
        W0.f[1].ai.target = cap.id; W0.f[1].ai.assault = false;
        this.summary = []; this.readRival(); this.startPlayerTurn();
        return n;
      },
      summary: () => { this.summary.push('took Test Town', 'promoted a veteran'); this.startPlayerTurn(); },
      turn: (n: number) => { w().turn = Math.max(1, Math.min(MAX_TURNS, Math.floor(n))); this.redraw(); },
      rivalTurn: () => this.endTurn(),
      techTree: () => { this.openTech(); },
      research: (id: string) => { const f = w().f[0]; for (const t of [TECHS[id]?.requires, id]) if (t && TECHS[t] && !f.techs.includes(t)) w().gainTech(0, t); this.redraw(); return [...f.techs]; },
      trainMenu: () => { const c = w().capital(0); if (c && c.owner === 0) this.openTrain(c); },
      // Load test: fill the map with units on both sides (every tile they can stand on, up to n each).
      flood: (n = 45) => {
        const W0 = w();
        W0.tiles.forEach((t) => (t.seen = true));
        const cnt = [0, 0];
        W0.tiles.forEach((t, i) => {
          const x = i % W0.W, y = (i / W0.W) | 0;
          if (!(t.t === 'plain' || t.t === 'forest') || W0.unitAt(x, y)) return;
          const o = x < W0.W / 2 ? 0 : 1;
          if (cnt[o] >= n || (x + y) % 2) return;
          cnt[o]++;
          W0.addUnit(o, UNIT_ORDER[(x * 3 + y) % UNIT_ORDER.length], x, y);
        });
        this.redraw();
        return cnt;
      },
    };
  }

  /** Mid-game skirmish in the middle of the map, with an attack ready to go (for the GIF). */
  private showcase() {
    const w = this.w;
    if (this.menu) { this.menu.objs.forEach((o) => o.destroy()); this.menu = null; hooks.state = 'playing'; }
    w.tiles.forEach((t) => (t.seen = true));
    w.turn = Math.max(w.turn, 9);
    w.f[0].stars += 12;
    for (const p of w.products.slice(0, 3)) if (!w.has(0, p)) w.f[0].techs.push(p);
    const free = (x0: number, y0: number) => {
      for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (w.inMap(x, y) && (w.tile(x, y).t === 'plain' || w.tile(x, y).t === 'forest') && !w.unitAt(x, y) && !w.cityAt(x, y)) return [x, y];
      }
      return null;
    };
    const mine: UnitType[] = ['catcher', 'warrior', 'archer'], theirs: UnitType[] = ['warrior', 'defender', 'scout'];
    let sel: Unit | null = null;
    const mx = Math.floor(w.W / 2) - 2, my = Math.floor(w.H / 2) - 2;
    mine.forEach((t, i) => { const p = free(mx, my + i * 2); if (p) { const u = w.addUnit(0, t, p[0], p[1]); u.moved = u.attacked = u.done = false; if (i === 0) { sel = u; u.kills = 2; } if (i === 1) { u.vet = true; u.kills = 3; u.maxHp += 5; u.hp = u.maxHp; } } });
    const s0 = sel as Unit | null;
    // Rival units right next to the selected catcher, so an attack is one ENTER away.
    theirs.forEach((t, i) => { const p = free((s0?.x ?? mx + 1) + 1 + (i > 0 ? 1 : 0), (s0?.y ?? my + 1) + (i === 2 ? 1 : 0)); if (p) { const e = w.addUnit(1, t, p[0], p[1]); if (i === 0) e.hp = 4; } });
    this.sel = s0;
    const tgt = s0 ? w.targets(s0)[0] : undefined;
    if (tgt) { this.cx = tgt.x; this.cy = tgt.y; } else if (s0) { this.cx = s0.x; this.cy = s0.y; }
    this.redraw();
    this.taunt(1);
  }
}

export { foes };
