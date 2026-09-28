// Data Inspector: the Papers, Please-style desk loop. All prospect content comes from K.theme; the
// rule logic lives in rules.ts. This file is never edited per prospect.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, bar, wrap, PixelText, W, H } from '@shared/ui';
import products from '../../shared/products.json';
import { World, Rec, Rule, fieldFor } from './rules';

type ToolId = 'session_replay' | 'product_analytics' | 'feature_flags' | 'error_tracking' | 'surveys' | 'experiments';
type Mode = 'intro' | 'playing' | 'rulebook' | 'summary' | 'finalintro' | 'final' | 'done';

export const TOOLS: Record<ToolId, { name: string; effect: string }> = {
  session_replay: { name: 'REWIND', effect: 'Replay the record: points at the broken field' },
  product_analytics: { name: 'INSIGHT', effect: 'Tells you which rule (if any) is broken' },
  feature_flags: { name: 'KILL SWITCH', effect: 'Switch a record off: skip it, no penalty' },
  error_tracking: { name: 'AUTO-CATCH', effect: 'Your next mistake today is forgiven' },
  surveys: { name: 'SURVEY', effect: 'Users explain themselves: +12s on the clock' },
  experiments: { name: 'A/B BOOST', effect: 'Double points for the next 5 records' },
};
export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;
const productColor = (id: string) => parseInt(((products as Record<string, { color: string }>)[id]?.color ?? '#fcfcfc').slice(1), 16);

const DIFF = {
  easy: { len: 60, quota: 5, pen: 0.7, charges: 2 },
  normal: { len: 50, quota: 7, pen: 1, charges: 1 },
  hard: { len: 42, quota: 9, pen: 1.3, charges: 1 },
};
const DAYS = 5;
const PAPER = 0xf0d0b0;
const INK = 0x000000;
const INK_KEY = 0x503000;
const RED = 0xf83800;
const GREEN = 0x00b800;

interface DayStats { processed: number; correct: number; caught: number; missed: number; falseFlags: number; skipped: number }
const emptyStats = (): DayStats => ({ processed: 0, correct: 0, caught: 0, missed: 0, falseFlags: 0, skipped: 0 });

export class GameScene extends Phaser.Scene {
  private world!: World;
  private personaNames: string[] = [];
  private tools: ToolId[] = [];
  private charges = new Map<ToolId, number>();
  private diff = DIFF.normal;
  private mode: Mode = 'intro';
  private day = 0;
  private clock = 0;
  private t = 0;               // game time (seconds, scaled by sim speed)
  private quality = 100;
  private score = 0;
  private streak = 0;
  private boost = 0;
  private shield = false;
  private stats: DayStats = emptyStats();
  private total: DayStats = emptyStats();
  private rec: Rec | null = null;
  private broken: Rule[] = [];
  private readyAt = 0;
  private nextAt = -1;         // when to bring the next record in
  private botT = 0;
  private overlayT = 0;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private card: Phaser.GameObjects.Container | null = null;
  private cardLines = new Map<string, number>(); // field -> y within card
  private hl: Phaser.GameObjects.Graphics | null = null;
  private lastTick = 0;
  private god = false;
  private autopilot = false;
  private simSpeed = 1;
  private finished = false;
  private hud!: {
    day: PixelText; clock: ReturnType<typeof bar>; quality: ReturnType<typeof bar>; quota: PixelText; score: PixelText;
    portrait: Phaser.GameObjects.Image; name: PixelText; role: PixelText; ids: PixelText; tools: PixelText[];
    say: PixelText; hog: Phaser.GameObjects.Sprite;
  };

  constructor() { super('Game'); }

