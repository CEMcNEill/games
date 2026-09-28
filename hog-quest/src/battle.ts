// Hog Quest battles: FIGHT / TALK / POSTHOG / SPARE, then a short bullet-dodging enemy turn.
// Solving a problem with the right PostHog product (or talking it down) lets you spare it:
// the flattering route where PostHog fixes the prospect's problems.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, bar, PixelText, W } from '@shared/ui';
import { R, BOSS, encDef, endData, productName, EncDef } from './state';
import { PATTERNS, Box, PatternCtx } from './patterns';
import { Typewriter } from './typewriter';

const TEXT_BOX: Box = { x: 24, y: 110, w: 432, h: 86 };
const DODGE_BOX: Box = { x: 165, y: 110, w: 150, h: 86 };
const BUTTONS = ['FIGHT', 'TALK', 'POSTHOG', 'SPARE'];
const SOUL_SPEED = 90;

const FLAVOUR = [
  '{name} is buffering ominously.',
  '{name} throws a stack trace at the wall. It sticks.',
  'Smells like a Friday deploy.',
  '{name} refreshes itself. Nothing changes.',
  '{name} mutters something about legacy reasons.',
  'The office wifi flickers.',
];

const EFFECTS: Record<string, string> = {
  session_replay: 'You replay its last move. You can see the next one coming.',
  feature_flags: 'You flag off its worst feature. Its next attack does half damage.',
  experiments: 'A/B test! Variant B hits for {n}.',
  error_tracking: 'Stack trace found! Your next FIGHT will be a critical hit.',
  product_analytics: 'You chart its behaviour. You understand it a little better.',
  surveys: 'You ask how it is feeling. It opens up a little.',
  web_analytics: 'Traffic stats show its next move. The next attack will be shorter.',
  data_warehouse: 'You query the warehouse and find a snack. +10 HP.',
};

type Mode = 'menu' | 'items' | 'fight' | 'result' | 'turn' | 'end';

interface Bullet { s: Phaser.GameObjects.Image; vx: number; vy: number; life: number; bounce: boolean }

export class BattleScene extends Phaser.Scene {
  private enc = 0;
  private def!: EncDef;
  private isBoss = false;
  private hp = 36;
  private maxHp = 36;
  private mercy = 0;
  private solved = false;
  private used = new Set<string>();
  private talkI = 0;
  private turn = 0;
  private mode: Mode = 'menu';
  private sel = 0;
  private itemSel = 0;
  private boxNow: Box = { ...TEXT_BOX };
  private frame!: Phaser.GameObjects.Graphics;
  private tw!: Typewriter;
  private enemy!: Phaser.GameObjects.Sprite;
  private nameT!: PixelText;
  private hpBar!: ReturnType<typeof bar>;
  private myHp!: PixelText;
  private myBar!: ReturnType<typeof bar>;
  private btns: { g: Phaser.GameObjects.Graphics; t: PixelText }[] = [];
  private items: { id: string; t: PixelText; icon: Phaser.GameObjects.Image }[] = [];
  private soul!: Phaser.GameObjects.Image;
  private bullets: Bullet[] = [];
  private emit: ((t: number, dt: number) => void) | null = null;
  private turnT = 0;
  private turnLen = 4.5;
  private invuln = 0;
  private fx = { slow: false, shield: false, crit: false, short: false };
  private fightX = 0;
  private fightG!: Phaser.GameObjects.Graphics;
  private next: (() => void) | null = null;
  private botT = 0;
  private finished = false;

  constructor() { super('Battle'); }

