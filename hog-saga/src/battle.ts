// Hog Saga battles: classic turn-based menus. Each round everyone acts in speed order; party
// members pick FIGHT / SKILL / ITEM / DEFEND / RUN. Skills are PostHog products.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, bar, PixelText, W, H } from '@shared/ui';
import {
  publishStats, R, ARCH, BOSS, ENCOUNTERS, SKILLS, ITEMS, Arch, ItemId, Member, SkillId, stat, levelUp, xpNext, endData,
  skillLine, featured, productName,
} from './state';

interface Foe {
  name: string; pain: string; arch: Arch | 'boss'; sprite: string;
  hp: number; maxHp: number; atk: number; def: number; mag: number; spd: number; xp: number;
  alive: boolean; exposed: number; weak: number; distracted: boolean; hardened: number;
  s: Phaser.GameObjects.Sprite; hpBar: Phaser.GameObjects.Graphics; x: number; y: number;
}

type Act =
  | { kind: 'fight'; target: Foe }
  | { kind: 'skill'; id: SkillId; target?: Foe | Member }
  | { kind: 'item'; id: ItemId; target: Member }
  | { kind: 'defend' }
  | { kind: 'run' };

type Actor = { side: 'party'; m: Member } | { side: 'foe'; f: Foe };

const CMDS = ['FIGHT', 'SKILL', 'ITEM', 'DEFEND', 'RUN'] as const;
const BACKDROPS = [
  ['#3cbcfc', '#a4e4fc', '#58d854', '#00b800'],   // meadow
  ['#004058', '#005800', '#503000', '#000000'],   // forest / cave
  ['#fca044', '#f8d878', '#f0d0b0', '#ac7c00'],   // desert
];

export class BattleScene extends Phaser.Scene {
  private enc = 0;
  private foes: Foe[] = [];
  private order: Actor[] = [];
  private turn = 0;
  private shield = 0;
  private defending = new Set<Member>();
  private msg!: PixelText;
  private rows: { name: PixelText; hp: ReturnType<typeof bar>; mp: ReturnType<typeof bar>; hpT: PixelText; mpT: PixelText; s: Phaser.GameObjects.Sprite; y: number }[] = [];
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private cursor!: Phaser.GameObjects.Graphics;
  private ui: { mode: 'none' | 'cmd' | 'skill' | 'item' | 'foe' | 'ally'; sel: number; member: Member | null; pending: Act | null; list: any[] } =
    { mode: 'none', sel: 0, member: null, pending: null, list: [] };
  private over = false;
  private phase2 = false;
  private xpGain = 0;

  constructor() { super('Battle'); }

