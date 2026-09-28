// The desk's widgets: top HUD, record card (left), document stack with tabs (right), the reason picker,
// and the bottom bar (inspector's line, tools, manager portrait). Pure presentation: game.ts owns the rules.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { text, box, bar, wrap, PixelText, W, H } from '@shared/ui';
import { burst, floatText, punch, shake } from '@shared/juice';
import products from '../../shared/products.json';
import type { Rec } from './rules';
import { Doc, Line, COLS } from './docs';

export const PAPER = 0xf0d0b0;
export const INK = 0x000000;
export const INK_KEY = 0x503000;
export const RED = 0xf83800;
export const GREEN = 0x00b800;
export const GOLD = 0xf8b800;
export const GREY = 0x7c7c7c;
const PERSON_PAPER = 0xc8e0f0;
const PERSON_HEAD = 0x0058f8;
export const productColor = (id: string) => parseInt(((products as Record<string, { color: string }>)[id]?.color ?? '#fcfcfc').slice(1), 16);

const CARD = { x: 4, y: 21, w: 236, h: 197 };
const PANEL = { x: 244, y: 21, w: 232, h: 197 };
const BODY = { x: 250, y: 38, lines: 16 };
const DOC_PAPER: Record<string, number> = { rules: PAPER, plan: 0xfce0a8, users: 0xd8f8b8, uptime: 0xd8d8d8, flags: 0xf8d8f8 };
const LINE_COL: Record<NonNullable<Line['c']>, number> = { ink: INK, key: INK_KEY, new: 0x0000bc, bad: 0xa81000, ok: 0x005800 };

export interface ToolView { name: string; icon: string; color: number }

