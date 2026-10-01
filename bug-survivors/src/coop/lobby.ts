// Co-op lobby and end screen. No accounts: everyone types the same 4-letter code, lands in the same room, and readies
// up; when everyone (2-4 players) is ready the server counts down 3 s and the game starts on every device at once.
import Phaser from 'phaser';
import { K } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { screen, starfield, button, onKeys, onTap, inside, TAP, Rect } from '@shared/scenes';
import { text, box, fitScale, W, H, NARROW, TOUCH, PixelText } from '@shared/ui';
import { HOG32 } from '../game';
import { hogFrame, hogName } from '../hoggies';
import { save, currentHog } from '../save';
import { net, CODE_LETTERS, randomCode, validCode, HogInfo } from './net';

/** Keypad: the code letters, plus 1-4 for the bot rooms (ZZZ1-ZZZ4). */
const KEYS = `${CODE_LETTERS}1234`;
import type { CoopResult } from './game';

const P_COLS = [0x3cbcfc, 0xf8b800, 0xf878f8, 0x58d854];
let lastCode = '';

/** What this device tells the room about its player. */
function myInfo(): { name: string; info: HogInfo } {
  const sv = save();
  const hog = currentHog();
  const name = hogName(hog).slice(0, 16);
  const pals = [...sv.hogs].sort().slice(0, 12);
  return { name, info: { hog, name, merch: { ...sv.merch }, pals, heat: Math.max(0, Math.min(5, K.run.heat | 0)) } };
}

export class LobbyScene extends Phaser.Scene {
  code = '';
  objs: Phaser.GameObjects.GameObject[] = [];
  keys: (Rect & { act: () => void })[] = [];
  status: PixelText | null = null;
  cdText: PixelText | null = null;
  drawnFor = '';
  bad = false; // the typed code isn't one the server takes

  constructor() { super('Lobby'); }