  create(data: { enc: number; region: number; showcase?: boolean }) {
    this.enc = data.enc;
    this.over = false;
    this.phase2 = false;
    this.shield = 0;
    this.defending = new Set();
    this.foes = [];
    this.rows = [];
    this.menuObjs = [];
    this.ui = { mode: 'none', sel: 0, member: null, pending: null, list: [] };
    this.xpGain = 0;
    this.minHp = 1;
    this.startRounds = R.rounds;
    this.startHp = Math.round((R.party.reduce((a, m) => a + m.hp, 0) / R.party.reduce((a, m) => a + m.maxHp, 0)) * 100) / 100;
    hooks.scene = 'Battle';
    hooks.state = 'battle';
    R.battles++;
    const ui = K.ui;
    this.drawBackdrop(data.region);
    this.spawnFoes();
    // Message box (top)
    box(this, 6, 4, W - 12, 20, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    this.msg = text(this, 14, 9, '', { depth: 101, maxWidth: W - 28, maxLines: 1 });
    // Bottom panels
    box(this, 6, 166, 134, 100, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    box(this, 144, 166, W - 150, 100, ui.bgInt, ui.textInt, ui.panelInt).setDepth(100);
    R.party.forEach((m, i) => {
      const y = 170 + i * 32;
      const s = this.add.sprite(166, y + 15, spr(m.sprite), m.sprite === 'hero' ? 0 : 0).setScale(2).setDepth(101);
      if (m.sprite !== 'hero') s.play(anim(m.sprite));
      const name = text(this, 186, y + 2, '', { depth: 101 });
      const hp = bar(this, 290, y + 5, 70, 4, 0x58d854, 0x000000, ui.panelInt);
      const mp = bar(this, 290, y + 17, 70, 4, 0x3cbcfc, 0x000000, ui.panelInt);
      hp.g.setScrollFactor(0).setDepth(101);
      mp.g.setScrollFactor(0).setDepth(101);
      const hpT = text(this, W - 12, y + 2, '', { align: 'right', depth: 101 });
      const mpT = text(this, W - 12, y + 14, '', { align: 'right', depth: 101, color: ui.dimInt });
      text(this, 186, y + 14, `LV ${m.lv}`, { depth: 101, color: ui.dimInt });
      text(this, 276, y + 2, 'HP', { depth: 101, color: ui.dimInt });
      text(this, 276, y + 14, 'MP', { depth: 101, color: ui.dimInt });
      this.rows.push({ name, hp, mp, hpT, mpT, s, y });
    });
    this.cursor = this.add.graphics().setDepth(150);
    this.refreshRows();
    const kb = this.input.keyboard!;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    const names = [...new Set(this.foes.map((f) => f.name))];
    capture('battle_started', { enc: this.enc, boss: this.enc === BOSS });
    if (this.enc === BOSS) {
      this.say(`${this.foes[0].name}: "${K.theme.game.boss.taunt}"`, 1600, () => this.startRound());
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
    R.log.push({ enc: this.enc, rounds: R.rounds - this.startRounds, startHp: this.startHp, minHp: Math.round(this.minHp * 100) / 100,
      ko: R.party.filter((m) => m.hp <= 0).length, lv: R.party[0].lv });
  }

  update() {
    publishStats(hooks);
    const f = R.party.reduce((a, m) => a + m.hp, 0) / R.party.reduce((a, m) => a + m.maxHp, 0);
    if (f < this.minHp) this.minHp = f;
    // Autopilot switched on while a menu is waiting: let the bot take this turn.
    if (R.autopilot && !this.over && this.ui.mode !== 'none' && this.ui.member) {
      const m = this.ui.member;
      this.clearMenu();
      this.ui.mode = 'none';
      this.perform(m, this.decide(m));
    }
    if (this.ui.mode === 'foe') this.drawCursor();
  }

  // ---------------------------------------------------------------- setup
  private drawBackdrop(region: number) {
    const g = this.add.graphics().setDepth(0);
    const cols = region === 3 ? this.lairColours() : BACKDROPS[region] ?? BACKDROPS[0];
    const toInt = (c: string) => parseInt(c.replace('#', ''), 16);
    const bands = [[0, 60, cols[0]], [60, 110, cols[1]], [110, 132, cols[2]], [132, 166, cols[3]]] as [number, number, string][];
    for (const [y0, y1, c] of bands) g.fillStyle(toInt(c), 1).fillRect(0, y0, W, y1 - y0);
    // dithered seams between bands
    g.fillStyle(toInt(cols[1]), 1);
    for (let x = 0; x < W; x += 4) g.fillRect(x + ((x / 4) % 2) * 2, 58, 2, 2);
    g.fillStyle(toInt(cols[3]), 1);
    for (let x = 0; x < W; x += 4) g.fillRect(x + ((x / 4) % 2) * 2, 130, 2, 2);
    // a stage shadow under the enemies
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
    const mult = R.diff;
    if (this.enc === BOSS) {
      this.addFoe({ name: g.boss.name, pain: g.boss.taunt, arch: 'boss', sprite: 'boss', hp: 1250 * mult.hp, atk: 33, def: 15, mag: 29, spd: 11, xp: 0 }, W / 2, 140, 1.7);
      return;
    }
    const e = ENCOUNTERS[this.enc];
    let ids: number[] = [];
    for (const i of e.group) {
      ids.push(i);
      if ((g.enemies[i]?.archetype ?? 'swarm') === 'swarm') ids.push(i); // swarms come in pairs
    }
    ids = ids.slice(0, 3);
    const sc = 1 + 0.22 * (e.tier - 1);     // toughness grows faster than hitting power
    const sa = 1 + 0.16 * (e.tier - 1);
    const xs = ids.length === 1 ? [W / 2] : ids.length === 2 ? [W / 2 - 70, W / 2 + 70] : [W / 2 - 120, W / 2, W / 2 + 120];
    ids.forEach((i, k) => {
      const def = g.enemies[i] ?? g.enemies[0];
      const a = ARCH[def.archetype as Arch] ?? ARCH.swarm;
      this.addFoe({ name: def.name, pain: def.pain, arch: def.archetype, sprite: `enemy_${i + 1}`,
        hp: Math.round(a.hp * sc * mult.hp), atk: a.atk * sa, def: a.def * sc, mag: a.mag * sa, spd: a.spd + e.tier * 0.3,
        xp: Math.round(a.xp * (1 + 0.45 * (e.tier - 1))) }, xs[k], 134, 2);
    });
  }

  private addFoe(d: { name: string; pain: string; arch: Arch | 'boss'; sprite: string; hp: number; atk: number; def: number; mag: number; spd: number; xp: number },
    x: number, y: number, scale: number) {
    const s = this.add.sprite(x, y, spr(d.sprite)).setOrigin(0.5, 1).setScale(scale).setDepth(10).play(anim(d.sprite));
    s.anims.setProgress(Math.random());
    const hpBar = this.add.graphics().setDepth(11);
    const f: Foe = { ...d, hp: Math.round(d.hp), maxHp: Math.round(d.hp), alive: true, exposed: 0, weak: 0, distracted: false, hardened: 0, s, hpBar, x, y };
    this.foes.push(f);
    this.drawFoeBar(f);
  }

  private drawFoeBar(f: Foe) {
    const w = f.arch === 'boss' ? 100 : 40;
    const x = Math.round(f.x - w / 2), y = f.y + 4;
    f.hpBar.clear();
    if (!f.alive) return;
    f.hpBar.fillStyle(0x000000).fillRect(x - 1, y - 1, w + 2, 5).fillStyle(0x7c7c7c).fillRect(x, y, w, 3)
      .fillStyle(f.hp / f.maxHp < 0.3 ? 0xf83800 : 0xf8b800).fillRect(x, y, Math.max(0, Math.round((w * f.hp) / f.maxHp)), 3);
    if (f.exposed > 0) f.hpBar.fillStyle(0xf83800).fillRect(x + w + 3, y - 1, 3, 5);
    if (f.weak > 0) f.hpBar.fillStyle(0xf85898).fillRect(x + w + 7, y - 1, 3, 5);
  }

  private refreshRows() {
    const ui = K.ui;
    R.party.forEach((m, i) => {
      const r = this.rows[i];
      const ko = m.hp <= 0;
      r.name.setText(m.name).setColor(ko ? 0x7c7c7c : this.ui.member === m ? ui.accentInt : ui.textInt);
      r.hp.draw(m.hp / m.maxHp, ko ? 0x7c7c7c : m.hp / m.maxHp < 0.3 ? 0xf83800 : 0x58d854);
      r.mp.draw(m.mp / m.maxMp, 0x3cbcfc);
      r.hpT.setText(ko ? 'KO' : `${m.hp}/${m.maxHp}`).setColor(ko ? 0xf83800 : ui.textInt);
      r.mpT.setText(`${m.mp}/${m.maxMp}`);
      r.s.setAlpha(ko ? 0.35 : 1).setAngle(ko ? 90 : 0);
    });
  }

  // ---------------------------------------------------------------- flow helpers
  private wait(ms: number, fn: () => void) {
    this.time.delayedCall(Math.max(16, ms / R.speed), () => { if (!this.over || fn === this.finishCb) fn(); });
  }

  private finishCb = () => {};

  private say(t: string, ms: number, then: () => void) {
    this.msg.setText(t);
    this.wait(ms, then);
  }

  private pop(x: number, y: number, str: string, color: number) {
    const t = text(this, x, y, str, { align: 'center', color, depth: 120, scale: 1 });
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700 / R.speed, onComplete: () => t.destroy() });
  }

  private aliveFoes() { return this.foes.filter((f) => f.alive); }
  private aliveParty() { return R.party.filter((m) => m.hp > 0); }

  // ---------------------------------------------------------------- rounds
  private startRound() {
    if (this.over) return;
    R.rounds++;
    this.defending.clear();
    const actors: Actor[] = [
      ...this.aliveParty().map((m) => ({ side: 'party' as const, m })),
      ...this.aliveFoes().map((f) => ({ side: 'foe' as const, f })),
    ];
    const spd = (a: Actor) => (a.side === 'party' ? a.m.spd : a.f.spd) * Phaser.Math.FloatBetween(0.8, 1.2);
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
    for (const f of this.foes) {
      if (f.exposed > 0) f.exposed--;
      if (f.weak > 0) f.weak--;
      if (f.hardened > 0) f.hardened--;
      this.drawFoeBar(f);
    }
    this.startRound();
  }

  private checkEnd(): boolean {
    if (this.aliveFoes().length === 0) { this.victory(); return true; }
    if (this.aliveParty().length === 0) { this.defeat(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- party turn + menus
  private partyTurn(m: Member) {
    this.ui.member = m;
    hooks.state = 'battle';
    this.refreshRows();
    if (R.autopilot) {
      const act = this.decide(m);
      this.wait(250, () => this.perform(m, act));
      return;
    }
    this.msg.setText(`${m.name}'s turn. What will ${m.name} do?`);
    this.openCmd();
  }

  private clearMenu() {
    this.menuObjs.forEach((o) => o.destroy());
    this.menuObjs = [];
    this.cursor.clear();
  }

  private openCmd() {
    this.clearMenu();
    this.ui.mode = 'cmd';
    this.ui.list = [...CMDS];
    const ui = K.ui;
    CMDS.forEach((c, i) => {
      const dim = (c === 'RUN' && this.enc === BOSS) || (c === 'SKILL' && !this.ui.member!.skills.length);
      this.menuObjs.push(text(this, 26, 174 + i * 17, c, { depth: 101, color: dim ? 0x7c7c7c : ui.textInt, scale: 1 }));
    });
    this.ui.sel = Math.min(this.ui.sel, CMDS.length - 1);
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
      const nm = (featured(id) ? '*' : '') + (s.name.length > 15 ? s.name.replace('Analytics', 'Anlytcs') : s.name);
      this.menuObjs.push(text(this, 22, 174 + i * 17, nm, { depth: 101, color: ok ? ui.textInt : 0x7c7c7c }));
      this.menuObjs.push(text(this, 134, 182 + i * 17, `${s.mp}MP`, { depth: 101, align: 'right', color: ui.dimInt }));
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
      this.menuObjs.push(this.add.image(24, 178 + i * 17, spr(`item_${id}`)).setDepth(101));
      this.menuObjs.push(text(this, 32, 174 + i * 17, `${ITEMS[id].name} x${n}`, { depth: 101, color: n > 0 ? ui.textInt : 0x7c7c7c }));
    });
    this.ui.sel = 0;
    this.drawCursor();
  }

  private drawCursor() {
    const c = this.cursor.clear();
    const ui = K.ui;
    const { mode, sel } = this.ui;
    if (mode === 'cmd' || mode === 'skill' || mode === 'item') {
      c.fillStyle(ui.accentInt).fillTriangle(12, 175 + sel * 17, 12, 183 + sel * 17, 17, 179 + sel * 17);
      if (mode === 'skill') {
        const id = this.ui.list[sel] as SkillId;
        this.msg.setText(`${SKILLS[id].name}: ${skillLine(id)}`);
      } else if (mode === 'item') {
        const id = this.ui.list[sel] as ItemId;
        this.msg.setText(`${ITEMS[id].name}: ${ITEMS[id].line}`);
      }
    } else if (mode === 'foe') {
      const f = this.ui.list[sel] as Foe;
      const bob = Math.floor(this.time.now / 200) % 2 * 2;
      const top = f.y - f.s.displayHeight + 2 + bob;
      c.fillStyle(0x000000).fillTriangle(f.x - 8, top - 12, f.x + 8, top - 12, f.x, top - 2);
      c.fillStyle(ui.accentInt).fillTriangle(f.x - 6, top - 11, f.x + 6, top - 11, f.x, top - 4);
      this.msg.setText(`Target: ${f.name}`);
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
      if (mode === 'skill' || mode === 'item') { K.play('back'); this.ui.sel = 0; this.openCmd(); }
      else if (mode === 'foe' || mode === 'ally') { K.play('back'); this.ui.pending = null; this.ui.sel = 0; this.openCmd(); }
      return;
    }
    if (!ok) return;
    const m = this.ui.member!;
    if (mode === 'cmd') {
      const c = CMDS[this.ui.sel];
      if (c === 'FIGHT') { K.play('select'); this.ui.pending = { kind: 'fight', target: this.aliveFoes()[0] }; this.pickFoe(); }
      else if (c === 'SKILL') { if (!m.skills.length) return; K.play('select'); this.openSkills(); }
      else if (c === 'ITEM') { K.play('select'); this.openItems(); }
      else if (c === 'DEFEND') { K.play('select'); this.commit({ kind: 'defend' }); }
      else if (c === 'RUN') { if (this.enc === BOSS) { K.play('bump'); this.msg.setText("You can't run from this one!"); return; } K.play('select'); this.commit({ kind: 'run' }); }
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
      if (p.kind === 'fight') this.commit({ kind: 'fight', target: f });
      else if (p.kind === 'skill') this.commit({ ...p, target: f });
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

  // ---------------------------------------------------------------- party actions
  private phys(atk: number, def: number) {
    return Math.max(1, Math.round((atk * 1.5 - def * 0.8) * Phaser.Math.FloatBetween(0.85, 1.15)));
  }

  private magic(mag: number, power: number, def: number) {
    return Math.max(1, Math.round((mag * power * 1.4 - def * 0.3) * Phaser.Math.FloatBetween(0.9, 1.1)));
  }

  private hitFoe(f: Foe, dmg: number, crit = false) {
    if (!f.alive) return;
    if (f.exposed > 0) dmg = Math.round(dmg * 1.3);
    if (f.hardened > 0) dmg = Math.round(dmg * 0.6);
    f.hp -= dmg;
    K.play(crit ? 'crit' : 'hit', 0.6, 30);
    this.pop(f.x, f.y - f.s.displayHeight / 2, `${dmg}`, crit ? 0xf8b800 : 0xfcfcfc);
    f.s.setTintFill(0xffffff);
    this.time.delayedCall(90, () => f.alive && f.s.clearTint());
    this.tweens.add({ targets: f.s, x: f.x + 4, duration: 40, yoyo: true, repeat: 1 });
    if (f.hp <= 0) {
      f.hp = 0;
      f.alive = false;
      R.kills++;
      this.xpGain += f.xp;
      K.play('kill', 0.7);
      this.tweens.add({ targets: f.s, alpha: 0, scaleX: 0.2 * f.s.scaleX, duration: 400 / R.speed });
    } else if (f.arch === 'boss' && !this.phase2 && f.hp < f.maxHp / 2) {
      this.phase2 = true;
    }
    this.drawFoeBar(f);
  }

  private healMember(m: Member, amt: number) {
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + Math.round(amt));
    const r = this.rows[R.party.indexOf(m)];
    this.pop(r.s.x, r.y + 4, `+${m.hp - before}`, 0x58d854);
  }

  private perform(m: Member, act: Act) {
    if (this.over) return;
    const nextIn = (ms: number) => this.wait(ms, () => { this.refreshRows(); this.afterAction(); });
    const tgt = (f?: Foe) => (f && f.alive ? f : this.aliveFoes()[0]);
    switch (act.kind) {
      case 'fight': {
        const f = tgt(act.target);
        const crit = Math.random() < 0.08;
        const d = this.phys(stat(m, 'atk'), f.def) * (crit ? 1.8 : 1);
        this.msg.setText(`${m.name} attacks ${f.name}!${crit ? ' A critical hit!' : ''}`);
        this.hitFoe(f, Math.round(d), crit);
        nextIn(700);
        return;
      }
      case 'defend':
        this.defending.add(m);
        this.msg.setText(`${m.name} braces for impact.`);
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
        if (act.id === 'potion') {
          if (t.hp <= 0) { this.msg.setText(`${t.name} is knocked out. A Potion won't help.`); R.items.potion++; nextIn(700); return; }
          this.healMember(t, 60); K.play('heal');
          this.msg.setText(`${m.name} uses a Potion on ${t.name}.`);
        } else if (act.id === 'ether') {
          t.mp = Math.min(t.maxMp, t.mp + 25); K.play('heal');
          this.msg.setText(`${m.name} uses an Ether. ${t.name} regains MP.`);
        } else {
          if (t.hp > 0) { this.msg.setText(`${t.name} is fine. Save the Hotfix!`); R.items.hotfix++; nextIn(700); return; }
          t.hp = Math.round(t.maxHp / 2); K.play('heal');
          this.msg.setText(`${m.name} ships a Hotfix. ${t.name} is back!`);
        }
        nextIn(800);
        return;
      }
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
            this.msg.setText(`${m.name} uses Error Tracking! ${f.name}'s weak spot is exposed.`);
            f.exposed = 3;
            this.hitFoe(f, Math.round(this.phys(atk, f.def) * 1.6), true);
            break;
          }
          case 'experiments': {
            this.msg.setText(`${m.name} runs an Experiment: variant A and variant B!`);
            for (let i = 0; i < 2; i++) {
              const alive = this.aliveFoes();
              if (!alive.length) break;
              const f = alive[Math.floor(Math.random() * alive.length)];
              this.time.delayedCall((i * 200) / R.speed, () => this.hitFoe(f, Math.round(this.phys(atk, f.def) * 0.9)));
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
            this.hitFoe(f, this.magic(mag, 1.8, f.def));
            break;
          }
          case 'product_analytics':
            this.msg.setText(`${m.name} unleashes a Product Analytics chart blast!`);
            this.chartBlast();
            this.aliveFoes().forEach((f) => this.hitFoe(f, this.magic(mag, 1.1, f.def)));
            break;
          case 'data_warehouse': {
            const f = tgt(act.target as Foe);
            this.msg.setText(`${m.name} queries the Data Warehouse. Party regains MP!`);
            this.hitFoe(f, this.magic(mag, 1.2, f.def));
            for (const p of this.aliveParty()) p.mp = Math.min(p.maxMp, p.mp + 4);
            break;
          }
          case 'session_replay': {
            const t = (act.target as Member) ?? m;
            if (t.hp <= 0) {
              t.hp = Math.round(t.maxHp * 0.4);
              this.msg.setText(`${m.name} rewinds with Session Replay. ${t.name} is back on their feet!`);
            } else {
              this.healMember(t, mag * 2.2 + 14);
              this.msg.setText(`${m.name} replays the session and patches up ${t.name}.`);
            }
            break;
          }
          case 'surveys':
            this.msg.setText(`${m.name} sends out a Survey. The monsters are distracted!`);
            for (const f of this.aliveFoes()) { f.weak = 3; if (Math.random() < (f.arch === 'boss' ? 0.2 : 0.4)) f.distracted = true; this.drawFoeBar(f); }
            break;
          case 'coffee_run':
            this.msg.setText(`${m.name} does a Coffee Run. Everyone feels better!`);
            for (const p of this.aliveParty()) this.healMember(p, mag * 1.3 + 10);
            break;
        }
        nextIn(900);
        return;
      }
    }
  }

