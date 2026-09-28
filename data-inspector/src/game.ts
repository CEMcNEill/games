// Data Inspector: the Papers, Please-style desk loop. All prospect content comes from K.theme; the rule
// logic lives in rules.ts, the documents in docs.ts, the widgets in desk.ts and the week's content
// tables (requests, bills, endings, heat, grades) in story.ts. This file is never edited per prospect.
import Phaser from 'phaser';
import { K, spr, anim, meta, achieve } from '@shared/kit';
import { hooks, sharedDebug } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, wrap, W, H } from '@shared/ui';
import { rng, randomSeed, dailySeed } from '@shared/meta';
import { hitstop, hitstopped, setJuiceSpeed, toast } from '@shared/juice';
import products from '../../shared/products.json';
import { World, Rec, Rule, RuleType, DESK_TYPES, FLAG_PROP, fieldFor, docFor } from './rules';
import { buildDoc, TABS } from './docs';
import { Desk, RED, GREEN, GOLD, GREY, productColor } from './desk';
import {
  REQUESTS, OVERTIME_BONUS, BILLS, Bill, START_CREDITS, earned, pickEnding, ENDINGS, Ending, HEAT, Heat, grade, letter, gradeColor, fill,
  Effect, Request,
} from './story';

type ToolId = 'session_replay' | 'product_analytics' | 'feature_flags' | 'error_tracking' | 'surveys' | 'experiments';
type Mode = 'intro' | 'request' | 'reply' | 'playing' | 'reason' | 'summary' | 'finalintro' | 'final' | 'done';
type RunMode = 'week' | 'endless' | 'daily';

export const TOOLS: Record<ToolId, { name: string; effect: string }> = {
  session_replay: { name: 'REWIND', effect: 'Replay the record: points at the broken field' },
  product_analytics: { name: 'INSIGHT', effect: 'Tells you which rule (if any) is broken' },
  feature_flags: { name: 'KILL SWITCH', effect: 'Switch a record off: skip it, no penalty' },
  error_tracking: { name: 'AUTO-CATCH', effect: 'Your next mistake today is forgiven' },
  surveys: { name: 'SURVEY', effect: 'Users explain themselves: +12s on the clock' },
  experiments: { name: 'A/B BOOST', effect: 'Double points for the next 5 records' },
};
export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;

const DIFF = {
  easy: { len: 60, quota: 5, pen: 0.7, charges: 2 },
  normal: { len: 50, quota: 7, pen: 1, charges: 1 },
  hard: { len: 42, quota: 9, pen: 1.3, charges: 1 },
};
const DAYS = 5;
const ENDLESS_STEP = 6; // records per new rule in the endless shift
const PERSON_DAY = 3;   // 0-based day person profiles start landing

interface DayStats { processed: number; correct: number; caught: number; missed: number; falseFlags: number; skipped: number }
const emptyStats = (): DayStats => ({ processed: 0, correct: 0, caught: 0, missed: 0, falseFlags: 0, skipped: 0 });
interface Adj { clock: number; charges: number; quality: number; notes: string[] }
const noAdj = (): Adj => ({ clock: 0, charges: 0, quality: 0, notes: [] });

interface BotPlan { requests: 'yes' | 'no'; bills: 'all' | 'none'; pattern: boolean; pace: number; accuracy: number; reasons: number }

export interface KitSave extends Record<string, unknown> { endings: string[]; bestGrade: Record<string, string>; endlessBest: number }
export const kitSave = () => meta.kitData<KitSave>({ endings: [], bestGrade: {}, endlessBest: 0 });

/** What the End screen's kit lines need (set by finish()). */
export const lastEnd = { ending: null as Ending | null, grade: '', endless: false, records: 0, newBestGrade: false, names: {} as Record<string, string> };

export class GameScene extends Phaser.Scene {
  private world!: World;
  private desk!: Desk;
  private tools: ToolId[] = [];
  private charges = new Map<ToolId, number>();
  private upgraded = new Set<ToolId>();
  private diff = DIFF.normal;
  private heat: Heat = HEAT[0];
  private heatN = 0;
  private runMode: RunMode = 'week';
  private dayLen = 50;
  private quota = 7;
  private mode: Mode = 'intro';
  private prevMode: Mode = 'playing';
  private day = 0;
  private clock = 0;
  private t = 0;
  private quality = 100;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private boost = 0;
  private shield = false;
  private stats: DayStats = emptyStats();
  private total: DayStats = emptyStats();
  private dayMistakes: number[] = [];
  private reasonsRight = 0;
  private reasonsWrong = 0;
  private toolsUsed = 0;
  private rec: Rec | null = null;
  private broken: Rule[] = [];
  private options: Rule[] = [];
  private sel = 0;
  private readyAt = 0;
  private nextAt = -1;
  private botT = 0;
  private botTool = false;
  private overlayT = 0;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private lastTick = 0;
  private lastFlag = false;
  private god = false;
  private autopilot = false;
  /** How the autopilot plays (debug.botPlan): answer requests yes/no, pay bills, flag the 3 AM story, pace, accuracy. */
  private plan: BotPlan = { requests: 'no', bills: 'all', pattern: false, pace: 0.9, accuracy: 0.92, reasons: 0.88 };
  private simSpeed = 1;
  private finished = false;
  // the week around the desk
  private credits = START_CREDITS;
  private billOn: Record<Bill['id'], boolean> = { infra: true, coffee: true, tooling: false };
  private dayCredits = 0;
  private grades: { g: string; pts: number }[] = [];
  private adj: Adj = noAdj();      // applies to today's shift
  private pending: Adj = noAdj();  // applies to tomorrow's
  private request: Request | null = null;
  private choices: Record<string, boolean> = {};
  private corners = 0;
  private integrity = 0;
  private stress = 0;
  private junk = 0;
  private todayExempt: string[] = [];
  private quotasMet = 0;
  private finalCaught = false;
  // the hidden story: one user at 3 AM on days 2-4
  private patternSeen = new Set<number>();
  private patternNoted = 0;
  private patternEvent = '';
  private pickRng = rng(randomSeed());
  private firstWeek = false;
  private pickerSeen = false;

  constructor() { super('Game'); }