  create() {
    hooks.scene = 'Lobby';
    hooks.state = 'lobby';
    screen(this, () => this.redraw(true));
    this.cameras.main.setBackgroundColor(K.ui.bg);
    starfield(this, 40);
    this.code = net.inRoom ? net.code : lastCode;
    this.objs = [];
    this.drawnFor = '';
    net.onRoom = () => this.redraw();
    net.onError = () => this.redraw(true);
    net.onStart = () => this.go();
    this.events.once('shutdown', () => { net.onRoom = null; net.onError = null; net.onStart = null; });
    // Keyboard: letters type the code, Backspace deletes, Enter joins (or readies up), Esc goes back (or leaves).
    // A plain DOM listener: Phaser's keyboard plugin can hand a typed letter over twice.
    const onKey = (e: KeyboardEvent) => {
      if (!this.scene.isActive()) return;
      if (e.repeat) return;
      if (net.inRoom) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') this.toggleReady();
        else if (e.code === 'Escape') this.leave();
        return;
      }
      if (e.code === 'Escape') { this.scene.start('Title'); return; }
      if (e.code === 'Backspace') { this.type(''); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { this.join(); return; }
      const ch = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^(Digit|Numpad)[1-4]$/.test(e.code) ? e.code.slice(-1) : '';
      if (ch && KEYS.includes(ch)) this.type(ch);
    };
    window.addEventListener('keydown', onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));
    onTap(this, (x, y) => { const k = this.keys.find((r) => inside(r, x, y, 1)); k?.act(); }, 200);
    this.redraw(true);
    if (net.start && net.room?.phase === 'playing') this.go(); // came back mid-game (a reconnect replays it)
  }

  update() {
    // Status line and the countdown tick without a full redraw.
    const r = net.room;
    if (this.cdText && r?.phase === 'countdown') {
      const left = Math.max(0, r.cd - (this.time.now - this.roomAt)) / 1000;
      this.cdText.setText(`STARTING IN ${Math.ceil(left) || 1}`);
    }
    const want = this.stateKey();
    if (want !== this.drawnFor) this.redraw();
  }

  private roomAt = 0;
  private stateKey() {
    const r = net.room;
    return `${net.status}|${net.error}|${r ? `${r.phase}|${r.you}|${r.players.map((p) => `${p.name}${p.ready}${p.on}${p.info?.hog}`).join(',')}` : this.code}`;
  }

  private type(ch: string) {
    if (!ch) this.code = this.code.slice(0, -1);
    else if (this.code.length < 4) this.code += ch;
    this.bad = false;
    K.play('move', 0.5);
    this.redraw(true);
  }

  private join() {
    if (!validCode(this.code)) { K.play('hurt', 0.4); this.bad = true; this.redraw(true); return; }
    lastCode = this.code;
    K.play('select');
    const me = myInfo();
    net.join(this.code, me.name, me.info);
    capture('coop_join', { players_hint: 0 });
    this.redraw(true);
  }

  private toggleReady() {
    const r = net.room;
    if (!r || r.phase === 'playing') return;
    const mine = r.players[r.you];
    const me = myInfo();
    net.ready(!mine?.ready, me.name, me.info);
    K.play('select');
  }

  private leave() {
    net.leave();
    K.play('move');
    this.redraw(true);
  }

  private go() {
    if (!net.start) return;
    capture('coop_start', { players: net.start.players.length });
    this.scene.start('Coop', net.start);
  }

  private clear() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.keys = [];
    this.status = null;
    this.cdText = null;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T) { this.objs.push(o); return o; }
  private T(x: number, y: number, s: string, o: Parameters<typeof text>[4] = {}) { return this.keep(text(this, x, y, s, { depth: 10, ...o })); }
  private btn(r: Rect, label: string, act: () => void, o: Parameters<typeof button>[3] = {}) {
    button(this, r, label, o).forEach((g) => this.keep(g));
    this.keys.push({ ...r, act });
  }

  private redraw(force = false) {
    const key = this.stateKey();
    if (!force && key === this.drawnFor) return;
    this.drawnFor = key;
    if (net.room?.phase === 'countdown') this.roomAt = this.time.now;
    this.clear();
    if (net.inRoom && net.room) this.drawRoom(); else this.drawCode();
  }

  /** Enter a code (or make one up), then JOIN. */
  private drawCode() {
    const ui = K.ui, narrow = NARROW();
    let y = narrow ? Math.max(24, Math.round((H - 310) / 2)) : Math.max(12, Math.round((H - 270) / 2));
    this.T(W / 2, y, 'CO-OP', { scale: 3, align: 'center', color: ui.accentInt, shadow: ui.panelInt });
    y += 28;
    y += this.T(W / 2, y, 'Everyone types the same 4-letter code. 2 to 4 hogs.', { align: 'center', color: ui.textInt, maxWidth: W - 16, maxLines: 2 }).lineCount * 10 + 8;
    // The code: four boxes.
    const bw = 26, gap = 6, x0 = W / 2 - (4 * bw + 3 * gap) / 2;
    for (let i = 0; i < 4; i++) {
      const ch = this.code[i] ?? '';
      this.keep(box(this, x0 + i * (bw + gap), y, bw, 30, ui.bgInt, i === this.code.length ? ui.accentInt : ui.textInt, ui.panelInt).setDepth(10));
      if (ch) this.T(x0 + i * (bw + gap) + bw / 2, y + 8, ch, { scale: 2, align: 'center', color: ui.accentInt });
    }
    y += 38;
    // The keypad: 24 letters (no I or O), DEL.
    const cols = narrow ? 6 : 12, kw = narrow ? Math.min(40, Math.floor((W - 16 - (cols - 1) * 4) / cols)) : Math.min(34, Math.floor((W - 16 - (cols - 1) * 4) / cols));
    const kh = TOUCH ? TAP : 20, kx0 = W / 2 - (cols * kw + (cols - 1) * 4) / 2;
    [...KEYS].forEach((ch, i) => {
      const r = { x: kx0 + (i % cols) * (kw + 4), y: y + Math.floor(i / cols) * (kh + 4), w: kw, h: kh };
      this.btn(r, ch, () => this.type(ch));
    });
    y += Math.ceil(KEYS.length / cols) * (kh + 4) + 4;
    const bh = TOUCH ? TAP + 4 : 22, n = 4, bwid = Math.min(96, Math.floor((W - 16 - (n - 1) * 6) / n)), bx0 = W / 2 - (n * bwid + (n - 1) * 6) / 2;
    const row = (i: number) => ({ x: bx0 + i * (bwid + 6), y, w: bwid, h: bh });
    this.btn(row(0), 'BACK', () => this.scene.start('Title'));
    this.btn(row(1), 'DEL', () => this.type(''));
    this.btn(row(2), 'NEW CODE', () => { this.code = randomCode(); K.play('select'); this.redraw(true); });
    const ok = validCode(this.code);
    this.btn(row(3), 'JOIN', () => this.join(), { color: ok ? ui.accentInt : ui.dimInt, on: ok });
    y += bh + 8;
    const msg = net.status === 'error' ? net.error : net.status === 'connecting' ? 'Connecting...'
      : this.bad ? 'Codes are 4 letters. Numbers only for bot rooms: ZZZ1 to ZZZ4'
        : `${TOUCH ? 'Tap the letters, then JOIN' : 'Type the code, ENTER to join, ESC back'}. Playtest alone: ZZZ1-ZZZ3 adds 1-3 bots, ZZZ4 a squad of 3`;
    this.status = this.T(W / 2, Math.min(y, H - 22), msg, { align: 'center', color: net.status === 'error' || this.bad ? 0xf87858 : ui.dimInt, maxWidth: W - 12, maxLines: 2 });
  }

  /** In a room: who's here, who's ready, READY and LEAVE. */
  private drawRoom() {
    const ui = K.ui, r = net.room!, narrow = NARROW();
    let y = narrow ? Math.max(20, Math.round((H - 270) / 2)) : Math.max(10, Math.round((H - 262) / 2));
    const head = `ROOM ${r.code}`;
    this.T(W / 2, y, head, { scale: fitScale(head, W - 16, 3), align: 'center', color: ui.accentInt, shadow: ui.panelInt });
    y += 26;
    this.T(W / 2, y, 'Tell your friends this code', { align: 'center', color: ui.dimInt });
    y += 16;
    const rw = Math.min(W - 16, 320), rx = W / 2 - rw / 2, rh = 26;
    for (let i = 0; i < 4; i++) {
      const p = r.players[i];
      this.keep(box(this, rx, y, rw, rh, ui.bgInt, p ? (i === r.you ? ui.accentInt : ui.textInt) : ui.panelInt, ui.panelInt).setDepth(10));
      if (p) {
        const hog = p.info?.hog || 'robot';
        this.keep(this.add.image(rx + 16, y + rh / 2, HOG32, hogFrame(hog)).setDisplaySize(24, 24).setDepth(11).setAlpha(p.on ? 1 : 0.4));
        this.T(rx + 32, y + 5, `P${i + 1} ${p.name.toUpperCase()}${i === r.you ? ' (YOU)' : ''}`, { color: P_COLS[i], maxWidth: rw - 110, maxLines: 1 });
        this.T(rx + 32, y + 15, p.bot ? (p.info?.follow ? 'Sticks with you' : 'Plays itself') : hogName(hog), { color: ui.dimInt, maxWidth: rw - 110, maxLines: 1 });
        this.T(rx + rw - 8, y + 9, p.bot ? 'BOT' : !p.on ? 'OFFLINE' : p.ready ? 'READY' : 'NOT READY', { align: 'right', color: p.bot ? 0x3cbcfc : !p.on ? 0xf87858 : p.ready ? 0x58d854 : ui.dimInt });
      } else {
        this.T(W / 2, y + 9, 'waiting for a hog...', { align: 'center', color: ui.panelInt });
      }
      y += rh + 4;
    }
    y += 4;
    const me = r.players[r.you];
    const all = r.players.length >= 2 && r.players.every((p) => p.ready || p.bot);
    if (r.phase === 'playing') {
      this.T(W / 2, y + 2, 'The last game is still finishing for someone...', { align: 'center', color: ui.dimInt, maxWidth: W - 16, maxLines: 2 });
      y += 20;
    } else if (r.phase === 'countdown') {
      this.cdText = this.T(W / 2, y, 'STARTING IN 3', { scale: 2, align: 'center', color: 0xf8d878 });
      y += 20;
    } else {
      const msg = r.players.length < 2 ? 'Waiting for at least one more hog to join' : all ? 'Starting...'
        : r.players.some((p) => p.bot) ? 'Ready up to play with the bots. Friends can still join' : 'Everyone readies up, then a 3 s countdown';
      this.T(W / 2, y + 2, msg, { align: 'center', color: ui.textInt, maxWidth: W - 16, maxLines: 2 });
      y += 20;
    }
    const bh = TOUCH ? TAP + 6 : 24, bw = Math.min(140, Math.floor((W - 22) / 2));
    this.btn({ x: W / 2 - bw - 3, y, w: bw, h: bh }, 'LEAVE', () => this.leave());
    this.btn({ x: W / 2 + 3, y, w: bw, h: bh }, me?.ready ? 'NOT READY' : 'READY!', () => this.toggleReady(), { color: me?.ready ? ui.textInt : ui.accentInt, on: !me?.ready });
    y += bh + 6;
    const heat = r.players[0]?.info?.heat ?? 0;
    const hint = [heat ? `HEAT ${heat} (P1's pick)` : '', TOUCH ? '' : 'ENTER ready   ESC leave', net.status === 'connecting' ? 'Reconnecting...' : ''].filter(Boolean).join('   ');
    if (y < H - 10) this.T(W / 2, y, hint, { align: 'center', color: ui.dimInt, maxWidth: W - 12, maxLines: 1 });
  }
}