export class Desk {
  private s: Phaser.Scene;
  private day!: PixelText;
  private clock!: ReturnType<typeof bar>;
  private quality!: ReturnType<typeof bar>;
  private quota!: PixelText;
  private score!: PixelText;
  private streakT!: PixelText;
  private flames!: Phaser.GameObjects.Graphics;
  private streak = 0;
  private sayT!: PixelText;
  hog!: Phaser.GameObjects.Sprite;
  private boss!: Phaser.GameObjects.Sprite;
  private bossMark!: PixelText;
  private toolIcons: Phaser.GameObjects.Image[] = [];
  private toolTexts: PixelText[] = [];
  private toolBadges: PixelText[] = [];
  card: Phaser.GameObjects.Container | null = null;
  private cardLines = new Map<string, number>();
  private hl: Phaser.GameObjects.Graphics | null = null;
  // documents
  private tabs: Phaser.GameObjects.GameObject[] = [];
  private body: Phaser.GameObjects.GameObject[] = [];
  private paper!: Phaser.GameObjects.Graphics;
  private seen!: PixelText;
  docs: Doc[] = [];
  tab = 'rules';
  private scroll = 0;
  private fresh = new Set<string>();
  private picker: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, tools: ToolView[]) {
    this.s = scene;
    const ui = K.ui;
    const g = scene.add.graphics().setDepth(1);
    g.fillStyle(ui.bgInt, 1).fillRect(0, 0, W, 17).fillStyle(ui.panelInt, 1).fillRect(0, 17, W, 1);
    this.day = text(scene, 4, 4, 'DAY 1/5', { color: ui.accentInt, depth: 2 });
    text(scene, 58, 4, 'TIME', { color: ui.dimInt, depth: 2 });
    this.clock = bar(scene, 86, 6, 90, 5, ui.accentInt, 0x000000, ui.textInt);
    this.clock.g.setDepth(2);
    text(scene, 186, 4, 'QUALITY', { color: ui.dimInt, depth: 2 });
    this.quality = bar(scene, 232, 6, 70, 5, GREEN, 0x000000, ui.textInt);
    this.quality.g.setDepth(2);
    this.quota = text(scene, 310, 4, 'DONE 0/7', { depth: 2 });
    this.flames = scene.add.graphics().setDepth(2);
    this.streakT = text(scene, 400, 4, '', { color: GOLD, depth: 2 });
    this.score = text(scene, W - 4, 4, '0', { align: 'right', color: ui.accentInt, depth: 2 });

    // Document stack (right).
    box(scene, PANEL.x, PANEL.y, PANEL.w, PANEL.h, ui.bgInt, ui.textInt, ui.panelInt).setDepth(1);
    this.paper = scene.add.graphics().setDepth(2);
    this.seen = text(scene, PANEL.x + 6, PANEL.y + PANEL.h - 12, '', { color: ui.dimInt, depth: 3 });

    // Bottom bar: the inspector's running commentary, tools, the manager watching.
    box(scene, 4, 222, W - 8, 45, ui.bgInt, ui.textInt, ui.panelInt).setDepth(12);
    this.hog = scene.add.sprite(9, 226, spr('inspector')).setOrigin(0).setDepth(13);
    this.hog.play(anim('inspector'));
    this.sayT = text(scene, 38, 228, '', { maxWidth: 394, maxLines: 1, depth: 13 });
    tools.forEach((t, i) => {
      const x = 38 + i * 99;
      this.toolIcons.push(scene.add.image(x, 243, spr(t.icon)).setOrigin(0).setDepth(13));
      this.toolTexts.push(text(scene, x + 19, 247, '', { depth: 13, maxWidth: 78, maxLines: 1 }));
      this.toolBadges.push(text(scene, x + 12, 252, '', { depth: 14, color: GOLD }));
    });
    if (!tools.length) text(scene, 38, 247, 'No tools on this desk', { color: ui.dimInt, depth: 13 });
    scene.add.graphics().setDepth(13).fillStyle(ui.panelInt, 1).fillRect(438, 227, 34, 34);
    this.boss = scene.add.sprite(439, 228, spr('manager')).setOrigin(0).setDepth(14);
    this.bossMark = text(scene, 434, 224, '', { depth: 15, color: RED, scale: 1 });
  }

  // ---------------------------------------------------------------- HUD
  hud(o: { day: string; clock: number; clockCol: number; quality: number; quota: string; quotaMet: boolean; score: number; streak: number }) {
    this.day.setText(o.day);
    this.clock.draw(o.clock, o.clockCol);
    this.quality.draw(o.quality / 100, o.quality > 50 ? GREEN : o.quality > 25 ? GOLD : RED);
    this.quota.setText(o.quota).setColor(o.quotaMet ? GREEN : K.ui.textInt);
    this.score.setText(String(o.score));
    if (o.streak !== this.streak) {
      if (o.streak > this.streak && o.streak >= 3) punch(this.streakT, 0.3);
      this.streak = o.streak;
      this.streakT.setText(o.streak >= 3 ? `x${o.streak}` : '');
    }
  }
  clockBar(frac: number, col: number) { this.clock.draw(frac, col); }

  /** Streak flames: 1/2/3 flickering pixel flames at 3+/6+/10+. */
  tickFlames(t: number) {
    const g = this.flames.clear();
    const n = this.streak >= 10 ? 3 : this.streak >= 6 ? 2 : this.streak >= 3 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = 394 - i * 8, f = Math.floor(t * 12 + i * 3) % 3;
      g.fillStyle(RED, 1).fillRect(x - 2, 9, 5, 4).fillRect(x - 1, 7 - (f === 0 ? 1 : 0), 3, 2);
      g.fillStyle(GOLD, 1).fillRect(x - 1, 10, 3, 3).fillRect(x, 5 + f, 1, 3);
      g.fillStyle(0xfcfcfc, 1).fillRect(x, 11, 1, 2);
    }
  }

  say(msg: string, color = K.ui.textInt) { this.sayT.setText(msg).setColor(color); }

  tools(v: { charges: number; upgraded: boolean }[], names: string[]) {
    v.forEach((t, i) => {
      const used = t.charges <= 0;
      this.toolIcons[i]?.setAlpha(used ? 0.35 : 1);
      this.toolTexts[i]?.setText(`${i + 1} ${names[i]}`).setColor(used ? GREY : t.upgraded ? GOLD : K.ui.textInt);
      this.toolBadges[i]?.setText(t.charges > 1 ? String(Math.min(9, t.charges)) : '');
    });
  }

  toolFlash(i: number) {
    const ic = this.toolIcons[i];
    if (!ic) return;
    punch(ic, 0.5, 160);
    burst(this.s, ic.x + 8, ic.y + 8, K.ui.accentInt, 10, { speed: 60 });
  }

  /** The manager reacts: 'bad' (jolt + !), 'good' (nod + star), 'talk' (mouth moves). */
  boss_(kind: 'bad' | 'good' | 'talk') {
    const b = this.boss, s = this.s;
    s.tweens.killTweensOf(b);
    b.setPosition(439, 228);
    if (kind === 'talk') { b.play(anim('manager')); s.time.delayedCall(900, () => b.stop().setFrame(0)); return; }
    this.bossMark.setText(kind === 'bad' ? '!!' : '*').setColor(kind === 'bad' ? RED : GOLD).setVisible(true);
    s.time.delayedCall(700, () => this.bossMark.setVisible(false));
    if (kind === 'bad') {
      b.setTint(0xffb0a0);
      s.tweens.add({ targets: b, x: 441, duration: 40, yoyo: true, repeat: 3, onComplete: () => { b.clearTint(); b.setX(439); } });
    } else {
      s.tweens.add({ targets: b, y: 226, duration: 90, yoyo: true, repeat: 1, onComplete: () => b.setY(228) });
    }
  }

  // ---------------------------------------------------------------- record card
  drawCard(rec: Rec, o: { persona: { name: string; role: string }; portrait: string; exempt: string | null; final: boolean }) {
    this.discard(true);
    const ui = K.ui, s = this.s;
    const { w, h } = CARD;
    const c = s.add.container(CARD.x, -h - 10).setDepth(10);
    const g = s.add.graphics();
    const paper = rec.person ? PERSON_PAPER : PAPER;
    g.fillStyle(0x000000, 0.35).fillRect(3, 3, w, h);
    g.fillStyle(paper, 1).fillRect(0, 0, w, h);
    g.lineStyle(1, INK, 1).strokeRect(0.5, 0.5, w - 1, h - 1);
    g.fillStyle(o.final ? GOLD : rec.person ? PERSON_HEAD : ui.panelInt, 1).fillRect(1, 1, w - 2, 13);
    if (o.final) g.lineStyle(2, GOLD, 1).strokeRect(-2, -2, w + 4, h + 4);
    c.add(g);
    const head = o.final ? 0x000000 : rec.person ? 0xfcfcfc : ui.onPanelInt;
    c.add(text(s, 6, 3, o.final ? 'FINAL RECORD' : `RECORD #${rec.n}`, { color: head, shadow: null }));
    c.add(text(s, w - 6, 3, rec.person ? 'PERSON PROFILE' : 'EVENT', { align: 'right', color: head, shadow: null }));
    this.cardLines.clear();
    const row = (key: string, label: string, v: string, y: number, maxW: number) => {
      this.cardLines.set(key, y);
      c.add(text(s, 6, y, label, { color: INK_KEY, shadow: null }));
      c.add(text(s, 46, y, v, { color: INK, shadow: null, maxWidth: maxW, maxLines: 1 }));
    };
    let propY: number;
    if (rec.person) {
      // Person layout: a big photo and name, then who they are, then their person properties.
      g.fillStyle(INK, 1).fillRect(5, 17, 66, 66);
      c.add(s.add.image(6, 18, o.portrait).setOrigin(0).setScale(2));
      this.cardLines.set('USER', 22);
      c.add(text(s, 78, 20, o.persona.name, { scale: 2, color: INK, shadow: null, maxWidth: w - 84, maxLines: 1 }));
      if (o.persona.role) c.add(text(s, 78, 42, o.persona.role, { color: INK_KEY, shadow: null, maxWidth: w - 84, maxLines: 1 }));
      c.add(text(s, 78, 56, `EVENT ${rec.event}`, { color: INK_KEY, shadow: null }));
      row('EMAIL', 'EMAIL', rec.email, 87, w - 50);
      row('ID', 'ID', rec.id, 98, w - 50);
      row('SOURCE', 'SOURCE', rec.source, 109, w - 50);
      row('TIME', 'SEEN', rec.time, 120, w - 50);
      propY = 132;
    } else {
      // Sender portrait, top right.
      g.fillStyle(INK, 1).fillRect(w - 38, 17, 34, 34);
      c.add(s.add.image(w - 37, 18, o.portrait).setOrigin(0));
      const rows: [string, string][] = [
        ['EVENT', rec.event], ['ID', rec.id], ['USER', o.persona.name], ['EMAIL', rec.email], ['SOURCE', rec.source], ['TIME', rec.time],
      ];
      rows.forEach(([k, v], i) => row(k, k, v, 19 + i * 11, (i < 3 ? w - 88 : w - 50) + (i === 0 ? 36 : 0)));
      propY = 86;
    }
    g.fillStyle(INK_KEY, 1);
    for (let x = 6; x < w - 6; x += 3) g.fillRect(x, propY, 1, 1);
    c.add(text(s, 6, propY + 3, rec.person ? 'PERSON PROPERTIES' : 'PROPERTIES', { color: INK_KEY, shadow: null }));
    if (!rec.props.length) c.add(text(s, 14, propY + 14, '(none)', { color: INK_KEY, shadow: null }));
    rec.props.slice(0, rec.person ? 4 : 8).forEach(([k, v], i) => {
      const y = propY + 14 + i * 10;
      this.cardLines.set(k, y);
      c.add(text(s, 10, y, k, { color: INK_KEY, shadow: null, maxWidth: 100, maxLines: 1 }));
      c.add(text(s, 110, y, v, { color: INK, shadow: null, maxWidth: w - 114, maxLines: 1 }));
    });
    if (o.exempt) {
      g.fillStyle(GOLD, 1).fillRect(w - 64, rec.person ? 108 : 72, 58, 11);
      c.add(text(s, w - 35, rec.person ? 110 : 74, 'DEAL', { color: INK, shadow: null, align: 'center' }));
    }
    // Stamp strip.
    g.fillStyle(INK_KEY, 1).fillRect(4, h - 17, w - 8, 1);
    c.add(text(s, 6, h - 12, '< A APPROVE', { color: 0x006800, shadow: null }));
    c.add(text(s, w - 6, h - 12, 'FLAG D >', { color: 0xa81000, shadow: null, align: 'right' }));
    this.hl = s.add.graphics();
    c.add(this.hl);
    this.card = c;
    s.tweens.add({ targets: c, y: CARD.y, duration: 240, ease: 'Back.easeOut' });
  }

  /** File the card away: approved slides out left, flagged drops into the drawer. */
  discard(approved: boolean) {
    const c = this.card;
    this.card = null;
    this.hl = null;
    if (!c) return;
    c.setDepth(9);
    const s = this.s;
    s.tweens.killTweensOf(c);
    if (approved) s.tweens.add({ targets: c, x: -CARD.w - 20, angle: -4, duration: 260, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
    else s.tweens.add({ targets: c, y: H + 20, angle: 5, duration: 280, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  }

  stamp(flag: boolean) {
    if (!this.card) return;
    const s = this.s;
    const col = flag ? RED : GREEN;
    const st = s.add.container(118, 150);
    const g = s.add.graphics();
    g.lineStyle(2, col, 1).strokeRect(-52, -13, 104, 26);
    g.lineStyle(1, col, 1).strokeRect(-49, -10, 98, 20);
    st.add(g);
    st.add(text(s, 0, -7, flag ? 'FLAGGED' : 'APPROVED', { scale: 2, align: 'center', color: col, shadow: null }));
    st.setAngle(flag ? 8 : -6).setScale(2.2).setAlpha(0);
    this.card.add(st);
    s.tweens.add({ targets: st, scale: 1, alpha: 1, duration: 90, ease: 'Quad.easeIn', onComplete: () => {
      shake(s, 2, 70);
      burst(s, CARD.x + 118, CARD.y + 150, col, 14, { speed: 90, colours: [INK] });
    } });
    this.hog.setFrame(1);
    s.time.delayedCall(150, () => this.hog.play(anim('inspector')));
  }

  float(msg: string, col: number) { floatText(this.s, CARD.x + 118, CARD.y + 172, msg, col); }

  highlight(field: string) {
    const y = this.cardLines.get(field);
    if (!this.hl || y === undefined) return false;
    this.hl.clear().lineStyle(1, RED, 1).strokeRect(3.5, y - 2.5, CARD.w - 7, 12);
    return true;
  }

  // ---------------------------------------------------------------- documents
  setDocs(docs: Doc[], opts: { keepTab?: boolean } = {}) {
    const had = new Set(this.docs.map((d) => d.id));
    for (const d of docs) if (had.size && !had.has(d.id)) this.fresh.add(d.id);
    this.docs = docs;
    if (!opts.keepTab || !docs.some((d) => d.id === this.tab)) { this.tab = docs[0]?.id ?? 'rules'; this.scroll = 0; }
    this.renderDocs();
  }

  switchTab(dir: number | string) {
    if (!this.docs.length) return;
    const i = this.docs.findIndex((d) => d.id === this.tab);
    const next = typeof dir === 'string' ? this.docs.find((d) => d.id === dir) : this.docs[(i + dir + this.docs.length) % this.docs.length];
    if (!next || next.id === this.tab) return;
    this.tab = next.id;
    this.scroll = 0;
    this.fresh.delete(next.id);
    K.play('rustle', 0.7);
    this.renderDocs();
  }

  scrollDoc(d: number) {
    const n = this.docLines().length;
    const max = Math.max(0, n - BODY.lines);
    const before = this.scroll;
    this.scroll = Phaser.Math.Clamp(this.scroll + d * 4, 0, max);
    if (this.scroll !== before) { K.play('move', 0.4); this.renderDocs(); }
  }

  seenIds(ids: string[]) { this.seen.setText(ids.length ? `SEEN ${ids.join(' ')}` : 'SEEN -'); }

  private docLines(): { t: string; col: number }[] {
    const d = this.docs.find((x) => x.id === this.tab);
    if (!d) return [];
    const out: { t: string; col: number }[] = d.title ? [{ t: d.title, col: INK }] : [];
    for (const l of d.lines) {
      const ind = l.indent ?? 0;
      for (const w of wrap(l.t, COLS - ind)) out.push({ t: ' '.repeat(ind) + w, col: LINE_COL[l.c ?? 'ink'] });
    }
    return out;
  }

  renderDocs() {
    const s = this.s;
    this.tabs.forEach((o) => o.destroy());
    this.body.forEach((o) => o.destroy());
    this.tabs = []; this.body = [];
    const ui = K.ui;
    let x = PANEL.x + 5;
    for (const d of this.docs) {
      const wpx = d.tab.length * 6 + 6;
      const on = d.id === this.tab;
      const g = s.add.graphics().setDepth(2);
      g.fillStyle(on ? DOC_PAPER[d.id] : ui.panelInt, 1).fillRect(x, PANEL.y + 4, wpx, on ? 12 : 11);
      this.tabs.push(g);
      const col = on ? INK : this.fresh.has(d.id) ? ui.accentInt : ui.onPanelInt;
      this.tabs.push(text(s, x + 3, PANEL.y + 6, d.tab, { color: col, shadow: null, depth: 3 }));
      x += wpx + 2;
    }
    const paper = DOC_PAPER[this.tab] ?? PAPER;
    this.paper.clear().fillStyle(paper, 1).fillRect(PANEL.x + 4, PANEL.y + 15, PANEL.w - 8, PANEL.h - 31);
    const lines = this.docLines();
    const max = Math.max(0, lines.length - BODY.lines);
    this.scroll = Math.min(this.scroll, max);
    lines.slice(this.scroll, this.scroll + BODY.lines).forEach((l, i) => {
      this.body.push(text(s, BODY.x, BODY.y + i * 10, l.t, { color: l.col, shadow: null, depth: 3 }));
    });
    if (this.scroll > 0) this.body.push(text(s, PANEL.x + PANEL.w - 8, BODY.y, '^', { align: 'right', color: RED, shadow: null, depth: 3 }));
    if (this.scroll < max) this.body.push(text(s, PANEL.x + PANEL.w - 8, BODY.y + (BODY.lines - 1) * 10, 'v', { align: 'right', color: RED, shadow: null, depth: 3 }));
  }

  // ---------------------------------------------------------------- reason picker
  showPicker(opts: string[], sel: number) {
    this.hidePicker();
    const s = this.s;
    const x = PANEL.x + 4, y = PANEL.y + 15, w = PANEL.w - 8, h = PANEL.h - 31;
    const g = s.add.graphics().setDepth(20);
    g.fillStyle(0xfcfcfc, 1).fillRect(x, y, w, h).lineStyle(2, RED, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
    this.picker.push(g);
    this.picker.push(text(s, x + w / 2, y + 5, 'WHY FLAG IT?', { align: 'center', color: 0xa81000, shadow: null, depth: 21 }));
    let yy = y + 20;
    opts.forEach((o, i) => {
      const lines = wrap(o, COLS - 3, 2);
      if (i === sel) g.fillStyle(0xfce0a8, 1).fillRect(x + 3, yy - 2, w - 6, lines.length * 10 + 3);
      this.picker.push(text(s, x + 5, yy, `${i + 1}`, { color: 0xa81000, shadow: null, depth: 21 }));
      this.picker.push(text(s, x + 17, yy, lines.join('\n'), { color: INK, shadow: null, depth: 21 }));
      yy += lines.length * 10 + 6;
    });
    this.picker.push(text(s, x + w / 2, y + h - 12, '1-4 PICK   A/ESC BACK', { align: 'center', color: INK_KEY, shadow: null, depth: 21 }));
  }
  hidePicker() { this.picker.forEach((o) => o.destroy()); this.picker = []; }
}
