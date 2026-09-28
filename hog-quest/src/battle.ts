// Hog Quest battles: FIGHT / ACT / POSTHOG / SPARE, then a bullet-dodging enemy turn.
// Every enemy is a small puzzle: ACT > CHECK hints at the acts it wants, in order; the right PostHog
// product (solved_by) fixes it at once. A full mercy meter lets you SPARE it: the flattering route
// where PostHog fixes the prospect's problems. FIGHT (a timing bar with a crit zone) is the other way.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { achieve, meta } from '@shared/meta';
import { shake, hitstop, hitstopped, flash, burst, floatText, punch } from '@shared/juice';
import { text, bar, PixelText, W } from '@shared/ui';
import { R, BOSS, MINI, MAX_CONTINUES, encDef, endData, productName, EncDef, route, heat } from './state';
import { item, itemLine } from './items';
import { Box } from './patterns';
import { Typewriter } from './typewriter';
import { makePuzzle, hint, Puzzle, VERBS, verbLabel, wantOf } from './acts';
import { enemySteps, enemyStep, bossStep, Step } from './choreo';
import { Dodge } from './dodge';
import { battleMusic, stopBattleMusic } from './music';
import { patchHq } from './save';
import { FLAVOUR, RULES, BUBBLES, EFFECTS } from './battletext';

const TEXT_BOX: Box = { x: 24, y: 110, w: 432, h: 86 };
const DODGE_BOX: Box = { x: 165, y: 110, w: 150, h: 86 };
const BUTTONS = ['FIGHT', 'ACT', 'POSTHOG', 'ITEM', 'SPARE'];
const BTN_X = (i: number) => 24 + i * 87;
const TP_COST = 40;
const CRIT_ZONE = 5;

type Mode = 'menu' | 'acts' | 'items' | 'bag' | 'fight' | 'result' | 'turn' | 'end';
type Mood = 'calm' | 'annoyed' | 'ready' | 'furious';

interface Choice { id: string; t: PixelText; icon?: Phaser.GameObjects.Image; x: number; y: number }

export class BattleScene extends Phaser.Scene {
  private enc = 0;
  private def!: EncDef;
  private isBoss = false;
  private hell = false;
  private isMini = false;      // bugfix-route boss: can't be talked down, pure bullet hell
  private hp = 36;
  private maxHp = 36;
  private mercy = 0;
  private solved = false;
  private annoyed = false;
  private puzzle!: Puzzle;
  private progress = 0;      // how many acts of the puzzle sequence are done
  private checked = false;
  private used = new Set<string>();
  private turn = 0;
  private steps: Step[] = [];
  private mode: Mode = 'menu';
  private sel = 0;
  private subSel = 0;
  private boxNow: Box = { ...TEXT_BOX };
  private frame!: Phaser.GameObjects.Graphics;
  private tw!: Typewriter;
  private enemy!: Phaser.GameObjects.Sprite;
  private enemyKey = '';
  private dust: number[] = [];
  private nameT!: PixelText;
  private moodT!: PixelText;
  private hpBar!: ReturnType<typeof bar>;
  private mercyBar!: ReturnType<typeof bar>;
  private myHp!: PixelText;
  private myBar!: ReturnType<typeof bar>;
  private tpBar!: ReturnType<typeof bar>;
  private tpT!: PixelText;
  private caption!: PixelText;
  private tp = 0;
  private btns: { g: Phaser.GameObjects.Graphics; t: PixelText }[] = [];
  private choices: Choice[] = [];
  private soul!: Phaser.GameObjects.Image;
  private dodge!: Dodge;
  private turnLen = 4.5;
  private turnPats: string[] = [];
  private live = false; // the dodge box is open and bullets are running
  private fx = { slow: false, shield: false, crit: false, short: false };
  private fightX = 0;
  private fightG!: Phaser.GameObjects.Graphics;
  private next: (() => void) | null = null;
  private botT = 0;
  private finished = false;
  private hitsThis = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private clockT: PixelText | null = null;
  private lastMood: Mood | '' = '';

  constructor() { super('Battle'); }

