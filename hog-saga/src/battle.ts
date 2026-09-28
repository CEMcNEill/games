// Hog Saga battles: classic turn-based menus. Each round everyone acts in speed order; party
// members pick FIGHT / SKILL / ITEM / SCAN / DEFEND / RUN, or SHIP IT! when the meter is full.
// Skills are PostHog products. Hits have a kind (strike/magic/data); weak hits knock a shield point
// off and at zero the foe BREAKs. Enemy AI scripts live in ai.ts, the numbers in rules.ts.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { flash, shake, hitstop, burst } from '@shared/juice';
import { text, box, bar, PixelText, W } from '@shared/ui';
import {
  publishStats, R, ARCH, BOSS, ENCOUNTERS, SKILLS, ITEMS, Arch, ItemId, Member, SkillId, stat, levelUp, xpNext, endData,
  skillLine, featured, productName, knows, gearCrit, gearMagic, gearHeal, gearDef,
} from './state';
import {
  AFFINITY, FoeKey, Kind, KIND_ICON, KIND_NAME, ICON, STATUS, StatusId, COMBOS, ComboId, METER, WEAK_MULT, RESIST_MULT,
  BREAK_MULT, LEAK_FRAC, CRIT_BASE, CRIT_FOCUSED, BACK_ROW, SOLO,
} from './rules';
import { foeMove, partyMove, randomVictim, BattleView, FoeMove } from './ai';
import { FOE_MOVES, SELF_MOVES } from './foemoves';
import { onWin, onBattleEnd } from './progress';
import { hasFx } from './gear';
import { MIMIC as MIMIC_DEF } from './world';
import { slash, sparkle, pop, cutIn, jingle, VICTORY, FANFARE, reveal, battleMusic } from './fx';

export interface Foe {
  name: string; pain: string; arch: Arch | 'boss' | 'wyrm'; key: FoeKey; sprite: string;
  hp: number; maxHp: number; atk: number; def: number; mag: number; spd: number; xp: number;
  alive: boolean; exposed: number; weak: number; hardened: number;
  status: Partial<Record<StatusId, number>>;
  shield: number; maxShield: number;
  /** 0 = fine; 1 = broken, will skip its next turn; 2 = skipped, recovers at the end of the round. */
  broken: number;
  guarding: Foe | null; guardedBy: Foe | null;
  windup: boolean; telegraph: boolean; charge: number; phase: number; canRollback: boolean;
  s: Phaser.GameObjects.Sprite; hpBar: Phaser.GameObjects.Graphics; icons: Phaser.GameObjects.GameObject[];
  alert: Phaser.GameObjects.Image | null; x: number; y: number;
}

export type Act =
  | { kind: 'fight'; target: Foe }
  | { kind: 'skill'; id: SkillId; target?: Foe | Member }
  | { kind: 'item'; id: ItemId; target: Member }
  | { kind: 'scan'; target: Foe }
  | { kind: 'combo'; id: ComboId; target?: Foe }
  | { kind: 'defend' }
  | { kind: 'run' };

type Actor = { side: 'party'; m: Member } | { side: 'foe'; f: Foe };
type Cmd = 'SHIP IT!' | 'FIGHT' | 'SKILL' | 'ITEM' | 'SCAN' | 'DEFEND' | 'RUN';

const ROW = 13;
const ROW2 = 27;
const MENU_Y = 172;
const BACKDROPS = [
  ['#3cbcfc', '#a4e4fc', '#58d854', '#00b800'],   // meadow
  ['#004058', '#005800', '#503000', '#000000'],   // forest / cave
  ['#fca044', '#f8d878', '#f0d0b0', '#ac7c00'],   // desert
];
const KIND_COLOUR: Record<Kind, number> = { strike: 0xfcfcfc, magic: 0x3cbcfc, data: 0x00e8d8 };
const isBossLike = (f: Foe) => f.arch === 'boss' || f.arch === 'wyrm';

export class BattleScene extends Phaser.Scene {
  private enc = 0;
  private foes: Foe[] = [];
  private order: Actor[] = [];
  private turn = 0;
  private round = 0;
  private shield = 0;
  private scanned = false;
  private defending = new Set<Member>();
  private msg!: PixelText;
  private rows: { name: PixelText; hp: ReturnType<typeof bar>; mp: ReturnType<typeof bar>; hpT: PixelText; mpT: PixelText; lv: PixelText;
    s: Phaser.GameObjects.Sprite; y: number; icons: Phaser.GameObjects.Image[] }[] = [];
  private meterUi!: { g: Phaser.GameObjects.Graphics; t: PixelText };
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private cursor!: Phaser.GameObjects.Graphics;
  private ui: { mode: 'none' | 'cmd' | 'skill' | 'item' | 'combo' | 'foe' | 'ally'; sel: number; member: Member | null; pending: Act | null; list: any[] } =
    { mode: 'none', sel: 0, member: null, pending: null, list: [] };
  private over = false;
  private xpGain = 0;
  private region = 0;
  private tipShown = false;

  constructor() { super('Battle'); }