  create() {
    const issues: string[] = [];
    const run = K.run;
    this.runMode = run.mode === 'endless' ? 'endless' : run.mode === 'daily' ? 'daily' : 'week';
    this.heatN = Math.max(0, Math.min(5, run.heat | 0));
    this.heat = HEAT[this.heatN];
    const r = rng(this.runMode === 'daily' ? dailySeed() : run.seed || randomSeed());
    const firstWeek = meta.data.runs === 0 && this.heatN === 0 && this.runMode === 'week';
    this.firstWeek = firstWeek;
    const kinds = r.shuffle([...DESK_TYPES]);
    const desk: (RuleType | null)[] = this.runMode === 'endless' ? kinds
      : firstWeek ? ['email_mismatch', 'source_outage', 'flag_before_release', null]
        : [kinds[0], kinds[1], kinds[2], this.heat.deskOn5 ? kinds[3] : null];
    this.world = new World(K.theme, issues, { rng: r, desk });
    if (issues.length) hooks.themeIssues.push(...issues.filter((i) => !hooks.themeIssues.includes(i)));
    this.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.dayLen = Math.max(25, this.diff.len + this.heat.len);
    this.quota = this.diff.quota + this.heat.quota;
    this.tools = (K.theme.products as string[]).filter((p): p is ToolId => p in TOOLS).slice(0, this.heat.tools);
    Object.assign(this, {
      mode: 'intro', day: 0, clock: 0, t: 0, quality: 100, score: 0, streak: 0, bestStreak: 0, boost: 0, shield: false,
      stats: emptyStats(), total: emptyStats(), dayMistakes: [], reasonsRight: 0, reasonsWrong: 0, toolsUsed: 0,
      rec: null, broken: [], options: [], readyAt: 0, nextAt: -1, botT: 0, overlayT: 0, overlay: [], timers: [], lastTick: 0,
      simSpeed: 1, finished: false, credits: START_CREDITS, grades: [], adj: noAdj(), pending: noAdj(), request: null,
      choices: {}, corners: 0, integrity: 0, stress: 0, junk: 0, todayExempt: [], quotasMet: 0, finalCaught: false,
      upgraded: new Set(), charges: new Map(), patternSeen: new Set(), patternNoted: 0, pickerSeen: false,
    });
    this.patternEvent = r.pick(this.world.events).name;
    hooks.scene = 'Game';
    hooks.elapsed = 0;
    hooks.score = 0;
    setJuiceSpeed(1);

    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.add.tileSprite(0, 0, W, H, spr('desk')).setOrigin(0).setDepth(-10);
    this.desk = new Desk(this, this.tools.map((id) => ({ name: TOOLS[id].name, icon: `icon_${id}`, color: productColor(id) })));
    const kb = this.input.keyboard!;
    kb.addCapture(['TAB', 'UP', 'DOWN']);
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.installDebug();
    if (this.runMode === 'endless') this.startEndless();
    else this.showIntro();
  }

  // ---------------------------------------------------------------- HUD + docs
  private refreshHud() {
    const endless = this.runMode === 'endless';
    const frac = endless ? (this.total.processed % ENDLESS_STEP) / ENDLESS_STEP
      : this.mode === 'final' || this.mode === 'finalintro' ? 1 : this.clock / this.dayLen;
    this.desk.hud({
      day: endless ? `RULE ${Math.min(this.world.all.length, this.world.active(this.day).length)}` : `DAY ${this.day + 1}/${DAYS}`,
      clock: Math.min(1, frac), clockCol: this.clockColour(frac),
      quality: this.quality,
      quota: endless ? `DONE ${this.total.processed}` : `DONE ${this.stats.processed}/${this.quota}`,
      quotaMet: !endless && this.stats.processed >= this.quota,
      score: endless ? this.total.correct : this.score, streak: this.streak,
    });
    this.desk.seenIds(this.world.recentIds(3));
    this.desk.tools(this.tools.map((id) => ({ charges: this.charges.get(id) ?? 0, upgraded: this.upgraded.has(id) })),
      this.tools.map((id) => TOOLS[id].name));
  }

  private clockColour(frac: number) {
    if (this.runMode === 'endless') return K.ui.accentInt;
    if (this.clock <= 10 && this.mode !== 'final') return Math.floor(this.t * 4) % 2 ? RED : 0xfcfcfc;
    return frac < 0.2 ? RED : K.ui.accentInt;
  }

  private refreshDocs(keepTab = true) {
    const ctx = { world: this.world, day: this.day, rules: this.world.active(this.day), personas: K.theme.game.personas,
      deals: [...this.world.exempt].map((s) => `approve all ${s} events`) };
    this.desk.setDocs(this.world.docs(this.day).map((id) => buildDoc(id, ctx, hooks.themeIssues)), { keepTab });
  }

  private say(msg: string, color = K.ui.textInt) { this.desk.say(msg, color); }

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

  private prompt(msg: string, y = H - 30) {
    const p = text(this, W / 2, y, msg, { align: 'center', color: K.ui.accentInt, depth: 102 });
    this.overlay.push(p);
    this.timers.push(this.time.addEvent({ delay: 500, loop: true, callback: () => p.setVisible(!p.visible) }));
  }

  private add_(t: Phaser.GameObjects.GameObject) { this.overlay.push(t); return t; }