  private chartBlast() {
    const g = this.add.graphics().setDepth(60);
    const bars = 14;
    for (let i = 0; i < bars; i++) {
      const h = 20 + ((i * 37) % 60);
      g.fillStyle(i % 2 ? 0x3cbcfc : 0x0058f8, 0.85).fillRect(40 + i * 29, 140 - h, 16, h);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 600 / R.speed, onComplete: () => g.destroy() });
  }

  private afterAction() {
    if (this.over) return;
    this.ui.member = null;
    this.refreshRows();
    this.nextTurn();
  }

  // ---------------------------------------------------------------- foe turns
  private pickVictim(): Member | null {
    const alive = this.aliveParty();
    if (!alive.length) return null;
    const w = alive.map((m) => (m.cls === 'hero' ? 1.4 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < alive.length; i++) { r -= w[i]; if (r <= 0) return alive[i]; }
    return alive[0];
  }

  private hurt(m: Member, raw: number) {
    let dmg = raw * R.diff.dmg;
    if (this.shield > 0) dmg *= 0.5;
    if (this.defending.has(m)) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg));
    if (R.god) dmg = 0;
    m.hp = Math.max(0, m.hp - dmg);
    const r = this.rows[R.party.indexOf(m)];
    this.pop(r.s.x, r.y + 4, `${dmg}`, 0xf83800);
    this.tweens.add({ targets: r.s, x: r.s.x + 3, duration: 40, yoyo: true, repeat: 2 });
    K.play('hurt', 0.6, 40);
    this.cameras.main.shake(100, 0.004);
    if (m.hp <= 0) this.time.delayedCall(200 / R.speed, () => this.msg.setText(`${m.name} is knocked out!`));
  }

  private foeTurn(f: Foe) {
    const done = (ms: number) => this.wait(ms, () => { this.refreshRows(); this.nextTurn(); });
    if (f.distracted) {
      f.distracted = false;
      this.say(`${f.name} is busy answering a survey...`, 700, () => this.nextTurn());
      return;
    }
    const weak = f.weak > 0 ? 0.7 : 1;
    const g = K.theme.game;
    if (f.arch === 'boss') {
      if (this.phase2 && !(f as any).announced) {
        (f as any).announced = true;
        K.play('boss');
        this.cameras.main.shake(400, 0.01);
        f.s.setTint(0xf87858);
        this.say(`${f.name}: "${g.boss.phase2}"`, 1500, () => this.bossAttack(f, weak, done));
        return;
      }
      this.bossAttack(f, weak, done);
      return;
    }
    const v = this.pickVictim();
    if (!v) { done(100); return; }
    const lunge = () => this.tweens.add({ targets: f.s, y: f.y + 6, duration: 80, yoyo: true });
    lunge();
    switch (f.arch) {
      case 'caster':
        if (Math.random() < 0.4) {
          this.msg.setText(`${f.name} casts a storm on the whole party!`);
          for (const m of this.aliveParty()) this.hurt(m, Math.max(1, f.mag * 0.5 * 1.4 * weak - stat(m, 'def') * 0.25));
        } else {
          this.msg.setText(`${f.name} casts a hex on ${v.name}!`);
          this.hurt(v, Math.max(1, f.mag * 1.15 * weak - stat(v, 'def') * 0.3));
        }
        done(900);
        return;
      case 'brute':
        if (Math.random() < 0.3) {
          if (Math.random() < 0.2) { this.msg.setText(`${f.name} swings wildly and misses!`); done(700); return; }
          this.msg.setText(`${f.name} lands a heavy blow on ${v.name}!`);
          this.hurt(v, this.phys(f.atk * weak, stat(v, 'def')) * 1.35);
          done(800);
          return;
        }
        break;
      case 'tank':
        if (Math.random() < 0.25 && f.hardened <= 0) {
          f.hardened = 2;
          this.msg.setText(`${f.name} hardens its shell!`);
          done(700);
          return;
        }
        break;
      case 'fast':
        this.msg.setText(`${f.name} darts at ${v.name}!`);
        this.hurt(v, this.phys(f.atk * weak, stat(v, 'def')));
        if (Math.random() < 0.35) {
          this.wait(350, () => {
            const v2 = this.pickVictim();
            if (!v2 || this.over) return;
            this.msg.setText(`${f.name} strikes again!`);
            this.hurt(v2, this.phys(f.atk * weak, stat(v2, 'def')));
            this.refreshRows();
          });
          done(1100);
          return;
        }
        done(800);
        return;
    }
    this.msg.setText(`${f.name} attacks ${v.name}!`);
    this.hurt(v, this.phys(f.atk * weak, stat(v, 'def')));
    done(800);
  }

  private bossAttack(f: Foe, weak: number, done: (ms: number) => void) {
    const p2 = this.phase2 ? 1.2 : 1;
    const aoe = Math.random() < (this.phase2 ? 0.5 : 0.35);
    this.tweens.add({ targets: f.s, scaleX: f.s.scaleX * 1.05, scaleY: f.s.scaleY * 1.05, duration: 120, yoyo: true });
    if (aoe) {
      this.msg.setText(`${f.name} triggers a system-wide outage!`);
      this.cameras.main.flash(120, 248, 56, 0);
      for (const m of this.aliveParty()) this.hurt(m, Math.max(1, f.mag * 0.7 * 1.4 * weak * p2 - stat(m, 'def') * 0.3));
    } else {
      const v = this.pickVictim();
      if (v) {
        this.msg.setText(`${f.name} slams ${v.name}!`);
        this.hurt(v, this.phys(f.atk * weak * p2, stat(v, 'def')));
      }
    }
    if (this.phase2 && Math.random() < 0.3 && this.aliveParty().length) {
      this.wait(500, () => {
        if (this.over) return;
        const v = this.pickVictim();
        if (!v) return;
        this.msg.setText(`${f.name} deploys again!`);
        this.hurt(v, this.phys(f.atk * weak * p2, stat(v, 'def')));
        this.refreshRows();
      });
      done(1300);
      return;
    }
    done(1000);
  }

  // ---------------------------------------------------------------- autopilot
  private decide(m: Member): Act {
    const foes = this.aliveFoes();
    const party = R.party;
    const ko = party.filter((p) => p.hp <= 0);
    const hurt = party.filter((p) => p.hp > 0 && p.hp < p.maxHp * 0.45).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const can = (id: SkillId) => m.skills.includes(id) && m.mp >= SKILLS[id].mp;
    const boss = this.enc === BOSS;
    const tough = [...foes].sort((a, b) => b.hp - a.hp)[0];
    const weakest = [...foes].sort((a, b) => a.hp - b.hp)[0];
    if (m.cls === 'support') {
      if (ko.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: ko[0] };
      if (party.filter((p) => p.hp > 0 && p.hp < p.maxHp * 0.6).length >= 2 && can('coffee_run')) return { kind: 'skill', id: 'coffee_run' };
      if (hurt.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: hurt[0] };
    }
    if (ko.length && R.items.hotfix > 0) return { kind: 'item', id: 'hotfix', target: ko[0] };
    const healer = party[2].hp > 0 && party[2].mp >= 4 && m.cls !== 'support';
    if (hurt.length && R.items.potion > 0 && (!healer || hurt.length >= 2 || hurt[0].hp < hurt[0].maxHp * 0.25))
      return { kind: 'item', id: 'potion', target: hurt[0] };
    if (boss && m.mp < 5 && m.cls !== 'hero' && R.items.ether > 0) return { kind: 'item', id: 'ether', target: m };
    if (m.cls === 'support') {
      if ((foes.length >= 2 || boss) && can('surveys') && !foes.some((f) => f.weak > 0)) return { kind: 'skill', id: 'surveys' };
      return { kind: 'fight', target: weakest };
    }
    if (m.cls === 'analyst') {
      if (foes.length >= 2 && can('product_analytics')) return { kind: 'skill', id: 'product_analytics' };
      if (can('data_warehouse') && party.some((p) => p !== m && p.hp > 0 && p.mp < p.maxMp * 0.5)) return { kind: 'skill', id: 'data_warehouse', target: tough };
      if (can('web_analytics') && (tough.hp > 20 || boss)) return { kind: 'skill', id: 'web_analytics', target: tough };
      return { kind: 'fight', target: weakest };
    }
    // hero
    if (boss && can('feature_flags') && this.shield <= 0) return { kind: 'skill', id: 'feature_flags' };
    if (can('error_tracking') && tough.exposed <= 0 && tough.hp > 30) return { kind: 'skill', id: 'error_tracking', target: tough };
    if (foes.length >= 2 && can('experiments')) return { kind: 'skill', id: 'experiments' };
    return { kind: 'fight', target: tough.exposed > 0 ? tough : weakest };
  }

  // ---------------------------------------------------------------- endings
  private victory() {
    if (this.over) return;
    this.over = true;
    this.logBattle();
    this.finishCb = () => {};
    this.clearMenu();
    if (this.enc === BOSS) {
      K.play('win');
      capture('boss_defeated', { rounds: R.rounds });
      this.msg.setText(`${K.theme.game.boss.name} is defeated!`);
      this.cameras.main.flash(500, 255, 255, 255);
      this.time.delayedCall(Math.max(200, 1800 / R.speed), () => {
        R.over = true;
        this.scene.stop('Explore');
        this.scene.start('End', endData(true));
      });
      return;
    }
    K.play('levelup', 0.5);
    const lines: string[] = [`Victory! Each member gains ${this.xpGain} XP.`];
    for (const m of R.party) {
      m.xp += this.xpGain;
      while (m.xp >= xpNext(m.lv)) {
        m.xp -= xpNext(m.lv);
        const { gains, learned } = levelUp(m);
        lines.push(`${m.name} is now LV ${m.lv}! HP+${gains.HP} ATK+${gains.ATK} MAG+${gains.MAG}`);
        if (learned) lines.push(`${m.name} learned ${SKILLS[learned].name}!${SKILLS[learned].product ? ` (${productName(SKILLS[learned].product!)})` : ''}`);
      }
      if (m.hp <= 0) m.hp = 1; // KO'd members get up after the fight
    }
    const show = (i: number) => {
      if (i >= lines.length) { this.leave('win'); return; }
      if (i > 0) K.play('levelup', 0.6);
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

  private leave(result: 'win' | 'run') {
    this.over = true;
    this.scene.stop();
    this.scene.wake('Explore', { result, enc: this.enc });
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