/** After a co-op run: the team's result and everyone's part in it; back to the room (same code) or the title. */
export class CoopEndScene extends Phaser.Scene {
  constructor() { super('CoopEnd'); }

  create(d: CoopResult) {
    hooks.scene = 'CoopEnd';
    hooks.state = d.won ? 'win' : 'lose';
    screen(this, () => this.scene.restart(d));
    const ui = K.ui, narrow = NARROW();
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this, d.won ? 80 : 20);
    K.play(d.won ? 'win' : 'lose');
    const head = d.cashedOut ? (d.wave >= 2 ? `SHIPPED v${d.wave}.0!` : 'BUGS SQUASHED!') : d.won ? `REACHED WAVE ${d.wave}` : 'TEAM WIPED';
    let y = narrow ? 24 : 12;
    text(this, W / 2, y, head, { scale: fitScale(head, W - 20, 3), align: 'center', color: d.won ? ui.accentInt : 0xf83800, shadow: ui.panelInt });
    y += 30;
    text(this, W / 2, y, `SCORE ${d.score}`, { scale: 2, align: 'center', color: ui.accentInt });
    y += 20;
    text(this, W / 2, y, `TIME ${d.time}   WAVE ${d.wave}   BUGS ${d.kills}   LEVEL ${d.level}   +${d.gold} GOLD`, { align: 'center', color: 0xf8d878, maxWidth: W - 12, maxLines: 2 });
    y += narrow ? 24 : 16;
    const rw = Math.min(W - 16, 360), rx = W / 2 - rw / 2;
    d.players.forEach((p, i) => {
      box(this, rx, y, rw, 28, ui.bgInt, p.local ? ui.accentInt : ui.textInt, ui.panelInt);
      this.add.image(rx + 14, y + 14, HOG32, hogFrame(p.hog)).setDisplaySize(20, 20).setAlpha(p.gone ? 0.4 : 1);
      text(this, rx + 28, y + 5, `P${i + 1} ${p.name.toUpperCase()}${p.local ? ' (YOU)' : ''}${p.gone ? ' LEFT' : ''}`, { color: P_COLS[i % 4], maxWidth: rw - 40, maxLines: 1 });
      text(this, rx + 28, y + 16, `${p.kills} bugs   ${fmt(p.dmg)} dmg   ${p.revived} reviews   ${p.downs} downs`, { color: ui.dimInt, maxWidth: rw - 40, maxLines: 1 });
      y += 32;
    });
    const extra: string[] = [];
    if (d.unlocks.length) extra.push(`NEW HOGGIES: ${d.unlocks.slice(0, 3).map((h) => hogName(h).toUpperCase()).join(', ')}${d.unlocks.length > 3 ? ` +${d.unlocks.length - 3}` : ''}`);
    if (d.desync) extra.push('The game went out of sync between players. Sorry!');
    for (const l of extra) { y += text(this, W / 2, y + 2, l, { align: 'center', color: ui.accentInt, maxWidth: W - 16, maxLines: 2 }).lineCount * 10 + 2; }
    const inRoom = net.inRoom;
    const bh = TOUCH ? TAP + 4 : 24, bw = Math.min(150, Math.floor((W - 22) / 2)), by = H - bh - (narrow ? 20 : 10);
    const back: Rect = { x: Math.round(W / 2 - bw - 3), y: by, w: bw, h: bh }, title: Rect = { x: Math.round(W / 2 + 3), y: by, w: bw, h: bh };
    button(this, back, inRoom ? 'BACK TO ROOM' : 'CO-OP', { color: ui.accentInt });
    button(this, title, 'TITLE');
    const toRoom = () => this.scene.start('Lobby');
    const toTitle = () => { net.leave(); this.scene.start('Title'); };
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], toRoom, 800);
    onKeys(this, ['Escape'], toTitle, 800);
    onTap(this, (x, yy) => { if (inside(back, x, yy)) toRoom(); else if (inside(title, x, yy)) toTitle(); }, 800);
    if (!TOUCH) text(this, W / 2, by - 12, 'ENTER room   ESC title', { align: 'center', color: ui.dimInt });
  }
}

const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1000)}K` : `${v}`);
