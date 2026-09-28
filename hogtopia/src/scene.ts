// Hogtopia's map scene: rendering, keyboard input, menus and turn flow. Rules live in world.ts.
import Phaser from 'phaser';
import { K, spr } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture as track } from '@shared/analytics';
import { text, box, PixelText, W, H } from '@shared/ui';
import { dist, toInt } from '@shared/palette';
import products from '../../shared/products.json';
import {
  World, MW, MH, MAX_TURNS, UNITS, UNIT_ORDER, TECHS, UnitType, Unit, City, Action, Owner, aiTurn, cheb, hash,
} from './world';

const T = 16;
const MX = 4;
const MY = 18;
const SX = MX + MW * T + 6; // sidebar x
const SW = W - SX - 4;
const BIOMES = ['meadow', 'desert', 'tundra', 'circuit'];

export const PLAYER_UNIT_NAMES: Record<UnitType, string> = { scout: 'Intern', warrior: 'Engineer', archer: 'Analyst', defender: 'Flag Guard', catcher: 'Bug Catcher' };
const RIVAL_UNIT_NAMES: Record<UnitType, string> = { scout: 'Stray Cron', warrior: 'Tech Debt', archer: 'Spam Alert', defender: 'Firewall', catcher: 'Monolith Bot' };
export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;

/** Same rule as art.py: the rival colour is the candidate most unlike the brand primary. */
export function rivalColour(primary: string) {
  return ['#940084', '#a80020', '#4428bc', '#7c7c7c'].reduce((b, c) => (dist(c, primary) > dist(b, primary) ? c : b));
}

export class MapScene extends Phaser.Scene {
  private w!: World;
  private terrain: Phaser.GameObjects.Image[] = [];
  private res: Phaser.GameObjects.Image[] = [];
  private cityImgs: Phaser.GameObjects.Image[] = [];
  private crowns: Phaser.GameObjects.Image[] = [];
  private fog: Phaser.GameObjects.Image[] = [];
  private unitSprites = new Map<number, Phaser.GameObjects.Image>();
  private hpG!: Phaser.GameObjects.Graphics;
  private borderG!: Phaser.GameObjects.Graphics;
  private hlG!: Phaser.GameObjects.Graphics;
  private curG!: Phaser.GameObjects.Graphics;
  private cx = 0;
  private cy = 0;
  private sel: Unit | null = null;
  private busy = false;
  private alive = true;
  private menu: null | { kind: 'train' | 'tech'; items: string[]; sel: number; objs: Phaser.GameObjects.GameObject[]; city?: City } = null;
  private top!: PixelText;
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
  private tauntsUsed = new Set<number>();
  private firstBlood = false;

  constructor() { super('Map'); }

  create() {
    const g = K.theme.game;
    this.alive = true;
    this.busy = false;
    this.sel = null;
    this.menu = null;
    this.autopilot = false;
    this.animMs = 160;
    this.tauntsUsed = new Set();
    this.firstBlood = false;
    this.unitSprites = new Map();
    this.terrain = []; this.res = []; this.cityImgs = []; this.crowns = []; this.fog = []; this.menuRowObjs = [];
    this.events.once('shutdown', () => (this.alive = false));
    const rivalShort = String(g.rival.name).replace(/^the\s+/i, '').split(/\s+/).pop() || 'Rival';
    this.w = new World(hash(K.theme.prospect.name + g.biome), g.biome, g.difficulty, K.theme.products, {
      capital: g.faction.capital, cities: g.cities, rivalCapital: g.rival.capital || `${rivalShort} HQ`.slice(0, 14), rivalShort,
    });
    const w = this.w;
    w.cities[0].name = w.names.capital;
    w.cities[4].name = w.names.rivalCapital;
    w.cities.forEach((c) => { if (!c.capital) c.name = 'Village'; });
    w.onEvent = (e, d) => this.onWorldEvent(e, d);
    // Borders must stand out from the ground: fall back to the accent (or white) when the brand
    // colour is too close to this biome's plains.
    const ground = ({ meadow: '#007800', desert: '#f8d878', tundra: '#bcbcbc', circuit: '#004058' } as Record<string, string>)[g.biome] ?? '#007800';
    const pickVisible = (...cs: string[]) => cs.find((c) => dist(c, ground) > 180) ?? '#fcfcfc';
    this.teamCol = toInt(pickVisible(K.ui.primary, K.ui.accent));
    this.rivalCol = toInt(pickVisible(rivalColour(K.theme.palette.primary), '#d800cc'));
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
    this.time.addEvent({ delay: 600, loop: true, callback: () => { this.water ^= 1; this.drawTerrain(); } });
    this.installDebug();
    this.startPlayerTurn(true);
  }