  create(data: { enc: number }) {
    this.enc = data?.enc ?? 0;
    this.def = encDef(this.enc);
    this.isBoss = this.enc === BOSS;
    this.hell = this.isBoss && route() === 'bugfix';
    this.isMini = this.enc === MINI;
    this.maxHp = this.hp = this.isBoss ? (this.hell ? 80 : 70) : this.isMini ? 50 : 36;
    Object.assign(this, { mercy: 0, solved: false, annoyed: false, progress: 0, checked: false, turn: 0, mode: 'menu', sel: 0,
      subSel: 0, tp: 0, next: null, botT: 0, finished: false, btns: [], choices: [], hitsThis: 0, live: false, turnPats: [], lastMood: '' });
    this.used = new Set();
    this.fx = { slow: false, shield: false, crit: false, short: false };
    this.boxNow = { ...TEXT_BOX };
    // Heat 0: the same puzzles every run (knowledge carries). Heat 1+: they reshuffle each run.
    this.puzzle = makePuzzle(this.def.name, this.isBoss ? heat().bossSteps : this.isMini ? 3 : heat().steps, R.heat > 0 ? K.run.seed : 0);
    this.steps = enemySteps(this.enc, this.def.patterns);
    hooks.scene = 'Battle';
    hooks.state = 'battle';
    const ui = K.ui;
    this.cameras.main.setBackgroundColor(ui.bg);
    this.cameras.main.fadeIn(220, 0, 0, 0);
    // A brand-tinted stage so the sprites' black outlines read against the dark background.
    this.add.rectangle(24, 8, 432, 93, ui.panelInt, 0.3).setOrigin(0);
    const grid = this.add.graphics().lineStyle(1, ui.panelInt, 0.35);
    for (let x = 24; x <= 456; x += 24) grid.lineBetween(x, 8, x, 100);
    for (let y = 8; y <= 100; y += 23) grid.lineBetween(24, y, 456, y);
    this.enemyKey = this.isBoss ? 'boss' : this.isMini ? 'miniboss' : `enemy_${this.enc + 1}`;
    this.enemy = this.add.sprite(W / 2, this.isBoss ? 56 : 60, spr(this.enemyKey)).setScale(2).play(anim(this.enemyKey));
    this.tweens.add({ targets: this.enemy, y: this.enemy.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dust = this.sampleColours();
    this.nameT = text(this, 24, 8, this.def.name, { color: ui.textInt });
    this.moodT = text(this, 26, 39, '', { color: ui.dimInt });
    text(this, 26, 19, 'HP', { color: ui.dimInt });
    this.hpBar = bar(this, 62, 21, 70, 3, 0x58d854, 0x7c7c7c, 0x000000);
    text(this, 26, 29, 'MERCY', { color: ui.dimInt });
    this.mercyBar = bar(this, 62, 31, 70, 3, 0xf8b800, 0x503000, 0x000000);
    this.frame = this.add.graphics().setDepth(5);
    this.fightG = this.add.graphics().setDepth(6);
    this.tw = new Typewriter(this, TEXT_BOX.x + 14, TEXT_BOX.y + 10, 66, 6, { depth: 7 });
    this.caption = text(this, W / 2, 100, '', { align: 'center', color: ui.accentInt, depth: 30 });
    this.clockT = K.run.mode === 'rush' ? text(this, 454, 10, '', { align: 'right', color: ui.accentInt, depth: 30 }) : null;
    const short = String(K.theme.prospect.short).toUpperCase();
    text(this, 26, 202, `${short.slice(0, 12)}  LV 1`, { color: ui.textInt });
    text(this, 172, 202, 'HP', { color: ui.textInt });
    this.myBar = bar(this, 188, 203, 56, 6, 0xf8b800, 0xa80020, 0x000000);
    this.myHp = text(this, 250, 202, '', { color: ui.textInt });
    text(this, 334, 202, 'TP', { color: ui.textInt });
    this.tpBar = bar(this, 350, 203, 60, 6, 0xf87858, 0x503000, 0x000000);
    this.tpT = text(this, 416, 202, '', { color: ui.textInt });
    BUTTONS.forEach((b, i) => {
      const x = BTN_X(i);
      const g = this.add.graphics();
      const t = text(this, x + 42, 225, b, { align: 'center', color: 0xf83800 });
      this.btns.push({ g, t });
    });
    this.soul = this.add.image(0, 0, spr('soul')).setDepth(20);
    this.dodge = new Dodge(this, this.soul, DODGE_BOX, {
      hit: () => this.hitSoul(),
      graze: (x, y) => this.graze(x, y),
      gem: (x, y) => this.gem(x, y),
    });
    const kb = this.input.keyboard!;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    battleMusic(this, this.isBoss);
    const tip = this.enc === 0 && meta.data.runs === 0 ? ' (New here? ACT > CHECK says what it wants.)' : '';
    this.say(this.hell ? `${this.def.intro} It has seen what you did. It will not listen.` : `${this.def.intro}${tip}`, null);
    this.mode = 'menu';
    this.drawAll();
    if (R.showcase) { R.showcase = false; this.time.delayedCall(250, () => this.showcase()); }
  }

  /** Start a long enemy turn now, using a busy step (or debug.pattern's pick) for the gameplay GIF. */
  showcase() {
    if (this.finished || this.mode === 'turn' || this.mode === 'end') return;
    this.clearChoices();
    this.fightG.clear();
    const step = R.flood ? { pats: ['spiral', 'laser', 'rain', 'orbit'], busy: 2.2 }
      : R.showPattern ? { pats: [R.showPattern], busy: 1.2 } : this.isBoss ? bossStep(this.def.patterns, 1, 1, true)
      : { pats: [enemyStep(this.steps, 0).pats[0], 'laser'], busy: 1.1 };
    this.startTurn(R.flood ? 60 : 8, 1.5, step);
  }

  /** A few of the enemy sprite's own colours, for its death dust. */
  private sampleColours(): number[] {
    const cols = new Map<number, number>();
    try {
      const key = spr(this.enemyKey);
      const src = this.textures.get(key).get(0);
      for (let y = 2; y < src.height; y += 3) {
        for (let x = 2; x < src.width; x += 3) {
          const c = this.textures.getPixel(x, y, key, 0);
          if (!c || c.alpha < 128 || c.red + c.green + c.blue < 60) continue;
          const v = c.color;
          cols.set(v, (cols.get(v) ?? 0) + 1);
        }
      }
    } catch { /* fall through to defaults */ }
    const top = [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
    return top.length ? top : [K.ui.textInt, K.ui.dimInt];
  }

  // ---------------------------------------------------------------- drawing
  private mood(): Mood {
    if (this.hell) return 'furious';
    if (this.sparable()) return 'ready';
    return this.annoyed ? 'annoyed' : 'calm';
  }

  private drawAll() {
    const ui = K.ui;
    const b = this.live ? this.dodge.box : this.boxNow;
    this.frame.clear().fillStyle(0x000000, 1).fillRect(b.x, b.y, b.w, b.h)
      .lineStyle(2, this.live && this.dodge.heavy ? 0x3cbcfc : 0xfcfcfc, 1).strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    this.btns.forEach(({ g, t }, i) => {
      const x = BTN_X(i);
      const on = i === this.sel && this.mode === 'menu';
      const ready = i === 4 && this.sparable();
      const col = on ? ui.accentInt : ready ? 0xf8d878 : 0xf83800;
      g.clear().lineStyle(2, col, 1).strokeRect(x + 1, 219, 83, 20);
      t.setColor(col);
    });
    const mood = this.mood();
    this.nameT.setColor(mood === 'ready' ? ui.accentInt : ui.textInt);
    if (mood !== this.lastMood && this.enemy.alpha > 0.5 && this.mode !== 'end') {
      if (mood === 'annoyed' || mood === 'furious') this.enemy.setTint(0xff9c9c); else this.enemy.clearTint();
      if (mood === 'ready' && this.lastMood) { K.play('spare', 0.35); burst(this, this.enemy.x, this.enemy.y - 20, 0xf8d878, 10, { gravity: -30, speed: 50 }); }
      this.lastMood = mood;
    }
    const tag = { calm: 'CALM', annoyed: 'ANNOYED', ready: 'READY TO SPARE', furious: 'FURIOUS' }[mood];
    this.moodT.setText(tag)
      .setColor(mood === 'ready' ? ui.accentInt : mood === 'calm' ? ui.dimInt : 0xf83800);
    this.hpBar.draw(this.hp / this.maxHp);
    this.mercyBar.draw(this.hell ? 0 : this.mercy / 100);
    this.myBar.draw(R.hp / R.maxHp);
    this.myHp.setText(`${Math.max(0, Math.ceil(R.hp))}/${R.maxHp}`);
    this.tpBar.draw(this.tp / 100, this.tp >= TP_COST ? 0xf8b800 : 0xf87858);
    this.tpT.setText(`${Math.floor(this.tp)}%`);
    // Soul: menu cursor, submenu cursor, or the dodging heart.
    if (this.mode === 'menu') this.soul.setPosition(BTN_X(this.sel) + 10, 229).setVisible(true).setAlpha(1);
    else if ((this.mode === 'items' || this.mode === 'acts' || this.mode === 'bag') && this.choices[this.subSel]) {
      const c = this.choices[this.subSel];
      this.soul.setPosition(c.x - 14, c.y + 3).setVisible(true).setAlpha(1);
    } else if (this.mode !== 'turn') this.soul.setVisible(false);
  }

  private sparable() {
    if (this.hell) return false;
    return this.solved || this.mercy >= 100 || this.hp <= this.maxHp * 0.25;
  }

  private say(str: string, then: (() => void) | null) {
    this.tw.t.setVisible(true);
    this.tw.show(`* ${str}`);
    this.next = then;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (e.repeat || this.finished) return;
    const c = e.code;
    const ok = ['Enter', 'Space', 'KeyZ', 'NumpadEnter'].includes(c);
    const back = ['Escape', 'KeyX', 'ShiftLeft', 'ShiftRight', 'Backspace'].includes(c);
    const left = ['ArrowLeft', 'KeyA'].includes(c), right = ['ArrowRight', 'KeyD'].includes(c);
    const up = ['ArrowUp', 'KeyW'].includes(c), down = ['ArrowDown', 'KeyS'].includes(c);
    this.input_(ok, back, left, right, up, down);
  }

  private input_(ok: boolean, back: boolean, left: boolean, right: boolean, up: boolean, down: boolean) {
    switch (this.mode) {
      case 'menu':
        if (left || right) { this.sel = (this.sel + (right ? 1 : BUTTONS.length - 1)) % BUTTONS.length; K.play('move', 0.5); }
        else if (ok) { K.play('select'); this.choose(this.sel); }
        break;
      case 'acts':
      case 'bag':
      case 'items': {
        const n = this.choices.length;
        if (left || right) this.subSel = (this.subSel + (this.subSel % 2 === 0 ? 1 : -1) + n) % n;
        if (up || down) this.subSel = (this.subSel + (down ? 2 : n - 2 + (n % 2))) % n;
        this.subSel = Math.min(this.subSel, n - 1);
        if (left || right || up || down) K.play('move', 0.5);
        if (ok) {
          K.play('select');
          const id = this.choices[this.subSel].id;
          if (this.mode === 'acts') this.act(id); else if (this.mode === 'bag') this.useItem(Number(id)); else this.useProduct(id);
        }
        if (back) { this.clearChoices(); this.mode = 'menu'; this.say(this.flavour(), null); }
        break;
      }
      case 'fight':
        if (ok) this.strike();
        break;
      case 'result':
      case 'end':
        if (ok) {
          if (!this.tw.done) this.tw.finish();
          else { const n = this.next; this.next = null; n?.(); }
        }
        break;
    }
    this.drawAll();
  }

  // ---------------------------------------------------------------- actions
  private choose(i: number) {
    const name = this.def.name;
    if (i === 0) {
      this.mode = 'fight';
      this.fightX = TEXT_BOX.x + 8;
      this.tw.t.setVisible(false);
      return;
    }
    if (i === 1) { this.openActs(); return; }
    if (i === 2) { this.openProducts(); return; }
    if (i === 3) { this.openBag(); return; }
    if (this.sparable()) {
      if (this.isMini) R.mini = 'spared';
      else { R.spared++; R.outcomes[this.enc] = 'spared'; }
      K.play('spare');
      this.mode = 'end';
      this.enemy.setTint(0x7c7c7c);
      this.tweens.add({ targets: this.enemy, alpha: 0.35, duration: 700 });
      burst(this, this.enemy.x, this.enemy.y, K.ui.accentInt, 28, { colours: [0xfcfcfc, 0xf8d878], gravity: -50, speed: 90, life: 1 });
      this.time.delayedCall(250, () => burst(this, this.enemy.x, this.enemy.y - 10, 0xfcfcfc, 14, { gravity: -30, speed: 60, life: 0.9 }));
      this.say(`You spared ${name}. One problem lighter for ${K.theme.prospect.name}.`, () => this.exit('spared'));
    } else if (this.hell) {
      this.result(`${name} will not be spared. Not after what happened to the others.`);
    } else {
      this.result(`${name} isn't ready to be spared yet. Try ACT or POSTHOG.`);
    }
  }

  private openActs() {
    this.mode = 'acts';
    this.tw.t.setVisible(false);
    this.clearChoices();
    const ids = ['check', ...this.puzzle.verbs.map((v) => v.id)];
    ids.forEach((id, i) => {
      const x = TEXT_BOX.x + 40 + (i % 2) * 210, y = TEXT_BOX.y + 18 + Math.floor(i / 2) * 26;
      const t = text(this, x, y, `* ${id === 'check' ? 'CHECK' : verbLabel(id)}`, { depth: 8, color: K.ui.textInt });
      this.choices.push({ id, t, x, y });
    });
    this.subSel = Math.min(this.subSel, this.choices.length - 1);
  }

  private openProducts() {
    const prods = (K.theme.products as string[]).slice(0, 6);
    this.mode = 'items';
    this.tw.t.setVisible(false);
    this.clearChoices();
    prods.forEach((id, i) => {
      const x = TEXT_BOX.x + 40 + (i % 2) * 210, y = TEXT_BOX.y + 16 + Math.floor(i / 2) * 26;
      const used = this.used.has(id);
      const afford = !used || this.tp >= TP_COST;
      const icon = this.add.image(x, y + 3, spr(`icon_${id}`)).setDepth(8).setAlpha(afford ? 1 : 0.35);
      const label = used ? `${productName(id)} ${TP_COST}%TP` : productName(id);
      const t = text(this, x + 14, y, label, { depth: 8, color: afford ? K.ui.textInt : K.ui.dimInt });
      this.choices.push({ id, t, icon, x, y });
    });
    this.subSel = Math.min(this.subSel, this.choices.length - 1);
  }

  private openBag() {
    if (!R.items.length) {
      this.say('Your bag is empty. Vending machines sell snacks for gold.', null);
      return;
    }
    this.mode = 'bag';
    this.tw.t.setVisible(false);
    this.clearChoices();
    R.items.forEach((id, i) => {
      const x = TEXT_BOX.x + 40 + (i % 2) * 210, y = TEXT_BOX.y + 16 + Math.floor(i / 2) * 26;
      const t = text(this, x, y, `* ${item(id)?.name ?? id}`, { depth: 8, color: K.ui.textInt });
      this.choices.push({ id: String(i), t, x, y });
    });
    this.subSel = Math.min(this.subSel, this.choices.length - 1);
  }

  private useItem(i: number) {
    const id = R.items[i];
    const it = item(id);
    this.clearChoices();
    if (!it) { this.mode = 'menu'; return; }
    R.items.splice(i, 1);
    R.itemsUsed = (R.itemsUsed ?? 0) + 1;
    K.play('product', 0.7);
    let healed = 0;
    if (it.kind === 'heal') {
      healed = Math.min(R.maxHp - R.hp, it.n ?? 10);
      R.hp += healed;
      floatText(this, 216, 190, `+${healed}`, 0x58d854);
    }
    if (it.kind === 'shield') this.fx.shield = true;
    if (it.kind === 'slow') this.fx.slow = true;
    this.result(itemLine(it, healed));
  }

  private clearChoices() {
    this.choices.forEach((c) => { c.t.destroy(); c.icon?.destroy(); });
    this.choices = [];
  }

  private act(id: string) {
    this.clearChoices();
    const name = this.def.name;
    if (id === 'check') {
      // The boss only shows what it wants right now: its mood shifts after every right act.
      const next = this.puzzle.seq[this.progress];
      const h = this.hell ? 'It is past talking. Only FIGHT will do now.'
        : this.sparable() ? 'It is ready to be spared.'
        : this.isBoss ? `Right now it ${wantOf(next)}. Its mood will shift after.` : hint(this.puzzle);
      const msg = `${name.toUpperCase()}: ${this.def.pain} ${h}`;
      // The first CHECK in a battle is free (no enemy turn): a first-timer should never pay to learn.
      if (!this.checked) { this.checked = true; this.info(msg); } else this.result(msg);
      return;
    }
    const verb = VERBS.find((v) => v.id === id)!;
    if (this.hell) { this.result(`You try to ${verb.label}. ${name} does not even look at you.`); return; }
    if (this.sparable()) { this.result(`${name} is already calm. You can SPARE it.`); return; }
    const want = this.puzzle.seq[this.progress];
    if (id === want) {
      this.progress++;
      this.annoyed = false;
      const steps = this.puzzle.seq.length;
      const before = this.mercy;
      this.mercy = this.progress >= steps ? 100 : Math.min(99, this.mercy + Math.ceil(100 / steps));
      if (this.mercy > before) floatText(this, 150, 26, `+${this.mercy - before}%`, 0xf8b800);
      const talk = this.def.talk?.length ? this.def.talk : ['It listens, sort of.'];
      // Spread the theme's lines over the sequence so the last right act gets the last (relief) line.
      const line = talk[Math.max(0, Math.min(talk.length - 1, Math.ceil((this.progress / steps) * talk.length) - 1))];
      K.play('product', 0.6);
      punch(this.enemy, 0.08);
      const shift = this.isBoss && this.mercy < 100 ? ` Its mood shifts. It ${wantOf(this.puzzle.seq[this.progress])} now.` : '';
      // Theme talk lines usually start with "You ...", so lead in without naming the verb again.
      this.result(`It liked that. ${line}${this.mercy >= 100 ? ` ${name} seems ready to be spared.` : shift}`);
      return;
    }
    if (this.puzzle.seq.slice(0, this.progress).includes(id)) {
      this.result(`You ${verb.label.toLowerCase()} again. ${name} already heard that one.`);
      return;
    }
    this.annoyed = true;
    R.wrongActs = (R.wrongActs ?? 0) + 1;
    K.play('hurt', 0.4);
    this.tweens.add({ targets: this.enemy, x: { from: W / 2 - 3, to: W / 2 }, duration: 200, ease: 'Bounce.out' });
    this.result(`${verb.wrong.replace(/\{name\}/g, name)} It gets annoyed.`);
  }

  private useProduct(id: string) {
    const reuse = this.used.has(id);
    if (reuse && this.tp < TP_COST) { K.play('hurt', 0.3); return; }
    if (reuse) this.tp -= TP_COST;
    this.used.add(id);
    R.productUses++;
    this.clearChoices();
    const name = productName(id);
    capture('product_picked', { product: id, enemy: this.enc, solved: id === this.def.solved_by });
    K.play('product');
    if (id === this.def.solved_by && !this.solved && !this.hell) {
      const full = heat().solve >= 100;
      this.solved = full;
      this.mercy = Math.max(this.mercy, heat().solve);
      this.annoyed = false;
      R.solvedBy = (R.solvedBy ?? 0) + 1;
      flash(this.enemy, K.ui.accentInt, 400);
      burst(this, this.enemy.x, this.enemy.y, K.ui.accentInt, 18, { colours: [0xfcfcfc], gravity: -40 });
      this.result(`You use ${name}! ${this.def.solve_line} ${this.sparable() ? 'It can be spared now.' : 'It is almost ready to be spared.'}`);
      return;
    }
    if (id === this.def.solved_by && this.hell) {
      const n = Math.round(20 * R.diff.fight);
      this.hurtEnemy(n, true);
      if (this.hp > 0) this.result(`You use ${name}. It finds the bug for you: ${n} damage.`);
      return;
    }
    let msg = EFFECTS[id] ?? 'It has a small effect.';
    if (id === 'session_replay') this.fx.slow = true;
    if (id === 'feature_flags') this.fx.shield = true;
    if (id === 'error_tracking') this.fx.crit = true;
    if (id === 'web_analytics') this.fx.short = true;
    if ((id === 'product_analytics' || id === 'surveys') && !this.hell) this.mercy = Math.min(100, this.mercy + 25);
    if (id === 'data_warehouse') R.hp = Math.min(R.maxHp, R.hp + 10);
    if (id === 'experiments') {
      const n = Math.round(Phaser.Math.Between(12, 16) * R.diff.fight);
      msg = msg.replace('{n}', String(n));
      this.hurtEnemy(n);
      if (this.hp <= 0) return;
    }
    this.result(`You use ${name}${reuse ? ' again' : ''}. ${msg}`);
  }

  private strike() {
    const b = TEXT_BOX;
    const center = b.x + b.w / 2;
    const off = Math.abs(this.fightX - center);
    const acc = Math.max(0, 1 - off / (b.w / 2));
    const perfect = off <= CRIT_ZONE;
    this.fightG.clear();
    this.tw.t.setVisible(true);
    const traced = this.fx.crit; // error_tracking: x2
    const crit = traced || perfect;
    this.fx.crit = false;
    const n = Math.round((5 + 9 * acc) * R.diff.fight * (traced ? 2 : 1) * (perfect ? 1.6 : 1));
    if (crit) R.crits++;
    if (perfect) achieve('crit');
    this.hurtEnemy(n, crit);
    if (this.hp > 0) this.result(perfect ? `CRITICAL! ${n} damage.` : crit ? `Critical hit for ${n}!` : acc > 0.85 ? `A clean hit for ${n}.` : `You hit ${this.def.name} for ${n}.`);
  }

  private miss() {
    this.fightG.clear();
    this.tw.t.setVisible(true);
    this.result('You missed. It did not even notice.');
  }

  private hurtEnemy(n: number, big = false) {
    this.hp = Math.max(0, this.hp - n);
    K.play('hit');
    flash(this.enemy, 0xfcfcfc, 90);
    this.tweens.add({ targets: this.enemy, x: { from: W / 2 - (big ? 8 : 4), to: W / 2 }, duration: 260, ease: 'Bounce.out' });
    burst(this, this.enemy.x, this.enemy.y, 0xfcfcfc, big ? 16 : 8, { colours: this.dust.slice(0, 2) });
    if (big) { hitstop(this, 90); shake(this, 4, 180); } else shake(this, 2, 100);
    const t = text(this, W / 2, 30, String(n), { scale: 2, align: 'center', color: big ? K.ui.accentInt : 0xf83800, depth: 30 });
    this.tweens.add({ targets: t, y: 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    if (this.hp <= 0) {
      if (this.isMini) R.mini = 'debugged';
      else { R.debugged++; R.outcomes[this.enc] = 'debugged'; }
      this.mode = 'end';
      this.dissolve();
      K.play('kill');
      this.say(`${this.def.name} crashes and dissolves into log lines.`, () => this.exit('debugged'));
    }
  }

  /** Death: the sprite squashes away while dust in its own colours drifts up. */
  private dissolve() {
    const e = this.enemy;
    const h = e.displayHeight, w = e.displayWidth;
    this.tweens.killTweensOf(e);
    this.tweens.add({ targets: e, alpha: 0, scaleY: 0.1, y: e.y + h * 0.4, duration: 900, ease: 'Quad.In' });
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 110, () => {
        const y = e.y - h / 2 + (i / 6) * h;
        for (let k = 0; k < 3; k++) {
          burst(this, e.x - w / 3 + Math.random() * w * 0.66, y, this.dust[(i + k) % this.dust.length], 5,
            { gravity: -70, speed: 35, life: 1.1, colours: this.dust });
        }
      });
    }
  }

  /** Show a message, then back to the menu without an enemy turn. */
  private info(msg: string) {
    this.mode = 'result';
    this.say(msg, () => { this.mode = 'menu'; this.say(this.flavour(), null); this.drawAll(); });
  }

  private result(msg: string) {
    this.mode = 'result';
    this.say(msg, () => this.startTurn());
  }

  private flavour() {
    const name = this.def.name;
    if (this.hell) return `${name} glares. Its fans are screaming.`;
    if (this.sparable()) return `${name} looks ready to be spared.`;
    if (this.annoyed) return `${name} is annoyed. Its attacks are getting denser.`;
    if (this.turn === 1) return this.def.pain;
    if (!this.checked && this.progress === 0 && this.turn >= 2) return `${name} is waiting for something. (ACT, then CHECK, tells you what.)`;
    return FLAVOUR[(this.turn + this.enc) % FLAVOUR.length].replace('{name}', name);
  }

  // ---------------------------------------------------------------- enemy turn
  private bossPhase() {
    const byMercy = this.hell ? 0 : Math.floor((this.progress / this.puzzle.seq.length) * 3 - 0.01);
    const byHp = this.hp <= this.maxHp * 0.33 ? 2 : this.hp <= this.maxHp * 0.66 ? 1 : 0;
    return Math.max(0, Math.min(2, Math.max(byMercy, byHp)));
  }

  private startTurn(len?: number, busy = 1, forced?: Step) {
    this.mode = 'turn';
    this.tw.t.setVisible(false);
    this.tw.show('');
    const step = forced ?? (this.isBoss ? bossStep(this.def.patterns, this.bossPhase(), this.turn, this.hell) : enemyStep(this.steps, this.turn));
    this.turn++;
    this.turnLen = len ?? (this.isBoss ? (this.hell ? 6.5 : 6) : 4.5) * (this.fx.short ? 0.6 : 1);
    const mood = this.mood();
    const speed = R.diff.bulletSpeed * heat().speed * (this.fx.slow ? 0.6 : 1) * (this.isBoss ? 1.1 : 1) * (mood === 'annoyed' ? 1.1 : 1);
    const density = R.diff.density * heat().dens * step.busy * busy * (this.isBoss ? 1.15 : 1) * (mood === 'annoyed' ? 1.3 : mood === 'ready' ? 0.6 : 1)
      * (this.hell ? 1.15 : 1);
    this.fx.slow = false;
    this.fx.short = false;
    this.turnPats = step.pats;
    const rule = step.pats.map((p) => RULES[p]).find(Boolean) ?? '';
    this.tweenBox(DODGE_BOX, () => {
      if (this.mode !== 'turn') return;
      this.dodge.start(step.pats, { speed, density, boss: this.isBoss });
      this.live = true;
      this.caption.setText(rule).setVisible(!!rule);
      this.bubble(pick(BUBBLES[this.mood()] ?? BUBBLES.calm, this.turn + this.enc));
      if (rule) blinkOnce(this, this.caption);
    });
  }

  /** A speech bubble to the right of the enemy for a moment. */
  private bubble(str: string) {
    const x = W / 2 + (this.isBoss ? 58 : 44), y = 16;
    const t = text(this, x + 6, y + 5, str, { color: 0x000000, shadow: null, depth: 26 });
    const w = t.textWidth + 12;
    const g = this.add.graphics().setDepth(25);
    g.fillStyle(0x000000, 1).fillRect(x - 1, y - 1, w + 2, 19).fillStyle(0xfcfcfc, 1).fillRect(x, y, w, 17)
      .fillTriangle(x, y + 6, x, y + 12, x - 6, y + 11);
    this.time.delayedCall(1500, () => { t.destroy(); g.destroy(); });
  }

  private tweenBox(to: Box, done: () => void) {
    const from = { ...this.boxNow };
    this.tweens.addCounter({ from: 0, to: 1, duration: 180, onUpdate: (tw) => {
      const v = tw.getValue() ?? 1;
      this.boxNow = { x: from.x + (to.x - from.x) * v, y: from.y + (to.y - from.y) * v, w: from.w + (to.w - from.w) * v, h: from.h + (to.h - from.h) * v };
      this.drawAll();
    }, onComplete: () => { this.boxNow = { ...to }; this.drawAll(); done(); } });
  }

  private endTurn() {
    this.live = false;
    this.boxNow = { ...this.dodge.box };
    this.dodge.clear();
    this.caption.setVisible(false);
    this.fx.shield = false;
    this.soul.setAlpha(1);
    this.mode = 'result';
    this.next = null;
    this.tweenBox(TEXT_BOX, () => {
      this.mode = 'menu';
      this.say(this.flavour(), null);
      this.drawAll();
    });
  }

  // ---------------------------------------------------------------- loop
  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    if (!hitstopped(this)) for (let i = 0; i < R.speed && !this.finished; i++) this.step(dt);
    this.clockT?.setText(`RUSH ${hooks.elapsed.toFixed(1)}s`);
    hooks.stats = {
      battle: this.enc, enemyHp: this.hp, mercy: this.mercy, mood: this.mood(), sparable: this.sparable(), hp: Math.ceil(R.hp),
      mode: this.mode, bullets: this.dodge.bullets.length, lasers: this.dodge.lasers.length, pattern: this.turnPats.join('+'),
      tp: Math.floor(this.tp), acts: `${this.progress}/${this.puzzle.seq.length}`, spared: R.spared, debugged: R.debugged,
      grazes: R.grazes, hits: R.hits, route: route(), hell: this.hell,
    };
  }

  private step(dt: number) {
    hooks.elapsed += dt;
    this.tw.step(dt);
    if (this.mode === 'fight') {
      this.fightX += dt * 330;
      const b = TEXT_BOX;
      const g = this.fightG.clear();
      const cx = b.x + b.w / 2;
      for (let i = 0; i < 12; i++) {
        const w = (b.w - 20) * (1 - i / 12);
        g.fillStyle(i % 2 ? 0x007800 : 0x00b800, 1).fillRect(cx - w / 2, b.y + 20, w, b.h - 40);
      }
      g.fillStyle(K.ui.accentInt, 1).fillRect(cx - CRIT_ZONE, b.y + 14, CRIT_ZONE * 2, b.h - 28);
      g.fillStyle(0xfcfcfc, 1).fillRect(cx - 1, b.y + 16, 2, b.h - 32);
      g.fillStyle(0x000000, 1).fillRect(this.fightX - 3, b.y + 10, 6, b.h - 20);
      g.fillStyle(0xfcfcfc, 1).fillRect(this.fightX - 2, b.y + 11, 4, b.h - 22);
      if (R.autopilot && Math.abs(this.fightX - cx) < 3) this.strike();
      else if (this.fightX > b.x + b.w - 8) this.miss();
      this.drawAll();
      return;
    }
    if (this.mode === 'turn') { this.stepTurn(dt); return; }
    if (R.autopilot) this.botStep(dt);
  }

  private stepTurn(dt: number) {
    if (!this.live) return; // box still opening
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    let jump = k.UP.isDown || k.W.isDown;
    if (R.autopilot && !dx && !dy) [dx, dy, jump] = this.dodge.bot();
    this.dodge.step(dt, dx, dy, jump);
    this.drawAll();
    if (this.finished) return;
    if (this.dodge.t >= this.turnLen) this.endTurn();
  }

  private hitSoul() {
    if (this.finished) return;
    let dmg = R.diff.dmg + (this.isBoss ? 1 : 0);
    if (this.fx.shield) dmg = Math.ceil(dmg / 2);
    R.hits++;
    this.hitsThis++;
    if (!R.god) R.hp -= dmg;
    K.play('hurt');
    flash(this.soul, 0xfcfcfc, 80);
    shake(this, 1.5 + dmg * 0.5, 140);
    hitstop(this, 45);
    burst(this, this.soul.x, this.soul.y, 0xf83800, 8, { speed: 70, life: 0.35 });
    floatText(this, 216, 190, `-${dmg}`, 0xf83800);
    this.drawAll();
    if (R.hp <= 0) this.lose();
  }

  private graze(x: number, y: number) {
    R.grazes++;
    if (R.grazes >= 60) achieve('graze');
    this.tp = Math.min(100, this.tp + 3);
    K.play('graze', 0.25, 60);
    burst(this, (x + this.soul.x) / 2, (y + this.soul.y) / 2, 0xfcfcfc, 3, { speed: 50, life: 0.25, size: 1, gravity: 0 });
    if (this.tp >= TP_COST && this.tp - 3 < TP_COST) punch(this.tpT, 0.4);
  }

  private gem(x: number, y: number) {
    this.tp = Math.min(100, this.tp + 8);
    R.gems = (R.gems ?? 0) + 1;
    K.play('gem', 0.4, 50);
    burst(this, x, y, K.ui.accentInt, 6, { colours: [0xfcfcfc], speed: 60, life: 0.4 });
    floatText(this, x, y - 6, '+TP', K.ui.accentInt, 0.5);
  }

  private lose() {
    if (this.finished) return;
    this.finished = true;
    R.over = true;
    this.live = false;
    this.dodge.clear();
    this.soul.setVisible(true).setTint(0x7c7c7c);
    K.play('lose');
    stopBattleMusic(this, false);
    this.tweens.add({ targets: this.soul, scale: 2.5, alpha: 0, duration: 900 });
    burst(this, this.soul.x, this.soul.y, 0xf83800, 20, { colours: [0xa80020], speed: 80, life: 1 });
    const retry = !!R.checkpoint && R.continues < MAX_CONTINUES && K.run.mode !== 'rush';
    if (retry) {
      R.over = false;
      const t = text(this, W / 2, 150, 'STAY DETERMINED', { scale: 2, align: 'center', color: K.ui.accentInt, depth: 40 });
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 500, duration: 400 });
    }
    this.time.delayedCall(retry ? 2000 : 1300, () => {
      if (retry) {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.stop(); this.scene.wake('Explore', { continue: true }); });
        return;
      }
      patchHq({ lastLost: true });
      this.scene.stop('Explore');
      this.scene.start('End', endData(false));
    });
  }

  private exit(how: 'spared' | 'debugged') {
    if (this.finished) return;
    this.finished = true;
    R.battleHits.push(this.hitsThis);
    if (how === 'spared') achieve('first_spare');
    if (how === 'spared' && this.used.size === 0) achieve('words_only');
    if (this.hitsThis === 0 && this.turn > 0) achieve('no_hit');
    capture('battle_won', { enemy: this.enc, how, hits: this.hitsThis, used_product: this.used.size > 0 });
    stopBattleMusic(this, true);
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.wake('Explore', { enc: this.enc, how, hits: this.hitsThis, products: this.used.size, grazes: this.dodge.grazes });
    });
  }

  // ---------------------------------------------------------------- autopilot
  /** Pacifist through the right act sequence (the boss also gets its PostHog product), or FIGHT on
   * the bugfix route (debug.route('bugfix')) and against the bullet-hell boss. */
  private botStep(dt: number) {
    this.botT += dt;
    // Humanized (debug.humanize): read at ~25 characters a second and think a second per menu.
    const need = R.humanize ? (this.mode === 'result' || this.mode === 'end' ? 0.8 + this.tw.full.length / 25 : 1.2) : 0.4;
    if (this.botT < need) return;
    if ((this.mode === 'result' || this.mode === 'end') && this.tw.done && this.next) {
      this.botT = 0;
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'menu') {
      this.botT = 0;
      const prods = K.theme.products as string[];
      const kill = this.hell || (R.forceRoute === 'bugfix' && !this.isBoss);
      const solve = this.isBoss && this.progress >= 1 && prods.includes(this.def.solved_by) && !this.used.has(this.def.solved_by) && !this.solved;
      const healIdx = R.items.findIndex((id) => item(id)?.kind === 'heal');
      const want = R.hp < R.maxHp * 0.4 && healIdx >= 0 && !this.sparable() ? 3 : kill ? 0 : this.sparable() ? 4 : solve ? 2 : 1;
      if (R.humanize && !this.checked && !kill && !this.sparable() && this.sel !== 1) { this.sel = 1; this.drawAll(); return; }
      if (this.sel !== want) { this.sel = want; this.drawAll(); return; }
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'acts') {
      this.botT = 0;
      const want = R.humanize && !this.checked ? 'check' : this.puzzle.seq[this.progress] ?? 'check';
      const i = this.choices.findIndex((c) => c.id === want);
      this.subSel = Math.max(0, i);
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'bag') {
      this.botT = 0;
      this.subSel = Math.max(0, R.items.findIndex((id) => item(id)?.kind === 'heal'));
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'items') {
      this.botT = 0;
      const i = this.choices.findIndex((c) => c.id === this.def.solved_by);
      this.subSel = i >= 0 ? i : 0;
      this.input_(true, false, false, false, false, false);
    }
  }
}

const pick = <T>(arr: T[], n: number) => arr[((n % arr.length) + arr.length) % arr.length];

function blinkOnce(scene: Phaser.Scene, t: PixelText) {
  t.setAlpha(1);
  scene.tweens.add({ targets: t, alpha: 0.2, duration: 160, yoyo: true, repeat: 3 });
}