  /** Manager portrait + typewriter speech. Returns the y below the speech. */
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
    const ev = this.time.addEvent({ delay: 22, repeat: full.length, callback: () => {
      i++;
      t.setText(full.slice(0, i));
      if (i >= full.length) face.stop().setFrame(0);
    } });
    this.timers.push(ev);
    this.desk.boss_('talk');
    return y + 4 + lines.length * 10;
  }

  private names(): Record<string, string> {
    const g = K.theme.game;
    const p = this.world.personaNames;
    return { manager: g.manager.name, company: K.theme.prospect.name, desk: g.desk.name, persona: p[p.length - 1] ?? 'someone' };
  }

  // ---------------------------------------------------------------- morning
  private showIntro() {
    this.mode = 'intro';
    hooks.state = 'dayintro';
    this.world.newDay(this.day);
    this.adj = this.pending;
    this.pending = noAdj();
    if (this.adj.quality) this.quality = Math.max(1, this.quality + this.adj.quality);
    this.charges = new Map(this.tools.map((id) => [id, this.diff.charges + (this.upgraded.has(id) ? 1 : 0) + this.adj.charges]));
    this.shield = false;
    this.botTool = false;
    this.request = REQUESTS.find((q) => q.day === this.day) ?? null;
    this.panel(`DAY ${this.day + 1}`);
    const ui = K.ui;
    this.add_(text(this, W / 2, 42, K.theme.game.desk.name, { align: 'center', color: ui.dimInt, depth: 102, maxWidth: W - 60, maxLines: 1 }));
    const y = Math.max(this.managerSays(K.theme.game.days[this.day]?.intro ?? 'Back to work!', 58) + 8, 118);
    const rules = this.world.days[this.day];
    this.add_(text(this, 118, y, rules.length > 1 ? 'NEW RULES' : 'NEW RULE', { color: ui.accentInt, depth: 102 }));
    let ry = y + 12;
    for (const r of rules) {
      const t = text(this, 118, ry, `- ${r.text}`, { depth: 102, maxWidth: W - 150, maxLines: 2 });
      this.add_(t);
      ry += t.lineCount * 10 + 2;
    }
    const before = new Set(this.day > 0 ? this.world.docs(this.day - 1) : []);
    const newDocs = this.world.docs(this.day).filter((d) => this.day > 0 && !before.has(d));
    if (this.day === PERSON_DAY) {
      this.add_(text(this, 118, ry + 2, 'NEW: PERSON PROFILES ($identify) land on the desk too.', { color: GOLD, depth: 102, maxWidth: W - 150, maxLines: 1 }));
      ry += 12;
    }
    if (newDocs.length) {
      this.add_(text(this, 118, ry + 2, `NEW ON YOUR DESK: ${newDocs.map((d) => TABS[d]).join(', ')} (TAB)`, { color: GOLD, depth: 102, maxWidth: W - 150, maxLines: 1 }));
      ry += 12;
    }
    if (this.adj.notes.length) this.add_(text(this, 118, ry + 2, this.adj.notes.join('  '), { color: RED, depth: 102, maxWidth: W - 150, maxLines: 2 }));
    if (this.day === 0) this.add_(text(this, 118, Math.max(ry + 6, 196), 'A approve   D flag   TAB docs   1-4 tools', { color: ui.dimInt, depth: 102 }));
    this.prompt(this.request ? 'ENTER: CONTINUE' : 'ENTER: START SHIFT');
    this.refreshDocs(false);
    this.refreshHud();
    this.say(this.day === 0 ? `First day at ${K.theme.prospect.name}. Let's keep the data clean!` : 'Coffee? Coffee. Back to the desk.');
  }

  private afterIntro() {
    if (this.request) this.showRequest(this.request);
    else this.startShift();
  }

  private showRequest(q: Request) {
    this.mode = 'request';
    hooks.state = 'request';
    K.play('paper');
    this.panel(q.title);
    const y = this.managerSays(fill(q.text, this.names()), 50, 5);
    const ui = K.ui;
    const opt = (x: number, key: string, label: string, col: number) => {
      this.add_(box(this, x, Math.max(y + 16, 150), 150, 30, ui.bgInt, col, ui.panelInt).setDepth(102));
      this.add_(text(this, x + 75, Math.max(y + 16, 150) + 6, key, { align: 'center', color: col, depth: 103 }));
      this.add_(text(this, x + 75, Math.max(y + 16, 150) + 17, label, { align: 'center', color: ui.textInt, depth: 103 }));
    };
    opt(100, 'A / LEFT', q.yes.label, GREEN);
    opt(270, 'D / RIGHT', q.no.label, RED);
    this.add_(text(this, W / 2, H - 44, 'Your choices change the week, and how it ends.', { align: 'center', color: ui.dimInt, depth: 102 }));
  }

  private answerRequest(yes: boolean) {
    const q = this.request;
    if (!q || this.mode !== 'request') return;
    this.choices[q.id] = yes;
    const o = yes ? q.yes : q.no;
    this.apply(o.effect);
    if (yes && q.id === 'overtime') this.addPending(OVERTIME_BONUS, 'Overtime: +10s and +1 tool use today.');
    capture('request_answered', { request: q.id, yes, day: this.day + 1 });
    K.play(yes ? 'correct' : 'select');
    this.mode = 'reply';
    hooks.state = 'reply';
    this.panel(q.title);
    this.managerSays(fill(o.reply, this.names()), 58);
    const fx = this.effectText(o.effect);
    if (fx) this.add_(text(this, 118, 120, fx, { color: GOLD, depth: 102, maxWidth: W - 150, maxLines: 2 }));
    this.prompt('ENTER: START SHIFT');
    this.refreshDocs();
    this.refreshHud();
  }

  private effectText(e: Effect) {
    const out: string[] = [];
    if (e.credits) out.push(`+${e.credits} credits`);
    if (e.clock) out.push(`${e.clock > 0 ? '+' : ''}${e.clock}s today`);
    if (e.quality) out.push(`+${e.quality} quality`);
    if (e.score) out.push(`+${e.score} score`);
    if (e.exemptToday) out.push(`${e.exemptToday} events: approve them today`);
    if (e.exemptWeek) out.push(`${e.exemptWeek} events: approve them all week`);
    return out.join('   ');
  }

  private apply(e: Effect) {
    this.credits += e.credits ?? 0;
    if (e.quality) this.quality = Math.min(100, Math.max(1, this.quality + e.quality));
    this.adj.clock += e.clock ?? 0;
    if (e.charges) this.tools.forEach((id) => this.charges.set(id, (this.charges.get(id) ?? 0) + e.charges!));
    this.corners += e.corners ?? 0;
    this.integrity += e.integrity ?? 0;
    this.stress = Math.max(0, this.stress + (e.stress ?? 0));
    this.score += e.score ?? 0;
    if (e.exemptToday) { this.world.exempt.add(e.exemptToday); this.todayExempt.push(e.exemptToday); }
    if (e.exemptWeek) this.world.exempt.add(e.exemptWeek);
  }

  private addPending(e: Effect, note: string) {
    this.pending.clock += e.clock ?? 0;
    this.pending.charges += e.charges ?? 0;
    this.pending.quality += e.quality ?? 0;
    this.pending.notes.push(note);
  }

  // ---------------------------------------------------------------- evening
  private showSummary() {
    this.mode = 'summary';
    hooks.state = 'summary';
    K.play('dayend');
    this.desk.hidePicker();
    this.desk.discard(!this.lastFlag);
    this.rec = null;
    const s = this.stats;
    const missingQuota = Math.max(0, this.quota - s.processed);
    const quotaMet = missingQuota === 0;
    if (quotaMet) { this.score += 250; this.quotasMet++; } else this.hitQuality(missingQuota * 4 * this.diff.pen * this.heat.pen);
    const judged = s.processed - s.skipped;
    const g = grade(judged > 0 ? s.correct / judged : 0, s.processed / this.quota);
    this.grades.push(g);
    this.dayMistakes.push(s.missed + s.falseFlags);
    if (this.day === 2 && s.missed + s.falseFlags === 0 && s.processed > 0) achieve('clean_day3');
    for (const src of this.todayExempt) this.world.exempt.delete(src);
    this.todayExempt = [];
    this.dayCredits = earned(s.correct, quotaMet, g.g);
    this.credits += this.dayCredits;
    const last = this.day + 1 >= DAYS;
    this.billOn = { infra: true, coffee: true, tooling: false };
    this.fitBills();
    this.drawSummary(missingQuota, g.g, last);
    this.refreshHud();
    if (this.quality <= 0 && !this.god) this.time.delayedCall(900, () => this.finish(false));
  }

  private billCost(b: Bill) { return Math.round(b.cost * this.heat.bills); }
  private billTotal() { return BILLS.filter((b) => this.billOn[b.id]).reduce((n, b) => n + this.billCost(b), 0); }
  /** Untick what can't be paid, cheapest-essential first. */
  private fitBills() {
    for (const id of ['tooling', 'coffee', 'infra'] as Bill['id'][]) if (this.billTotal() > this.credits) this.billOn[id] = false;
    if (this.tools.every((t) => this.upgraded.has(t))) this.billOn.tooling = false;
  }

  private drawSummary(missingQuota: number, g: string, last: boolean) {
    this.panel(`END OF DAY ${this.day + 1}`);
    const ui = K.ui;
    const s = this.stats;
    const rows: [string, string, number?][] = [
      ['Records checked', String(s.processed)],
      ['Correct calls', String(s.correct)],
      ['Bad data caught', String(s.caught)],
      ['Bad data let in', String(s.missed), s.missed ? RED : undefined],
      ['Good data flagged', String(s.falseFlags), s.falseFlags ? RED : undefined],
      ['Daily quota', missingQuota ? `MISSED by ${missingQuota}` : 'MET (+250)', missingQuota ? RED : GREEN],
      ['Data quality', `${Math.round(this.quality)}%`],
      ['Score', String(this.score)],
    ];
    rows.forEach(([k, v, c], i) => {
      this.add_(text(this, 146, 50 + i * 13, k, { align: 'right', color: ui.dimInt, depth: 102 }));
      this.add_(text(this, 154, 50 + i * 13, v, { color: c ?? ui.textInt, depth: 102 }));
    });
    this.add_(text(this, 290, 46, 'GRADE', { color: ui.dimInt, depth: 102 }));
    const judged = s.processed - s.skipped;
    this.add_(text(this, 360, 62, `${judged ? Math.round((100 * s.correct) / judged) : 0}% right, ${s.processed}/${this.quota}`, { color: ui.dimInt, depth: 102 }));
    this.add_(text(this, 330, 42, g, { scale: 3, color: gradeColor(g), depth: 102, shadow: ui.panelInt }));
    this.add_(text(this, 360, 50, `+${this.dayCredits} CREDITS`, { color: GOLD, depth: 102 }));
    if (last) {
      this.add_(text(this, 290, 80, 'No bills tonight.', { color: ui.dimInt, depth: 102 }));
      this.add_(text(this, 290, 92, `Credits left: ${this.credits}`, { color: GOLD, depth: 102 }));
      this.prompt('ENTER: ONE MORE THING...');
      return;
    }
    this.add_(text(this, 290, 76, 'BILLS', { color: ui.accentInt, depth: 102 }));
    const draw: Phaser.GameObjects.GameObject[] = [];
    const redraw = () => {
      draw.forEach((o) => o.destroy());
      draw.length = 0;
      BILLS.forEach((b, i) => {
        const y = 90 + i * 24;
        const on = this.billOn[b.id];
        const col = on ? ui.textInt : ui.dimInt;
        draw.push(text(this, 290, y, `${i + 1} [${on ? 'X' : ' '}] ${b.name}`, { color: col, depth: 102 }));
        draw.push(text(this, 446, y, `${this.billCost(b)}`, { align: 'right', color: on ? GOLD : ui.dimInt, depth: 102 }));
        const note = on ? (b.buy ?? 'paid') : (b.optional ? (b.buy ? `buy: ${b.buy}` : '') : `skip: ${b.skip}`);
        draw.push(text(this, 302, y + 10, note, { color: on ? GREEN : b.optional ? ui.dimInt : RED, depth: 102, maxWidth: 168, maxLines: 1 }));
      });
      draw.push(text(this, 290, 166, `CREDITS ${this.credits} - ${this.billTotal()} = ${this.credits - this.billTotal()}`, { color: GOLD, depth: 102 }));
      draw.push(text(this, 290, 180, '1-3 toggle', { color: ui.dimInt, depth: 102 }));
    };
    this.redrawBills = () => { redraw(); this.overlay.push(...draw); };
    this.redrawBills();
    this.prompt('ENTER: PAY AND GO HOME');
  }
  private redrawBills = () => {};

  private toggleBill(i: number) {
    const b = BILLS[i];
    if (!b || this.day + 1 >= DAYS) return;
    if (b.id === 'tooling' && this.tools.every((t) => this.upgraded.has(t))) { K.play('wrong', 0.4); return; }
    this.billOn[b.id] = !this.billOn[b.id];
    if (this.billTotal() > this.credits) { this.billOn[b.id] = false; K.play('wrong', 0.4); this.say('Not enough credits for that.', RED); }
    else K.play('move');
    this.redrawBills();
  }

  private payBills() {
    if (this.day + 1 < DAYS) {
      this.credits -= this.billTotal();
      if (!this.billOn.infra) this.addPending({ quality: -8 }, 'Skipped infra: -8 quality.');
      if (!this.billOn.coffee) { this.addPending({ clock: -8 }, 'No coffee: -8s.'); this.stress++; }
      if (this.billOn.tooling) {
        const t = this.tools.find((id) => !this.upgraded.has(id));
        if (t) { this.upgraded.add(t); this.pending.notes.push(`${TOOLS[t].name} upgraded: 2 uses a day.`); }
      }
    }
    this.nextDay();
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
    this.add_(text(this, 118, 150, 'No clock. No tools. Take your time.', { color: K.ui.dimInt, depth: 102 }));
    this.add_(text(this, 118, 162, 'Flag it with the right reason for a bonus.', { color: K.ui.dimInt, depth: 102 }));
    this.prompt('ENTER: BRING IT IN');
  }

  // ---------------------------------------------------------------- shift
  private startShift() {
    this.clearOverlay();
    this.mode = 'playing';
    hooks.state = 'playing';
    this.clock = Math.max(15, this.dayLen + this.adj.clock);
    this.lastTick = Math.ceil(this.clock);
    const kit = this.world.days[this.day].find((r) => r.kit);
    // A document that arrived today opens on top of the stack.
    const before = new Set(this.day > 0 ? this.world.docs(this.day - 1) : ['rules', 'plan']);
    const fresh = this.world.docs(this.day).find((d) => !before.has(d));
    if (fresh) this.desk.switchTab(fresh);
    this.say(kit ? `New: ${kit.text}` : this.world.days[this.day][0]?.text ? `Today: ${this.world.days[this.day][0].text}` : 'Here they come.');
    this.newRecord();
  }

  private startEndless() {
    this.day = 0;
    this.world.newDay(0);
    this.charges = new Map(this.tools.map((id) => [id, this.diff.charges]));
    this.refreshDocs(false);
    this.mode = 'playing';
    hooks.state = 'playing';
    this.say('ENDLESS SHIFT: rules keep stacking. Quality drains. Go!', K.ui.accentInt);
    this.newRecord();
  }

  /** Endless: every few records a new rule lands; tools recharge and the boards change. */
  private endlessStep() {
    const n = this.total.processed;
    if (n === 0 || n % ENDLESS_STEP !== 0) return;
    const before = this.world.active(this.day).length;
    this.day = Math.min(DAYS - 1, this.day + 1);
    this.world.newDay(this.day);
    this.charges = new Map(this.tools.map((id) => [id, this.diff.charges]));
    const added = this.world.active(this.day).slice(before);
    toast(this, added.length ? `NEW RULE: ${added[0].text}` : 'NEW BOARDS: check UPTIME and FLAGS');
    this.refreshDocs();
  }

  private newRecord(final = false) {
    this.desk.discard(!this.lastFlag);
    const w = this.world, r = w.r;
    const active = w.active(this.day);
    // From day 4 some records are person profiles ($identify): a different card, and only some rules apply.
    const rec = !final && this.day >= PERSON_DAY && r.chance(this.firstWeek ? 0.15 : 0.25) ? w.personBaseline() : w.baseline();
    const endless = this.runMode === 'endless';
    const badChance = final ? 1 : endless ? Math.min(0.6, 0.4 + this.total.processed * 0.004) : 0.35 + this.day * 0.04 + this.heat.bad;
    const exempt = [...w.exempt];
    if (!final && this.runMode !== 'endless' && this.day >= 1 && this.day <= 3 && !this.patternSeen.has(this.day)
      && this.stats.processed >= 2 + (this.day % 2)) {
      this.patternRecord(rec);
    } else if (!final && exempt.length && r.chance(0.16)) {
      rec.source = r.pick(exempt); // the deal: noisy junk you were told to wave through
      if (r.chance(0.7)) for (const rule of r.shuffle([...active])) if (w.breakRule(rec, rule)) break;
      rec.source = r.pick(exempt);
    } else if (r.chance(badChance) && active.length) {
      const order = r.shuffle([...active]);
      if (final) order.sort((a, b) => a.day - b.day); // the final record breaks the oldest rule, subtly
      const subtle = final || r.chance(endless ? Math.min(0.5, this.total.processed * 0.01) : this.heat.subtle);
      let need = final && this.heat.final2 ? 2 : 1;
      for (const rule of order) if (need > 0 && w.breakRule(rec, rule, subtle)) need--;
    }
    rec.final = final;
    this.rec = rec;
    this.broken = w.violations(rec, active);
    if (rec.pattern && this.broken.length) rec.pattern = false;
    if (rec.pattern) {
      this.patternSeen.add(this.day);
      const who = w.personaNames[rec.persona] ?? 'someone';
      this.say(this.patternSeen.size === 1 ? `Hm. ${who}, up at 3 AM?` : `${who} again. 3 AM again. Same event...`, K.ui.dimInt);
    }
    w.shown(rec);
    this.readyAt = this.t + 0.3;
    this.nextAt = -1;
    this.botT = 0;
    const p = K.theme.game.personas[rec.persona] ?? K.theme.game.personas[0];
    this.desk.drawCard(rec, { persona: p, portrait: spr(`persona_${rec.persona + 1}`), exempt: w.exempt.has(rec.source) ? rec.source : null, final });
    K.play('paper', 0.6);
    this.refreshHud();
  }

  /** Same user, same event, in the middle of the night: legal, but odd. Flag all three for the secret ending. */
  private patternRecord(rec: Rec) {
    const w = this.world;
    const ev = w.events.find((e) => e.name === this.patternEvent) ?? w.events[0];
    const persona = w.personas - 1;
    const fresh = w.baseline(ev);
    Object.assign(rec, { event: fresh.event, props: fresh.props.filter(([k]) => k !== FLAG_PROP), persona,
      email: w.directory[persona] ?? rec.email, pattern: true, person: false });
    w.setTime(rec, 0, 180 + w.r.int(0, 40));
  }

  // ---------------------------------------------------------------- decisions
  private answer(flag: boolean) {
    if (!this.rec || this.t < this.readyAt || this.nextAt !== -1) return;
    if (!flag) { this.resolve(false, null); return; }
    const active = this.world.active(this.day);
    if (active.length <= 1) { this.resolve(true, active[0] ?? null); return; }
    this.openPicker(active);
  }

  /** FLAG asks why: up to 4 active rules, including one that is broken when the record is bad. */
  private openPicker(active: Rule[]) {
    const r = this.pickRng; // not the world's RNG: the daily record stream must not depend on the player's flags
    const n = Math.min(4, active.length);
    let opts: Rule[];
    if (active.length <= 4) opts = [...active];
    else {
      const must = this.broken.length ? [r.pick(this.broken)] : [];
      opts = [...must, ...r.shuffle(active.filter((x) => !must.includes(x))).slice(0, n - must.length)];
      opts.sort((a, b) => active.indexOf(a) - active.indexOf(b));
    }
    this.options = opts;
    this.sel = 0;
    if (!this.pickerSeen) {
      this.pickerSeen = true;
      this.say('Pick the rule it breaks (1-4). Right reason = bonus.', K.ui.accentInt);
    }
    this.prevMode = this.mode;
    this.mode = 'reason';
    hooks.state = 'reason';
    K.play('paper', 0.5);
    this.drawPicker();
  }

  private drawPicker() {
    const active = this.world.active(this.day);
    this.desk.showPicker(this.options.map((o) => `#${active.indexOf(o) + 1} ${o.text}`), this.sel);
  }

  private pickReason(i: number) {
    if (this.mode !== 'reason' || !this.options[i]) return;
    this.mode = this.prevMode;
    hooks.state = this.mode === 'final' ? 'final' : 'playing';
    this.desk.hidePicker();
    this.resolve(true, this.options[i]);
  }

  private cancelPicker() {
    if (this.mode !== 'reason') return;
    this.mode = this.prevMode;
    hooks.state = this.mode === 'final' ? 'final' : 'playing';
    this.desk.hidePicker();
    K.play('move');
  }

  private resolve(flag: boolean, reason: Rule | null) {
    const rec = this.rec!;
    if (flag && rec.pattern && !this.broken.length) { this.notePattern(); return; }
    const bad = this.broken.length > 0;
    const correct = flag === bad;
    this.lastFlag = flag;
    this.desk.stamp(flag);
    K.play('stamp');
    hitstop(this, 45);
    this.stats.processed++;
    this.total.processed++;
    if (!flag && this.world.exempt.has(rec.source) && this.world.violations(rec, this.world.active(this.day), true).length) this.junk++;
    if (correct) {
      this.stats.correct++; this.total.correct++;
      const reasonRight = flag && !!reason && this.broken.includes(reason);
      if (bad) {
        this.stats.caught++; this.total.caught++;
        if (reasonRight) this.reasonsRight++; else this.reasonsWrong++;
      }
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (this.streak === 15) achieve('streak15');
      let pts = (100 + Math.min(this.streak, 5) * 10) * (this.boost > 0 ? 2 : 1);
      if (this.boost > 0) this.boost--;
      if (rec.final) { pts = 1000 + (reasonRight ? 250 : 0); this.finalCaught = true; achieve('final'); }
      else if (bad) pts = reasonRight ? pts + 50 : Math.round(pts * 0.6);
      this.score += pts;
      const q = this.runMode === 'endless' ? 3 : 2;
      if (!bad || reasonRight) this.quality = Math.min(100, this.quality + q);
      K.play('correct', 0.6);
      this.desk.float(`+${pts}`, bad && !reasonRight ? GOLD : GREEN);
      if (this.streak > 0 && this.streak % 5 === 0) this.desk.boss_('good');
      if (!bad) this.say('Clean record. Into the warehouse it goes.');
      else if (reasonRight) this.say(`CAUGHT: ${reason!.text}`, GREEN);
      else {
        this.say(`Right call, wrong reason: it was rule #${this.world.active(this.day).indexOf(this.broken[0]) + 1}.`, GOLD);
        this.desk.highlight(fieldFor(this.broken[0], this.world));
      }
    } else {
      this.streak = 0;
      if (bad) { this.stats.missed++; this.total.missed++; } else { this.stats.falseFlags++; this.total.falseFlags++; }
      const cost = (rec.final ? 30 : bad ? 8 : 5) * this.diff.pen * this.heat.pen * (this.runMode === 'endless' ? 1.5 : 1);
      if (this.shield && !rec.final) {
        this.shield = false;
        this.say('AUTO-CATCH saved you: that call was wrong, no harm done.', GOLD);
      } else {
        this.hitQuality(cost);
        const deal = this.world.exempt.has(rec.source) ? ` (deal: approve ${rec.source})` : '';
        this.say(bad ? `MISSED: ${this.broken[0].text}` : `That one was fine! Good data got flagged.${deal}`, RED);
        this.desk.boss_('bad');
      }
      if (bad) this.desk.highlight(fieldFor(this.broken[0], this.world));
      K.play('wrong', 0.8);
    }
    this.nextAt = this.t + (correct ? 0.45 : 0.9);
    if (this.runMode === 'endless') this.endlessStep();
    this.refreshHud();
    if (rec.final) {
      this.nextAt = -2;
      this.time.delayedCall(1800, () => this.finish(this.quality > 0 || this.god));
      return;
    }
    if (this.quality <= 0 && !this.god) this.time.delayedCall(700, () => this.finish(false));
  }

  private notePattern() {
    this.lastFlag = true;
    this.desk.stamp(true);
    K.play('stamp');
    hitstop(this, 45);
    this.stats.processed++; this.total.processed++;
    this.stats.correct++; this.total.correct++;
    this.patternNoted++;
    const who = this.world.personaNames[this.rec!.persona] ?? 'someone';
    this.say(`No rule broken... but you note ${who} at 3 AM. (${this.patternNoted}/3)`, GOLD);
    this.desk.float('NOTED', GOLD);
    this.nextAt = this.t + 0.6;
    this.refreshHud();
  }

  private hitQuality(n: number) {
    this.quality = Math.max(this.god ? 1 : 0, this.quality - n);
  }

  private useTool(i: number) {
    const id = this.tools[i];
    if (!id || !this.rec || this.mode !== 'playing' || this.nextAt !== -1) return;
    const n = this.charges.get(id) ?? 0;
    if (n <= 0) { this.say(`${TOOLS[id].name} is used up for today.`, GREY); K.play('move'); return; }
    this.charges.set(id, n - 1);
    this.toolsUsed++;
    K.play('power');
    this.desk.toolFlash(i);
    capture('product_used', { product: id, day: this.day + 1 });
    const b = this.broken[0];
    const col = productColor(id);
    switch (id) {
      case 'session_replay': {
        if (!b) { this.say('REWIND: the replay looks normal. Nothing odd here.', col); break; }
        const f = fieldFor(b, this.world);
        const doc = docFor(b);
        if (doc !== 'rules' && this.desk.docs.some((d) => d.id === doc)) this.desk.switchTab(doc);
        if (this.desk.highlight(f)) this.say(`REWIND: something is off with ${f}${doc !== 'rules' ? `. Check ${TABS[doc]}.` : '.'}`, col);
        else this.say(`REWIND: something is MISSING (${f}).`, col);
        break;
      }
      case 'product_analytics': {
        const idx = b ? this.world.active(this.day).indexOf(b) + 1 : 0;
        this.say(b ? `INSIGHT: this record breaks rule ${idx}.` : 'INSIGHT: no rules broken. Looks clean.', col);
        if (b) this.desk.switchTab('rules');
        break;
      }
      case 'feature_flags':
        this.say('KILL SWITCH: record switched off. Next!', col);
        this.stats.processed++; this.stats.skipped++; this.total.processed++; this.total.skipped++;
        this.lastFlag = false;
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
    const left = ['ArrowLeft', 'KeyA'].includes(c), right = ['ArrowRight', 'KeyD'].includes(c);
    const up = ['ArrowUp', 'KeyW'].includes(c), down = ['ArrowDown', 'KeyS'].includes(c);
    const digit = /^(Digit|Numpad)[1-4]$/.test(c) ? +c.slice(-1) - 1 : -1;
    const armed = this.overlayT > 0.3;
    switch (this.mode) {
      case 'intro': if (go && armed) { K.play('select'); this.afterIntro(); } break;
      case 'request': if ((left || right) && armed) this.answerRequest(left); break;
      case 'reply': if (go && armed) { K.play('select'); this.startShift(); } break;
      case 'summary':
        if (digit >= 0 && armed) this.toggleBill(digit);
        else if (go && armed) { K.play('select'); this.payBills(); }
        break;
      case 'finalintro': if (go && armed) { K.play('select'); this.startFinal(); } break;
      case 'reason':
        if (digit >= 0) this.pickReason(digit);
        else if (up || down) { this.sel = (this.sel + (up ? -1 : 1) + this.options.length) % this.options.length; K.play('move', 0.4); this.drawPicker(); }
        else if (right || go) this.pickReason(this.sel);
        else if (left || c === 'Escape') this.cancelPicker();
        break;
      case 'playing':
      case 'final':
        if (left) this.answer(false);
        else if (right) this.answer(true);
        else if (c === 'Tab' || c === 'KeyE') this.desk.switchTab(e.shiftKey ? -1 : 1);
        else if (c === 'KeyQ') this.desk.switchTab(-1);
        else if (c === 'KeyR' || c === 'Escape') this.desk.switchTab('rules');
        else if (up || down) this.desk.scrollDoc(up ? -1 : 1);
        else if (this.mode === 'playing' && digit >= 0) this.useTool(digit);
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
    this.desk.tickFlames(this.t);
    if (hitstopped(this)) return;
    const dt = (Math.min(dtMs, 50) / 1000) * this.simSpeed;
    this.t += dt;
    this.overlayT += dt;
    const shift = this.mode === 'playing' || (this.mode === 'reason' && this.prevMode === 'playing');
    hooks.elapsed += shift || this.mode === 'final' || this.mode === 'reason' ? dt : 0;
    hooks.score = this.score;
    if (shift && this.runMode === 'endless') {
      this.hitQuality(Math.min(1.2, 0.35 + this.total.processed * 0.01) * dt);
      if (this.quality <= 0 && !this.god) { this.finish(false); return; }
      if (this.mode === 'playing' && this.nextAt >= 0 && this.t >= this.nextAt) this.newRecord();
      this.refreshHud();
    } else if (shift) {
      this.clock -= dt;
      // Tick every second in the last 10, twice a second in the last 5.
      const step = this.clock <= 5 ? Math.ceil(this.clock * 2) : Math.ceil(this.clock);
      if (this.clock <= 10 && step !== this.lastTick && this.clock > 0) K.play('tick', this.clock <= 5 ? 0.9 : 0.6, 0);
      this.lastTick = step;
      if (this.clock <= 0) { this.clock = 0; this.showSummary(); }
      else if (this.mode === 'playing' && this.nextAt >= 0 && this.t >= this.nextAt) this.newRecord();
      const frac = this.clock / this.dayLen;
      this.desk.clockBar(Math.min(1, frac), this.clockColour(frac));
    }
    if (this.autopilot) this.bot(dt);
    hooks.stats = {
      day: this.day + 1, mode: this.mode, runMode: this.runMode, heat: this.heatN, quality: Math.round(this.quality), score: this.score,
      clock: Math.round(this.clock), processed: this.total.processed, correct: this.total.correct, missed: this.total.missed,
      falseFlags: this.total.falseFlags, reasonsRight: this.reasonsRight, reasonsWrong: this.reasonsWrong, credits: this.credits,
      grades: this.grades.map((g) => g.g), corners: this.corners, integrity: this.integrity, stress: this.stress, junk: this.junk,
      streak: this.streak, bestStreak: this.bestStreak, tools: this.toolsUsed, tab: this.desk.tab, docs: this.desk.docs.map((d) => d.id),
      rules: this.world.active(this.day).length,
      record: this.rec ? { event: this.rec.event, bad: this.broken.length > 0, broken: this.broken.map((r) => r.type) } : null,
    };
  }

  private bot(dt: number) {
    this.botT += dt;
    if (['intro', 'request', 'reply', 'summary', 'finalintro'].includes(this.mode) && this.overlayT > 0.6) {
      if (this.mode === 'intro') this.afterIntro();
      else if (this.mode === 'request') this.answerRequest(this.plan.requests === 'yes'); // by default the bot plays it straight
      else if (this.mode === 'reply') this.startShift();
      else if (this.mode === 'summary') {
        if (this.quality <= 0) return;
        if (this.day + 1 < DAYS) {
          const pay = this.plan.bills === 'all';
          this.billOn = { infra: pay, coffee: pay, tooling: pay };
          this.fitBills();
        }
        this.payBills();
      } else this.startFinal();
      return;
    }
    if (this.mode === 'reason' && this.botT > 0.25) {
      const bad = this.broken.length > 0;
      const i = this.options.findIndex((o) => this.broken.includes(o));
      this.pickReason(bad && i >= 0 && Math.random() < this.plan.reasons ? i : Math.floor(Math.random() * this.options.length));
      return;
    }
    if ((this.mode === 'playing' || this.mode === 'final') && this.rec && this.nextAt === -1 && this.t >= this.readyAt && this.botT > this.plan.pace) {
      const bad = this.broken.length > 0;
      if (this.plan.pattern && this.rec.pattern) { this.answer(true); return; }
      if (bad) {
        const doc = docFor(this.broken[0]);
        if (this.desk.docs.some((d) => d.id === doc)) this.desk.switchTab(doc);
        if (!this.botTool && this.mode === 'playing' && this.tools.length && Math.random() < 0.3) {
          this.botTool = true;
          this.useTool(this.day % this.tools.length);
          if (this.nextAt !== -1) return;
        }
      }
      const right = this.rec.final || Math.random() < this.plan.accuracy;
      this.answer(right ? bad : !bad);
    }
  }

  // ---------------------------------------------------------------- the end
  private finish(won: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.mode = 'done';
    this.desk.hidePicker();
    const judged = this.total.processed - this.total.skipped;
    const acc = judged > 0 ? Math.round((100 * this.total.correct) / judged) : 0;
    const save = kitSave();
    Object.assign(lastEnd, { ending: null, grade: '', endless: false, records: 0, newBestGrade: false, names: this.names() });
    if (this.runMode === 'endless') {
      const n = this.total.correct; // endless score = records called right
      lastEnd.endless = true;
      lastEnd.records = n;
      if (n > save.endlessBest) save.endlessBest = n;
      meta.save();
      if (n >= 50) achieve('endless50');
      this.time.delayedCall(700, () => this.scene.start('End', {
        won: false, score: n, headline: 'SHIFT OVER',
        stats: [['Records checked', this.total.processed], ['Accuracy', `${acc}%`], ['Rules stacked', this.world.active(this.day).length]],
        props: { mode: 'endless', records: n, accuracy: acc },
      }));
      return;
    }
    const pts = this.grades.length ? this.grades.reduce((a, g) => a + g.pts, 0) / this.grades.length : 0;
    const weekGrade = letter(pts);
    if (won) this.score += this.credits * 5;
    const ending = pickEnding({ won, corners: this.corners, integrity: this.integrity, stress: this.stress, junk: this.junk,
      missed: this.total.missed, accuracy: acc, quotasMet: this.quotasMet, days: DAYS, pattern: this.patternNoted >= 3 });
    lastEnd.ending = ending;
    lastEnd.grade = won ? weekGrade : '';
    if (ending && !save.endings.includes(ending.id)) save.endings.push(ending.id);
    const key = String(this.heatN);
    if (won && (!save.bestGrade[key] || 'SABCD'.indexOf(weekGrade) < 'SABCD'.indexOf(save.bestGrade[key]))) {
      save.bestGrade[key] = weekGrade;
      lastEnd.newBestGrade = true;
    }
    meta.save();
    if (won) {
      achieve('first_week');
      if (this.patternNoted >= 3) achieve('pattern');
      if (this.toolsUsed === 0) achieve('no_tools');
      if (this.reasonsWrong === 0 && this.reasonsRight >= 3) achieve('reasons');
      if (weekGrade === 'S') achieve('grade_s');
      if (this.heatN >= 3) achieve('heat3');
      if (this.heatN >= 5) achieve('heat5');
      if (this.runMode === 'daily') achieve('daily');
      const asked = REQUESTS.filter((q) => q.id in this.choices);
      if (asked.length >= 3 && asked.every((q) => !this.choices[q.id])) achieve('honest');
    }
    if (ENDINGS.every((e) => save.endings.includes(e.id))) achieve('all_endings');
    const headline = ending?.name ?? (won ? 'SHIFT SURVIVED' : 'DATA DISASTER');
    capture('ending_reached', { ending: ending?.id ?? 'none', grade: weekGrade, heat: this.heatN, mode: this.runMode });
    this.time.delayedCall(won ? 300 : 700, () => this.scene.start('End', {
      won, score: this.score, headline,
      stats: [['Records checked', this.total.processed], ['Accuracy', `${acc}%`],
        ['Week grade', won ? `${weekGrade}  (days ${this.grades.map((g) => g.g).join('')})` : '-']],
      props: { day: this.day + 1, accuracy: acc, quality: Math.round(this.quality), tools: this.tools, ending: ending?.id ?? null,
        grade: weekGrade, heat: this.heatN, mode: this.runMode },
    }));
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    const jump = (d: number) => {
      this.clearOverlay();
      this.desk.hidePicker();
      this.day = Math.max(0, Math.min(DAYS - 1, d));
      this.stats = emptyStats();
      this.showIntro();
    };
    hooks.debug = {
      speed: (n: number) => { this.simSpeed = Math.max(1, Math.min(8, Math.round(n))); setJuiceSpeed(this.simSpeed); },
      god: (on = true) => { this.god = !!on; },
      autopilot: (on = true) => { this.autopilot = !!on; },
      botPlan: (p: Partial<BotPlan> = {}) => Object.assign(this.plan, p),
      lose: () => this.finish(false),
      win: () => this.finish(true),
      skipDay: () => { if (this.mode === 'playing' || (this.mode === 'reason' && this.prevMode === 'playing')) this.clock = 0.01; },
      rules: () => this.world.active(this.day).map((r) => `${r.type}: ${r.text}`),
      /** Jump to the morning of day n (1-5). */
      day: (n: number) => jump((n | 0) - 1),
      docs: () => this.desk.docs.map((d) => ({ id: d.id, lines: d.lines.map((l) => l.t) })),
      tab: (id: string) => this.desk.switchTab(id),
      /** Answer the open request (true = yes) or pick a flag reason (0-3). */
      choose: (yes = false) => this.answerRequest(!!yes),
      reason: (i = 0) => this.pickReason(i | 0),
      bills: (on: Partial<Record<Bill['id'], boolean>>) => { Object.assign(this.billOn, on); this.redrawBills(); },
      story: () => ({ corners: this.corners, integrity: this.integrity, stress: this.stress, junk: this.junk, choices: this.choices,
        credits: this.credits, grades: this.grades, upgraded: [...this.upgraded], exempt: [...this.world.exempt] }),
      ending: () => pickEnding({ won: true, corners: this.corners, integrity: this.integrity, stress: this.stress, junk: this.junk,
        missed: this.total.missed, accuracy: 100, quotasMet: this.quotasMet, days: DAYS, pattern: this.patternNoted >= 3 })?.id ?? null,
      world: () => ({ outages: this.world.outages, releases: this.world.releases, directory: this.world.directory,
        textProp: this.world.textProp, money: this.world.money, desk: this.world.all.filter((r) => r.kit).map((r) => `${r.day + 1}:${r.type}`) }),
      endings: () => kitSave().endings,
      /** The next records' fingerprints (event/id/time), without showing them: checks the daily stream is seeded. */
      peek: () => this.rec ? `${this.rec.event}|${this.rec.id}|${this.rec.time}|${this.rec.email}` : null,
      pattern: () => ({ seen: [...this.patternSeen].map((d) => d + 1), noted: this.patternNoted, event: this.patternEvent }),
      /** Restart the game scene with a heat level / mode (e.g. heat(5), mode('endless')). */
      heat: (n: number) => { K.run.heat = Math.max(0, Math.min(5, n | 0)); K.run.choices.heat = K.run.heat; this.scene.restart(); },
      mode: (m: string) => { K.run.mode = m; K.run.choices.mode = m; this.scene.restart(); },
      unlockAll: () => {
        const s = kitSave();
        s.endings = ENDINGS.map((e) => e.id);
        s.bestGrade = { 0: 'A', 1: 'B', 2: 'B', 3: 'C', 4: 'C', 5: 'D' };
        return sharedDebug.unlockAll?.();
      },
      /** Rule-engine self check on a private World with every desk rule: baselines that break a rule, and breaks
       * that don't show up in violations() (both should be ~0). */
      selfTest: (n = 150) => {
        const issues: string[] = [];
        const w = new World(K.theme, issues, { rng: rng(1234), desk: [...DESK_TYPES] });
        const baseBad: Record<string, number> = {}, breakMiss: Record<string, number> = {}, breakFail: Record<string, number> = {};
        let records = 0;
        for (let d = 0; d < DAYS; d++) {
          w.newDay(d);
          const active = w.active(d);
          for (let i = 0; i < n; i++) {
            const rec = i % 4 === 3 ? w.personBaseline() : w.baseline();
            records++;
            for (const v of w.violations(rec, active)) baseBad[v.type] = (baseBad[v.type] ?? 0) + 1;
            w.shown(rec);
          }
          for (const rule of active) for (let i = 0; i < 20; i++) {
            const rec = i % 4 === 3 ? w.personBaseline() : w.baseline();
            if (!w.breakRule(rec, rule, i % 2 === 0)) { breakFail[rule.type] = (breakFail[rule.type] ?? 0) + 1; continue; }
            if (!w.violations(rec, active).includes(rule)) breakMiss[rule.type] = (breakMiss[rule.type] ?? 0) + 1;
          }
        }
        return { records, rules: w.all.map((r) => `${r.day + 1}:${r.type}`), baseBad, breakMiss, breakFail, issues };
      },
      // Load test (tests/accept.py): the busiest desk (day 5, every document) at top bot speed.
      flood: () => {
        hooks.debug.showcase();
        this.day = DAYS - 1;
        this.world.newDay(this.day);
        this.refreshDocs(false);
        this.simSpeed = 8;
        setJuiceSpeed(8);
        this.autopilot = true;
      },
      // For the gameplay GIF: a busy day-4 shift with every document on the desk.
      showcase: () => {
        if (this.finished) return;
        this.clearOverlay();
        this.day = Math.min(3, DAYS - 1);
        this.world.newDay(this.day);
        this.stats = emptyStats();
        this.stats.processed = 3;
        this.total.processed += 17; this.total.correct += 16; this.total.caught += 6;
        this.score = Math.max(this.score, 2380);
        this.quality = Math.min(this.quality, 86);
        this.streak = 4;
        this.charges = new Map(this.tools.map((id) => [id, this.diff.charges]));
        this.refreshDocs(false);
        this.startShift();
        this.clock = this.dayLen * 0.6;
        this.time.delayedCall(400, () => { if (this.mode === 'playing' && this.nextAt === -1) this.useTool(0); });
      },
    };
  }
}