  update(_t: number, dt: number) {
    if (!this.w.over) hooks.elapsed += dt / 1000;
    this.drawCursor();
  }

  // ---------------------------------------------------------------- map drawing
  private buildMap() {
    const bi = Math.max(0, BIOMES.indexOf(this.w.biome));
    for (let i = 0; i < MW * MH; i++) {
      const x = MX + (i % MW) * T, y = MY + ((i / MW) | 0) * T;
      this.terrain.push(this.add.image(x, y, spr('terrain'), bi * 8).setOrigin(0).setDepth(0));
      this.res.push(this.add.image(x, y, spr('res'), 0).setOrigin(0).setDepth(1).setVisible(false));
      this.fog.push(this.add.image(x, y, spr('terrain'), bi * 8 + 7).setOrigin(0).setDepth(8));
    }
    for (const c of this.w.cities) {
      this.cityImgs[c.id] = this.add.image(MX + c.x * T, MY + c.y * T, spr('city'), 0).setOrigin(0).setDepth(3);
      this.crowns[c.id] = this.add.image(MX + c.x * T, MY + c.y * T - 5, spr('city'), 7).setOrigin(0).setDepth(6).setVisible(false);
    }
    this.borderG = this.add.graphics().setDepth(2);
    this.hlG = this.add.graphics().setDepth(4);
    this.hpG = this.add.graphics().setDepth(7);
    this.curG = this.add.graphics().setDepth(9);
    this.add.graphics().setDepth(9).lineStyle(1, K.ui.textInt, 1).strokeRect(MX - 1.5, MY - 1.5, MW * T + 3, MH * T + 3);
  }

  private drawTerrain() {
    const bi = Math.max(0, BIOMES.indexOf(this.w.biome));
    this.w.tiles.forEach((t, i) => {
      const x = i % MW, y = (i / MW) | 0;
      const f = t.t === 'water' ? 4 + this.water : t.t === 'forest' ? 2 : t.t === 'mountain' ? 3 : t.ruins ? 6 : (x * 7 + y * 3) % 5 === 0 ? 1 : 0;
      this.terrain[i].setFrame(bi * 8 + f);
    });
  }