  create(data: { enc: number }) {
    this.enc = data?.enc ?? 0;
    this.def = encDef(this.enc);
    this.isBoss = this.enc === BOSS;
    this.maxHp = this.hp = this.isBoss ? 70 : 36;
    Object.assign(this, { mercy: 0, solved: false, talkI: 0, turn: 0, mode: 'menu', sel: 0, itemSel: 0, invuln: 0,
      bullets: [], emit: null, next: null, botT: 0, finished: false, btns: [], items: [] });
    this.used = new Set();
    this.fx = { slow: false, shield: false, crit: false, short: false };
    this.boxNow = { ...TEXT_BOX };
    hooks.scene = 'Battle';
    hooks.state = 'battle';
    const ui = K.ui;
    this.cameras.main.setBackgroundColor(ui.bg);
    // Faint grid behind the enemy.
    // A brand-tinted stage so the sprites' black outlines read against the dark background.
    this.add.rectangle(24, 8, 432, 93, ui.panelInt, 0.3).setOrigin(0);
    const grid = this.add.graphics().lineStyle(1, ui.panelInt, 0.35);
    for (let x = 24; x <= 456; x += 24) grid.lineBetween(x, 8, x, 100);
    for (let y = 8; y <= 100; y += 23) grid.lineBetween(24, y, 456, y);
    const key = this.isBoss ? 'boss' : `enemy_${this.enc + 1}`;
    this.enemy = this.add.sprite(W / 2, this.isBoss ? 56 : 60, spr(key)).setScale(2).play(anim(key));
    this.tweens.add({ targets: this.enemy, y: this.enemy.y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.nameT = text(this, 24, 8, this.def.name, { color: ui.textInt });
    this.hpBar = bar(this, 24, 20, 80, 3, 0x58d854, 0x7c7c7c, 0x000000);
    this.frame = this.add.graphics().setDepth(5);
    this.fightG = this.add.graphics().setDepth(6);
    this.tw = new Typewriter(this, TEXT_BOX.x + 14, TEXT_BOX.y + 10, 66, 6, { depth: 7 });
    const short = String(K.theme.prospect.short).toUpperCase();
    text(this, 26, 202, `${short.slice(0, 12)}  LV 1`, { color: ui.textInt });
    text(this, 190, 202, 'HP', { color: ui.textInt });
    this.myBar = bar(this, 208, 203, 60, 6, 0xf8b800, 0xa80020, 0x000000);
    this.myHp = text(this, 276, 202, '', { color: ui.textInt });
    BUTTONS.forEach((b, i) => {
      const x = 25 + i * 110;
      const g = this.add.graphics();
      const t = text(this, x + 55, 225, b, { align: 'center', color: 0xf83800 });
      this.btns.push({ g, t });
    });
    this.soul = this.add.image(0, 0, spr('soul')).setDepth(20);
    const kb = this.input.keyboard!;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.say(`${this.def.intro}`, null);
    this.mode = 'menu';
    this.drawAll();
    if (R.showcase) { R.showcase = false; this.time.delayedCall(250, () => this.showcase()); }
  }

  /** Start a long enemy turn now, using its busiest pattern (for the gameplay GIF). */
  showcase() {
    if (this.finished || this.mode === 'turn' || this.mode === 'end') return;
    this.clearItems();
    this.fightG.clear();
    this.startTurn(8, 1.5);
  }

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // ---------------------------------------------------------------- drawing
  private drawAll() {
    const ui = K.ui;
    const b = this.boxNow;
    this.frame.clear().fillStyle(0x000000, 1).fillRect(b.x, b.y, b.w, b.h)
      .lineStyle(2, 0xfcfcfc, 1).strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    this.btns.forEach(({ g, t }, i) => {
      const x = 25 + i * 110;
      const on = i === this.sel && (this.mode === 'menu');
      const col = on ? ui.accentInt : 0xf83800;
      g.clear().lineStyle(2, col, 1).strokeRect(x + 1, 219, 98, 20);
      t.setColor(on ? ui.accentInt : 0xf83800);
    });
    const ready = this.sparable();
    this.nameT.setColor(ready ? ui.accentInt : ui.textInt);
    this.hpBar.draw(this.hp / this.maxHp);
    this.myBar.draw(R.hp / R.maxHp);
    this.myHp.setText(`${Math.max(0, Math.ceil(R.hp))} / ${R.maxHp}`);
    // Soul: menu cursor, item cursor, or the dodging heart.
    if (this.mode === 'menu') this.soul.setPosition(25 + this.sel * 110 + 12, 229).setVisible(true);
    else if (this.mode === 'items' && this.items[this.itemSel]) {
      const it = this.items[this.itemSel];
      this.soul.setPosition(it.icon.x - 14, it.icon.y).setVisible(true);
    } else if (this.mode !== 'turn') this.soul.setVisible(false);
  }

  private sparable() {
    return this.solved || this.mercy >= (this.isBoss ? 3 : 2) || this.hp <= this.maxHp * 0.25;
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
        if (left || right) { this.sel = (this.sel + (right ? 1 : 3)) % 4; K.play('move', 0.5); }
        else if (ok) { K.play('select'); this.choose(this.sel); }
        break;
      case 'items': {
        const n = this.items.length;
        if (left || right) this.itemSel = (this.itemSel + (this.itemSel % 2 === 0 ? 1 : -1) + n) % n;
        if (up || down) this.itemSel = (this.itemSel + (down ? 2 : n - 2 + (n % 2))) % n;
        if (left || right || up || down) K.play('move', 0.5);
        if (ok) { K.play('select'); this.useProduct(this.items[this.itemSel].id); }
        if (back) { this.clearItems(); this.mode = 'menu'; this.say(this.flavour(), null); }
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
    if (i === 1) {
      const lines = this.def.talk?.length ? this.def.talk : ['You try to chat. It listens, sort of.'];
      const line = lines[this.talkI++ % lines.length];
      this.mercy++;
      this.result(line + (this.sparable() && !this.solved && this.mercy === (this.isBoss ? 3 : 2) ? ` ${name} seems ready to be spared.` : ''));
      return;
    }
    if (i === 2) {
      this.openItems();
      return;
    }
    if (this.sparable()) {
      R.spared++;
      K.play('spare');
      this.tweens.add({ targets: this.enemy, alpha: 0.25, duration: 700 });
      this.mode = 'end';
      this.say(`You spared ${name}. One problem lighter for ${K.theme.prospect.name}.`, () => this.exit('spared'));
    } else {
      this.result(`${name} isn't ready to be spared yet. Try TALK or POSTHOG.`);
    }
  }

  private openItems() {
    const prods = (K.theme.products as string[]).slice(0, 6);
    this.mode = 'items';
    this.tw.t.setVisible(false);
    this.clearItems();
    prods.forEach((id, i) => {
      const x = TEXT_BOX.x + 40 + (i % 2) * 210, y = TEXT_BOX.y + 16 + Math.floor(i / 2) * 26;
      const used = this.used.has(id);
      const icon = this.add.image(x, y, spr(`icon_${id}`)).setDepth(8).setAlpha(used ? 0.35 : 1);
      const t = text(this, x + 14, y - 4, productName(id), { depth: 8, color: used ? K.ui.dimInt : K.ui.textInt });
      this.items.push({ id, t, icon });
    });
    this.itemSel = Math.min(this.itemSel, this.items.length - 1);
  }

  private clearItems() {
    this.items.forEach((it) => { it.t.destroy(); it.icon.destroy(); });
    this.items = [];
  }

  private useProduct(id: string) {
    if (this.used.has(id)) { K.play('hurt', 0.3); return; }
    this.used.add(id);
    this.clearItems();
    const name = productName(id);
    capture('product_picked', { product: id, enemy: this.enc, solved: id === this.def.solved_by });
    K.play('product');
    if (id === this.def.solved_by && !this.solved) {
      this.solved = true;
      this.enemy.setTint(K.ui.accentInt);
      this.time.delayedCall(400, () => this.enemy.clearTint());
      this.result(`You use ${name}! ${this.def.solve_line} It can be spared now.`);
      return;
    }
    let msg = EFFECTS[id] ?? 'It has a small effect.';
    if (id === 'session_replay') this.fx.slow = true;
    if (id === 'feature_flags') this.fx.shield = true;
    if (id === 'error_tracking') this.fx.crit = true;
    if (id === 'web_analytics') this.fx.short = true;
    if (id === 'product_analytics' || id === 'surveys') this.mercy++;
    if (id === 'data_warehouse') R.hp = Math.min(R.maxHp, R.hp + 10);
    if (id === 'experiments') {
      const n = Math.round(Phaser.Math.Between(12, 16) * R.diff.fight);
      msg = msg.replace('{n}', String(n));
      this.hurtEnemy(n);
      if (this.hp <= 0) return;
    }
    this.result(`You use ${name}. ${msg}`);
  }

  private strike() {
    const b = TEXT_BOX;
    const center = b.x + b.w / 2;
    const acc = Math.max(0, 1 - Math.abs(this.fightX - center) / (b.w / 2));
    this.fightG.clear();
    this.tw.t.setVisible(true);
    const crit = this.fx.crit;
    this.fx.crit = false;
    const n = Math.round((5 + 9 * acc) * R.diff.fight * (crit ? 2 : 1));
    this.hurtEnemy(n);
    if (this.hp > 0) this.result(crit ? `Critical hit for ${n}!` : acc > 0.85 ? `A clean hit for ${n}.` : `You hit ${this.def.name} for ${n}.`);
  }

  private miss() {
    this.fightG.clear();
    this.tw.t.setVisible(true);
    this.result('You missed. It did not even notice.');
  }

  private hurtEnemy(n: number) {
    this.hp = Math.max(0, this.hp - n);
    K.play('hit');
    this.tweens.add({ targets: this.enemy, x: { from: W / 2 - 4, to: W / 2 }, duration: 240, ease: 'Bounce.out' });
    const t = text(this, W / 2, 30, String(n), { scale: 2, align: 'center', color: 0xf83800, depth: 30 });
    this.tweens.add({ targets: t, y: 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    if (this.hp <= 0) {
      R.debugged++;
      this.mode = 'end';
      this.tweens.add({ targets: this.enemy, alpha: 0, scaleY: 0.2, duration: 800 });
      K.play('kill');
      this.say(`${this.def.name} crashes and dissolves into log lines.`, () => this.exit('debugged'));
    }
  }

  private result(msg: string) {
    this.mode = 'result';
    this.say(msg, () => this.startTurn());
  }

  private flavour() {
    if (this.sparable()) return `${this.def.name} looks ready to be spared.`;
    if (this.turn === 1) return this.def.pain;
    return FLAVOUR[(this.turn + this.enc) % FLAVOUR.length].replace('{name}', this.def.name);
  }

  // ---------------------------------------------------------------- enemy turn
  private startTurn(len?: number, busy = 1) {
    this.mode = 'turn';
    this.tw.t.setVisible(false);
    this.tw.show('');
    const pats = (this.def.patterns?.length ? this.def.patterns : ['rain']).filter((p) => PATTERNS[p]);
    const pname = pats.length ? pats[this.turn % pats.length] : 'rain';
    this.turn++;
    this.turnLen = len ?? (this.isBoss ? 6 : 4.5) * (this.fx.short ? 0.6 : 1);
    this.turnT = 0;
    const speed = R.diff.bulletSpeed * (this.fx.slow ? 0.6 : 1) * (this.isBoss ? 1.1 : 1);
    this.fx.slow = false;
    this.fx.short = false;
    this.tweenBox(DODGE_BOX, () => {
      this.soul.setPosition(DODGE_BOX.x + DODGE_BOX.w / 2, DODGE_BOX.y + DODGE_BOX.h / 2).setVisible(true);
      const ctx: PatternCtx = {
        box: DODGE_BOX, soul: this.soul, speed, density: R.diff.density * (this.isBoss ? 1.15 : 1) * busy, boss: this.isBoss,
        spawn: (x, y, vx, vy) => this.spawn(x, y, vx, vy, pname === 'bounce'),
      };
      this.emit = PATTERNS[pname](ctx);
    });
  }

  private tweenBox(to: Box, done: () => void) {
    const from = { ...this.boxNow };
    this.tweens.addCounter({ from: 0, to: 1, duration: 180, onUpdate: (tw) => {
      const v = tw.getValue() ?? 1;
      this.boxNow = { x: from.x + (to.x - from.x) * v, y: from.y, w: from.w + (to.w - from.w) * v, h: from.h };
      this.drawAll();
    }, onComplete: () => { this.boxNow = { ...to }; this.drawAll(); done(); } });
  }

  private spawn(x: number, y: number, vx: number, vy: number, bounce: boolean) {
    if (this.bullets.length > 160) return;
    const s = this.add.image(x, y, spr('bullet')).setDepth(15);
    this.bullets.push({ s, vx, vy, life: bounce ? 4.5 : 9, bounce });
  }

  private endTurn() {
    this.emit = null;
    this.bullets.forEach((b) => b.s.destroy());
    this.bullets = [];
    this.fx.shield = false;
    this.soul.setAlpha(1);
    this.tweenBox(TEXT_BOX, () => {
      this.mode = 'menu';
      this.say(this.flavour(), null);
      this.drawAll();
    });
    this.mode = 'result';
    this.next = null;
  }

  // ---------------------------------------------------------------- loop
  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    for (let i = 0; i < R.speed && !this.finished; i++) this.step(dt);
    hooks.stats = {
      battle: this.enc, enemyHp: this.hp, mercy: this.mercy, sparable: this.sparable(), hp: Math.ceil(R.hp), mode: this.mode,
      bullets: this.bullets.length, spared: R.spared, debugged: R.debugged,
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
      g.fillStyle(0xfcfcfc, 1).fillRect(cx - 1, b.y + 16, 2, b.h - 32);
      g.fillStyle(0x000000, 1).fillRect(this.fightX - 3, b.y + 10, 6, b.h - 20);
      g.fillStyle(0xfcfcfc, 1).fillRect(this.fightX - 2, b.y + 11, 4, b.h - 22);
      if (R.autopilot && Math.abs(this.fightX - cx) < 6) this.strike();
      else if (this.fightX > b.x + b.w - 8) this.miss();
      this.drawAll();
      return;
    }
    if (this.mode === 'turn') { this.stepTurn(dt); return; }
    if (R.autopilot) this.botStep(dt);
  }

  private stepTurn(dt: number) {
    if (!this.emit) return;
    this.turnT += dt;
    this.emit(this.turnT, dt);
    const box = DODGE_BOX;
    // Soul movement
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (R.autopilot && !dx && !dy) [dx, dy] = this.dodge();
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    this.soul.x = Phaser.Math.Clamp(this.soul.x + dx * SOUL_SPEED * dt, box.x + 6, box.x + box.w - 6);
    this.soul.y = Phaser.Math.Clamp(this.soul.y + dy * SOUL_SPEED * dt, box.y + 6, box.y + box.h - 6);
    this.invuln = Math.max(0, this.invuln - dt);
    this.soul.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 12) % 2 ? 0.3 : 1);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.s.x += b.vx * dt;
      b.s.y += b.vy * dt;
      b.life -= dt;
      if (b.bounce) {
        if (b.s.x < box.x + 3 || b.s.x > box.x + box.w - 3) b.vx = -b.vx;
        if (b.s.y < box.y + 3 || b.s.y > box.y + box.h - 3) b.vy = -b.vy;
      }
      const inside = b.s.x > box.x + 2 && b.s.x < box.x + box.w - 2 && b.s.y > box.y + 2 && b.s.y < box.y + box.h - 2;
      b.s.setVisible(inside);
      const far = b.s.x < box.x - 60 || b.s.x > box.x + box.w + 60 || b.s.y < box.y - 60 || b.s.y > box.y + box.h + 60;
      if (b.life <= 0 || far) { b.s.destroy(); this.bullets.splice(i, 1); continue; }
      if (inside && this.invuln <= 0 && Math.abs(b.s.x - this.soul.x) < 5 && Math.abs(b.s.y - this.soul.y) < 5) {
        this.hitSoul();
        b.s.destroy();
        this.bullets.splice(i, 1);
        if (this.finished) return;
      }
    }
    if (this.turnT >= this.turnLen) this.endTurn();
  }

  private hitSoul() {
    this.invuln = 0.9;
    let dmg = R.diff.dmg + (this.isBoss ? 1 : 0);
    if (this.fx.shield) dmg = Math.ceil(dmg / 2);
    if (!R.god) R.hp -= dmg;
    K.play('hurt');
    this.cameras.main.shake(100, 0.006);
    this.drawAll();
    if (R.hp <= 0) this.lose();
  }

  private lose() {
    this.finished = true;
    R.over = true;
    this.emit = null;
    this.soul.setTint(0x7c7c7c);
    K.play('lose');
    this.tweens.add({ targets: this.soul, scale: 2.5, alpha: 0, duration: 900 });
    this.time.delayedCall(1300, () => {
      this.scene.stop('Explore');
      this.scene.start('End', endData(false));
    });
  }

  private exit(how: 'spared' | 'debugged') {
    if (this.finished) return;
    this.finished = true;
    capture('battle_won', { enemy: this.enc, how });
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.wake('Explore', { enc: this.enc, how });
    });
  }

  // ---------------------------------------------------------------- autopilot
  private botStep(dt: number) {
    this.botT += dt;
    if (this.botT < 0.4) return;
    if ((this.mode === 'result' || this.mode === 'end') && this.tw.done && this.next) {
      this.botT = 0;
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'menu') {
      this.botT = 0;
      const prods = K.theme.products as string[];
      const solve = prods.includes(this.def.solved_by) && !this.used.has(this.def.solved_by) && !this.solved;
      const want = this.sparable() ? 3 : solve ? 2 : 1;
      if (this.sel !== want) { this.sel = want; this.drawAll(); return; }
      this.input_(true, false, false, false, false, false);
    } else if (this.mode === 'items') {
      this.botT = 0;
      const i = this.items.findIndex((it) => it.id === this.def.solved_by);
      this.itemSel = i >= 0 ? i : 0;
      this.input_(true, false, false, false, false, false);
    }
  }

  private dodge(): [number, number] {
    let fx = 0, fy = 0;
    for (const b of this.bullets) {
      const px = b.s.x + b.vx * 0.12, py = b.s.y + b.vy * 0.12; // look a little ahead
      const dx = this.soul.x - px, dy = this.soul.y - py, d2 = dx * dx + dy * dy;
      if (d2 < 30 * 30 && d2 > 0.01) { fx += dx / d2; fy += dy / d2; }
    }
    const cx = DODGE_BOX.x + DODGE_BOX.w / 2, cy = DODGE_BOX.y + DODGE_BOX.h / 2;
    fx += (cx - this.soul.x) * 0.0006;
    fy += (cy - this.soul.y) * 0.0006;
    const m = Math.hypot(fx, fy);
    return m < 0.004 ? [0, 0] : [fx / m, fy / m];
  }
}
