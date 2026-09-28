// Hog Saga overworld: tile-by-tile walking (Dragon Quest style) with two followers, townsfolk,
// chests, firewall gates that drop when an area's monsters are beaten, and visible encounters.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, bar, PixelText, W, H } from '@shared/ui';
import { MAP } from './map';
import { WYRM, WYRM_NAME, MIMIC } from './battle';
import {
  publishStats, R, BOSS, ENCOUNTERS, GATES, CHESTS, ITEMS, ItemId, resetRun, endData, relicName, levelUp, theName, productName, stat,
} from './state';
import { ShopMenu } from './shop';
import { SECRETS, SECRET_TEXT, SecretId, QUEST, WYRM_LINES, chestContents, rollEvents, RunEvents, MERCHANT, MIMIC as MIMIC_DEF } from './world';
import { rng } from '@shared/meta';
import { autoEquip, gearDef, gearLine, SHOP, price, RARE_POOL } from './gear';
import { checkFinds, fmtTime, onWin } from './progress';
import { ICON, HEAT as HEAT_T, STATUS, StatusId } from './rules';
import { toast } from '@shared/juice';
import { beginRun } from '@shared/kit';


import { saga } from './save';

import { Typewriter, paginate } from './typewriter';
import { swirl, loadMusic } from './fx';
import { setJuiceSpeed } from '@shared/juice';
import { METER } from './rules';

export const TILE = 16;
const MW = MAP[0].length;
const MH = MAP.length;
const STEP_RATE = 7; // tiles per second
const FRAME: Record<string, number> = { '.': 0, '"': 1, ',': 2, T: 3, '~': 4, '=': 5, '^': 6, ':': 7, r: 8, _: 9, '#': 10, '%': 19, '&': 20, F: 22,
  S: 3, Q: 10 };
const BLOCK = new Set('T~^r#HI&F');
const DIRS = { down: [0, 1, 0], up: [0, -1, 2], left: [-1, 0, 4], right: [1, 0, 6] } as const;
type Dir = keyof typeof DIRS;

interface P { x: number; y: number }
const key = (x: number, y: number) => y * MW + x;

/** Parsed once: marker positions from the map. */
const M = (() => {
  const out = { start: { x: 1, y: 1 }, npcs: [] as P[], chests: [] as P[], encs: [] as P[], boss: { x: 0, y: 0 },
    gates: { G: [] as P[], g: [] as P[], X: [] as P[] } as Record<string, P[]>, heals: [] as P[], inn: [] as P[],
    hidden: [] as P[], quest: { x: -1, y: -1 }, item: { x: -1, y: -1 }, wyrm: { x: -1, y: -1 }, secret: {} as Record<string, SecretId> };
  MAP.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === 's') out.start = { x, y };
    else if (c === 'n') out.npcs.push({ x, y });
    else if (c === 'c') out.chests.push({ x, y });
    else if (c >= '1' && c <= '8') out.encs[+c - 1] = { x, y };
    else if (c === 'B') out.boss = { x, y };
    else if (c in out.gates) out.gates[c].push({ x, y });
    else if (c === 'F') out.heals.push({ x, y });
    else if (c === 'I') out.inn.push({ x, y });
    else if (c === 'h') out.hidden.push({ x, y });
    else if (c === 'q') out.quest = { x, y };
    else if (c === 'k') out.item = { x, y };
    else if (c === 'W') out.wyrm = { x, y };
    else if (c === 'S') out.secret[`${x},${y}`] = 'grove';
    else if (c === 'Q') out.secret[`${x},${y}`] = 'vault';
  }));
  out.chests.sort((a, b) => a.x - b.x);
  out.hidden.sort((a, b) => a.x - b.x);
  out.chests.push(...out.hidden);
  return out;
})();

/** The shop is the south-west house in town. */
const isShop = (x: number, y: number) => MAP[y]?.[x] === 'H' && x <= 4 && y >= 8 && y <= 9;
const isHiddenChest = (i: number) => i >= CHESTS.length - M.hidden.length;
const regionOf = (p: P) => (p.x >= 47 && p.x <= 57 && p.y >= 2 && p.y <= 11 ? 3 : p.x < 21 ? 0 : p.x < 41 ? 1 : 2);