  private redraw() {
    const w = this.w;
    this.drawTerrain();
    w.tiles.forEach((t, i) => {
      this.res[i].setVisible(!!t.res && t.seen).setFrame(t.res === 'fruit' ? 1 : t.res === 'fish' ? 2 : 0);
      this.fog[i].setVisible(!t.seen);
    });
    for (const c of w.cities) {
      const f = c.owner === -1 ? 0 : c.owner === 0 ? Math.min(3, c.level) : 3 + Math.min(3, c.level);
      this.cityImgs[c.id].setFrame(f);
      this.crowns[c.id].setVisible(c.capital && w.tile(c.x, c.y).seen);
    }
    // Territory borders.
    const g = this.borderG.clear();
    const ownerAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MW || y >= MH) return -2;
      const t = w.tile(x, y);
      return t.terr >= 0 ? w.cities[t.terr].owner : -2;
    };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const o = ownerAt(x, y);
      if (o < 0 || !w.tile(x, y).seen) continue;
      g.fillStyle(o === 0 ? this.teamCol : this.rivalCol, 1);
      const px = MX + x * T, py = MY + y * T;
      if (ownerAt(x, y - 1) !== o) g.fillRect(px, py, T, 2);
      if (ownerAt(x, y + 1) !== o) g.fillRect(px, py + T - 2, T, 2);
      if (ownerAt(x - 1, y) !== o) g.fillRect(px, py, 2, T);
      if (ownerAt(x + 1, y) !== o) g.fillRect(px + T - 2, py, 2, T);
    }
    this.syncUnits();
    this.drawHighlights();
    this.refreshUi();
  }

  private syncUnits() {
    const w = this.w;
    const live = new Set(w.units.map((u) => u.id));
    for (const [id, s] of this.unitSprites) if (!live.has(id)) { s.destroy(); this.unitSprites.delete(id); }
    this.hpG.clear();
    for (const u of w.units) {
      let s = this.unitSprites.get(u.id);
      if (!s) {
        s = this.add.image(0, 0, spr('units'), u.owner * 5 + UNIT_ORDER.indexOf(u.type)).setOrigin(0).setDepth(5);
        this.unitSprites.set(u.id, s);
      }
      if (!this.tweens.isTweening(s)) s.setPosition(MX + u.x * T, MY + u.y * T);
      s.setFlipX(u.owner === 1);
      const seen = w.tile(u.x, u.y).seen;
      s.setVisible(seen);
      s.setAlpha(u.owner === 0 && u.done && hooks.state === 'playing' ? 0.55 : 1);
      if (!seen) continue;
      const frac = u.hp / UNITS[u.type].hp;
      const bx = MX + u.x * T + 2, by = MY + u.y * T + T - 2;
      this.hpG.fillStyle(0x000000).fillRect(bx - 1, by - 1, 14, 3)
        .fillStyle(u.owner === 0 ? this.teamCol : this.rivalCol).fillRect(bx, by, Math.max(1, Math.round(12 * frac)), 1);
    }
  }

  private drawHighlights() {
    const g = this.hlG.clear();
    const u = this.sel;
    if (!u || !this.w.units.includes(u)) return;
    for (const i of this.w.reachable(u).keys()) {
      const x = MX + (i % MW) * T, y = MY + ((i / MW) | 0) * T;
      g.fillStyle(0xfcfcfc, 0.28).fillRect(x + 1, y + 1, T - 2, T - 2);
    }
    for (const t of this.w.targets(u)) {
      g.lineStyle(2, 0xf83800, 1).strokeRect(MX + t.x * T + 1, MY + t.y * T + 1, T - 2, T - 2);
    }
    g.lineStyle(1, K.ui.accentInt, 1).strokeRect(MX + u.x * T + 0.5, MY + u.y * T + 0.5, T - 1, T - 1);
  }

  private drawCursor() {
    const g = this.curG.clear();
    if (this.menu || this.w.over) return;
    const on = Math.floor(this.time.now / 300) % 3 !== 0;
    const x = MX + this.cx * T, y = MY + this.cy * T;
    g.lineStyle(1, on ? K.ui.accentInt : 0xfcfcfc, 1);
    for (const [ax, ay, bx, by] of [[0, 0, 4, 0], [0, 0, 0, 4], [T - 1, 0, T - 5, 0], [T - 1, 0, T - 1, 4], [0, T - 1, 4, T - 1], [0, T - 1, 0, T - 5], [T - 1, T - 1, T - 5, T - 1], [T - 1, T - 1, T - 1, T - 5]]) {
      g.lineBetween(x + ax + 0.5, y + ay + 0.5, x + bx + 0.5, y + by + 0.5);
    }
  }

  // ---------------------------------------------------------------- side panels
  private buildUi() {
    const ui = K.ui;
    this.add.rectangle(0, 0, W, 15, 0x000000).setOrigin(0).setDepth(20);
    this.top = text(this, 4, 3, '', { depth: 21, color: ui.textInt });
    this.add.image(W - 118, 3, spr('star')).setOrigin(0).setDepth(21);
    this.starsTxt = text(this, W - 108, 3, '', { depth: 21, color: ui.accentInt });
    box(this, SX, MY - 1, SW, 104, ui.bgInt, ui.textInt, ui.panelInt).setDepth(20);
    this.info = text(this, SX + 6, MY + 5, '', { depth: 21, maxWidth: SW - 12, maxLines: 9 });
    box(this, SX, MY + 107, SW, 88, ui.bgInt, ui.textInt, ui.panelInt).setDepth(20);
    this.advImg = this.add.image(SX + 5, MY + 112, spr('advisor')).setOrigin(0).setDepth(21);
    this.advName = text(this, SX + 34, MY + 113, 'Max the Hedgehog', { depth: 21, color: ui.accentInt, maxWidth: SW - 40, maxLines: 1 });
    this.advTxt = text(this, SX + 34, MY + 124, '', { depth: 21, maxWidth: SW - 40, maxLines: 7 });
    this.add.rectangle(0, MY + MH * T + 3, W, H - (MY + MH * T + 3), 0x000000).setOrigin(0).setDepth(20);
    this.ctx1 = text(this, 6, H - 50, '', { depth: 21, color: ui.accentInt, maxWidth: W - 12, maxLines: 1 });
    this.ctx2 = text(this, 6, H - 38, '', { depth: 21, color: ui.dimInt, maxWidth: W - 12, maxLines: 1 });
    this.msg = text(this, 6, H - 24, '', { depth: 21, color: ui.textInt, maxWidth: W - 12, maxLines: 2 });
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

  private unitName(u: { owner: Owner; type: UnitType }) {
    return u.owner === 0 ? (K.theme.game.units?.[u.type] || PLAYER_UNIT_NAMES[u.type]) : RIVAL_UNIT_NAMES[u.type];
  }

  private refreshUi() {
    const w = this.w;
    this.top.setText(`TURN ${Math.min(w.turn, MAX_TURNS)}/${MAX_TURNS}   YOU ${w.score(0)} : ${w.score(1)} RIVAL`);
    this.starsTxt.setText(`${w.f[0].stars} (+${w.income(0)})`);
    // Tile info
    const t = w.tile(this.cx, this.cy);
    const lines: string[] = [];
    if (!t.seen) lines.push('Unexplored', '', 'Move units here to see', 'what is out there.');
    else {
      const c = w.cityAt(this.cx, this.cy);
      const u = w.unitAt(this.cx, this.cy);
      if (c) {
        const who = c.owner === 0 ? K.theme.game.faction.name : c.owner === 1 ? K.theme.game.rival.name : 'Neutral village';
        lines.push(`${c.name}${c.capital ? ' (capital)' : ''}`, who);
        if (c.owner !== -1) lines.push(`Level ${c.level}  pop ${c.pop}/${w.popNeeded(c)}  +${c.level + (c.capital ? 1 : 0)}/turn`);
        else lines.push('Stand a unit here a turn', 'to capture it.');
      } else {
        const names = { plain: 'Plains', forest: 'Forest (+defence)', mountain: 'Mountains', water: 'Water' };
        lines.push(t.ruins ? 'Data ruins: explore!' : names[t.t]);
        if (t.res) lines.push(`${t.res === 'data' ? 'Data crystal' : t.res === 'fruit' ? 'Insight berries' : 'Fish'}: harvest 2 stars`);
      }
      if (u && t.seen) {
        const s = UNITS[u.type];
        lines.push('', `${this.unitName(u)} (${u.owner === 0 ? 'yours' : 'rival'})`, `HP ${u.hp}/${s.hp}  ATK ${s.atk} DEF ${s.def}`, `MOVE ${s.move}  RANGE ${s.range}`);
      }
    }
    this.info.setText(lines.join('\n'));
    // Context bar
    const c = this.context();
    this.ctx1.setText(c);
    const keys = ['TAB next unit', 'T tech', 'E end turn'];
    if (this.sel && w.has(0, 'session_replay') && this.sel.prev && !w.f[0].undoUsed) keys.unshift('U rewind');
    if (this.sel && w.canCapture(this.sel)) keys.unshift('C capture');
    this.ctx2.setText(keys.join('   ') + '   ESC cancel');
    hooks.stats = {
      turn: w.turn, stars: w.f[0].stars, income: w.income(0), techs: [...w.f[0].techs],
      cities: w.cities.filter((c) => c.owner === 0).length, rivalCities: w.cities.filter((c) => c.owner === 1).length,
      neutral: w.cities.filter((c) => c.owner === -1).length, units: w.units.filter((u) => u.owner === 0).length,
      rivalUnits: w.units.filter((u) => u.owner === 1).length, score: w.score(0), rivalScore: w.score(1),
    };
    hooks.score = w.score(0);
  }

  private context(): string {
    const w = this.w;
    if (this.busy) return hooks.state === 'aiturn' ? `${K.theme.game.rival.name} is moving...` : '...';
    if (this.menu) return this.menu.kind === 'tech' ? 'UP/DOWN choose   ENTER research   ESC close' : 'UP/DOWN choose   ENTER train   ESC close';
    const u = w.unitAt(this.cx, this.cy);
    const i = this.cy * MW + this.cx;
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
      this.cx = Phaser.Math.Clamp(this.cx + mv[code][0], 0, MW - 1);
      this.cy = Phaser.Math.Clamp(this.cy + mv[code][1], 0, MH - 1);
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
      if (tgt) { void this.doAttack(s, tgt); return; }
      if (w.reachable(s).has(this.cy * MW + this.cx)) { void this.doMove(s, this.cx, this.cy); return; }
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
      this.say('advisor', r.grew ? `${r.city.name} grew to level ${r.city.level}! More stars every turn.` : `Harvested. ${r.city.name} is growing.`);
      this.redraw();
    }
  }

  private async doMove(u: Unit, x: number, y: number) {
    const s = this.unitSprites.get(u.id);
    const ok = this.w.move(u, x, y);
    if (!ok) return;
    K.play('step', 0.5);
    if (s && this.animMs > 0) {
      await new Promise<void>((r) => this.tweens.add({ targets: s, x: MX + u.x * T, y: MY + u.y * T, duration: this.animMs, onComplete: () => r() }));
    }
    if (u.owner === 0 && !(this.w.targets(u).length || this.w.canCapture(u))) this.sel = null;
    this.redraw();
  }

  private async doAttack(a: Unit, d: Unit) {
    const res = this.w.attack(a, d);
    if (!res) return;
    K.play('attack');
    this.floatText(d.x, d.y, `-${res.dmg}`, 0xf83800);
    if (res.ret) this.floatText(a.x, a.y, `-${res.ret}`, 0xfca044);
    const s = this.unitSprites.get(d.id);
    if (s) { s.setTintFill(0xffffff); this.time.delayedCall(90, () => s.active && s.clearTint()); }
    if (res.died.length) K.play('die');
    if (a.owner === 0 && res.died.some((x) => x.owner === 1) && !this.firstBlood) { this.firstBlood = true; this.taunt(2); }
    if (a.owner === 0) this.sel = null;
    await this.wait(this.animMs * 1.5);
    this.redraw();
  }

  private doCapture(u: Unit) {
    const c = this.w.capture(u);
    if (!c) return;
    this.sel = null;
    this.redraw();
    this.checkOver();
  }

  private floatText(x: number, y: number, s: string, col: number) {
    if (!this.w.tile(x, y).seen) return;
    const t = text(this, MX + x * T + 8, MY + y * T - 2, s, { align: 'center', color: col, depth: 12 });
    this.tweens.add({ targets: t, y: t.y - 10, alpha: 0, duration: Math.max(300, this.animMs * 4), onComplete: () => t.destroy() });
  }

  private onWorldEvent(e: string, d: any) {
    if (e === 'capture') {
      const c: City = d.city;
      K.play(d.by === 0 ? 'capture' : 'lost');
      if (d.by === 0) {
        this.say('advisor', c.capital ? String(K.theme.game.rival.defeat || 'Their capital is ours!') : `${c.name} joins ${K.theme.game.faction.name}! More stars every turn.`);
        if (d.from === 1) this.taunt(2);
      } else if (d.by === 1) {
        this.taunt(1);
      }
      this.msg.setText(`${d.by === 0 ? K.theme.game.faction.name : K.theme.game.rival.name} captured ${c.name}.`);
    } else if (e === 'ruins' && d.u.owner === 0) {
      K.play('levelup');
      const m = d.kind === 'tech' ? `The ruins held old notes on ${productName(d.tech)}. Free tech!` : d.kind === 'map' ? 'The ruins held a map of the area, and 2 stars.' : 'The ruins held 5 stars!';
      this.say('advisor', m);
    }
  }

  // ---------------------------------------------------------------- menus
  private closeMenu() {
    this.menu?.objs.forEach((o) => o.destroy());
    this.menu = null;
    hooks.state = 'playing';
    this.redraw();
  }

  private openTrain(c: City) {
    const ui = K.ui;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const bx = 30, by = 40, bw = 250, bh = 136;
    objs.push(box(this, bx, by, bw, bh, ui.bgInt, ui.textInt, ui.panelInt).setDepth(30));
    objs.push(text(this, bx + bw / 2, by + 6, `TRAIN AT ${c.name.toUpperCase()}`, { align: 'center', color: ui.accentInt, depth: 31, maxWidth: bw - 12, maxLines: 1 }));
    this.menu = { kind: 'train', items: [...UNIT_ORDER, 'invest'], sel: 0, objs, city: c };
    hooks.state = 'menu';
    this.drawMenuRows();
  }

  private openTech() {
    const ui = K.ui;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const bx = 12, by = 22, bw = 272, bh = 186;
    objs.push(box(this, bx, by, bw, bh, ui.bgInt, ui.textInt, ui.panelInt).setDepth(30));
    objs.push(text(this, bx + bw / 2, by + 6, `RESEARCH - next costs ${this.w.techCost(0)} stars`, { align: 'center', color: ui.accentInt, depth: 31 }));
    this.sel = null;
    this.menu = { kind: 'tech', items: [...this.w.products], sel: 0, objs };
    hooks.state = 'tech';
    this.drawMenuRows();
  }

  private menuRowObjs: Phaser.GameObjects.GameObject[] = [];

  private drawMenuRows() {
    const m = this.menu!;
    const ui = K.ui, w = this.w;
    this.menuRowObjs.forEach((o) => o.destroy());
    this.menuRowObjs = [];
    const add = (o: Phaser.GameObjects.GameObject) => { this.menuRowObjs.push(o); m.objs.push(o); };
    if (m.kind === 'train') {
      m.items.forEach((id, i) => {
        if (id === 'invest') {
          const y = 60 + i * 16, c = m.city!;
          if (i === m.sel) add(this.add.rectangle(36, y - 2, 238, 14, ui.panelInt, 0.6).setOrigin(0).setDepth(31));
          add(this.add.image(44, y - 1, spr('star')).setOrigin(0).setDepth(32));
          add(text(this, 60, y, c.level >= 5 ? 'Invest: city is at max level' : `Invest in ${c.name}: +1 pop  ${w.investCost(c)}*`,
            { depth: 32, color: w.canInvest(0, c) ? ui.textInt : ui.dimInt, maxWidth: 212, maxLines: 1 }));
          return;
        }
        const t = id as UnitType, s = UNITS[t];
        const y = 60 + i * 16;
        const ok = w.canTrain(0, m.city!, t);
        const locked = !w.unlocked(0, t);
        if (i === m.sel) add(this.add.rectangle(36, y - 2, 238, 14, ui.panelInt, 0.6).setOrigin(0).setDepth(31));
        add(this.add.image(40, y - 3, spr('units'), UNIT_ORDER.indexOf(t)).setOrigin(0).setDepth(32).setAlpha(locked ? 0.4 : 1));
        const label = locked ? `${this.unitName({ owner: 0, type: t })} - needs ${productName(s.tech!)}`
          : `${this.unitName({ owner: 0, type: t })}  ${s.cost}*  A${s.atk} D${s.def} M${s.move}${s.range > 1 ? ' R2' : ''}`;
        add(text(this, 60, y, label, { depth: 32, color: ok ? ui.textInt : ui.dimInt, maxWidth: 212, maxLines: 1 }));
      });
      const cap = w.units.filter((u) => u.owner === 0).length >= w.unitCap(0);
      add(text(this, 155, 160, cap ? 'Unit limit reached: grow your cities' : `You have ${w.f[0].stars} stars`, { align: 'center', depth: 32, color: ui.dimInt }));
    } else {
      m.items.forEach((id, i) => {
        const y = 40 + i * 18;
        const owned = w.has(0, id);
        if (i === m.sel) add(this.add.rectangle(18, y - 3, 260, 17, ui.panelInt, 0.6).setOrigin(0).setDepth(31));
        add(this.add.image(22, y - 3, spr(`icon_${id}`)).setOrigin(0).setDepth(32).setAlpha(owned ? 1 : 0.85));
        add(text(this, 42, y + 1, productName(id), { depth: 32, color: owned ? ui.accentInt : ui.textInt }));
        add(text(this, 276, y + 1, owned ? 'OWNED' : w.canResearch(0, id) ? 'READY' : `${w.techCost(0)}*`, { align: 'right', depth: 32, color: owned ? ui.accentInt : ui.dimInt }));
      });
      const id = m.items[m.sel];
      const line = K.theme.game.tech_lines?.[id];
      add(text(this, 20, 40 + m.items.length * 18 + 4, TECHS[id].effect + (line ? `\n${line}` : ''), { depth: 32, color: ui.textInt, maxWidth: 256, maxLines: 4 }));
    }
    this.refreshUi();
  }

  private menuKey(code: string, repeat: boolean) {
    const m = this.menu!;
    if (code === 'Escape' || (code === 'KeyT' && m.kind === 'tech')) { this.closeMenu(); return; }
    if (['ArrowUp', 'KeyW'].includes(code)) { m.sel = (m.sel + m.items.length - 1) % m.items.length; K.play('move', 0.3); this.drawMenuRows(); return; }
    if (['ArrowDown', 'KeyS'].includes(code)) { m.sel = (m.sel + 1) % m.items.length; K.play('move', 0.3); this.drawMenuRows(); return; }
    if (repeat || !['Enter', 'Space', 'NumpadEnter'].includes(code)) return;
    const id = m.items[m.sel];
    if (m.kind === 'train' && id === 'invest') {
      const r = this.w.invest(0, m.city!);
      if (!r) { K.play('error'); return; }
      K.play(r.grew ? 'levelup' : 'harvest');
      if (r.grew) this.say('advisor', `${r.city.name} grew to level ${r.city.level}!`);
      this.drawMenuRows();
      return;
    }
    if (m.kind === 'train') {
      const u = this.w.train(0, m.city!, id as UnitType);
      if (!u) { K.play('error'); return; }
      K.play('train');
      this.closeMenu();
    } else {
      if (!this.w.research(0, id)) { K.play('error'); return; }
      K.play('levelup');
      track('product_picked', { product: id, turn: this.w.turn });
      this.say('advisor', `${productName(id)} researched! ${TECHS[id].effect}`);
      this.closeMenu();
    }
  }

  // ---------------------------------------------------------------- turns
  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(Math.max(0, ms), () => r()));
  }

  private startPlayerTurn(first = false) {
    const w = this.w;
    w.startTurn(0);
    hooks.state = 'playing';
    this.busy = false;
    this.sel = null;
    const tips: string[] = K.theme.game.tips;
    if (first) this.say('advisor', `Welcome to ${K.theme.game.faction.capital}! ${tips[0] ?? ''}`);
    else if (w.turn === MAX_TURNS) this.say('advisor', 'Last turn! Grab every point you can.');
    else if (w.turn % 3 === 0 && tips.length) this.say('advisor', tips[(w.turn / 3) % tips.length | 0]);
    this.msg.setText(`Turn ${w.turn}: +${w.income(0)} stars. ${w.turn === 1 ? 'Press T to research PostHog tech.' : ''}`);
    this.redraw();
    if (this.autopilot) void this.playerAuto();
  }

  private async playerAuto() {
    if (this.busy || !this.alive) return;
    if (this.menu) this.closeMenu();
    await this.runAi(0);
    if (this.alive && !this.w.over) await this.endTurn(true);
  }

  private async runAi(o: Owner) {
    this.busy = true;
    const gen = aiTurn(this.w, o);
    let guard = 0;
    for (let a = gen.next(); !a.done && this.alive && guard < 400; a = gen.next(), guard++) {
      await this.apply(a.value, o);
      if (this.w.over) break;
      if (this.animMs > 0 || guard % 8 === 0) await this.wait(this.animMs);
    }
    this.redraw();
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
    if (this.menu) this.closeMenu();
    w.endTurn(0);
    if (this.checkOver()) return;
    hooks.state = 'aiturn';
    this.busy = true;
    this.redraw();
    w.startTurn(1);
    if (w.turn === 1) this.taunt(0);
    if (w.turn === MAX_TURNS - 4) this.taunt(3);
    await this.runAi(1);
    if (!this.alive) return;
    w.endTurn(1);
    if (this.checkOver()) return;
    await this.wait(this.animMs);
    this.startPlayerTurn();
  }

  private checkOver() {
    const o = this.w.over;
    if (!o) return false;
    this.busy = true;
    hooks.state = 'over'; // the End scene sets win/lose once it is on screen
    const w = this.w;
    const headline = o.reason === 'capital' ? 'VICTORY!' : o.reason === 'score' ? 'YOU OUTGREW THEM!' : o.reason === 'debug' ? (o.won ? 'VICTORY!' : 'DEFEAT') : w.turn > MAX_TURNS ? 'OUT OF TURNS' : 'CAPITAL LOST';
    if (o.won && o.reason === 'capital') this.say('advisor', String(K.theme.game.rival.defeat || 'Their capital is ours!'));
    this.redraw();
    this.time.delayedCall(Math.max(300, this.animMs * 4), () => this.scene.start('End', {
      won: o.won,
      score: w.score(0),
      headline,
      stats: [['Turns', Math.min(w.turn, MAX_TURNS)], ['Cities', w.cities.filter((c) => c.owner === 0).length],
        ['PostHog tech', w.f[0].techs.length], ['Final score', `${w.score(0)} vs ${w.score(1)}`]],
      props: { turns: w.turn, techs: [...w.f[0].techs], reason: o.reason },
    }));
    return true;
  }

  // ---------------------------------------------------------------- debug hooks
  private installDebug() {
    hooks.debug = {
      autopilot: (on = true) => {
        this.autopilot = !!on;
        if (this.autopilot && !this.busy && !this.w.over) void this.playerAuto();
      },
      speed: (n: number) => { this.animMs = n >= 4 ? 0 : Math.round(160 / Math.max(1, n)); },
      god: (on = true) => { this.w.god = !!on; },
      lose: () => { if (!this.w.over) { this.w.over = { won: false, reason: 'debug' }; this.checkOver(); } },
      win: () => { if (!this.w.over) { this.w.over = { won: true, reason: 'debug' }; this.checkOver(); } },
      reveal: () => { this.w.tiles.forEach((t) => (t.seen = true)); this.redraw(); },
      stars: (n = 20) => { this.w.f[0].stars += n; this.redraw(); },
      showcase: () => this.showcase(),
    };
  }

  /** Mid-game skirmish in the middle of the map, with an attack ready to go (for the GIF). */
  private showcase() {
    const w = this.w;
    if (this.menu) this.closeMenu();
    w.tiles.forEach((t) => (t.seen = true));
    w.turn = Math.max(w.turn, 9);
    w.f[0].stars += 12;
    for (const p of w.products.slice(0, 3)) if (!w.has(0, p)) w.f[0].techs.push(p);
    const free = (x0: number, y0: number) => {
      for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x >= 0 && y >= 0 && x < MW && y < MH && (w.tile(x, y).t === 'plain' || w.tile(x, y).t === 'forest') && !w.unitAt(x, y) && !w.cityAt(x, y)) return [x, y];
      }
      return null;
    };
    const mine: UnitType[] = ['catcher', 'warrior', 'archer'], theirs: UnitType[] = ['warrior', 'defender', 'scout'];
    let sel: Unit | null = null;
    mine.forEach((t, i) => { const p = free(7, 4 + i * 2); if (p) { const u = w.addUnit(0, t, p[0], p[1]); u.moved = u.attacked = u.done = false; if (i === 0) sel = u; } });
    const s0 = sel as Unit | null;
    // Rival units right next to the selected catcher, so an attack is one ENTER away.
    theirs.forEach((t, i) => { const p = free((s0?.x ?? 8) + 1 + (i > 0 ? 1 : 0), (s0?.y ?? 5) + (i === 2 ? 1 : 0)); if (p) w.addUnit(1, t, p[0], p[1]); });
    this.sel = s0;
    const tgt = s0 ? w.targets(s0)[0] : undefined;
    if (tgt) { this.cx = tgt.x; this.cy = tgt.y; } else if (s0) { this.cx = s0.x; this.cy = s0.y; }
    this.redraw();
    this.taunt(1);
  }
}