  create() {
    const issues: string[] = [];
    this.world = new World(K.theme, issues);
    if (issues.length) hooks.themeIssues.push(...issues.filter((i) => !hooks.themeIssues.includes(i)));
    this.personaNames = K.theme.game.personas.map((p: any) => p.name);
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.tools = (K.theme.products as string[]).filter((p): p is ToolId => p in TOOLS).slice(0, 4);
    Object.assign(this, {
      mode: 'intro', day: 0, clock: 0, t: 0, quality: 100, score: 0, streak: 0, boost: 0, shield: false,
      stats: emptyStats(), total: emptyStats(), rec: null, broken: [], readyAt: 0, nextAt: -1, botT: 0, overlayT: 0,
      overlay: [], timers: [], card: null, hl: null, lastTick: 0, simSpeed: 1, finished: false,
    });
    this.cardLines = new Map();
    hooks.scene = 'Game';
    hooks.elapsed = 0;
    hooks.score = 0;

    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.add.tileSprite(0, 0, W, H, spr('desk')).setOrigin(0).setDepth(-10);
    this.buildHud();
    const kb = this.input.keyboard!;
    kb.addCapture('TAB');
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.installDebug();
    this.showIntro();
  }

  // ---------------------------------------------------------------- HUD
  private buildHud() {
    const ui = K.ui;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(ui.bgInt, 1).fillRect(0, 0, W, 17).fillStyle(ui.panelInt, 1).fillRect(0, 17, W, 1);
    const day = text(this, 4, 4, 'DAY 1/5', { color: ui.accentInt, depth: 2 });
    text(this, 58, 4, 'TIME', { color: ui.dimInt, depth: 2 });
    const clock = bar(this, 86, 6, 90, 5, ui.accentInt, 0x000000, ui.textInt);
    clock.g.setDepth(2);
    text(this, 186, 4, 'QUALITY', { color: ui.dimInt, depth: 2 });
    const quality = bar(this, 232, 6, 70, 5, GREEN, 0x000000, ui.textInt);
    quality.g.setDepth(2);
    const quota = text(this, 310, 4, 'DONE 0/7', { depth: 2 });
    const score = text(this, W - 4, 4, '0', { align: 'right', color: ui.accentInt, depth: 2 });

    // Left column: who sent this record, recent IDs, tools.
    box(this, 4, 22, 146, 82, ui.bgInt, ui.textInt, ui.panelInt).setDepth(1);
    const portrait = this.add.image(10, 30, spr('persona_1')).setOrigin(0).setScale(2).setDepth(2).setVisible(false);
    const name = text(this, 80, 30, '', { color: ui.accentInt, maxWidth: 66, maxLines: 1, depth: 2 });
    const role = text(this, 80, 44, '', { color: ui.dimInt, maxWidth: 66, maxLines: 4, depth: 2 });
    box(this, 4, 108, 146, 48, ui.bgInt, ui.textInt, ui.panelInt).setDepth(1);
    text(this, 10, 112, 'RECENT IDS', { color: ui.dimInt, depth: 2 });
    const ids = text(this, 10, 124, '-', { depth: 2 });
    box(this, 4, 160, 146, 58, ui.bgInt, ui.textInt, ui.panelInt).setDepth(1);
    text(this, 10, 163, 'POSTHOG TOOLS', { color: ui.dimInt, depth: 2 });
    const tools = this.tools.map((_, i) => text(this, 10, 174 + i * 10, '', { depth: 2, maxWidth: 136, maxLines: 1 }));
    if (!this.tools.length) text(this, 10, 176, 'none today', { color: ui.dimInt, depth: 2 });

    // Bottom bar: the inspector's running commentary + controls.
    box(this, 4, 222, W - 8, 45, ui.bgInt, ui.textInt, ui.panelInt).setDepth(12);
    const hog = this.add.sprite(10, 226, spr('inspector')).setOrigin(0).setDepth(13);
    hog.play(anim('inspector'));
    const say = text(this, 40, 227, '', { maxWidth: W - 52, maxLines: 2, depth: 13 });
    this.add.image(40, 250, spr('stamp_ok')).setOrigin(0).setDepth(13);
    text(this, 60, 254, 'A/LEFT APPROVE', { color: GREEN, depth: 13 });
    text(this, W / 2 + 10, 254, 'R RULES  1-4 TOOLS', { align: 'center', color: ui.dimInt, depth: 13 });
    text(this, W - 30, 254, 'FLAG D/RIGHT', { align: 'right', color: RED, depth: 13 });
    this.add.image(W - 26, 250, spr('stamp_flag')).setOrigin(0).setDepth(13);
    this.hud = { day, clock, quality, quota, score, portrait, name, role, ids, tools, say, hog };
    this.refreshHud();
  }