function floorAt(x: number, y: number): string {
  const c = MAP[y][x];
  if (c in FRAME && c !== 'F') return c;
  if (c === 'F') return '.';
  const counts: Record<string, number> = {};
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const n = MAP[y + dy]?.[x + dx];
    if (n && ('.",_:%'.includes(n))) counts[n] = (counts[n] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

function tileFrame(x: number, y: number): number {
  const c = MAP[y][x];
  if (c === 'H' || c === 'I') {
    const base = c === 'H' ? 11 : 15;
    const top = MAP[y - 1]?.[x] !== c, left = MAP[y]?.[x - 1] !== c;
    return base + (top ? 0 : 2) + (left ? 0 : 1);
  }
  if (c === 'F') return 22;
  return FRAME[floorAt(x, y)] ?? 0;
}

interface Page { speaker?: string; text: string }

export class ExploreScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private followers: Phaser.GameObjects.Sprite[] = [];
  private pos: P = { x: 0, y: 0 };
  private trail: P[] = [];        // positions of followers (index 0 = first follower)
  private from: P[] = [];         // for the step in progress: leader + followers start positions
  private to: P[] = [];
  private stepT = 1;              // 0..1 progress of the current step; 1 = standing
  private dir: Dir = 'down';
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private encs: (Phaser.GameObjects.Sprite | null)[] = [];
  private chests: Phaser.GameObjects.Sprite[] = [];
  private gates: Record<string, Phaser.GameObjects.Image[]> = {};
  private open = new Set<string>();
  private region = -1;
  private hud!: { region: PixelText; rows: { name: PixelText; hp: ReturnType<typeof bar> }[]; bg: Phaser.GameObjects.Graphics };
  private banner: Phaser.GameObjects.GameObject[] = [];
  private dlg: { pages: Page[]; i: number; tw: Typewriter; objs: Phaser.GameObjects.GameObject[]; speaker: PixelText; done: () => void; wait: number } | null = null;
  private menu: Phaser.GameObjects.GameObject[] | null = null;
  private busy = false;
  private bumpAt = 0;
  private bot = { path: [] as P[], goal: '', idle: 0, shopped: -1 };
  private shop!: ShopMenu;
  private questNpc: Phaser.GameObjects.Sprite | null = null;
  private questItem: Phaser.GameObjects.Image | null = null;
  private contents: string[][] = [];
  private ev!: RunEvents;
  private evChests: { x: number; y: number; mimic: boolean; opened: boolean; s: Phaser.GameObjects.Sprite }[] = [];
  private mimicAt = -1;
  private menuSel = 0;
  private foot!: { gold: PixelText; chests: PixelText; secrets: PixelText; tag: PixelText };

  constructor() { super('Explore'); }

  preload() { loadMusic(this); }

  create() {
    resetRun();
    hooks.scene = 'Explore';
    hooks.state = 'explore';
    hooks.elapsed = 0;
    this.busy = false;
    this.dlg = null;
    this.menu = null;
    this.region = -1;
    this.open = new Set();
    this.cameras.main.setBackgroundColor('#000000');
    // Map
    const data = MAP.map((row, y) => [...row].map((_, x) => tileFrame(x, y)));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage('saga-tiles', spr('tiles'), TILE, TILE, 0, 0)!;
    map.createLayer(0, ts, 0, 0)!.setDepth(0);
    // Objects
    this.gates = {};
    for (const [g, ps] of Object.entries(M.gates)) this.gates[g] = ps.map((p) => this.add.image(p.x * TILE, p.y * TILE, spr('tiles'), 21).setOrigin(0).setDepth(1));
    this.chests = M.chests.map((p) => this.add.sprite(p.x * TILE, p.y * TILE, spr('chest'), 0).setOrigin(0).setDepth(2));
    this.npcs = M.npcs.map((p, i) => this.add.sprite(p.x * TILE + 8, p.y * TILE + 6, spr(`npc_${i + 1}`)).play(anim(`npc_${i + 1}`)).setDepth(p.y + 3));
    this.npcs.forEach((s) => s.anims.setProgress(Math.random()));
    this.encs = M.encs.map((p, i) => {
      const s = this.add.sprite(p.x * TILE + 8, p.y * TILE + 14, spr(`enemy_${ENCOUNTERS[i].group[0] + 1}`)).setOrigin(0.5, 1).setDepth(p.y + 3);
      s.play(anim(`enemy_${ENCOUNTERS[i].group[0] + 1}`));
      s.anims.setProgress(Math.random());
      return s;
    });
    const boss = this.add.sprite(M.boss.x * TILE + 8, M.boss.y * TILE + 16, spr('boss')).setOrigin(0.5, 1).setDepth(M.boss.y + 3).play(anim('boss'));
    this.encs[BOSS] = boss;
    // Off the main road: the superboss, the side quest, the shop sign, secret hints.
    this.contents = chestContents();
    if (M.wyrm.x >= 0) {
      this.encs[WYRM] = this.add.sprite(M.wyrm.x * TILE + 8, M.wyrm.y * TILE + 16, spr('wyrm')).setOrigin(0.5, 1).setDepth(M.wyrm.y + 3).play(anim('wyrm'));
    }
    this.questNpc = M.quest.x >= 0 ? this.add.sprite(M.quest.x * TILE + 8, M.quest.y * TILE + 6, spr('quest_npc')).play(anim('quest_npc')).setDepth(M.quest.y + 3) : null;
    this.questItem = M.item.x >= 0 ? this.add.image(M.item.x * TILE, M.item.y * TILE, spr('saga_map'), 2).setOrigin(0).setDepth(2) : null;
    this.add.image(4 * TILE, 9 * TILE, spr('saga_map'), 0).setOrigin(0).setDepth(2);
    for (const [k, id] of Object.entries(M.secret)) {
      const [x, y] = k.split(',').map(Number);
      if (id === 'vault') this.add.image(x * TILE, y * TILE, spr('saga_map'), 1).setOrigin(0).setDepth(1);
      const tw = this.add.image(x * TILE + 4, y * TILE + 2, spr('saga_map'), 3).setOrigin(0).setDepth(2).setAlpha(0);
      this.tweens.add({ targets: tw, alpha: 1, duration: 300, yoyo: true, repeat: -1, repeatDelay: 2600, delay: 1000 });
    }
    this.shop = new ShopMenu(this, () => { hooks.state = 'explore'; this.refreshHud(); });
    // Seeded overworld events: a travelling merchant and two stray chests (some bite).
    this.ev = rollEvents();
    this.add.sprite(this.ev.merchant.x * TILE + 8, this.ev.merchant.y * TILE + 6, spr('merchant')).play(anim('merchant')).setDepth(this.ev.merchant.y + 3);
    this.evChests = this.ev.chests.map((c) => ({ ...c, opened: false, s: this.add.sprite(c.x * TILE, c.y * TILE, spr('chest'), 0).setOrigin(0).setDepth(2) }));
    this.mimicAt = -1;
    // Party
    this.pos = { ...M.start };
    this.trail = [{ ...M.start }, { ...M.start }];
    this.player = this.add.sprite(0, 0, spr('hero'), 0).setDepth(50);
    this.followers = R.party.slice(1).map((m) => this.add.sprite(0, 0, spr(m.sprite)).play(anim(m.sprite)).setDepth(49));
    this.makeAnims();
    this.placeParty();
    this.cameras.main.setBounds(0, 0, MW * TILE, MH * TILE).startFollow(this.player, true, 1, 1).setRoundPixels(true);
    this.buildHud();
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.events.on('wake', this.onWake, this);
    this.events.once('shutdown', () => this.events.off('wake', this.onWake, this));
    this.installDebug();
    this.enterRegion();
    const g = K.theme.game;
    this.say([
      { text: g.intro },
      { text: `${g.party[0].name} the ${g.party[0].role} joins the party!` },
      { text: `${g.party[1].name} the ${g.party[1].role} joins the party!` },
      { speaker: g.party[0].name, text: 'The monsters block the road east. Beat them and the firewalls will drop.' },
    ], () => { R.started = true; });
  }

  // ---------------------------------------------------------------- setup helpers
  private makeAnims() {
    const k = spr('hero');
    for (const [d, [, , f]] of Object.entries(DIRS)) {
      const a = `saga-walk-${d}`;
      if (this.anims.exists(a)) this.anims.remove(a);
      this.anims.create({ key: a, frames: this.anims.generateFrameNumbers(k, { start: f, end: f + 1 }), frameRate: 8, repeat: -1 });
    }
  }

  private placeParty() {
    const px = (p: P) => p.x * TILE + 8, py = (p: P) => p.y * TILE + 6;
    const t = this.stepT;
    const lerp = (a: P, b: P, u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const lead = t < 1 ? lerp(this.from[0], this.to[0], t) : this.pos;
    this.player.setPosition(Math.round(px(lead)), Math.round(py(lead))).setDepth(lead.y + 3.2);
    this.followers.forEach((f, i) => {
      const p = t < 1 ? lerp(this.from[i + 1], this.to[i + 1], t) : this.trail[i];
      f.setPosition(Math.round(px(p)), Math.round(py(p))).setDepth(p.y + 3.1 - i * 0.01);
      f.setVisible(!(Math.abs(p.x - lead.x) < 0.01 && Math.abs(p.y - lead.y) < 0.01));
    });
    R.pos = { ...this.pos };
  }

  private buildHud() {
    const ui = K.ui;
    const g = this.add.graphics().setScrollFactor(0).setDepth(900);
    g.fillStyle(ui.bgInt, 0.85).fillRect(0, 0, W, 16);
    g.fillStyle(ui.panelInt, 1).fillRect(0, 16, W, 1);
    const region = text(this, 4, 3, '', { color: ui.accentInt, fixed: true, depth: 901 });
    const rows = R.party.map((m, i) => {
      const x = W - 3 * 96 + i * 96;
      const name = text(this, x, 3, m.name, { fixed: true, depth: 901, color: ui.textInt });
      const hp = bar(this, x + 52, 6, 38, 4, 0x58d854, 0x000000, ui.panelInt);
      hp.g.setDepth(901);
      return { name, hp };
    });
    this.hud = { region, rows, bg: g };
    // Footer: gold, chests and secrets found; run tags (NG+, heat, challenge) and the speedrun clock.
    const fg = this.add.graphics().setScrollFactor(0).setDepth(900);
    fg.fillStyle(ui.bgInt, 0.8).fillRect(0, H - 13, 150, 13).fillRect(W - 150, H - 13, 150, 13);
    const ico = (x: number, f: number) => this.add.image(x, H - 7, spr('saga_icons'), f).setScrollFactor(0).setDepth(901);
    ico(8, ICON.gold); ico(58, ICON.chest); ico(104, ICON.star);
    this.foot = {
      gold: text(this, 15, H - 10, '', { fixed: true, depth: 901, color: 0xf8b800 }),
      chests: text(this, 65, H - 10, '', { fixed: true, depth: 901 }),
      secrets: text(this, 111, H - 10, '', { fixed: true, depth: 901 }),
      tag: text(this, W - 4, H - 10, '', { fixed: true, depth: 901, align: 'right', color: ui.accentInt }),
    };
    this.refreshHud();
  }

  private runTag() {
    const t: string[] = [];
    if (R.mode === 'ngplus') t.push(`NG+${R.ng > 1 ? R.ng : ''}`);
    if (R.mode === 'solo') t.push('SOLO');
    if (R.mode === 'noitems') t.push('NO ITEMS');
    if (R.mode === 'daily') t.push('DAILY');
    if (R.heat) t.push(`HEAT ${R.heat}`);
    if (R.mode === 'speedrun') t.push(fmtTime(hooks.elapsed));
    return t.join('  ');
  }

  private refreshHud() {
    if (this.foot) {
      this.foot.gold.setText(String(R.gold));
      this.foot.chests.setText(`${R.chests.size}/${CHESTS.length}`);
      this.foot.secrets.setText(`${R.secrets.size}/${SECRETS.length}`);
      this.foot.tag.setText(this.runTag());
    }
    this.hud.rows.forEach((r, i) => {
      const m = R.party[i];
      const f = m.hp / m.maxHp;
      r.hp.draw(f, m.hp <= 0 ? 0x7c7c7c : f < 0.35 ? 0xf83800 : 0x58d854);
      r.name.setColor(m.hp <= 0 ? 0x7c7c7c : K.ui.textInt);
    });
  }

  private regionName(i: number) {
    const g = K.theme.game;
    return i === 3 ? `${g.boss.name}'s Lair` : g.regions[i]?.name ?? '';
  }

  private enterRegion() {
    const r = regionOf(this.pos);
    if (r === this.region) return;
    this.region = r;
    this.hud.region.setText(this.regionName(r));
    this.banner.forEach((o) => o.destroy());
    const ui = K.ui;
    const blurb = r === 3 ? `"${K.theme.game.boss.taunt}"` : r === 0 && this.pos.x < 16 && this.pos.y < 12 ? `Welcome to ${K.theme.game.town.name}.` : K.theme.game.regions[r]?.blurb ?? '';
    const b = box(this, 70, 26, W - 140, 32, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(890);
    const t1 = text(this, W / 2, 30, this.regionName(r).toUpperCase(), { align: 'center', color: ui.accentInt, fixed: true, depth: 891 });
    const t2 = text(this, W / 2, 43, blurb, { align: 'center', fixed: true, depth: 891, maxWidth: W - 150, maxLines: 1 });
    this.banner = [b, t1, t2];
    this.time.delayedCall(2600, () => { [b, t1, t2].forEach((o) => o.destroy()); });
  }

  // ---------------------------------------------------------------- world queries
  private blocked(x: number, y: number, forBot = false): boolean {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    if (BLOCK.has(MAP[y][x])) return true;
    for (const [g, ps] of Object.entries(M.gates)) if (!this.open.has(g) && ps.some((p) => p.x === x && p.y === y)) return true;
    if (M.npcs.some((p) => p.x === x && p.y === y)) return true;
    if (M.quest.x === x && M.quest.y === y) return true;
    if (this.ev && ((this.ev.merchant.x === x && this.ev.merchant.y === y) || this.evChests.some((c) => c.x === x && c.y === y))) return true;
    if (forBot && !R.optional && (M.secret[`${x},${y}`] || (M.item.x === x && M.item.y === y))) return true;
    if (M.chests.some((p) => p.x === x && p.y === y)) return true;
    if (forBot) {
      const e = this.encAt(x, y);
      if (e >= 0) return true;
    }
    return false;
  }

  private encAt(x: number, y: number): number {
    const i = M.encs.findIndex((p) => p.x === x && p.y === y);
    if (i >= 0 && !R.cleared.has(i)) return i;
    if (M.boss.x === x && M.boss.y === y && !R.cleared.has(BOSS)) return BOSS;
    if (M.wyrm.x === x && M.wyrm.y === y && !R.cleared.has(WYRM)) return WYRM;
    return -1;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (R.over || this.busy) return;
    if (this.dlg) {
      if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat) this.advance();
      return;
    }
    if (this.shop.open) { this.shop.key(e); this.refreshHud(); return; }
    if (this.menu) {
      if (e.code === 'Escape' || e.code === 'KeyX') this.closeMenu();
      else if (['Enter', 'Space'].includes(e.code) && !e.repeat) this.menuUsePotion();
      else if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) {
        const n = R.party.length;
        this.menuSel = (this.menuSel + (['ArrowUp', 'KeyW'].includes(e.code) ? n - 1 : 1)) % n;
        K.play('move', 0.4);
        this.redrawMenu();
      } else if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) {
        const m = R.party[this.menuSel];
        if (m) { m.row = m.row === 'back' ? 'front' : 'back'; K.play('select', 0.5); this.redrawMenu(); }
      }
      return;
    }
    if (!R.started) return;
    if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat && this.stepT >= 1) this.interact();
    if ((e.code === 'Escape' || e.code === 'KeyX') && !e.repeat && this.stepT >= 1) this.openMenu();
  }

  private heldDir(): Dir | null {
    const k = this.keys;
    if (k.UP.isDown || k.W.isDown) return 'up';
    if (k.DOWN.isDown || k.S.isDown) return 'down';
    if (k.LEFT.isDown || k.A.isDown) return 'left';
    if (k.RIGHT.isDown || k.D.isDown) return 'right';
    return null;
  }

  update(_t: number, dtMs: number) {
    if (R.over) return;
    publishStats(hooks);
    const dt = (Math.min(dtMs, 50) / 1000) * R.speed;
    hooks.elapsed += dt;
    if (R.mode === 'speedrun') this.foot.tag.setText(this.runTag());
    if (this.dlg) {
      this.dlg.tw.step(dt);
      if (R.autopilot) {
        this.dlg.wait += dt;
        if (this.dlg.wait > 0.5) { this.dlg.wait = 0; this.advance(); }
      }
      return;
    }
    if (this.shop.open && R.autopilot) { this.botShop(); return; }
    if (this.menu || this.shop.open || this.busy || !R.started) return;
    if (this.stepT < 1) {
      this.stepT = Math.min(1, this.stepT + dt * STEP_RATE);
      if (this.stepT >= 1) this.endStep();
      this.placeParty();
      return;
    }
    const d = this.heldDir() ?? (R.autopilot ? this.botDir() : null);
    if (d) this.tryStep(d);
    else {
      this.player.anims.stop();
      this.player.setFrame(DIRS[this.dir][2]);
    }
  }

  private face(d: Dir) {
    this.dir = d;
    const a = `saga-walk-${d}`;
    if (this.player.anims.currentAnim?.key !== a || !this.player.anims.isPlaying) this.player.play(a);
  }

  private tryStep(d: Dir) {
    this.face(d);
    const [dx, dy] = DIRS[d];
    const nx = this.pos.x + dx, ny = this.pos.y + dy;
    const enc = this.encAt(nx, ny);
    if (enc === WYRM && !R.flags.has('wyrm_warned')) {
      R.flags.add('wyrm_warned');
      this.say([{ speaker: WYRM_NAME, text: '...' }, { text: WYRM_LINES.warn }], () => {});
      return;
    }
    if (enc >= 0) { this.startBattle(enc); return; }
    const chest = M.chests.findIndex((p) => p.x === nx && p.y === ny);
    if (chest >= 0 && !R.chests.has(chest)) { this.openChest(chest); return; }
    const evc = this.evChests.findIndex((c) => c.x === nx && c.y === ny && !c.opened);
    if (evc >= 0) { this.openEventChest(evc); return; }
    const gate = Object.entries(M.gates).find(([g, ps]) => !this.open.has(g) && ps.some((p) => p.x === nx && p.y === ny));
    if (gate) {
      if (this.time.now - this.bumpAt > 1500) { this.bumpAt = this.time.now; this.gateMessage(gate[0]); }
      return;
    }
    if (this.blocked(nx, ny)) {
      if (this.time.now - this.bumpAt > 300) { this.bumpAt = this.time.now; K.play('bump', 0.4); }
      this.player.anims.stop();
      this.player.setFrame(DIRS[d][2]);
      return;
    }
    this.from = [{ ...this.pos }, { ...this.trail[0] }, { ...this.trail[1] }];
    this.to = [{ x: nx, y: ny }, { ...this.pos }, { ...this.trail[0] }];
    this.trail = [{ ...this.pos }, { ...this.trail[0] }];
    this.pos = { x: nx, y: ny };
    this.stepT = 0;
    if ((nx + ny) % 2 === 0) K.play('step', 0.3, 80);
  }

  private endStep() {
    this.enterRegion();
    const sec = M.secret[`${this.pos.x},${this.pos.y}`];
    if (sec) this.findSecret(sec);
    if (M.item.x === this.pos.x && M.item.y === this.pos.y && !R.flags.has('item')) {
      R.flags.add('item');
      this.questItem?.destroy();
      K.play('chest');
      this.say([{ text: QUEST.found }], () => {});
    }
  }

  private findSecret(id: SecretId) {
    if (R.secrets.has(id)) return;
    R.secrets.add(id);
    K.play('gate', 0.6);
    toast(this, `SECRET ${R.secrets.size}/${SECRETS.length}: ${SECRET_TEXT[id]}`, false);
    capture('secret_found', { secret: id });
    this.refreshHud();
    checkFinds(CHESTS.length);
  }

  private talkQuest() {
    const n = QUEST.npc;
    if (R.flags.has('quest_done')) { this.say([{ speaker: n, text: QUEST.after }], () => {}); return; }
    if (!R.flags.has('item')) {
      R.flags.add('quest_given');
      this.say(paginate(R.flags.has('quest_asked') ? QUEST.waiting : QUEST.ask, 58, 2).map((p) => ({ speaker: n, text: p })), () => {});
      R.flags.add('quest_asked');
      return;
    }
    R.flags.add('quest_done');
    R.gold += QUEST.reward.gold;
    const pages: Page[] = paginate(QUEST.thanks, 58, 2).map((p) => ({ speaker: n, text: p }));
    pages.push({ text: `Got ${QUEST.reward.gold} gold. ${this.giveGear(QUEST.reward.gear)}` });
    this.say(pages, () => {});
    this.findSecret('quest');
  }

  /** Give a piece of gear: equip it on whoever gains most, else sell it. Returns the line to show. */
  private giveGear(id: string): string {
    const g = gearDef(id)!;
    const m = autoEquip(R.party, id);
    if (m) return `${m.name} equips the ${g.name}! (${gearLine(id)})`;
    const cash = Math.round(g.price / 2);
    R.gold += cash;
    return `Found the ${g.name}, but nobody needs it. Sold for ${cash} gold.`;
  }

  private facing(): P {
    const [dx, dy] = DIRS[this.dir];
    return { x: this.pos.x + dx, y: this.pos.y + dy };
  }

  private interact() {
    const t = this.facing();
    const g = K.theme.game;
    if (M.quest.x === t.x && M.quest.y === t.y) { this.talkQuest(); return; }
    if (this.ev.merchant.x === t.x && this.ev.merchant.y === t.y) {
      R.flags.add('merchant');
      this.say([{ speaker: MERCHANT.name, text: MERCHANT.hello }], () => {
        hooks.state = 'shop';
        this.shop.showStock(this.ev.stock, 'MERCHANT', 0.8);
      });
      return;
    }
    const evc = this.evChests.findIndex((c) => c.x === t.x && c.y === t.y && !c.opened);
    if (evc >= 0) { this.openEventChest(evc); return; }
    if (isShop(t.x, t.y)) {
      K.play('select');
      hooks.state = 'shop';
      this.player.anims.stop();
      this.shop.show();
      return;
    }
    const npc = M.npcs.findIndex((p) => p.x === t.x && p.y === t.y);
    if (npc >= 0) {
      const n = g.npcs[npc];
      R.talked.add(npc);
      capture('npc_talked', { npc: npc });
      this.say(paginate(n.line, 58, 2).map((p) => ({ speaker: n.name, text: p })), () => {});
      return;
    }
    if (M.inn.some((p) => p.x === t.x && p.y === t.y)) {
      this.say([{ speaker: 'Innkeeper', text: g.town.inn_line }, { text: 'The party rests. HP and MP are fully restored!' }], () => {});
      this.healAll();
      return;
    }
    if (M.heals.some((p) => p.x === t.x && p.y === t.y)) {
      this.say([{ text: 'A coffee station! The party takes a break. HP and MP restored.' }], () => {});
      this.healAll();
      return;
    }
    const chest = M.chests.findIndex((p) => p.x === t.x && p.y === t.y);
    if (chest >= 0 && !R.chests.has(chest)) { this.openChest(chest); return; }
    const enc = this.encAt(t.x, t.y);
    if (enc >= 0) { this.startBattle(enc); return; }
    const gate = Object.entries(M.gates).find(([gk, ps]) => !this.open.has(gk) && ps.some((p) => p.x === t.x && p.y === t.y));
    if (gate) this.gateMessage(gate[0]);
  }

  private healAll() {
    K.play('heal');
    for (const m of R.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
    this.refreshHud();
  }

  private openChest(i: number) {
    R.chests.add(i);
    this.chests[i].setFrame(1);
    K.play('chest');
    const pages: Page[] = [];
    for (const what of this.contents[i] ?? ['potion']) {
      if (what === 'relic') {
        R.relic = true;
        pages.push({ text: `Found the ${relicName()}! The whole party feels stronger.` });
      } else if (what in ITEMS) {
        if (R.mode === 'noitems') { R.gold += 10; pages.push({ text: `Found a ${ITEMS[what as ItemId].name}... no items in this challenge. Sold for 10 gold.` }); continue; }
        R.items[what as ItemId]++;
        pages.push({ text: `Found a ${ITEMS[what as ItemId].name}! (${ITEMS[what as ItemId].line})` });
      } else if (gearDef(what)) {
        pages.push({ text: this.giveGear(what) });
      }
      capture('chest_opened', { item: what, hidden: isHiddenChest(i) });
    }
    this.refreshHud();
    checkFinds(CHESTS.length);
    this.say(pages, () => {});
  }

  /** A stray event chest: supplies, or a mimic fight. */
  private openEventChest(i: number) {
    const c = this.evChests[i];
    if (c.mimic) {
      this.mimicAt = i;
      K.play('boss', 0.5);
      this.tweens.add({ targets: c.s, y: c.s.y - 4, duration: 60, yoyo: true, repeat: 3 });
      this.say([{ text: `The chest has teeth! It's a ${MIMIC_DEF.name.toUpperCase()}!` }], () => this.startBattle(MIMIC));
      return;
    }
    c.opened = true;
    c.s.setFrame(1);
    K.play('chest');
    R.flags.add(`evchest${i}`);
    const gold = 20 + 10 * regionOf(c);
    R.gold += gold;
    const pages: Page[] = [{ text: `A stray supply chest! Got ${gold} gold${R.mode === 'noitems' ? '' : ' and a Potion'}.` }];
    if (R.mode !== 'noitems') R.items.potion++;
    this.refreshHud();
    this.say(pages, () => {});
  }

  private gateMessage(g: string) {
    const left = GATES[g].filter((e) => !R.cleared.has(e)).length;
    const where = g === 'X' ? `${theName(K.theme.game.boss.name)}'s lair` : this.regionName(g === 'G' ? 1 : 2);
    K.play('bump', 0.5);
    this.say([{ text: `A firewall blocks the way to ${where}. Beat the ${left} monster${left === 1 ? '' : 's'} nearby to bring it down.` }], () => {});
  }

  private checkGates() {
    const opened: string[] = [];
    for (const [g, encs] of Object.entries(GATES)) {
      if (this.open.has(g) || !encs.every((e) => R.cleared.has(e))) continue;
      this.open.add(g);
      this.gates[g].forEach((s) => this.tweens.add({ targets: s, alpha: 0, duration: 600, onComplete: () => s.destroy() }));
      opened.push(g);
    }
    if (opened.length) {
      K.play('gate');
      const g = opened[0];
      const where = g === 'X' ? `${theName(K.theme.game.boss.name)}'s lair` : this.regionName(g === 'G' ? 1 : 2);
      this.say([{ text: `The firewall to ${where} is down!` }], () => {});
    }
  }

  // ---------------------------------------------------------------- dialogue
  private say(pages: Page[], done: () => void) {
    if (!pages.length) { done(); return; }
    if (this.dlg) {
      // Already talking: queue these pages after the current ones.
      const d = this.dlg, prev = d.done;
      d.pages.push(...pages);
      d.done = () => { prev(); done(); };
      return;
    }
    const ui = K.ui;
    hooks.state = 'dialogue';
    this.player.anims.stop();
    const y = H - 62;
    const b = box(this, 8, y, W - 16, 56, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(950);
    const speaker = text(this, 18, y + 6, '', { color: ui.accentInt, fixed: true, depth: 951 });
    const tw = new Typewriter(this, 18, y + 18, 70, 3, { depth: 951 });
    tw.t.setScrollFactor(0);
    const more = text(this, W - 20, y + 44, '▼', { color: ui.accentInt, fixed: true, depth: 951 });
    this.tweens.add({ targets: more, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
    this.dlg = { pages, i: 0, tw, objs: [b, speaker, more], speaker, done, wait: 0 };
    this.showPage();
  }

  private showPage() {
    const d = this.dlg!;
    const p = d.pages[d.i];
    d.speaker.setText(p.speaker ?? '');
    d.tw.t.setPosition(18, H - 62 + (p.speaker ? 18 : 10));
    d.tw.show(p.text);
  }

  private advance() {
    const d = this.dlg;
    if (!d) return;
    if (!d.tw.done) { d.tw.finish(); return; }
    K.play('blip', 0.4);
    d.i++;
    if (d.i < d.pages.length) { this.showPage(); return; }
    d.objs.forEach((o) => o.destroy());
    d.tw.destroy();
    this.dlg = null;
    hooks.state = 'explore';
    d.done();
  }

  // ---------------------------------------------------------------- menu (ESC)
  private openMenu(quiet = false) {
    const ui = K.ui;
    hooks.state = 'menu';
    if (!quiet) K.play('select');
    this.menuSel = Math.min(this.menuSel, R.party.length - 1);
    const objs: Phaser.GameObjects.GameObject[] = [];
    objs.push(box(this, 40, 26, W - 80, H - 52, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(960));
    objs.push(text(this, W / 2, 34, 'PARTY', { align: 'center', color: ui.accentInt, scale: 2, fixed: true, depth: 961 }));
    R.party.forEach((m, i) => {
      const y = 54 + i * 45;
      if (i === this.menuSel) {
        const c = this.add.graphics().setScrollFactor(0).setDepth(961);
        c.fillStyle(ui.accentInt).fillTriangle(44, y + 6, 44, y + 14, 49, y + 10);
        objs.push(c);
      }
      objs.push(this.add.image(m.row === 'back' ? 62 : 58, y + 10, spr(m.sprite), 0).setScale(2).setScrollFactor(0).setDepth(961));
      objs.push(text(this, 76, y, `${m.name}  LV ${m.lv}  ${m.role}`, { fixed: true, depth: 961, color: m.hp > 0 ? ui.textInt : 0x7c7c7c }));
      objs.push(text(this, W - 50, y, m.row === 'back' ? 'BACK' : 'FRONT', { fixed: true, depth: 961, align: 'right', color: m.row === 'back' ? ui.dimInt : ui.accentInt }));
      objs.push(text(this, 76, y + 10, `HP ${m.hp}/${m.maxHp}  MP ${m.mp}/${m.maxMp}  ATK ${stat(m, 'atk')} DEF ${stat(m, 'def')} MAG ${stat(m, 'mag')}`,
        { fixed: true, depth: 961, color: ui.dimInt }));
      objs.push(text(this, 76, y + 20, m.skills.map((s) => (s === 'coffee_run' ? 'Coffee Run' : productName(s))).join(', '), { fixed: true, depth: 961, color: ui.dimInt, maxWidth: W - 130, maxLines: 1 }));
      const gear = (['weapon', 'armor', 'charm'] as const).map((k) => gearDef(m.gear[k] ?? '')?.name ?? '-').join(' / ');
      objs.push(text(this, 76, y + 30, gear, { fixed: true, depth: 961, color: 0xf8b800, maxWidth: W - 130, maxLines: 1 }));
    });
    const inv = `Potion x${R.items.potion}   Ether x${R.items.ether}   Hotfix x${R.items.hotfix}   Gold ${R.gold}${R.relic ? `   ${relicName()}` : ''}`;
    objs.push(text(this, W / 2, 192, inv, { align: 'center', fixed: true, depth: 961, color: ui.textInt, maxWidth: W - 100, maxLines: 2 }));
    objs.push(text(this, W / 2, 204, 'Back row: takes and deals less physical damage.', { align: 'center', fixed: true, depth: 961, color: ui.dimInt }));
    objs.push(text(this, W / 2, H - 40, 'LEFT/RIGHT row   ENTER Potion   ESC close', { align: 'center', fixed: true, depth: 961, color: ui.accentInt }));
    this.menu = objs;
  }

  private redrawMenu() {
    this.menu?.forEach((o) => o.destroy());
    this.menu = null;
    this.openMenu(true);
  }

  private closeMenu() {
    this.menu?.forEach((o) => o.destroy());
    this.menu = null;
    hooks.state = 'explore';
    K.play('back');
  }

  private menuUsePotion() {
    const m = R.party[this.menuSel];
    if (!m || m.hp <= 0 || m.hp >= m.maxHp || R.items.potion <= 0) { K.play('bump'); return; }
    R.items.potion--;
    m.hp = Math.min(m.maxHp, m.hp + 60);
    K.play('heal');
    this.refreshHud();
    this.redrawMenu();
  }

  // ---------------------------------------------------------------- battles
  private startBattle(enc: number, showcase = false) {
    if (this.busy) return;
    this.busy = true;
    hooks.state = 'battle';
    this.player.anims.stop();
    K.play(enc === BOSS ? 'boss' : 'encounter');
    K.play('swirl', 0.5);
    this.cameras.main.flash(120, 255, 255, 255);
    swirl(this, 420, () => {
      this.scene.sleep();
      const region = enc === BOSS ? 3 : enc === WYRM ? 2 : enc === MIMIC ? regionOf(this.pos) : ENCOUNTERS[enc].region;
      this.scene.launch('Battle', { enc, region, showcase });
    });
  }

  private onWake(_sys: unknown, data: { result: 'win' | 'run'; enc: number }) {
    this.busy = false;
    hooks.scene = 'Explore';
    hooks.state = 'explore';
    this.refreshHud();
    if (!data) return;
    if (data.result === 'win') {
      R.cleared.add(data.enc);
      const s = this.encs[data.enc];
      if (s) this.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.setVisible(false) });
      if (data.enc === MIMIC && this.mimicAt >= 0) {
        const c = this.evChests[this.mimicAt];
        c.opened = true;
        c.s.setVisible(false);
        R.flags.add(`mimic${this.mimicAt}`);
        this.mimicAt = -1;
        R.gold += 40;
        const id = rng(((K.run?.seed ?? 3) ^ R.kills) >>> 0).pick(RARE_POOL);
        this.say([{ text: `The mimic spits out 40 gold and some loot.` }, { text: this.giveGear(id) }], () => {});
      }
      if (data.enc === WYRM) {
        R.gold += WYRM_LINES.reward.gold;
        this.say([{ text: `The ${WYRM_NAME} crumbles into a pile of closed tickets! Got ${WYRM_LINES.reward.gold} gold.` },
          { text: this.giveGear(WYRM_LINES.reward.gear) }], () => {});
        this.findSecret('wyrm');
      }
      this.refreshHud();
      this.checkGates();
    } else {
      // Ran away: step back from the monster if we can.
      const [dx, dy] = DIRS[this.dir];
      const bx = this.pos.x - dx, by = this.pos.y - dy;
      if (!this.blocked(bx, by)) { this.pos = { x: bx, y: by }; this.trail = [{ ...this.pos }, { ...this.pos }]; this.placeParty(); }
    }
  }

  // ---------------------------------------------------------------- autopilot
  /** BFS to any tile in `goals` (which may be blocked themselves: we stop next to them). */
  private pathTo(goals: P[]): P[] | null {
    const want = new Set(goals.map((g) => key(g.x, g.y)));
    const prev = new Map<number, number>();
    const start = key(this.pos.x, this.pos.y);
    prev.set(start, -1);
    const q = [start];
    while (q.length) {
      const k = q.shift()!;
      const x = k % MW, y = Math.floor(k / MW);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (prev.has(nk) || nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        if (want.has(nk)) {
          prev.set(nk, k);
          const path: P[] = [];
          for (let c = nk; c !== start; c = prev.get(c)!) path.unshift({ x: c % MW, y: Math.floor(c / MW) });
          return path;
        }
        if (this.blocked(nx, ny, true)) continue;
        prev.set(nk, k);
        q.push(nk);
      }
    }
    return null;
  }

  private needsRest() {
    return R.party.some((m) => m.hp <= 0 || m.hp < m.maxHp * 0.75 || (m.cls !== 'hero' && m.mp < m.maxMp * 0.4));
  }

  private botDir(): Dir | null {
    // Choose a goal: talk to townsfolk, rest when hurt, grab chests, then fight in order.
    const goals: { name: string; tiles: P[]; act: 'step' | 'interact' }[] = [];
    M.npcs.forEach((p, i) => { if (!R.talked.has(i)) goals.push({ name: `npc${i}`, tiles: [p], act: 'interact' }); });
    if (this.needsRest()) goals.push({ name: 'rest', tiles: [...M.inn, ...M.heals], act: 'interact' });
    if (!R.naive && this.wantShop()) goals.push({ name: 'shop', tiles: [{ x: 3, y: 9 }, { x: 4, y: 9 }], act: 'interact' });
    // Formation: casters and healers stand in the back row.
    if (!R.naive) for (const m of R.party) if (m.cls !== 'hero' && m.row !== 'back') m.row = 'back';
    if (R.optional) {
      if (!R.flags.has('merchant')) goals.push({ name: 'merchant', tiles: [this.ev.merchant], act: 'interact' });
      this.evChests.forEach((c, i) => { if (!c.opened && !this.needsRest()) goals.push({ name: `ev${i}`, tiles: [c], act: 'step' }); });
    }
    M.chests.forEach((p, i) => { if (!R.chests.has(i) && (R.optional || !isHiddenChest(i))) goals.push({ name: `chest${i}`, tiles: [p], act: 'step' }); });
    if (R.optional && M.quest.x >= 0) {
      if (!R.flags.has('quest_asked')) goals.push({ name: 'quest', tiles: [M.quest], act: 'interact' });
      else if (!R.flags.has('item')) goals.push({ name: 'item', tiles: [M.item], act: 'step' });
      else if (!R.flags.has('quest_done')) goals.push({ name: 'questdone', tiles: [M.quest], act: 'interact' });
    }
    const next = [...M.encs.keys()].find((i) => !R.cleared.has(i));
    if (next !== undefined) goals.push({ name: `enc${next}`, tiles: [M.encs[next]], act: 'step' });
    else if (R.optional && M.wyrm.x >= 0 && !R.cleared.has(WYRM) && !this.needsRest()) goals.push({ name: 'wyrm', tiles: [M.wyrm], act: 'step' });
    else goals.push({ name: 'boss', tiles: [M.boss], act: 'step' });
    for (const g of goals) {
      const path = this.pathTo(g.tiles);
      if (!path) continue;
      if (g.name === 'rest' && path.length > 45) continue; // too far: keep going, potions will do
      if (g.name === 'shop' && path.length > 30) continue;
      this.bot.goal = g.name;
      if (g.name === 'wyrm' && path.length === 1 && !R.flags.has('wyrm_warned')) R.flags.add('wyrm_warned');
      const nxt = path[0];
      const d = (Object.keys(DIRS) as Dir[]).find((k) => this.pos.x + DIRS[k][0] === nxt.x && this.pos.y + DIRS[k][1] === nxt.y)!;
      if (path.length === 1) {
        if (g.act === 'interact') { this.face(d); this.interact(); return null; }
        return d; // stepping into a chest/monster triggers it
      }
      return d;
    }
    return null;
  }

  /** Is there something in the shop worth a detour? */
  private wantShop() {
    if (this.bot.shopped === R.gold) return false;
    return SHOP.some((id) => R.gold >= price(id) && (gearDef(id) ? this.shopWants(id) : id === 'potion' && R.items.potion < 4 && R.mode !== 'noitems'));
  }

  private shopWants(id: string) {
    const g = gearDef(id);
    if (!g) return false;
    return R.party.some((m) => (g.cls === 'any' || g.cls === m.cls) && !m.gear[g.slot]);
  }

  /** Autopilot in the shop: best affordable gear for empty slots first, then potions. */
  private botShop() {
    const stock = this.shop.stock;
    const gear = stock.filter((id) => gearDef(id) && (this.shopWants(id) || stock !== SHOP)).sort((a, b) => price(b) - price(a));
    for (const id of gear) if (R.gold >= this.shop.cost(id)) this.shop.buy(stock.indexOf(id));
    while (R.mode !== 'noitems' && R.items.potion < 4 && R.gold >= price('potion') && stock.includes('potion')) {
      if (!this.shop.buy(stock.indexOf('potion'))) break;
    }
    this.bot.shopped = R.gold;
    this.shop.close();
  }

  // ---------------------------------------------------------------- debug hooks
  private skipDialogue() {
    if (this.dlg) { this.dlg.objs.forEach((o) => o.destroy()); this.dlg.tw.destroy(); this.dlg = null; }
    hooks.state = 'explore';
    R.started = true;
  }

  private installDebug() {
    const battle = () => this.scene.get('Battle') as any;
    const battleOn = () => this.scene.isActive('Battle');
    hooks.debug = {
      autopilot: (on = true) => { R.autopilot = !!on; },
      speed: (n: number) => { R.speed = Math.max(1, Math.min(8, Math.round(n))); setJuiceSpeed(R.speed); },
      meter: (n = METER.max) => { R.meter = Math.max(0, Math.min(METER.max, Number(n) || 0)); if (battleOn()) battle().debugMeter?.(); return R.meter; },
      breakAll: () => { if (battleOn()) battle().debugBreak(); },
      optional: (on = true) => { R.optional = !!on; },
      naive: (on = true) => { R.naive = !!on; },
      god: (on = true) => { R.god = !!on; },
      lose: () => {
        if (battleOn()) battle().forceEnd(false);
        else { R.over = true; this.scene.start('End', endData(false)); }
      },
      win: () => {
        if (battleOn()) this.scene.stop('Battle');
        R.over = true;
        R.cleared.add(BOSS);
        onWin();
        this.scene.start('End', endData(true));
      },
      warp: (enc: number) => {
        M.npcs.forEach((_, i) => R.talked.add(i));
        for (let i = 0; i < Math.min(enc, 8); i++) R.cleared.add(i);
        this.encs.forEach((s, i) => s?.setVisible(!R.cleared.has(i)));
        this.checkGates();
        const t = enc >= 8 ? M.boss : M.encs[enc];
        const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).find((p) => !this.blocked(p.x, p.y, true));
        if (spot) { this.pos = spot; this.trail = [{ ...spot }, { ...spot }]; this.stepT = 1; this.placeParty(); this.enterRegion(); }
      },
      levels: (n: number) => { for (const m of R.party) for (let i = 0; i < n; i++) levelUp(m); for (const m of R.party) { m.hp = m.maxHp; m.mp = m.maxMp; } this.refreshHud(); },
      showcase: () => {
        if (battleOn()) return;
        this.skipDialogue();
        if (R.party[0].lv < 5) for (const m of R.party) for (let i = m.lv; i < 5; i++) levelUp(m);
        for (const m of R.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
        R.meter = METER.max - 8;
        this.startBattle(7, true);
      },
      // Run setup: restart the adventure as `mode` (standard/ngplus/solo/noitems/speedrun) at `heat` 0-5.
      run: (mode = 'standard', heat = 0) => {
        if (battleOn()) this.scene.stop('Battle');
        beginRun({ mode: String(mode), heat: Number(heat) || 0 });
        this.scene.restart();
      },
      heat: (n: number) => { R.heat = Math.max(0, Math.min(HEAT_T.length - 1, Math.floor(Number(n) || 0))); R.heatDef = HEAT_T[R.heat]; K.run.heat = R.heat; this.refreshHud(); return R.heat; },
      gold: (n = 500) => { R.gold = Math.max(0, Math.floor(Number(n) || 0)); this.refreshHud(); return R.gold; },
      gear: (id: string) => (gearDef(id) ? this.giveGear(id) : `no gear ${id}`),
      // Stand next to an optional spot: shop, quest, item, grove, vault, wyrm.
      place: (what: string) => {
        const spots: Record<string, P> = { shop: { x: 3, y: 10 }, quest: { x: M.quest.x, y: M.quest.y + 1 }, item: { x: M.item.x + 1, y: M.item.y },
          grove: { x: 31, y: 8 }, vault: { x: 32, y: 29 }, wyrm: { x: M.wyrm.x - 1, y: M.wyrm.y } };
        const adj = (q: { x: number; y: number }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy })).find((o) => !this.blocked(o.x, o.y, true))!;
        spots.merchant = adj(this.ev.merchant);
        this.evChests.forEach((c, i) => { spots[`ev${i}`] = adj(c); });
        const p = spots[what];
        if (!p) return Object.keys(spots);
        if (what === 'vault' || what === 'wyrm' || what === 'grove' || what === 'item') { for (let i = 0; i < 8; i++) R.cleared.add(i); this.encs.forEach((s, i) => s?.setVisible(!R.cleared.has(i))); this.checkGates(); }
        this.skipDialogue();
        this.pos = { ...p }; this.trail = [{ ...p }, { ...p }]; this.stepT = 1; this.placeParty(); this.enterRegion();
        const face = what === 'merchant' ? this.ev.merchant : what.startsWith('ev') ? this.evChests[+what.slice(2)] : null;
        this.dir = face ? ((Object.keys(DIRS) as Dir[]).find((k) => p.x + DIRS[k][0] === face.x && p.y + DIRS[k][1] === face.y) ?? 'up')
          : what === 'shop' || what === 'quest' || what === 'grove' ? 'up' : what === 'item' ? 'left' : 'right';
        this.player.setFrame(DIRS[this.dir][2]);
        return p;
      },
      // Load test (tests/accept.py): the showcase fight with a combo every turn, forever (use with god).
      flood: () => { R.flood = true; if (!battleOn()) (hooks.debug.showcase as () => void)(); },
      // Jump straight into battle n: 0-7 map encounters, 8 boss, 9 Wyrm, 10 mimic.
      fight: (n: number) => { if (!battleOn()) { this.skipDialogue(); if (n === MIMIC) this.mimicAt = 0; this.startBattle(Math.max(0, Math.min(10, Math.floor(n)))); } },
      wyrm: () => { if (!battleOn()) { this.skipDialogue(); this.startBattle(WYRM); } },
      secrets: () => [...R.secrets],
      // Give party member i a status (leak, frozen, throttled, focused) for screenshots and tests.
      status: (i = 0, id = 'leak', turns = 3) => { const m = R.party[i]; if (m && id in STATUS) m.status[id as StatusId] = turns; if (battleOn()) battle().refreshRows(); return m?.status; },
      botGoal: () => this.bot.goal,
      events: () => ({ merchant: this.ev.merchant, stock: this.ev.stock, chests: this.evChests.map((c) => ({ x: c.x, y: c.y, mimic: c.mimic, opened: c.opened })) }),
      mimic: () => { if (!battleOn()) { this.skipDialogue(); this.mimicAt = this.evChests.findIndex((c) => !c.opened); this.startBattle(MIMIC); } },
      saga: () => saga(),
    };
  }
}