  create(data: { enc: number; region: number; showcase?: boolean }) {
    this.region = data.region;
    this.enc = data.enc;
    this.over = false;
    this.shield = 0;
    this.round = 0;
    this.scanned = false;
    this.defending = new Set();
    this.foes = [];
    this.rows = [];
    this.menuObjs = [];
    this.ui = { mode: 'none', sel: 0, member: null, pending: null, list: [] };
    this.xpGain = 0;
    this.breaks = 0;
    this.minHp = 1;
    this.startRounds = R.rounds;
    this.startHp = Math.round((R.party.reduce((a, m) => a + m.hp, 0) / R.party.reduce((a, m) => a + m.maxHp, 0)) * 100) / 100;
    hooks.scene = 'Battle';
    hooks.state = 'battle';
    R.battles++;
    for (const m of R.party) m.status = {};
    const ui = K.ui;
    this.drawBackdrop(data.region);
    this.spawnFoes();
    // Message box (top) and the Ship It meter under it
    box(this, 6, 4, W - 12, 20, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    this.msg = text(this, 14, 9, '', { depth: 101, maxWidth: W - 28, maxLines: 1 });
    box(this, W - 128, 26, 122, 13, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    this.meterUi = { g: this.add.graphics().setDepth(101), t: text(this, W - 123, 29, 'SHIP IT', { depth: 101, color: ui.dimInt }) };
    // Bottom panels
    box(this, 6, 166, 134, 100, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    box(this, 144, 166, W - 150, 100, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    const rowH = R.party.length === 1 ? 0 : 32;
    R.party.forEach((m, i) => {
      const y = 170 + i * rowH;
      const s = this.add.sprite(this.homeX(m), y + 15, spr(m.sprite), 0).setScale(2).setDepth(101);
      if (m.row === 'back') text(this, 150, y + 22, 'B', { depth: 102, color: K.ui.dimInt });
      if (m.sprite !== 'hero') s.play(anim(m.sprite));
      const name = text(this, 186, y + 2, '', { depth: 101 });
      const hp = bar(this, 290, y + 5, 70, 4, 0x58d854, 0x000000, ui.panelInt);
      const mp = bar(this, 290, y + 17, 70, 4, 0x3cbcfc, 0x000000, ui.panelInt);
      hp.g.setScrollFactor(0).setDepth(101);
      mp.g.setScrollFactor(0).setDepth(101);
      const hpT = text(this, W - 12, y + 2, '', { align: 'right', depth: 101 });
      const mpT = text(this, W - 12, y + 14, '', { align: 'right', depth: 101, color: ui.dimInt });
      const lv = text(this, 186, y + 14, `LV ${m.lv}`, { depth: 101, color: ui.dimInt });
      text(this, 276, y + 2, 'HP', { depth: 101, color: ui.dimInt });
      text(this, 276, y + 14, 'MP', { depth: 101, color: ui.dimInt });
      const icons = [0, 1, 2, 3].map((k) => this.add.image(226 + k * 10, y + 17, spr('saga_icons'), 0).setDepth(102).setVisible(false));
      this.rows.push({ name, hp, mp, hpT, mpT, lv, s, y, icons });
    });
    this.cursor = this.add.graphics().setDepth(150);
    this.refreshRows();
    this.drawMeter();
    const kb = this.input.keyboard!;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    reveal(this);
    battleMusic(this, isBossLike(this.foes[0]) ? 'boss' : 'battle');
    const names = [...new Set(this.foes.map((f) => f.name))];
    capture('battle_started', { enc: this.enc, boss: this.enc === BOSS });
    if (this.enc === BOSS) {
      this.say(`${this.foes[0].name}: "${K.theme.game.boss.taunt}"`, 1600, () => this.startRound());
    } else if (this.foes[0].arch === 'wyrm') {
      this.say(`${this.foes[0].name}: "${this.foes[0].pain}"`, 1600, () => this.startRound());
    } else {
      const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      this.say(`${who} appear${names.length === 1 && this.foes.length === 1 ? 's' : ''}!`, 1000,
        () => this.say(`"${this.foes[0].pain}"`, 1200, () => this.startRound()));
    }
  }

  private minHp = 1;
  private startRounds = 0;
  private startHp = 1;

  private logBattle() {
    onBattleEnd(this.enc, this.battleBreaks());
    R.log.push({ enc: this.enc, rounds: R.rounds - this.startRounds, startHp: this.startHp, minHp: Math.round(this.minHp * 100) / 100,
      ko: R.party.filter((m) => m.hp <= 0).length, lv: R.party[0].lv });
  }

  update(_t: number, dtMs: number) {
    publishStats(hooks);
    if (!this.over) hooks.elapsed += (Math.min(dtMs, 50) / 1000) * R.speed;
    const f = R.party.reduce((a, m) => a + m.hp, 0) / R.party.reduce((a, m) => a + m.maxHp, 0);
    if (f < this.minHp) this.minHp = f;
    // Autopilot switched on while a menu is waiting: let the bot take this turn.
    if (R.autopilot && !this.over && this.ui.mode !== 'none' && this.ui.member) {
      const m = this.ui.member;
      this.clearMenu();
      this.ui.mode = 'none';
      this.perform(m, partyMove(this.view(), m));
    }
    if (this.ui.mode === 'foe') this.drawCursor();
    for (const fo of this.foes) if (fo.alert) fo.alert.y = this.alertY(fo) + (Math.floor(this.time.now / 250) % 2) * 2;
  }

  view(): BattleView {
    return { foes: this.aliveFoes(), boss: isBossLike(this.foes[0]), shield: this.shield, round: this.round, scanned: this.scanned,
      hasItems: R.mode !== 'noitems' };
  }

  // ---------------------------------------------------------------- setup
  private drawBackdrop(region: number) {
    const g = this.add.graphics().setDepth(0);
    const cols = region === 3 ? this.lairColours() : BACKDROPS[region] ?? BACKDROPS[0];
    const toInt = (c: string) => parseInt(c.replace('#', ''), 16);
    const bands = [[0, 60, cols[0]], [60, 110, cols[1]], [110, 132, cols[2]], [132, 166, cols[3]]] as [number, number, string][];
    for (const [y0, y1, c] of bands) g.fillStyle(toInt(c), 1).fillRect(0, y0, W, y1 - y0);
    g.fillStyle(toInt(cols[1]), 1);
    for (let x = 0; x < W; x += 4) g.fillRect(x + ((x / 4) % 2) * 2, 58, 2, 2);
    g.fillStyle(toInt(cols[3]), 1);
    for (let x = 0; x < W; x += 4) g.fillRect(x + ((x / 4) % 2) * 2, 130, 2, 2);
    g.fillStyle(0x000000, 0.35).fillEllipse(W / 2, 140, 360, 22);
  }

  /** Lair backdrop: dark red or dark violet, whichever stands further from the boss sprite's colour. */
  private lairColours(): string[] {
    const sets = [['#000000', '#881400', '#a81000', '#503000'], ['#000000', '#4428bc', '#6844fc', '#0000bc'], ['#000000', '#7c7c7c', '#bcbcbc', '#7c7c7c']];
    const avg = avgColour(this, spr('boss'));
    if (!avg) return sets[0];
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const d = (set: string[]) => Math.min(...set.slice(1).map((c) => rgb(c).reduce((a, v, i) => a + (v - avg[i]) ** 2, 0)));
    return [...sets].sort((a, b) => d(b) - d(a))[0];
  }

  private spawnFoes() {
    const g = K.theme.game;
    const solo = R.mode === 'solo' ? SOLO.hp : 1;
    const mult = { hp: R.diff.hp * solo, dmg: R.diff.dmg };
    const heat = R.heatDef;
    const ng = 1 + 0.6 * R.ng;
    if (this.enc === BOSS) {
      this.addFoe({ name: g.boss.name, pain: g.boss.taunt, arch: 'boss', key: 'boss', sprite: 'boss', hp: 1400 * mult.hp * heat.hp * ng,
        atk: 33 * (1 + 0.25 * R.ng), def: 15, mag: 29 * (1 + 0.25 * R.ng), spd: 11, xp: 0 }, W / 2, 140, 1.7);
      this.foes[0].canRollback = false;
      return;
    }
    if (this.enc === WYRM) {
      this.addFoe({ name: WYRM_NAME, pain: WYRM_TAUNT, arch: 'wyrm', key: 'wyrm', sprite: 'wyrm', hp: 1500 * mult.hp * heat.hp * ng,
        atk: 36 * (1 + 0.15 * R.ng), def: 17, mag: 31 * (1 + 0.15 * R.ng), spd: 12, xp: 220 }, W / 2, 140, 1.7);
      return;
    }
    if (this.enc === MIMIC) {
      const t = 2 + this.region * 2.5 + R.ng * 5;
      const a = ARCH.fast;
      this.addFoe({ name: MIMIC_DEF.name, pain: MIMIC_DEF.pain, arch: 'fast', key: 'fast', sprite: 'chest', hp: Math.round(a.hp * 2.2 * (1 + 0.22 * (t - 1)) * mult.hp * heat.hp),
        atk: a.atk * (1 + 0.16 * (t - 1)), def: a.def * (1 + 0.22 * (t - 1)), mag: a.mag, spd: a.spd + t * 0.3, xp: Math.round(a.xp * 2 * (1 + 0.45 * (t - 1))) }, W / 2, 134, 4);
      return;
    }
    const e = ENCOUNTERS[this.enc];
    let ids: number[] = [];
    for (const i of e.group) {
      ids.push(i);
      if ((g.enemies[i]?.archetype ?? 'swarm') === 'swarm') ids.push(i); // swarms come in pairs
    }
    if (heat.extra && ids.length < 3) ids.push(e.group[0]);   // hotter runs: bigger formations
    ids = ids.slice(0, 3);
    const tier = e.tier + R.ng * 5;
    const sc = 1 + 0.22 * (tier - 1);     // toughness grows faster than hitting power
    const sa = 1 + 0.16 * (tier - 1);
    const xs = ids.length === 1 ? [W / 2] : ids.length === 2 ? [W / 2 - 70, W / 2 + 70] : [W / 2 - 120, W / 2, W / 2 + 120];
    ids.forEach((i, k) => {
      const def = g.enemies[i] ?? g.enemies[0];
      const arch = (def.archetype in ARCH ? def.archetype : 'swarm') as Arch;
      const a = ARCH[arch];
      this.addFoe({ name: def.name, pain: def.pain, arch, key: arch, sprite: `enemy_${i + 1}`,
        hp: Math.round(a.hp * sc * mult.hp * heat.hp), atk: a.atk * sa, def: a.def * sc, mag: a.mag * sa, spd: a.spd + tier * 0.3,
        xp: Math.round(a.xp * (1 + 0.45 * (e.tier - 1))) }, xs[k], 134, 2);
    });
  }

  private addFoe(d: { name: string; pain: string; arch: Foe['arch']; key: FoeKey; sprite: string; hp: number; atk: number; def: number; mag: number; spd: number; xp: number },
    x: number, y: number, scale: number) {
    const s = this.add.sprite(x, y, spr(d.sprite)).setOrigin(0.5, 1).setScale(scale).setDepth(10).play(anim(d.sprite));
    s.anims.setProgress(Math.random());
    const hpBar = this.add.graphics().setDepth(11);
    const sh = AFFINITY[d.key].shield;
    const f: Foe = { ...d, hp: Math.round(d.hp), maxHp: Math.round(d.hp), alive: true, exposed: 0, weak: 0, hardened: 0, status: {},
      shield: sh, maxShield: sh, broken: 0, guarding: null, guardedBy: null, windup: false, telegraph: false, charge: 0, phase: 1,
      canRollback: false, s, hpBar, icons: [], alert: null, x, y };
    this.foes.push(f);
    this.drawFoeBar(f);
  }

  private drawFoeBar(f: Foe) {
    const w = isBossLike(f) ? 100 : 40;
    const x = Math.round(f.x - w / 2), y = f.y + 4;
    f.hpBar.clear();
    f.icons.forEach((o) => o.destroy());
    f.icons = [];
    if (!f.alive) { f.alert?.destroy(); f.alert = null; return; }
    f.hpBar.fillStyle(0x000000).fillRect(x - 1, y - 1, w + 2, 5).fillStyle(0x7c7c7c).fillRect(x, y, w, 3)
      .fillStyle(f.hp / f.maxHp < 0.3 ? 0xf83800 : 0xf8b800).fillRect(x, y, Math.max(0, Math.round((w * f.hp) / f.maxHp)), 3);
    if (f.exposed > 0) f.hpBar.fillStyle(0xf83800).fillRect(x + w + 3, y - 1, 3, 5);
    if (f.weak > 0) f.hpBar.fillStyle(0xf85898).fillRect(x + w + 7, y - 1, 3, 5);
    // Icon row: shield (or BREAK), weak kind, resisted kind, statuses.
    const aff = AFFINITY[f.key];
    let ix = Math.round(f.x - 26);
    const iy = y + 10;
    const icon = (frame: number) => { f.icons.push(this.add.image(ix + 4, iy, spr('saga_icons'), frame).setDepth(12)); ix += 9; };
    const label = (s: string, c: number) => { f.icons.push(text(this, ix, iy - 3, s, { depth: 12, color: c })); ix += s.length * 6; };
    const plate = this.add.graphics().setDepth(11);
    f.icons.push(plate);
    icon(f.broken ? ICON.brk : ICON.armor);
    label(f.broken ? '' : String(f.shield), 0xfcfcfc);
    ix += 3;
    label('W', 0x58d854);
    icon(knows(f.key, 'weak') ? KIND_ICON[aff.weak] : ICON.unknown);
    ix += 2;
    label('R', 0xbcbcbc);
    icon(knows(f.key, 'resist') ? KIND_ICON[aff.resist] : ICON.unknown);
    ix += 2;
    for (const k of Object.keys(f.status) as StatusId[]) if ((f.status[k] ?? 0) > 0) icon(STATUS[k].icon);
    const x0 = Math.round(f.x - 26) - 2;
    plate.fillStyle(0x000000, 0.55).fillRect(x0, iy - 5, ix - x0, 10);
    const warn = f.windup || f.telegraph;
    if (warn && !f.alert) f.alert = this.add.image(this.alertX(f), this.alertY(f), spr('saga_icons'), ICON.alert).setScale(2).setDepth(13);
    if (!warn && f.alert) { f.alert.destroy(); f.alert = null; }
  }

  /** Where the red "!" goes: above small foes, beside big ones (the top boxes would hide it). */
  private alertX(f: Foe) { return isBossLike(f) ? f.x + f.s.displayWidth / 2 + 10 : f.x; }
  private alertY(f: Foe) { return Math.max(50, f.y - f.s.displayHeight - 8); }

  refreshRows() {
    const ui = K.ui;
    R.party.forEach((m, i) => {
      const r = this.rows[i];
      const ko = m.hp <= 0;
      r.name.setText(m.name).setColor(ko ? 0x7c7c7c : this.ui.member === m ? ui.accentInt : ui.textInt);
      r.hp.draw(m.hp / m.maxHp, ko ? 0x7c7c7c : m.hp / m.maxHp < 0.3 ? 0xf83800 : 0x58d854);
      r.mp.draw(m.mp / m.maxMp, 0x3cbcfc);
      r.hpT.setText(ko ? 'KO' : `${m.hp}/${m.maxHp}`).setColor(ko ? 0xf83800 : ui.textInt);
      r.mpT.setText(`${m.mp}/${m.maxMp}`);
      r.lv.setText(`LV ${m.lv}`);
      r.s.setAlpha(ko ? 0.35 : 1).setAngle(ko ? 90 : 0);
      const st = (Object.keys(m.status) as StatusId[]).filter((k) => (m.status[k] ?? 0) > 0);
      r.icons.forEach((ic, k) => { ic.setVisible(!ko && k < st.length); if (k < st.length) ic.setFrame(STATUS[st[k]].icon); });
    });
  }

  private drawMeter() {
    const g = this.meterUi.g.clear();
    const x = W - 78, y = 30, w = 68;
    const full = R.meter >= METER.max;
    g.fillStyle(0x000000).fillRect(x - 1, y - 1, w + 2, 7).fillStyle(0x3c3c3c).fillRect(x, y, w, 5);
    const col = full ? (Math.floor(this.time.now / 150) % 2 ? 0xf8b800 : 0xfcfcfc) : K.ui.accentInt;
    g.fillStyle(col).fillRect(x, y, Math.round((w * Math.min(R.meter, METER.max)) / METER.max), 5);
    this.meterUi.t.setText(full ? 'READY!' : 'SHIP IT').setColor(full ? 0xf8b800 : K.ui.dimInt);
    if (full && !this.meterBlink) {
      this.meterBlink = this.time.addEvent({ delay: 150, loop: true, callback: () => this.drawMeter() });
    } else if (!full && this.meterBlink) { this.meterBlink.remove(); this.meterBlink = null; }
  }
  private meterBlink: Phaser.Time.TimerEvent | null = null;

  private addMeter(n: number) {
    if (this.over) return;
    const was = R.meter;
    R.meter = Math.min(METER.max, R.meter + n);
    if (was < METER.max && R.meter >= METER.max) {
      K.play('ready', 0.6);
      burst(this, W - 44, 32, 0xf8b800, 16, { colours: [0xfcfcfc], speed: 80 });
    }
    this.drawMeter();
  }

  // ---------------------------------------------------------------- flow helpers
  private wait(ms: number, fn: () => void) {
    this.time.delayedCall(Math.max(16, ms / R.speed), () => { if (!this.over) fn(); });
  }

  private say(t: string, ms: number, then: () => void) {
    this.msg.setText(t);
    this.wait(ms, then);
  }

  private aliveFoes() { return this.foes.filter((f) => f.alive); }
  private aliveParty() { return R.party.filter((m) => m.hp > 0); }

  // ---------------------------------------------------------------- rounds
  private startRound() {
    if (this.over) return;
    R.rounds++;
    this.round++;
    this.scanned = false;
    this.defending.clear();
    const actors: Actor[] = [
      ...this.aliveParty().map((m) => ({ side: 'party' as const, m })),
      ...this.aliveFoes().map((f) => ({ side: 'foe' as const, f })),
    ];
    const spd = (a: Actor) => {
      const st = a.side === 'party' ? a.m.status : a.f.status;
      return (a.side === 'party' ? a.m.spd : a.f.spd) * Phaser.Math.FloatBetween(0.8, 1.2) * ((st.throttled ?? 0) > 0 ? 0.3 : 1);
    };
    this.order = actors.map((a) => ({ a, s: spd(a) })).sort((p, q) => q.s - p.s).map((p) => p.a);
    this.turn = 0;
    this.nextTurn();
  }

  private nextTurn() {
    if (this.over) return;
    if (this.checkEnd()) return;
    while (this.turn < this.order.length) {
      const a = this.order[this.turn++];
      if (a.side === 'party' && a.m.hp > 0) { this.partyTurn(a.m); return; }
      if (a.side === 'foe' && a.f.alive) { this.foeTurn(a.f); return; }
    }
    this.endRound();
  }

  private endRound() {
    if (this.shield > 0) this.shield--;
    // Memory leaks tick; statuses count down; broken foes that sat out a turn recover.
    const leaks: (() => void)[] = [];
    for (const m of this.aliveParty()) {
      if ((m.status.leak ?? 0) > 0) leaks.push(() => this.leakTick(m));
    }
    for (const f of this.aliveFoes()) {
      if ((f.status.leak ?? 0) > 0) leaks.push(() => this.leakTickFoe(f));
    }
    for (const m of R.party) {
      tickStatus(m.status);
      if (m.hp > 0 && hasFx(m, 'mpRegen')) m.mp = Math.min(m.maxMp, m.mp + 2);
    }
    for (const f of this.foes) {
      if (f.exposed > 0) f.exposed--;
      if (f.weak > 0) f.weak--;
      if (f.hardened > 0) f.hardened--;
      tickStatus(f.status);
      if (f.broken === 2) { f.broken = 0; f.shield = f.maxShield; }
      this.drawFoeBar(f);
    }
    this.refreshRows();
    if (!leaks.length) { this.startRound(); return; }
    leaks.forEach((fn) => fn());
    this.msg.setText('Memory leaks drain HP...');
    this.wait(600, () => { this.refreshRows(); if (!this.checkEnd()) this.startRound(); });
  }

  private leakTick(m: Member) {
    const d = Math.max(1, Math.round(m.maxHp * LEAK_FRAC));
    if (R.god) return;
    m.hp = Math.max(1, m.hp - d);
    const r = this.rows[R.party.indexOf(m)];
    pop(this, r.s.x, r.y + 4, `${d}`, STATUS.leak.color);
  }

  private leakTickFoe(f: Foe) {
    const d = Math.max(1, Math.round(f.maxHp * LEAK_FRAC * (isBossLike(f) ? 0.3 : 1)));
    f.hp = Math.max(0, f.hp - d);
    pop(this, f.x, f.y - f.s.displayHeight / 2, `${d}`, STATUS.leak.color);
    if (f.hp <= 0) this.killFoe(f);
    this.drawFoeBar(f);
  }

  private checkEnd(): boolean {
    if (this.aliveFoes().length === 0) { this.victory(); return true; }
    if (this.aliveParty().length === 0) { this.defeat(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- party turn + menus
  private partyTurn(m: Member) {
    if (R.flood) { R.meter = METER.max; this.drawMeter(); }
    this.ui.member = m;
    hooks.state = 'battle';
    this.refreshRows();
    if ((m.status.frozen ?? 0) > 0) {
      delete m.status.frozen;
      K.play('status', 0.5);
      this.say(`${m.name} is FROZEN and can't move!`, 800, () => { this.ui.member = null; this.refreshRows(); this.nextTurn(); });
      return;
    }
    if (R.autopilot) {
      const act = partyMove(this.view(), m);
      this.wait(250, () => this.perform(m, act));
      return;
    }
    if (!this.tipShown && this.round === 1 && R.battles <= 2 && this.aliveFoes().some((f) => !knows(f.key, 'weak'))) {
      this.tipShown = true;
      this.msg.setText('Tip: SCAN a foe to see its weak spot (W).');
    } else {
      const st = (Object.keys(m.status) as StatusId[]).filter((k) => (m.status[k] ?? 0) > 0).map((k) => STATUS[k].name);
      this.msg.setText(st.length ? `${m.name}'s turn (${st.join(', ')}). What will ${m.name} do?` : `${m.name}'s turn. What will ${m.name} do?`);
    }
    this.openCmd();
  }

  private clearMenu() {
    this.menuObjs.forEach((o) => o.destroy());
    this.menuObjs = [];
    this.cursor.clear();
  }

  private cmds(): Cmd[] {
    const out: Cmd[] = [];
    if (R.meter >= METER.max && this.comboOptions(this.ui.member!).length) out.push('SHIP IT!');
    out.push('FIGHT', 'SKILL', 'ITEM', 'SCAN', 'DEFEND', 'RUN');
    return out;
  }

  private openCmd() {
    this.clearMenu();
    this.ui.mode = 'cmd';
    const cmds = this.cmds();
    this.ui.list = cmds;
    const ui = K.ui;
    cmds.forEach((c, i) => {
      const dim = (c === 'RUN' && isBossLike(this.foes[0])) || (c === 'SKILL' && !this.ui.member!.skills.length) || (c === 'ITEM' && R.mode === 'noitems');
      const col = c === 'SHIP IT!' ? 0xf8b800 : dim ? 0x7c7c7c : ui.textInt;
      this.menuObjs.push(text(this, 26, MENU_Y + i * ROW, c, { depth: 101, color: col }));
    });
    this.ui.sel = Math.min(this.ui.sel, cmds.length - 1);
    this.drawCursor();
  }

  private openSkills() {
    const m = this.ui.member!;
    this.clearMenu();
    this.ui.mode = 'skill';
    this.ui.list = m.skills;
    const ui = K.ui;
    m.skills.forEach((id, i) => {
      const s = SKILLS[id];
      const ok = m.mp >= s.mp;
      const y = MENU_Y + i * ROW2;
      const nm = (featured(id) ? '*' : '') + (s.name.length > 15 ? s.name.replace('Analytics', 'Anlytcs') : s.name);
      this.menuObjs.push(text(this, 22, y, nm, { depth: 101, color: ok ? ui.textInt : 0x7c7c7c }));
      if (s.kind) {
        this.menuObjs.push(this.add.image(30, y + 13, spr('saga_icons'), KIND_ICON[s.kind]).setDepth(101));
        this.menuObjs.push(text(this, 38, y + 10, KIND_NAME[s.kind], { depth: 101, color: ui.dimInt }));
      }
      this.menuObjs.push(text(this, 134, y + 10, `${s.mp}MP`, { depth: 101, align: 'right', color: ui.dimInt }));
    });
    this.ui.sel = 0;
    this.drawCursor();
  }

  private openItems() {
    this.clearMenu();
    this.ui.mode = 'item';
    const ids = (Object.keys(ITEMS) as ItemId[]);
    this.ui.list = ids;
    const ui = K.ui;
    ids.forEach((id, i) => {
      const n = R.items[id];
      this.menuObjs.push(this.add.image(24, MENU_Y + 4 + i * ROW, spr(`item_${id}`)).setDepth(101));
      this.menuObjs.push(text(this, 32, MENU_Y + i * ROW, `${ITEMS[id].name} x${n}`, { depth: 101, color: n > 0 ? ui.textInt : 0x7c7c7c }));
    });
    this.ui.sel = 0;
    this.drawCursor();
  }

  private comboOptions(m: Member): ComboId[] {
    return (Object.keys(COMBOS) as ComboId[]).filter((id) => {
      const pair = COMBOS[id].pair;
      if (!pair.includes(m.cls)) return false;
      if (pair.length === 1) return R.party.length === 1;
      return pair.filter((c) => c !== m.cls).every((c) => R.party.some((p) => p.cls === c && p.hp > 0 && !(p.status.frozen ?? 0)));
    });
  }

  private openCombos() {
    const m = this.ui.member!;
    this.clearMenu();
    this.ui.mode = 'combo';
    this.ui.list = this.comboOptions(m);
    this.ui.list.forEach((id: ComboId, i: number) => {
      this.menuObjs.push(text(this, 22, MENU_Y + i * ROW2, COMBOS[id].name, { depth: 101, color: 0xf8b800 }));
      const partner = COMBOS[id].pair.filter((c) => c !== m.cls).map((c) => R.party.find((p) => p.cls === c)?.name ?? '').join('');
      this.menuObjs.push(text(this, 22, MENU_Y + i * ROW2 + 10, partner ? `with ${partner}` : 'alone', { depth: 101, color: K.ui.dimInt }));
    });
    this.ui.sel = 0;
    this.drawCursor();
  }

  private drawCursor() {
    const c = this.cursor.clear();
    const ui = K.ui;
    const { mode, sel } = this.ui;
    if (mode === 'cmd' || mode === 'skill' || mode === 'item' || mode === 'combo') {
      const step = mode === 'combo' || mode === 'skill' ? ROW2 : ROW;
      const y = MENU_Y + 1 + sel * step;
      c.fillStyle(ui.accentInt).fillTriangle(12, y, 12, y + 8, 17, y + 4);
      if (mode === 'skill') {
        const id = this.ui.list[sel] as SkillId;
        this.msg.setText(`${SKILLS[id].name}: ${skillLine(id)}`);
      } else if (mode === 'item') {
        const id = this.ui.list[sel] as ItemId;
        this.msg.setText(`${ITEMS[id].name}: ${ITEMS[id].line}`);
      } else if (mode === 'combo') {
        const id = this.ui.list[sel] as ComboId;
        this.msg.setText(`${COMBOS[id].name}: ${COMBOS[id].line}`);
      } else {
        const cmd = this.ui.list[sel] as Cmd;
        if (cmd === 'SCAN') this.msg.setText('SCAN: reveal a foe\'s weak spot and resistance.');
        else if (cmd === 'SHIP IT!') this.msg.setText('SHIP IT! The meter is full: team up for a combo!');
        else if (cmd === 'DEFEND') this.msg.setText('DEFEND: half damage, and FOCUS (crits) next round.');
      }
    } else if (mode === 'foe') {
      const f = this.ui.list[sel] as Foe;
      const bob = Math.floor(this.time.now / 200) % 2 * 2;
      const top = f.y - f.s.displayHeight + 2 + bob;
      c.fillStyle(0x000000).fillTriangle(f.x - 8, top - 12, f.x + 8, top - 12, f.x, top - 2);
      c.fillStyle(ui.accentInt).fillTriangle(f.x - 6, top - 11, f.x + 6, top - 11, f.x, top - 4);
      const aff = AFFINITY[f.key];
      const w = knows(f.key, 'weak') ? KIND_NAME[aff.weak] : '?';
      const r = knows(f.key, 'resist') ? KIND_NAME[aff.resist] : '?';
      this.msg.setText(`Target: ${f.name}  (weak ${w}, resists ${r})`);
    } else if (mode === 'ally') {
      const m = this.ui.list[sel] as Member;
      const r = this.rows[R.party.indexOf(m)];
      c.fillStyle(ui.accentInt).fillTriangle(148, r.y + 10, 148, r.y + 20, 153, r.y + 15);
      this.msg.setText(`Use on ${m.name}?`);
    }
  }

  private onKey(e: KeyboardEvent) {
    if (this.over || R.autopilot) return;
    const { mode } = this.ui;
    if (mode === 'none') return;
    const n = this.ui.list.length;
    const up = ['ArrowUp', 'KeyW'].includes(e.code), down = ['ArrowDown', 'KeyS'].includes(e.code);
    const left = ['ArrowLeft', 'KeyA'].includes(e.code), right = ['ArrowRight', 'KeyD'].includes(e.code);
    const ok = ['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat;
    const back = ['Escape', 'Backspace', 'KeyX'].includes(e.code);
    if ((mode === 'foe' ? left : up)) { this.ui.sel = (this.ui.sel + n - 1) % n; K.play('move', 0.4); this.drawCursor(); return; }
    if ((mode === 'foe' ? right : down)) { this.ui.sel = (this.ui.sel + 1) % n; K.play('move', 0.4); this.drawCursor(); return; }
    if (mode === 'foe' && (up || down)) return;
    if (back) {
      if (mode === 'skill' || mode === 'item' || mode === 'combo') { K.play('back'); this.ui.sel = 0; this.openCmd(); }
      else if (mode === 'foe' || mode === 'ally') { K.play('back'); this.ui.pending = null; this.ui.sel = 0; this.openCmd(); }
      return;
    }
    if (!ok) return;
    const m = this.ui.member!;
    if (mode === 'cmd') {
      const c = this.ui.list[this.ui.sel] as Cmd;
      if (c === 'SHIP IT!') { K.play('select'); this.openCombos(); }
      else if (c === 'FIGHT') { K.play('select'); this.ui.pending = { kind: 'fight', target: this.aliveFoes()[0] }; this.pickFoe(); }
      else if (c === 'SKILL') { if (!m.skills.length) return; K.play('select'); this.openSkills(); }
      else if (c === 'ITEM') {
        if (R.mode === 'noitems') { K.play('bump'); this.msg.setText('No items in this challenge!'); return; }
        K.play('select'); this.openItems();
      }
      else if (c === 'SCAN') { K.play('select'); this.ui.pending = { kind: 'scan', target: this.aliveFoes()[0] }; this.pickFoe(); }
      else if (c === 'DEFEND') { K.play('select'); this.commit({ kind: 'defend' }); }
      else if (c === 'RUN') { if (isBossLike(this.foes[0])) { K.play('bump'); this.msg.setText("You can't run from this one!"); return; } K.play('select'); this.commit({ kind: 'run' }); }
    } else if (mode === 'combo') {
      const id = this.ui.list[this.ui.sel] as ComboId;
      K.play('select');
      if (id === 'hotfix_rush') { this.ui.pending = { kind: 'combo', id }; this.pickFoe(); }
      else this.commit({ kind: 'combo', id });
    } else if (mode === 'skill') {
      const id = this.ui.list[this.ui.sel] as SkillId;
      const s = SKILLS[id];
      if (m.mp < s.mp) { K.play('bump'); this.msg.setText('Not enough MP!'); return; }
      K.play('select');
      this.ui.pending = { kind: 'skill', id };
      if (s.target === 'enemy') this.pickFoe();
      else if (s.target === 'ally') this.pickAlly(id === 'session_replay');
      else this.commit(this.ui.pending);
    } else if (mode === 'item') {
      const id = this.ui.list[this.ui.sel] as ItemId;
      if (R.items[id] <= 0) { K.play('bump'); this.msg.setText(`No ${ITEMS[id].name}s left.`); return; }
      K.play('select');
      this.ui.pending = { kind: 'item', id, target: m };
      this.pickAlly(id === 'hotfix');
    } else if (mode === 'foe') {
      const f = this.ui.list[this.ui.sel] as Foe;
      const p = this.ui.pending!;
      K.play('select');
      if (p.kind === 'fight' || p.kind === 'scan') this.commit({ ...p, target: f });
      else if (p.kind === 'skill' || p.kind === 'combo') this.commit({ ...p, target: f });
    } else if (mode === 'ally') {
      const t = this.ui.list[this.ui.sel] as Member;
      const p = this.ui.pending!;
      K.play('select');
      if (p.kind === 'skill') this.commit({ ...p, target: t });
      else if (p.kind === 'item') this.commit({ ...p, target: t });
    }
  }

  private pickFoe() {
    this.clearMenu();
    this.ui.mode = 'foe';
    this.ui.list = this.aliveFoes();
    this.ui.sel = 0;
    this.drawCursor();
  }

  private pickAlly(koFirst: boolean) {
    this.clearMenu();
    this.ui.mode = 'ally';
    this.ui.list = [...R.party];
    const ko = R.party.findIndex((m) => m.hp <= 0);
    this.ui.sel = koFirst && ko >= 0 ? ko : R.party.indexOf([...R.party].filter((m) => m.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? R.party[0]);
    this.drawCursor();
  }

  private commit(act: Act) {
    const m = this.ui.member!;
    this.clearMenu();
    this.ui.mode = 'none';
    this.ui.sel = 0;
    this.perform(m, act);
  }

  // ---------------------------------------------------------------- damage
  private phys(atk: number, def: number) {
    return Math.max(1, Math.round((atk * 1.5 - def * 0.8) * Phaser.Math.FloatBetween(0.85, 1.15)));
  }

  /** A party member's physical hit: the back row hits for less. */
  private physBy(m: Member, atk: number, def: number) {
    return Math.max(1, Math.round(this.phys(atk, def) * (m.row === 'back' ? BACK_ROW : 1)));
  }

  private magic(mag: number, power: number, def: number) {
    return Math.max(1, Math.round((mag * power * 1.4 - def * 0.3) * Phaser.Math.FloatBetween(0.9, 1.1)));
  }

  private crit(m: Member) {
    return Math.random() < ((m.status.focused ?? 0) > 0 ? CRIT_FOCUSED : CRIT_BASE + gearCrit(m));
  }

  /** A tank guarding this foe takes single-target hits for it. */
  private guardOf(f: Foe): Foe {
    const g = f.guardedBy;
    if (g && g.alive && g.guarding === f) {
      pop(this, g.x, g.y - g.s.displayHeight - 4, 'GUARD', 0xbcbcbc);
      return g;
    }
    return f;
  }

  /** Reveal what this hit taught the party about the foe's kind. */
  private learn(f: Foe, kind: Kind) {
    const a = AFFINITY[f.key];
    if (a.weak === kind) R.known.add(`${f.key}:weak`);
    if (a.resist === kind) R.known.add(`${f.key}:resist`);
  }

  /** Party hits a foe. Applies kind, break, crit, meter and all the feel. Returns damage dealt. */
  private hitFoe(f: Foe, dmg: number, kind: Kind, opts: { crit?: boolean; quiet?: boolean } = {}): number {
    if (!f.alive) return 0;
    const a = AFFINITY[f.key];
    let mult = 1;
    let tag = '';
    if (a.weak === kind) { mult = WEAK_MULT; tag = 'WEAK!'; }
    else if (a.resist === kind) { mult = RESIST_MULT; tag = 'RESIST'; }
    const knewWeak = knows(f.key, 'weak');
    this.learn(f, kind);
    if (f.broken) mult *= BREAK_MULT;
    if (f.exposed > 0) mult *= 1.3;
    if (f.hardened > 0) mult *= 0.6;
    if (opts.crit) mult *= 1.6;
    dmg = Math.max(1, Math.round(dmg * mult));
    f.hp -= dmg;
    const cy = f.y - f.s.displayHeight / 2;
    K.play(opts.crit ? 'crit' : 'hit', 0.6, 30);
    pop(this, f.x + Phaser.Math.Between(-6, 6), cy, `${dmg}`, opts.crit ? 0xf8b800 : 0xfcfcfc, !!opts.crit);
    if (tag) {
      this.time.delayedCall(60, () => pop(this, f.x, cy - 16, tag, tag === 'WEAK!' ? 0x58d854 : 0xbcbcbc));
      K.play(tag === 'WEAK!' ? 'weak' : 'resist', 0.5, 60);
      if (tag === 'WEAK!' && !knewWeak) R.known.add(`${f.key}:weak`);
    }
    if (kind === 'strike') slash(this, f.x, cy, opts.crit ? 0xf8b800 : 0xfcfcfc);
    else sparkle(this, f.x, cy, KIND_COLOUR[kind]);
    flash(f.s, 0xffffff, 80);
    this.tweens.add({ targets: f.s, x: f.x + 4, duration: 40, yoyo: true, repeat: 1, onComplete: () => f.s.setX(f.x) });
    if (opts.crit) { hitstop(this, 70); shake(this, 3, 140); }
    let gain = METER.hit;
    if (tag === 'WEAK!') gain += METER.weak;
    // Shield and BREAK
    if (tag === 'WEAK!' && !f.broken && f.shield > 0) {
      f.shield--;
      if (f.shield <= 0) this.breakFoe(f);
      gain += f.broken ? METER.brk : 0;
    }
    this.addMeter(gain);
    if (f.hp <= 0 && R.flood) f.hp = f.maxHp; // load test: the fight never ends
    if (f.hp <= 0) this.killFoe(f);
    else this.checkPhase(f);
    this.drawFoeBar(f);
    return dmg;
  }

  private breaks = 0;
  private battleBreaks() { return this.breaks; }

  private breakFoe(f: Foe) {
    this.breaks++;
    f.broken = 1;
    f.windup = false;
    f.telegraph = false;
    R.breaks++;
    K.play('break', 0.8);
    hitstop(this, 90);
    shake(this, 4, 180);
    burst(this, f.x, f.y - f.s.displayHeight / 2, 0xf8b800, 18, { colours: [0xfcfcfc, 0xf83800] });
    this.time.delayedCall(120, () => pop(this, f.x, Math.max(56, f.y - f.s.displayHeight - 6), 'BREAK!', 0xf83800, true));
    hooks.events.push({ event: 'break', props: { arch: f.arch }, t: Math.round(performance.now()) });
  }

  private killFoe(f: Foe) {
    f.hp = 0;
    f.alive = false;
    if (f.guarding) { f.guarding.guardedBy = null; f.guarding = null; }
    R.kills++;
    this.xpGain += f.xp;
    K.play('kill', 0.7);
    burst(this, f.x, f.y - f.s.displayHeight / 2, 0xfcfcfc, 14, { colours: [K.ui.accentInt] });
    this.tweens.add({ targets: f.s, alpha: 0, scaleX: 0.2 * f.s.scaleX, duration: 400 / R.speed });
    this.drawFoeBar(f);
  }

  /** Boss phases: 2 at half health (weak spot moves), 3 at a quarter on heat 3+. */
  private checkPhase(f: Foe) {
    if (f.arch !== 'boss') return;
    if (f.phase === 1 && f.hp < f.maxHp / 2) {
      f.phase = 2;
      this.pendingPhase = 2;
    } else if (f.phase === 2 && R.heatDef.phase3 && f.hp < f.maxHp / 4) {
      f.phase = 3;
      this.pendingPhase = 3;
    }
  }
  private pendingPhase = 0;

  private healMember(m: Member, amt: number) {
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + Math.round(amt));
    const r = this.rows[R.party.indexOf(m)];
    pop(this, r.s.x, r.y + 4, `+${m.hp - before}`, 0x58d854);
  }

  private cure(m: Member) {
    for (const k of Object.keys(m.status) as StatusId[]) if (!STATUS[k].good) delete m.status[k];
  }

  /** Party sprite x in the bottom panel: the back row stands a little further back. */
  private homeX(m: Member) { return m.row === 'back' ? 172 : 166; }

  private lunge(m: Member) {
    const r = this.rows[R.party.indexOf(m)];
    if (!r) return;
    this.tweens.add({ targets: r.s, x: r.s.x - 8, y: r.s.y - 4, duration: Math.max(16, 70 / R.speed), yoyo: true,
      onComplete: () => r.s.setPosition(this.homeX(m), r.y + 15) });
  }

  // ---------------------------------------------------------------- party actions
  private perform(m: Member, act: Act) {
    if (this.over) return;
    const nextIn = (ms: number) => this.wait(ms, () => { this.refreshRows(); this.afterAction(); });
    const tgt = (f?: Foe) => this.guardOf(f && f.alive ? f : this.aliveFoes()[0]);
    switch (act.kind) {
      case 'fight': {
        const f = tgt(act.target);
        const crit = this.crit(m);
        this.lunge(m);
        this.msg.setText(`${m.name} attacks ${f.name}!${crit ? ' A critical hit!' : ''}`);
        this.hitFoe(f, this.physBy(m, stat(m, 'atk'), f.def), 'strike', { crit });
        nextIn(700);
        return;
      }
      case 'scan': {
        const f = act.target && act.target.alive ? act.target : this.aliveFoes()[0];
        const a = AFFINITY[f.key];
        R.known.add(`${f.key}:weak`);
        R.known.add(`${f.key}:resist`);
        R.scans++;
        this.scanned = true;
        K.play('scan');
        sparkle(this, f.x, f.y - f.s.displayHeight / 2, 0x00e8d8);
        this.foes.forEach((o) => this.drawFoeBar(o));
        this.msg.setText(`${m.name} scans ${f.name}: weak to ${KIND_NAME[a.weak]}, resists ${KIND_NAME[a.resist]}.`);
        nextIn(1100);
        return;
      }
      case 'defend':
        this.defending.add(m);
        m.status.focused = Math.max(m.status.focused ?? 0, 2);
        this.msg.setText(`${m.name} braces for impact and FOCUSES.`);
        nextIn(500);
        return;
      case 'run': {
        if (Math.random() < 0.7) {
          K.play('run');
          this.say('The party slipped away!', 800, () => this.leave('run'));
        } else {
          this.msg.setText("Couldn't get away!");
          nextIn(700);
        }
        return;
      }
      case 'item': {
        const t = act.target;
        R.items[act.id]--;
        R.itemsUsed++;
        if (act.id === 'potion') {
          if (t.hp <= 0) { this.msg.setText(`${t.name} is knocked out. A Potion won't help.`); R.items.potion++; R.itemsUsed--; nextIn(700); return; }
          this.healMember(t, 60); K.play('heal');
          delete t.status.leak;
          this.msg.setText(`${m.name} uses a Potion on ${t.name}.`);
        } else if (act.id === 'ether') {
          t.mp = Math.min(t.maxMp, t.mp + 25); K.play('heal');
          this.msg.setText(`${m.name} uses an Ether. ${t.name} regains MP.`);
        } else {
          if (t.hp > 0) { this.msg.setText(`${t.name} is fine. Save the Hotfix!`); R.items.hotfix++; R.itemsUsed--; nextIn(700); return; }
          t.hp = Math.round(t.maxHp / 2); K.play('heal');
          this.msg.setText(`${m.name} ships a Hotfix. ${t.name} is back!`);
        }
        nextIn(800);
        return;
      }
      case 'combo':
        this.combo(m, act.id, act.target);
        return;
      case 'skill': {
        const s = SKILLS[act.id];
        if (m.mp < s.mp) { this.perform(m, { kind: 'fight', target: this.aliveFoes()[0] }); return; }
        m.mp -= s.mp;
        capture('skill_used', { skill: act.id, product: s.product });
        K.play(s.sfx);
        const mag = stat(m, 'mag'), atk = stat(m, 'atk');
        switch (act.id) {
          case 'error_tracking': {
            const f = tgt(act.target as Foe);
            this.lunge(m);
            this.msg.setText(`${m.name} uses Error Tracking! ${f.name}'s weak spot is exposed.`);
            f.exposed = 3;
            this.hitFoe(f, Math.round(this.physBy(m, atk, f.def) * 1.6), 'data', { crit: this.crit(m) });
            break;
          }
          case 'experiments': {
            this.lunge(m);
            this.msg.setText(`${m.name} runs an Experiment: variant A and variant B!`);
            for (let i = 0; i < 2; i++) {
              this.time.delayedCall((i * 200) / R.speed, () => {
                const alive = this.aliveFoes();
                if (!alive.length || this.over) return;
                const f = alive[Math.floor(Math.random() * alive.length)];
                this.hitFoe(f, Math.round(this.physBy(m, atk, f.def) * 0.9), 'strike', { crit: this.crit(m) });
              });
            }
            break;
          }
          case 'feature_flags':
            this.shield = 3;
            this.msg.setText(`${m.name} flips a Feature Flag. The party is shielded!`);
            this.cameras.main.flash(150, 88, 216, 84);
            break;
          case 'web_analytics': {
            const f = tgt(act.target as Foe);
            this.msg.setText(`${m.name} sends a Web Analytics traffic spike at ${f.name}!`);
            R.known.add(`${f.key}:weak`);
            R.known.add(`${f.key}:resist`);
            this.hitFoe(f, this.magic(mag, 1.8 * gearMagic(m), f.def), 'magic', { crit: this.crit(m) });
            this.foes.forEach((o) => this.drawFoeBar(o));
            break;
          }
          case 'product_analytics':
            this.msg.setText(`${m.name} unleashes a Product Analytics chart blast!`);
            this.chartBlast();
            this.aliveFoes().forEach((f) => this.hitFoe(f, this.magic(mag, 1.1 * gearMagic(m), f.def), 'magic'));
            break;
          case 'data_warehouse': {
            const f = tgt(act.target as Foe);
            this.msg.setText(`${m.name} queries the Data Warehouse. Party regains MP!`);
            this.hitFoe(f, this.magic(mag, 1.2 * gearMagic(m), f.def), 'data', { crit: this.crit(m) });
            for (const p of this.aliveParty()) p.mp = Math.min(p.maxMp, p.mp + 4);
            break;
          }
          case 'session_replay': {
            const t = (act.target as Member) ?? m;
            if (t.hp <= 0) {
              t.hp = Math.round(t.maxHp * 0.4);
              this.msg.setText(`${m.name} rewinds with Session Replay. ${t.name} is back on their feet!`);
            } else {
              this.healMember(t, (mag * 2.2 + 14) * gearHeal(m));
              this.cure(t);
              this.msg.setText(`${m.name} replays the session and patches up ${t.name}.`);
            }
            break;
          }
          case 'surveys':
            this.msg.setText(`${m.name} sends out a Survey. The monsters slow down!`);
            for (const f of this.aliveFoes()) {
              f.weak = 3;
              if (Math.random() < (isBossLike(f) ? 0.4 : 0.8)) f.status.throttled = STATUS.throttled.turns;
              this.drawFoeBar(f);
            }
            break;
          case 'coffee_run':
            this.msg.setText(`${m.name} does a Coffee Run. Everyone feels better!`);
            for (const p of this.aliveParty()) { this.healMember(p, (mag * 1.3 + 10) * gearHeal(m)); this.cure(p); }
            break;
        }
        nextIn(900);
        return;
      }
    }
  }

  private combo(m: Member, id: ComboId, target?: Foe) {
    const def = COMBOS[id];
    R.meter = 0;
    R.combos++;
    this.drawMeter();
    capture('combo_used', { combo: id });
    hooks.events.push({ event: 'combo', props: { id }, t: Math.round(performance.now()) });
    const partners = def.pair.filter((c) => c !== m.cls).map((c) => R.party.find((p) => p.cls === c)!).filter(Boolean);
    const sprites = [m.sprite, ...partners.map((p) => p.sprite)];
    this.msg.setText(`${m.name}${partners.length ? ` and ${partners.map((p) => p.name).join(' and ')}` : ''}: ${def.name}!`);
    cutIn(this, sprites, def.name, 0xf8b800, () => {
      if (this.over) return;
      const all = [m, ...partners];
      const atk = Math.max(...all.map((p) => stat(p, 'atk'))), mag = Math.max(...all.map((p) => stat(p, 'mag')));
      const hits: [number, () => void][] = [];
      if (id === 'launch_day') {
        (['strike', 'magic', 'data'] as Kind[]).forEach((k, i) => hits.push([i * 220, () => this.aliveFoes().forEach((f) =>
          this.hitFoe(f, k === 'strike' ? this.phys(atk, f.def) : this.magic(mag, 1.0, f.def), k))]));
      } else if (id === 'hotfix_rush') {
        const f = this.guardOf(target && target.alive ? target : [...this.aliveFoes()].sort((a, b) => b.hp - a.hp)[0]);
        hits.push([0, () => this.hitFoe(f, Math.round(this.phys(atk, f.def) * 3), 'strike', { crit: true })]);
        hits.push([260, () => { for (const p of R.party) { if (p.hp <= 0) p.hp = 1; this.healMember(p, p.maxHp * 0.5); this.cure(p); } this.refreshRows(); }]);
      } else if (id === 'insight_loop') {
        hits.push([0, () => this.aliveFoes().forEach((f) => this.hitFoe(f, this.magic(mag, 1.6, f.def), 'magic'))]);
        hits.push([260, () => { for (const p of this.aliveParty()) { p.status.focused = 3; p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * 0.4)); } this.refreshRows(); }]);
      } else {
        for (let i = 0; i < 3; i++) hits.push([i * 200, () => this.aliveFoes().forEach((f) => this.hitFoe(f, this.phys(atk, f.def), 'strike'))]);
      }
      shake(this, 4, 250);
      hits.forEach(([t, fn]) => this.time.delayedCall(t / R.speed, () => { if (!this.over) fn(); }));
      this.wait(hits[hits.length - 1][0] + 700, () => { this.refreshRows(); this.afterAction(); });
    });
  }

  private chartBlast() {
    const g = this.add.graphics().setDepth(60);
    const bars = 14;
    for (let i = 0; i < bars; i++) {
      const h = 20 + ((i * 37) % 60);
      g.fillStyle(i % 2 ? 0x3cbcfc : 0x0058f8, 0.85).fillRect(40 + i * 29, 140 - h, 16, h);
    }
    g.setScale(1, 0.1).setY(126);
    this.tweens.add({ targets: g, scaleY: 1, y: 0, duration: 160 / R.speed, ease: 'Back.Out' });
    this.tweens.add({ targets: g, alpha: 0, delay: 250 / R.speed, duration: 450 / R.speed, onComplete: () => g.destroy() });
  }

  private afterAction() {
    if (this.over) return;
    this.ui.member = null;
    this.refreshRows();
    if (this.pendingPhase) { this.announcePhase(); return; }
    this.nextTurn();
  }

  private announcePhase() {
    const f = this.foes[0];
    const p = this.pendingPhase;
    this.pendingPhase = 0;
    if (!f.alive) { this.nextTurn(); return; }
    f.key = p === 2 ? 'boss2' : 'boss3';
    f.maxShield = f.shield = AFFINITY[f.key].shield;
    f.broken = 0;
    f.telegraph = false;
    K.play('boss');
    shake(this, 5, 400);
    f.s.setTint(p === 2 ? 0xf87858 : 0xd800cc);
    burst(this, f.x, f.y - 50, 0xf83800, 30, { colours: [0xfcfcfc, 0xf8b800] });
    const line = p === 2 ? `${f.name}: "${K.theme.game.boss.phase2}"` : `${f.name} enters its FINAL FORM!`;
    if (p === 3) f.canRollback = true;
    this.drawFoeBar(f);
    this.say(line, 1500, () => this.say('Its weak spot moved! SCAN it again.', 1100, () => this.nextTurn()));
  }

  // ---------------------------------------------------------------- foe turns
  private hurt(m: Member, raw: number, f?: Foe) {
    let dmg = raw * R.diff.dmg * R.heatDef.dmg * gearDef(m) * (R.mode === 'solo' ? SOLO.dmg : 1);
    if (f && (f.status.focused ?? 0) > 0 && Math.random() < 0.35) dmg *= 1.5;
    if (this.shield > 0) dmg *= 0.5;
    if (this.defending.has(m)) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    if (R.god) dmg = 0;
    m.hp = Math.max(0, m.hp - dmg);
    const r = this.rows[R.party.indexOf(m)];
    pop(this, r.s.x, r.y + 4, `${dmg}`, 0xf83800);
    flash(r.s, 0xf83800, 90);
    this.tweens.add({ targets: r.s, x: r.s.x + 3, duration: 40, yoyo: true, repeat: 2, onComplete: () => r.s.setX(this.homeX(m)) });
    K.play('hurt', 0.6, 40);
    shake(this, 2, 100);
    this.addMeter((dmg / m.maxHp) * METER.hurtScale);
    if (m.hp <= 0) {
      m.status = {};
      this.time.delayedCall(200 / R.speed, () => this.msg.setText(`${m.name} is knocked out!`));
    }
    return dmg;
  }

  private inflict(m: Member, s: StatusId | undefined) {
    if (!s || m.hp <= 0 || R.god) return;
    if (this.shield > 0) return; // Feature Flags also blocks new statuses
    if (s === 'leak' && hasFx(m, 'leakProof')) { const r = this.rows[R.party.indexOf(m)]; pop(this, r.s.x + 30, r.y + 2, 'IMMUNE', 0xbcbcbc); return; }
    m.status[s] = STATUS[s].turns + (s === 'frozen' ? 0 : 1);
    K.play('status', 0.5);
    const r = this.rows[R.party.indexOf(m)];
    this.time.delayedCall(120, () => pop(this, r.s.x + 30, r.y + 2, STATUS[s].name, STATUS[s].color));
  }

  private foeLunge(f: Foe) {
    this.tweens.add({ targets: f.s, y: f.y + 8, scaleX: f.s.scaleX * 1.08, scaleY: f.s.scaleY * 1.08, duration: 90 / R.speed, yoyo: true,
      onComplete: () => f.s.setY(f.y) });
  }

  private foeTurn(f: Foe) {
    const done = (ms: number) => this.wait(ms, () => { this.refreshRows(); this.foes.forEach((o) => this.drawFoeBar(o)); this.nextTurn(); });
    if (f.broken === 1) {
      f.broken = 2;
      this.say(`${f.name} is BROKEN and can't act!`, 700, () => this.nextTurn());
      return;
    }
    if ((f.status.frozen ?? 0) > 0) {
      delete f.status.frozen;
      this.say(`${f.name} is frozen solid!`, 700, () => this.nextTurn());
      return;
    }
    if (f.guarding) { f.guarding.guardedBy = null; f.guarding = null; }
    const weak = f.weak > 0 ? 0.7 : 1;
    const mv = foeMove(this.view(), f);
    this.foeDo(f, mv, weak, done);
  }

  private foeDo(f: Foe, mv: FoeMove, weak: number, done: (ms: number) => void) {
    const v = mv.target && mv.target.hp > 0 ? mv.target : randomVictim();
    if (!v && !SELF_MOVES.has(mv.id)) { done(100); return; }
    const boss = isBossLike(f);
    const p2 = boss ? 1 + 0.2 * (f.phase - 1) : 1;
    FOE_MOVES[mv.id]({
      f, mv, v, boss,
      strike: (m, mult = 1) => this.hurt(m, this.phys(f.atk * weak * p2, stat(m, 'def')) * mult * (m.row === 'back' ? BACK_ROW : 1), f),
      spell: (m, mult) => this.hurt(m, Math.max(1, f.mag * mult * weak * p2 - stat(m, 'def') * 0.3), f),
      inflict: (m, st) => this.inflict(m, st),
      aliveParty: () => this.aliveParty(),
      done,
      say: (t) => this.msg.setText(t),
      lunge: () => this.foeLunge(f),
      wait: (ms, fn) => this.wait(ms, fn),
      shake: (px, ms) => shake(this, px, ms),
      flashCam: (ms, r, g, b) => this.cameras.main.flash(ms, r, g, b),
      tween: (cfg) => this.tweens.add(cfg),
      sparkle: (o, colour) => sparkle(this, o.x, o.y - o.s.displayHeight / 2, colour),
      redraw: (o) => this.drawFoeBar(o),
      refresh: () => this.refreshRows(),
    });
  }

  // ---------------------------------------------------------------- endings
  private victory() {
    if (this.over) return;
    this.over = true;
    this.logBattle();
    this.clearMenu();
    const boss = this.enc === BOSS;
    for (const m of R.party) m.status = {};
    jingle(this, VICTORY, 110, 0.5);
    battleMusic(this, null);
    if (boss) {
      capture('boss_defeated', { rounds: R.rounds });
      this.msg.setText(`${K.theme.game.boss.name} is defeated!`);
      this.cameras.main.flash(500, 255, 255, 255);
      burst(this, this.foes[0].x, 90, 0xf8b800, 40, { colours: [0xfcfcfc, K.ui.accentInt], speed: 160 });
      onWin();
      this.time.delayedCall(Math.max(200, 1800 / R.speed), () => {
        R.over = true;
        this.scene.stop('Explore');
        this.scene.start('End', endData(true));
      });
      return;
    }
    const gold = this.foes.reduce((a, f) => a + goldFor(f), 0);
    R.gold += gold;
    const lines: string[] = [`Victory! ${this.xpGain} XP${gold ? ` and ${gold} gold` : ''}.`];
    let leveled = false;
    for (const m of R.party) {
      m.xp += this.xpGain;
      while (m.xp >= xpNext(m.lv)) {
        m.xp -= xpNext(m.lv);
        const { gains, learned } = levelUp(m);
        leveled = true;
        lines.push(`${m.name} is now LV ${m.lv}! HP+${gains.HP} ATK+${gains.ATK} MAG+${gains.MAG}`);
        if (learned) lines.push(`${m.name} learned ${SKILLS[learned].name}!${SKILLS[learned].product ? ` (${productName(SKILLS[learned].product!)})` : ''}`);
      }
      if (m.hp <= 0) m.hp = 1; // KO'd members get up after the fight
    }
    const show = (i: number) => {
      if (i >= lines.length) { this.leave('win'); return; }
      if (i === 1 && leveled) {
        jingle(this, FANFARE, 90, 0.5);
        this.rows.forEach((r) => burst(this, r.s.x, r.s.y, 0xf8b800, 8));
      }
      this.msg.setText(lines[i]);
      this.refreshRows();
      this.time.delayedCall(Math.max(60, 1100 / R.speed), () => show(i + 1));
    };
    show(0);
  }

  private defeat() {
    if (this.over) return;
    this.over = true;
    this.logBattle();
    this.clearMenu();
    this.msg.setText('The party has fallen...');
    K.play('lose', 0.6);
    battleMusic(this, null);
    this.time.delayedCall(Math.max(200, 1500 / R.speed), () => {
      R.over = true;
      this.scene.stop('Explore');
      this.scene.start('End', endData(false));
    });
  }

  /** Debug: end the fight now (used by __game.debug.lose()). */
  forceEnd(won: boolean) {
    if (won) { this.foes.forEach((f) => { f.alive = false; }); this.over = false; this.victory(); }
    else { for (const m of R.party) m.hp = 0; this.over = false; this.defeat(); }
  }

  /** Debug: fill the Ship It meter / break every foe. */
  debugMeter() { this.drawMeter(); if (this.ui.mode === 'cmd') { this.ui.sel = 0; this.openCmd(); } }
  debugBreak() { for (const f of this.aliveFoes()) { f.shield = 0; this.breakFoe(f); this.drawFoeBar(f); } }

  private leave(result: 'win' | 'run') {
    this.over = true;
    battleMusic(this, null);
    this.scene.stop();
    this.scene.wake('Explore', { result, enc: this.enc });
  }
}

export const WYRM = 9;
export const MIMIC = 10;
export const WYRM_NAME = 'Tech Debt Wyrm';
export const WYRM_TAUNT = 'I am every shortcut you ever took!';

const GOLD: Record<string, number> = { swarm: 4, fast: 6, brute: 9, tank: 10, caster: 9, wyrm: 0, boss: 0 };
function goldFor(f: Foe) { return Math.round((GOLD[f.arch] ?? 5) * (1 + 0.2 * (f.xp / 10))); }

function tickStatus(s: Partial<Record<StatusId, number>>) {
  for (const k of Object.keys(s) as StatusId[]) {
    if (k === 'frozen') continue;
    s[k] = (s[k] ?? 0) - 1;
    if ((s[k] ?? 0) <= 0) delete s[k];
  }
}

/** Average colour of a texture's opaque pixels (first frame), or null if it can't be read. */
export function avgColour(scene: Phaser.Scene, key: string): [number, number, number] | null {
  try {
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const px = ctx.getImageData(0, 0, Math.min(c.width, c.height), c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128 || px[i] + px[i + 1] + px[i + 2] < 30) continue; // skip outline black
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : null;
  } catch {
    return null;
  }
}