  private refreshHud() {
    const h = this.hud;
    h.day.setText(`DAY ${this.day + 1}/${DAYS}`);
    const frac = this.mode === 'final' || this.mode === 'finalintro' ? 1 : this.clock / this.diff.len;
    h.clock.draw(frac, frac < 0.2 ? RED : K.ui.accentInt);
    h.quality.draw(this.quality / 100, this.quality > 50 ? GREEN : this.quality > 25 ? 0xf8b800 : RED);
    h.quota.setText(`DONE ${this.stats.processed}/${this.diff.quota}`).setColor(this.stats.processed >= this.diff.quota ? GREEN : K.ui.textInt);
    h.score.setText(String(this.score));
    const ids = this.world.recentIds(3);
    h.ids.setText(ids.length ? ids.join('\n') : '-');
    this.tools.forEach((id, i) => {
      const n = this.charges.get(id) ?? 0;
      h.tools[i].setText(`${i + 1} ${TOOLS[id].name}${n > 1 ? ` x${n}` : ''}`).setColor(n > 0 ? productColor(id) : 0x7c7c7c);
    });
  }

  private say(msg: string, color = K.ui.textInt) {
    this.hud.say.setText(msg).setColor(color);
  }

  // ---------------------------------------------------------------- overlays
  private clearOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.overlayT = 0;
    this.botT = 0;
  }

  private panel(title: string) {
    this.clearOverlay();
    const ui = K.ui;
    this.overlay.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setDepth(100));
    this.overlay.push(box(this, 20, 14, W - 40, H - 28, ui.bgInt, ui.textInt, ui.panelInt).setDepth(101));
    this.overlay.push(text(this, W / 2, 22, title, { scale: 2, align: 'center', color: ui.accentInt, depth: 102, shadow: ui.panelInt }));
  }

  private prompt(msg: string) {
    const p = text(this, W / 2, H - 30, msg, { align: 'center', color: K.ui.accentInt, depth: 102 });
    this.overlay.push(p);
    this.timers.push(this.time.addEvent({ delay: 500, loop: true, callback: () => p.setVisible(!p.visible) }));
  }

  /** Manager portrait + typewriter speech. Returns the y below the speech. */
  private managerSays(line: string, y = 48): number {
    const ui = K.ui;
    const m = K.theme.game.manager;
    const face = this.add.sprite(36, y, spr('manager')).setOrigin(0).setScale(2).setDepth(102);
    face.play(anim('manager'));
    this.overlay.push(face);
    this.overlay.push(text(this, 68, y + 68, m.name, { align: 'center', color: ui.accentInt, depth: 102, maxWidth: 90, maxLines: 1 }));
    this.overlay.push(text(this, 68, y + 80, m.title, { align: 'center', color: ui.dimInt, depth: 102, maxWidth: 96, maxLines: 2 }));
    const lines = wrap(line, 52, 4, 'manager');
    const full = lines.join('\n');
    const t = text(this, 118, y + 4, '', { depth: 102, color: ui.textInt });
    this.overlay.push(t);
    let i = 0;
    const ev = this.time.addEvent({ delay: 22, repeat: full.length, callback: () => {
      i++;
      t.setText(full.slice(0, i));
      if (i >= full.length) face.stop().setFrame(0);
    } });
    this.timers.push(ev);
    return y + 4 + lines.length * 10;
  }

  private showIntro() {
    this.mode = 'intro';
    hooks.state = 'dayintro';
    this.charges = new Map(this.tools.map((id) => [id, this.diff.charges]));
    this.shield = false;
    this.world.newDay();
    this.panel(`DAY ${this.day + 1}`);
    const ui = K.ui;
    this.overlay.push(text(this, W / 2, 42, K.theme.game.desk.name, { align: 'center', color: ui.dimInt, depth: 102, maxWidth: W - 60, maxLines: 1 }));
    const y = Math.max(this.managerSays(K.theme.game.days[this.day]?.intro ?? 'Back to work!', 58) + 8, 118);
    const rules = this.world.days[this.day];
    this.overlay.push(text(this, 118, y, rules.length > 1 ? 'NEW RULES' : 'NEW RULE', { color: ui.accentInt, depth: 102 }));
    let ry = y + 12;
    for (const r of rules) {
      const t = text(this, 118, ry, `• ${r.text}`, { depth: 102, maxWidth: W - 150, maxLines: 2 });
      this.overlay.push(t);
      ry += t.lineCount * 10 + 2;
    }
    if (this.day === 0) this.overlay.push(text(this, 118, ry + 4, 'A/LEFT approve  D/RIGHT flag  R rulebook', { color: ui.dimInt, depth: 102 }));
    this.prompt('ENTER: START SHIFT');
    this.refreshHud();
    this.say(this.day === 0 ? `First day at ${K.theme.prospect.name}. Let's keep the data clean!` : 'Coffee? Coffee. Back to the desk.');
  }

  private showRulebook() {
    if (this.mode !== 'playing') return;
    this.mode = 'rulebook';
    hooks.state = 'rulebook';
    K.play('paper');
    this.panel('RULEBOOK');
    const ui = K.ui;
    let y = 46;
    this.world.active(this.day).forEach((r, i) => {
      const isNew = r.day === this.day;
      const t = text(this, 44, y, `${i + 1}. ${r.text}`, { depth: 102, maxWidth: W - 120, maxLines: 2, color: isNew ? ui.accentInt : ui.textInt });
      this.overlay.push(t);
      if (isNew) this.overlay.push(text(this, W - 44, y, 'NEW', { align: 'right', color: ui.accentInt, depth: 102 }));
      y += t.lineCount * 10 + 4;
    });
    this.overlay.push(text(this, W - 44, H - 48, 'VERIFIED BY POSTHOG', { align: 'right', color: GREEN, depth: 102 }));
    this.prompt('R / ENTER: BACK TO THE DESK');
  }

  private closeRulebook() {
    this.clearOverlay();
    this.mode = 'playing';
    hooks.state = 'playing';
  }

  private showSummary() {
    this.mode = 'summary';
    hooks.state = 'summary';
    K.play('dayend');
    this.discardCard();
    this.rec = null;
    const s = this.stats;
    const missingQuota = Math.max(0, this.diff.quota - s.processed);
    const quotaMet = missingQuota === 0;
    if (quotaMet) this.score += 250;
    else this.hitQuality(missingQuota * 4 * this.diff.pen);
    this.panel(`END OF DAY ${this.day + 1}`);
    const ui = K.ui;
    const rows: [string, string, number?][] = [
      ['Records checked', String(s.processed)],
      ['Correct calls', String(s.correct)],
      ['Bad data caught', String(s.caught)],
      ['Bad data let in', String(s.missed), s.missed ? RED : undefined],
      ['Good data flagged', String(s.falseFlags), s.falseFlags ? RED : undefined],
      ['Daily quota', quotaMet ? `MET (+250)` : `MISSED by ${missingQuota}`, quotaMet ? GREEN : RED],
      ['Data quality', `${Math.round(this.quality)}%`],
      ['Score', String(this.score)],
    ];
    rows.forEach(([k, v, c], i) => {
      this.overlay.push(text(this, W / 2 - 6, 54 + i * 14, k, { align: 'right', color: ui.dimInt, depth: 102 }));
      this.overlay.push(text(this, W / 2 + 6, 54 + i * 14, v, { color: c ?? ui.textInt, depth: 102 }));
    });
    this.prompt(this.day + 1 < DAYS ? 'ENTER: NEXT DAY' : 'ENTER: ONE MORE THING...');
    this.refreshHud();
    if (this.quality <= 0 && !this.god) this.time.delayedCall(900, () => this.finish(false));
  }

  private nextDay() {
    this.clearOverlay();
    if (this.day + 1 >= DAYS) { this.showFinalIntro(); return; }
    this.day++;
    this.stats = emptyStats();
    this.showIntro();
  }

  private showFinalIntro() {
    this.mode = 'finalintro';
    hooks.state = 'finalintro';
    K.play('boss');
    this.panel('THE FINAL RECORD');
    this.managerSays(K.theme.game.final_record.intro, 58);
    this.overlay.push(text(this, 118, 150, 'No clock. No tools. Take your time.', { color: K.ui.dimInt, depth: 102 }));
    this.prompt('ENTER: BRING IT IN');
  }

  // ---------------------------------------------------------------- flow
  private startShift() {
    this.clearOverlay();
    this.mode = 'playing';
    hooks.state = 'playing';
    this.clock = this.diff.len;
    this.lastTick = Math.ceil(this.clock);
    this.say(this.world.days[this.day][0]?.text ? `Today: ${this.world.days[this.day][0].text}` : 'Here they come.');
    this.newRecord();
  }

  private newRecord(final = false) {
    this.discardCard();
    const active = this.world.active(this.day);
    const rec = this.world.baseline(this.personaNames);
    const badChance = final ? 1 : 0.35 + this.day * 0.04;
    if (Math.random() < badChance && active.length) {
      const order = Phaser.Utils.Array.Shuffle([...active]);
      if (final) order.sort((a, b) => a.day - b.day); // the final record breaks the oldest rule, subtly
      for (const r of order) if (this.world.breakRule(rec, r, this.personaNames, final)) break;
    }
    rec.final = final;
    this.rec = rec;
    this.broken = this.world.violations(rec, active);
    this.world.shown(rec);
    this.readyAt = this.t + 0.25;
    this.nextAt = -1;
    this.botT = 0;
    this.drawCard(rec);
    this.showSender(rec);
    K.play('paper', 0.6);
    this.refreshHud();
  }

  private showSender(rec: Rec) {
    const p = K.theme.game.personas[rec.persona] ?? K.theme.game.personas[0];
    this.hud.portrait.setTexture(spr(`persona_${rec.persona + 1}`)).setVisible(true);
    this.hud.name.setText(p.name);
    this.hud.role.setText(p.role);
  }

  private drawCard(rec: Rec) {
    const ui = K.ui;
    const cw = 318, ch = 196;
    const c = this.add.container(W + 10, 22).setDepth(10);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRect(3, 3, cw, ch);
    g.fillStyle(PAPER, 1).fillRect(0, 0, cw, ch);
    g.lineStyle(1, INK, 1).strokeRect(0.5, 0.5, cw - 1, ch - 1);
    g.fillStyle(rec.final ? 0xf8b800 : ui.panelInt, 1).fillRect(1, 1, cw - 2, 13);
    if (rec.final) g.lineStyle(2, 0xf8b800, 1).strokeRect(-2, -2, cw + 4, ch + 4);
    c.add(g);
    const head = rec.final ? 0x000000 : ui.onPanelInt;
    c.add(text(this, 6, 3, rec.final ? 'FINAL RECORD' : `RECORD #${rec.n}`, { color: head, shadow: null }));
    c.add(text(this, cw - 6, 3, 'EVENT', { align: 'right', color: head, shadow: null }));
    this.cardLines.clear();
    const persona = K.theme.game.personas[rec.persona] ?? K.theme.game.personas[0];
    const rows: [string, string][] = [
      ['EVENT', rec.event], ['ID', rec.id], ['USER', persona.name], ['EMAIL', rec.email], ['SOURCE', rec.source], ['TIME', rec.time],
    ];
    rows.forEach(([k, v], i) => {
      const y = 20 + i * 12;
      this.cardLines.set(k, y);
      c.add(text(this, 8, y, k, { color: INK_KEY, shadow: null }));
      c.add(text(this, 56, y, v, { color: INK, shadow: null, maxWidth: cw - 62, maxLines: 1 }));
    });
    g.fillStyle(INK_KEY, 1);
    for (let x = 6; x < cw - 6; x += 3) g.fillRect(x, 95, 1, 1);
    c.add(text(this, 8, 99, 'PROPERTIES', { color: INK_KEY, shadow: null }));
    if (!rec.props.length) c.add(text(this, 16, 112, '(none)', { color: INK_KEY, shadow: null }));
    rec.props.forEach(([k, v], i) => {
      const y = 112 + i * 12;
      this.cardLines.set(k, y);
      c.add(text(this, 16, y, k, { color: INK_KEY, shadow: null }));
      c.add(text(this, 118, y, v, { color: INK, shadow: null, maxWidth: cw - 124, maxLines: 1 }));
    });
    this.hl = this.add.graphics();
    c.add(this.hl);
    this.card = c;
    this.tweens.add({ targets: c, x: 154, duration: 220, ease: 'Cubic.easeOut' });
  }

  private discardCard() {
    const c = this.card;
    this.card = null;
    this.hl = null;
    if (!c) return;
    c.setDepth(9); // file it away: drop down into the drawer, under the next record
    this.tweens.add({ targets: c, y: H + 20, duration: 260, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  private stamp(flag: boolean) {
    if (!this.card) return;
    const col = flag ? RED : GREEN;
    const s = this.add.container(236, 162);
    const g = this.add.graphics();
    g.lineStyle(2, col, 1).strokeRect(-52, -13, 104, 26);
    g.lineStyle(1, col, 1).strokeRect(-49, -10, 98, 20);
    s.add(g);
    s.add(text(this, 0, -7, flag ? 'FLAGGED' : 'APPROVED', { scale: 2, align: 'center', color: col, shadow: null }));
    s.setAngle(flag ? 8 : -6).setScale(2).setAlpha(0);
    this.card.add(s);
    this.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 110, ease: 'Quad.easeIn' });
    K.play('stamp');
    this.hud.hog.setFrame(1);
    this.time.delayedCall(150, () => this.hud.hog.play(anim('inspector')));
  }

  private highlight(field: string) {
    const y = this.cardLines.get(field);
    if (!this.hl || y === undefined) return false;
    this.hl.clear().lineStyle(1, RED, 1).strokeRect(4.5, y - 2.5, 310, 12);
    return true;
  }

  private answer(flag: boolean) {
    if (!this.rec || this.t < this.readyAt || this.nextAt !== -1) return;
    const rec = this.rec;
    const bad = this.broken.length > 0;
    const correct = flag === bad;
    this.stamp(flag);
    this.stats.processed++;
    this.total.processed++;
    if (correct) {
      this.stats.correct++; this.total.correct++;
      if (bad) { this.stats.caught++; this.total.caught++; }
      this.streak++;
      const pts = (100 + Math.min(this.streak, 5) * 10) * (this.boost > 0 ? 2 : 1);
      if (this.boost > 0) this.boost--;
      this.score += rec.final ? 1000 : pts;
      this.quality = Math.min(100, this.quality + 2);
      K.play('correct', 0.6);
      this.say(bad ? `CAUGHT IT: ${this.broken[0].text}` : 'Clean record. Into the warehouse it goes.', bad ? GREEN : K.ui.textInt);
    } else {
      this.streak = 0;
      if (bad) { this.stats.missed++; this.total.missed++; } else { this.stats.falseFlags++; this.total.falseFlags++; }
      const cost = (rec.final ? 30 : bad ? 8 : 5) * this.diff.pen;
      if (this.shield && !rec.final) {
        this.shield = false;
        this.say('AUTO-CATCH saved you: that call was wrong, no harm done.', 0xf8b800);
      } else {
        this.hitQuality(cost);
        this.say(bad ? `MISSED: ${this.broken[0].text}` : 'That one was fine! Good data got flagged.', RED);
        this.cameras.main.shake(120, 0.004);
      }
      if (bad) this.highlight(fieldFor(this.broken[0]));
      K.play('wrong', 0.8);
    }
    this.nextAt = this.t + (correct ? 0.45 : 0.9);
    this.refreshHud();
    if (rec.final) {
      this.nextAt = -2;
      this.time.delayedCall(1800, () => this.finish(this.quality > 0 || this.god));
      return;
    }
    if (this.quality <= 0 && !this.god) this.time.delayedCall(700, () => this.finish(false));
  }

  private hitQuality(n: number) {
    this.quality = Math.max(this.god ? 1 : 0, this.quality - n);
  }

  private useTool(i: number) {
    const id = this.tools[i];
    if (!id || !this.rec || this.mode !== 'playing' || this.nextAt !== -1) return;
    const n = this.charges.get(id) ?? 0;
    if (n <= 0) { this.say(`${TOOLS[id].name} is used up for today.`, 0x7c7c7c); K.play('move'); return; }
    this.charges.set(id, n - 1);
    K.play('power');
    capture('product_used', { product: id, day: this.day + 1 });
    const b = this.broken[0];
    const col = productColor(id);
    switch (id) {
      case 'session_replay':
        if (!b) this.say('REWIND: the replay looks normal. Nothing odd here.', col);
        else if (this.highlight(fieldFor(b))) this.say(`REWIND: something is off with ${fieldFor(b)}.`, col);
        else this.say(`REWIND: something is MISSING (${fieldFor(b)}).`, col);
        break;
      case 'product_analytics': {
        const idx = b ? this.world.active(this.day).indexOf(b) + 1 : 0;
        this.say(b ? `INSIGHT: this record breaks rule ${idx}.` : 'INSIGHT: no rules broken. Looks clean.', col);
        break;
      }
      case 'feature_flags':
        this.say('KILL SWITCH: record switched off. Next!', col);
        this.stats.processed++; this.stats.skipped++; this.total.processed++; this.total.skipped++;
        this.nextAt = this.t + 0.3;
        break;
      case 'error_tracking':
        this.shield = true;
        this.say('AUTO-CATCH armed: your next mistake today is forgiven.', col);
        break;
      case 'surveys':
        this.clock += 12;
        this.say('SURVEY: users explained themselves. +12 seconds.', col);
        break;
      case 'experiments':
        this.boost = 5;
        this.say('A/B BOOST: double points for the next 5 records.', col);
        break;
    }
    this.refreshHud();
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (this.finished || e.repeat) return;
    const c = e.code;
    const go = ['Enter', 'Space', 'NumpadEnter'].includes(c);
    const armed = this.overlayT > 0.3;
    switch (this.mode) {
      case 'intro': if (go && armed) { K.play('select'); this.startShift(); } break;
      case 'summary': if (go && armed) { K.play('select'); this.nextDay(); } break;
      case 'finalintro': if (go && armed) { K.play('select'); this.startFinal(); } break;
      case 'rulebook': if ((go || ['KeyR', 'Tab', 'Escape'].includes(c)) && armed) this.closeRulebook(); break;
      case 'playing':
      case 'final':
        if (['ArrowLeft', 'KeyA'].includes(c)) this.answer(false);
        else if (['ArrowRight', 'KeyD'].includes(c)) this.answer(true);
        else if (this.mode === 'playing' && ['KeyR', 'Tab', 'Escape'].includes(c)) this.showRulebook();
        else if (this.mode === 'playing' && /^Digit[1-4]$/.test(c)) this.useTool(+c.slice(-1) - 1);
        break;
    }
  }

  private startFinal() {
    this.clearOverlay();
    this.mode = 'final';
    hooks.state = 'final';
    this.say(`The final record. ${this.world.active(this.day).length} rules. Check every one.`, K.ui.accentInt);
    this.newRecord(true);
  }

  // ---------------------------------------------------------------- loop
  update(_t: number, dtMs: number) {
    if (this.finished) return;
    const dt = (Math.min(dtMs, 50) / 1000) * this.simSpeed;
    this.t += dt;
    this.overlayT += dt;
    hooks.elapsed += this.mode === 'playing' ? dt : 0;
    hooks.score = this.score;
    if (this.mode === 'playing') {
      this.clock -= dt;
      const sec = Math.ceil(this.clock);
      if (sec <= 5 && sec < this.lastTick && sec > 0) K.play('tick');
      this.lastTick = sec;
      if (this.clock <= 0) { this.clock = 0; this.showSummary(); }
      else if (this.nextAt >= 0 && this.t >= this.nextAt) this.newRecord();
      this.refreshClock();
    }
    if (this.autopilot) this.bot(dt);
    hooks.stats = {
      day: this.day + 1, mode: this.mode, quality: Math.round(this.quality), score: this.score, clock: Math.round(this.clock),
      processed: this.total.processed, correct: this.total.correct, missed: this.total.missed, falseFlags: this.total.falseFlags,
      record: this.rec ? { event: this.rec.event, bad: this.broken.length > 0, broken: this.broken.map((r) => r.type) } : null,
    };
  }

  private refreshClock() {
    const frac = this.clock / this.diff.len;
    this.hud.clock.draw(Math.min(1, frac), frac < 0.2 ? RED : K.ui.accentInt);
  }

  private bot(dt: number) {
    this.botT += dt;
    if (['intro', 'summary', 'finalintro'].includes(this.mode) && this.overlayT > 0.6) {
      if (this.mode === 'intro') this.startShift();
      else if (this.mode === 'summary') { if (this.quality > 0) this.nextDay(); }
      else this.startFinal();
      return;
    }
    if ((this.mode === 'playing' || this.mode === 'final') && this.rec && this.nextAt === -1 && this.t >= this.readyAt && this.botT > 0.9) {
      const bad = this.broken.length > 0;
      const right = this.rec.final || Math.random() < 0.92;
      this.answer(right ? bad : !bad);
    }
  }

  private finish(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.mode = 'done';
    const acc = this.total.processed - this.total.skipped > 0
      ? Math.round((100 * this.total.correct) / (this.total.processed - this.total.skipped)) : 0;
    const headline = !won ? 'DATA DISASTER' : acc >= 90 ? 'DATA LEGEND!' : acc >= 75 ? 'PROMOTED!' : 'SHIFT SURVIVED';
    this.time.delayedCall(won ? 300 : 700, () => this.scene.start('End', {
      won, score: this.score, headline,
      stats: [['Records checked', this.total.processed], ['Accuracy', `${acc}%`], ['Bad data caught', this.total.caught],
        ['Data quality', `${Math.round(this.quality)}%`]],
      props: { day: this.day + 1, accuracy: acc, quality: Math.round(this.quality), tools: this.tools },
    }));
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    hooks.debug = {
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true) => { this.autopilot = !!on; },
      lose: () => this.finish(false),
      win: () => this.finish(true),
      skipDay: () => { if (this.mode === 'playing') this.clock = 0.01; },
      rules: () => this.world.active(this.day).map((r) => `${r.type}: ${r.text}`),
      // For the gameplay GIF: a busy mid-week shift (day 3, rulebook filling up, a tool in use).
      showcase: () => {
        if (this.finished) return;
        this.day = Math.min(2, DAYS - 1);
        this.stats = emptyStats();
        this.stats.processed = 3;
        this.total.processed += 17; this.total.correct += 16; this.total.caught += 6;
        this.score = Math.max(this.score, 2380);
        this.quality = Math.min(this.quality, 86);
        this.charges = new Map(this.tools.map((id) => [id, this.diff.charges]));
        this.world.newDay();
        this.startShift();
        this.clock = this.diff.len * 0.6;
        this.time.delayedCall(400, () => { if (this.mode === 'playing' && this.nextAt === -1) this.useTool(0); });
      },
    };
  }
}
