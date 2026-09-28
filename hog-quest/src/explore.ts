// Hog Quest: walking the prospect's office, talking to their team, bumping into their problems.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { capture } from '@shared/analytics';
import { text, box, blink, PixelText, W } from '@shared/ui';
import {
  buildRoom, cellFrames, cellX, cellY, colOf, rowOf, RoomMap, Spot, COLS, ROWS, OX, OY, DOOR_ROW, TILE,
} from './rooms';
import { R, BOSS, encDef, resetRun, endData } from './state';
import { Typewriter, paginate } from './typewriter';

interface Page { speaker?: string; text: string }
interface NpcPlace { i: number; room: number; spot: Spot }
interface EncPlace { enc: number; room: number; spot: Spot }

const SPEED = 72;
const DIRS = { down: 0, up: 2, left: 4, right: 6 } as const;
type Dir = keyof typeof DIRS;

export class ExploreScene extends Phaser.Scene {
  private rooms: RoomMap[] = [];
  private npcs: NpcPlace[] = [];
  private encs: EncPlace[] = [];
  private roomIdx = 0;
  private layer!: Phaser.GameObjects.Container;
  private actors: { kind: 'npc' | 'enc'; id: number; s: Phaser.GameObjects.Sprite; col: number; row: number; half?: number }[] = [];
  private pos = { x: 0, y: 0 };
  private player!: Phaser.GameObjects.Sprite;
  private dir: Dir = 'right';
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: { name: PixelText; desc: PixelText; hp: PixelText };
  private dlg: { pages: Page[]; i: number; tw: Typewriter; objs: Phaser.GameObjects.GameObject[]; speaker: PixelText; more: PixelText; done: () => void; wait: number } | null = null;
  private busy = false; // room transition or battle launch in progress
  private bot = { path: [] as Spot[], goal: '' as string, push: null as null | { x: number; y: number }, stuckT: 0, lastX: 0, lastY: 0, talkTo: -1 };

  constructor() { super('Explore'); }

  create() {
    resetRun();
    const g = K.theme.game;
    hooks.scene = 'Explore';
    hooks.state = 'explore';
    hooks.elapsed = 0;
    this.busy = false;
    this.dlg = null;
    const n = Math.min(4, Math.max(3, g.rooms.length));
    this.rooms = g.rooms.slice(0, n).map((r: any, i: number) => buildRoom(r.layout, i > 0, i < n - 1));
    this.placeActors(n);
    this.cameras.main.setBackgroundColor(K.ui.bg);
    this.layer = this.add.container(0, 0);
    this.player = this.add.sprite(0, 0, spr('player'), 6);
    this.makeAnims();
    const ui = K.ui;
    this.add.rectangle(0, 0, W, OY - 2, ui.bgInt).setOrigin(0).setDepth(1000);
    this.add.rectangle(0, OY - 2, W, 2, ui.panelInt).setOrigin(0).setDepth(1000);
    this.hud = {
      name: text(this, OX, 5, '', { color: ui.accentInt, depth: 1001 }),
      desc: text(this, OX, 16, '', { color: ui.dimInt, depth: 1001, maxWidth: W - 110, maxLines: 1 }),
      hp: text(this, W - OX, 5, '', { align: 'right', depth: 1001 }),
    };
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => kb.off('keydown', this.onKey, this));
    this.events.on('wake', this.onWake, this);
    this.events.once('shutdown', () => this.events.off('wake', this.onWake, this));
    this.enterRoom(0, this.rooms[0].spots.s);
    this.say((g.intro as string[]).map((t) => ({ text: t })), () => {});
    this.installDebug();
  }

  // ---------------------------------------------------------------- setup
  private placeActors(n: number) {
    const g = K.theme.game;
    this.encs = [];
    if (n >= 4) {
      for (let i = 0; i < 3; i++) this.encs.push({ enc: i, room: i, spot: this.rooms[i].spots.e });
      this.encs.push({ enc: BOSS, room: 3, spot: this.rooms[3].spots.b });
    } else {
      this.encs.push({ enc: 0, room: 0, spot: this.rooms[0].spots.e });
      this.encs.push({ enc: 1, room: 1, spot: this.rooms[1].spots.e });
      this.encs.push({ enc: 2, room: 2, spot: this.rooms[2].spots.m });
      this.encs.push({ enc: BOSS, room: 2, spot: this.rooms[2].spots.b });
    }
    // NPCs: 3 spots per room; overflow moves to the next room with space.
    const used = this.rooms.map(() => 0);
    this.npcs = [];
    (g.npcs as any[]).forEach((npc, i) => {
      if (i >= 6) return;
      let room = Number.isInteger(npc.room) ? npc.room : 0;
      if (room < 0 || room >= n) {
        hooks.themeIssues.push(`game.npcs[${i}].room ${npc.room} has no room: moved`);
        room = i % n;
      }
      for (let k = 0; k < n && used[room] >= this.rooms[room].spots.n.length; k++) room = (room + 1) % n;
      if (used[room] >= this.rooms[room].spots.n.length) { hooks.themeIssues.push(`game.npcs[${i}]: no free spot, dropped`); return; }
      this.npcs.push({ i, room, spot: this.rooms[room].spots.n[used[room]++] });
    });
  }

  private makeAnims() {
    const key = spr('player');
    for (const [d, f] of Object.entries(DIRS)) {
      const k = `hq-walk-${d}`;
      if (this.anims.exists(k)) this.anims.remove(k);
      this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(key, { start: f, end: f + 1 }), frameRate: 6, repeat: -1 });
    }
  }

  private get room() { return this.rooms[this.roomIdx]; }

  private enterRoom(i: number, at: Spot) {
    this.roomIdx = i;
    const room = this.room;
    this.layer.removeAll(true);
    this.actors.forEach((a) => a.s.destroy());
    this.actors = [];
    const tiles = spr('tiles');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const f of cellFrames(room, c, r)) this.layer.add(this.add.image(OX + c * TILE, OY + r * TILE, tiles, f).setOrigin(0));
      }
    }
    for (const p of this.npcs.filter((p) => p.room === i)) {
      const s = this.add.sprite(cellX(p.spot.col), cellY(p.spot.row) - 4, spr(`npc_${p.i + 1}`)).setDepth(cellY(p.spot.row));
      s.play(anim(`npc_${p.i + 1}`));
      s.anims.setProgress(Math.random());
      this.actors.push({ kind: 'npc', id: p.i, s, col: p.spot.col, row: p.spot.row });
    }
    for (const e of this.encs.filter((e) => e.room === i && !R.cleared.has(e.enc))) {
      const key = e.enc === BOSS ? 'boss' : `enemy_${e.enc + 1}`;
      const s = this.add.sprite(cellX(e.spot.col), cellY(e.spot.row) - 4, spr(key)).setDepth(cellY(e.spot.row));
      s.play(anim(key));
      if (e.enc !== BOSS) s.setFlipX(true);
      this.actors.push({ kind: 'enc', id: e.enc, s, col: e.spot.col, row: e.spot.row, half: e.enc === BOSS ? 20 : 12 });
    }
    this.pos = { x: cellX(at.col), y: cellY(at.row) };
    this.syncPlayer();
    this.refreshBoss();
    const def = K.theme.game.rooms[i];
    this.hud.name.setText(def?.name ?? '');
    this.hud.desc.setText(def?.description ?? '');
    this.bot.path = [];
    this.bot.goal = '';
    this.bot.push = null;
    capture('room_entered', { room: i });
  }

  /** The boss only shows up once every other problem is dealt with. */
  private refreshBoss(announce = false) {
    const b = this.actors.find((a) => a.kind === 'enc' && a.id === BOSS);
    if (!b) return;
    const ready = [0, 1, 2].every((i) => R.cleared.has(i));
    if (ready && !b.s.visible && announce) {
      b.s.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: b.s, alpha: 1, duration: 900 });
      this.cameras.main.shake(500, 0.008);
      K.play('boss');
    } else {
      b.s.setVisible(ready);
    }
  }

  private syncPlayer() {
    this.player.setPosition(Math.round(this.pos.x), Math.round(this.pos.y - 5)).setDepth(this.pos.y + 1);
    this.hud?.hp.setText(`HP ${Math.ceil(R.hp)}/${R.maxHp}`);
  }

  // ---------------------------------------------------------------- collision
  private blockedTile(c: number, r: number, forBot = false): boolean {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    if (this.room.solid[r][c]) return true;
    const ch = this.room.grid[r][c];
    if (ch === 'R' && this.blockerHere()) return true;
    for (const a of this.actors) {
      if (a.kind === 'npc' && a.col === c && a.row === r) return true;
      if (forBot && a.kind === 'enc' && a.s.visible) {
        const span = a.half! > 12 ? 2 : 1;
        if (Math.abs(c - a.col) <= span && Math.abs(r - a.row) <= span) return true;
      }
    }
    return false;
  }

  private blockerHere() {
    return this.actors.some((a) => a.kind === 'enc' && a.id !== BOSS && !R.cleared.has(a.id) && this.room.grid[a.row][a.col] === 'e');
  }

  private blockedAt(x: number, y: number) {
    if (this.blockedTile(colOf(x), rowOf(y))) return true;
    for (const a of this.actors) {
      if (a.kind !== 'enc' || !a.s.visible) continue;
      const cx = cellX(a.col), cy = cellY(a.row);
      if (Math.abs(x - cx) < a.half! && Math.abs(y - cy) < a.half!) return true;
    }
    return false;
  }

  private free(x: number, y: number) {
    return !this.blockedAt(x - 5, y - 3) && !this.blockedAt(x + 5, y - 3) && !this.blockedAt(x - 5, y + 3) && !this.blockedAt(x + 5, y + 3);
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (e.repeat || this.busy || R.over) return;
    const confirm = ['Enter', 'Space', 'KeyZ', 'NumpadEnter'].includes(e.code);
    if (this.dlg) { if (confirm) this.advance(); return; }
    if (confirm) this.interact();
  }

  private interact() {
    const fx = this.dir === 'left' ? -1 : this.dir === 'right' ? 1 : 0;
    const fy = this.dir === 'up' ? -1 : this.dir === 'down' ? 1 : 0;
    let best: (typeof this.actors)[number] | null = null, bd = 1e9;
    for (const a of this.actors) {
      if (a.kind !== 'npc') continue;
      const dx = cellX(a.col) - this.pos.x, dy = cellY(a.row) - this.pos.y;
      const d = Math.hypot(dx, dy);
      const facing = (dx * fx + dy * fy) / (d || 1);
      if (d < 26 && (facing > 0.3 || d < 14) && d < bd) { bd = d; best = a; }
    }
    if (best) this.talk(best.id);
  }

  private talk(i: number) {
    const npc = K.theme.game.npcs[i];
    if (!npc) return;
    R.met.add(i);
    const speaker = `${npc.name}, ${npc.role}`;
    this.say((npc.lines as string[]).map((t) => ({ speaker, text: t })), () => {});
  }

  // ---------------------------------------------------------------- dialogue
  say(pages: Page[], done: () => void) {
    const flat: Page[] = [];
    for (const p of pages) for (const t of paginate(p.text, 70, 4)) flat.push({ speaker: p.speaker, text: t });
    if (!flat.length) { done(); return; }
    this.closeDialogue();
    const top = this.pos.y > 170;
    const y = top ? OY + 4 : 270 - 66;
    const g = box(this, 16, y, 448, 62, K.ui.bgInt, K.ui.textInt, K.ui.panelInt).setDepth(2000);
    const speaker = text(this, 26, y + 6, '', { color: K.ui.accentInt, depth: 2001 });
    const tw = new Typewriter(this, 26, y + 18, 70, 4, { depth: 2001 });
    const more = text(this, 452, y + 52, '▼', { align: 'right', color: K.ui.accentInt, depth: 2001 });
    blink(this, more, 350);
    this.dlg = { pages: flat, i: -1, tw, objs: [g, speaker, more], speaker, more, done, wait: 0 };
    hooks.state = 'dialogue';
    this.advance();
  }

  private advance() {
    const d = this.dlg;
    if (!d) return;
    if (d.i >= 0 && !d.tw.done) { d.tw.finish(); return; }
    d.i++;
    d.wait = 0;
    if (d.i >= d.pages.length) {
      const done = d.done;
      this.closeDialogue();
      done();
      return;
    }
    const p = d.pages[d.i];
    d.speaker.setText(p.speaker ?? '');
    d.tw.t.setPosition(26, (d.objs[0] as any).y ?? 0);
    d.tw.t.y = d.speaker.y + (p.speaker ? 12 : 2);
    d.tw.show(p.speaker ? p.text : `* ${p.text}`);
  }

  private closeDialogue() {
    if (!this.dlg) return;
    this.dlg.objs.forEach((o) => o.destroy());
    this.dlg.tw.destroy();
    this.dlg = null;
    if (!this.busy && !R.over) hooks.state = 'explore';
  }

  // ---------------------------------------------------------------- loop
  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    for (let i = 0; i < R.speed; i++) this.step(dt);
    this.syncPlayer();
    hooks.stats = {
      room: this.roomIdx, hp: Math.ceil(R.hp), cleared: [...R.cleared], spared: R.spared, debugged: R.debugged, met: R.met.size,
      pos: { col: colOf(this.pos.x), row: rowOf(this.pos.y) },
    };
  }

  private step(dt: number) {
    if (R.over) return;
    hooks.elapsed += dt;
    if (this.dlg) {
      this.dlg.tw.step(dt);
      if (R.autopilot && this.dlg.tw.done) {
        this.dlg.wait += dt;
        if (this.dlg.wait > 0.35) this.advance();
      }
      this.player.anims.stop();
      return;
    }
    if (this.busy) return;
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (R.autopilot && !dx && !dy) [dx, dy] = this.botDir(dt);
    if (this.busy || this.dlg) return;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      const nd: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (nd !== this.dir || !this.player.anims.isPlaying) { this.dir = nd; this.player.play(`hq-walk-${nd}`, true); }
      const nx = this.pos.x + dx * SPEED * dt, ny = this.pos.y + dy * SPEED * dt;
      if (this.free(nx, this.pos.y)) this.pos.x = nx;
      if (this.free(this.pos.x, ny)) this.pos.y = ny;
      if (Math.floor(hooks.elapsed * 4) !== Math.floor((hooks.elapsed - dt) * 4)) K.play('step', 0.15, 200);
    } else {
      this.player.anims.stop();
      this.player.setFrame(DIRS[this.dir]);
    }
    this.checkDoors();
    this.checkEncounters();
  }

  private checkDoors() {
    const c = colOf(this.pos.x), r = rowOf(this.pos.y);
    if (r !== DOOR_ROW) return;
    if (c <= 0 && this.room.hasLeft) this.goRoom(this.roomIdx - 1, { col: COLS - 2, row: DOOR_ROW }, 'left');
    else if (c >= COLS - 1 && this.room.hasRight) this.goRoom(this.roomIdx + 1, { col: 1, row: DOOR_ROW }, 'right');
  }

  private goRoom(i: number, at: Spot, dir: Dir) {
    this.busy = true;
    K.play('door', 0.6);
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.enterRoom(i, at);
      this.dir = dir;
      this.cameras.main.fadeIn(140, 0, 0, 0);
      this.busy = false;
    });
  }

  private checkEncounters() {
    for (const a of this.actors) {
      if (a.kind !== 'enc' || !a.s.visible || R.cleared.has(a.id)) continue;
      const cx = cellX(a.col), cy = cellY(a.row);
      const bx = Math.max(0, Math.abs(this.pos.x - cx) - a.half!), by = Math.max(0, Math.abs(this.pos.y - cy) - a.half!);
      if (bx < 8 && by < 6) { this.encounter(a.id); return; }
    }
  }

  private encounter(enc: number) {
    this.busy = true;
    this.player.anims.stop();
    const def = encDef(enc);
    const go = () => {
      hooks.state = 'battle';
      K.play('encounter');
      this.cameras.main.flash(250, 255, 255, 255);
      this.time.delayedCall(260, () => {
        this.scene.launch('Battle', { enc });
        this.scene.sleep();
      });
    };
    if (enc === BOSS && def.taunt) {
      this.busy = false;
      this.say([{ speaker: def.name, text: def.taunt }], () => { this.busy = true; go(); });
    } else go();
  }

  private onWake(_sys: unknown, data: { enc: number; how: 'spared' | 'debugged' }) {
    this.busy = false;
    hooks.scene = 'Explore';
    hooks.state = 'explore';
    if (!data) return;
    R.cleared.add(data.enc);
    const a = this.actors.find((x) => x.kind === 'enc' && x.id === data.enc);
    if (a) {
      this.tweens.add({ targets: a.s, alpha: 0, y: a.s.y - 8, duration: 500, onComplete: () => a.s.destroy() });
      this.actors = this.actors.filter((x) => x !== a);
    }
    // Step back from where the encounter stood so we don't re-trigger anything.
    const def = encDef(data.enc);
    const pages: Page[] = [];
    if (data.enc === BOSS) {
      pages.push(...(K.theme.game.ending as string[]).map((t) => ({ text: t })));
      this.say(pages, () => this.finish(true));
      return;
    }
    pages.push({ text: data.how === 'spared' ? `${def.name} wanders off, finally fixed.` : `${def.name} was debugged the hard way.` });
    if (R.hp < R.maxHp) { R.hp = R.maxHp; pages.push({ text: 'You sip a PostHog coffee. HP fully restored.' }); }
    const bossNow = [0, 1, 2].every((i) => R.cleared.has(i)) && this.actors.some((x) => x.id === BOSS && x.kind === 'enc');
    if (bossNow) pages.push({ text: 'The floor rumbles. Something big just booted up...' });
    this.say(pages, () => { if (bossNow) this.refreshBoss(true); });
  }

  finish(won: boolean) {
    if (R.over) return;
    R.over = true;
    this.scene.start('End', endData(won));
  }

  // ---------------------------------------------------------------- autopilot
  private botDir(dt: number): [number, number] {
    const b = this.bot;
    if (Math.hypot(this.pos.x - b.lastX, this.pos.y - b.lastY) < 0.05) b.stuckT += dt; else b.stuckT = 0;
    b.lastX = this.pos.x; b.lastY = this.pos.y;
    if (b.stuckT > 0.8) { b.stuckT = 0; b.path = []; b.push = null; b.goal = ''; return [Math.random() - 0.5, Math.random() - 0.5]; }
    if (b.push) return [b.push.x, b.push.y];
    if (!b.path.length) {
      if (b.goal === 'talk' && b.talkTo >= 0) {
        const a = this.actors.find((x) => x.kind === 'npc' && x.id === b.talkTo);
        b.goal = '';
        if (a) {
          const dx = cellX(a.col) - this.pos.x, dy = cellY(a.row) - this.pos.y;
          this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          this.talk(a.id);
        }
        return [0, 0];
      }
      if (b.goal === 'enc' || b.goal === 'door') { b.push = { x: 1, y: 0 }; return [1, 0]; }
      this.planBot();
      if (!b.path.length) return [0, 0];
    }
    const next = b.path[0];
    const tx = cellX(next.col), ty = cellY(next.row);
    const dx = tx - this.pos.x, dy = ty - this.pos.y;
    if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) { b.path.shift(); return [dx, dy]; }
    return [Math.abs(dx) > 1 ? Math.sign(dx) : 0, Math.abs(dy) > 1 ? Math.sign(dy) : 0];
  }

  private planBot() {
    const b = this.bot;
    const here = { col: colOf(this.pos.x), row: rowOf(this.pos.y) };
    const npc = this.actors.filter((a) => a.kind === 'npc' && !R.met.has(a.id))
      .sort((p, q) => Math.hypot(p.col - here.col, p.row - here.row) - Math.hypot(q.col - here.col, q.row - here.row))[0];
    if (npc) {
      const targets = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, y]) => ({ col: npc.col + x, row: npc.row + y }))
        .filter((t) => !this.blockedTile(t.col, t.row, true));
      const path = this.bfs(here, targets);
      if (path) { b.path = path; b.goal = 'talk'; b.talkTo = npc.id; return; }
      R.met.add(npc.id); // unreachable: skip
    }
    const enc = this.actors.find((a) => a.kind === 'enc' && a.s.visible && !R.cleared.has(a.id));
    if (enc) {
      const off = enc.half! > 12 ? 3 : 2;
      const path = this.bfs(here, [{ col: enc.col - off, row: enc.row }]);
      if (path) { b.path = path; b.goal = 'enc'; return; }
    }
    if (this.room.hasRight && !this.blockerHere()) {
      const path = this.bfs(here, [{ col: COLS - 2, row: DOOR_ROW }]);
      if (path) { b.path = path; b.goal = 'door'; }
    }
  }

  private bfs(from: Spot, targets: Spot[]): Spot[] | null {
    const key = (c: number, r: number) => r * COLS + c;
    const want = new Set(targets.map((t) => key(t.col, t.row)));
    if (!want.size) return null;
    const prev = new Map<number, number>();
    const start = key(from.col, from.row);
    prev.set(start, -1);
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      if (want.has(cur)) {
        const path: Spot[] = [];
        for (let k = cur; k !== -1; k = prev.get(k)!) path.unshift({ col: k % COLS, row: Math.floor(k / COLS) });
        return path.slice(1).length ? path.slice(1) : [{ col: cur % COLS, row: Math.floor(cur / COLS) }];
      }
      const c = cur % COLS, r = Math.floor(cur / COLS);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, nk = key(nc, nr);
        if (prev.has(nk) || this.blockedTile(nc, nr, true) || nc <= 0 || nc >= COLS - 1) continue;
        prev.set(nk, cur);
        q.push(nk);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- test hooks
  private installDebug() {
    const game = this.game;
    hooks.debug = {
      autopilot: (on = true) => { R.autopilot = !!on; },
      speed: (n: number) => { R.speed = Math.max(1, Math.min(8, Math.round(n))); },
      god: (on = true) => { R.god = !!on; },
      lose: () => { if (R.over) return; R.over = true; game.scene.stop('Battle'); game.scene.stop('Explore'); game.scene.start('End', endData(false)); },
      win: () => { if (R.over) return; R.over = true; [0, 1, 2, 3].forEach((i) => R.cleared.add(i)); R.spared = 4; game.scene.stop('Battle'); game.scene.stop('Explore'); game.scene.start('End', endData(true)); },
      room: (i: number) => { if (this.rooms[i]) this.enterRoom(i, this.rooms[i].spots.s); },
      // Jump to a representative, busy moment for the gameplay GIF: a battle with bullets flying.
      showcase: () => {
        if (R.over) return;
        const battle = game.scene.getScene('Battle') as unknown as { showcase?: () => void };
        if (game.scene.isActive('Battle')) { battle.showcase?.(); return; }
        if (this.busy || !this.scene.isActive()) return;
        this.closeDialogue();
        const enc = this.actors.find((a) => a.kind === 'enc' && a.s.visible && !R.cleared.has(a.id))?.id
          ?? [0, 1, 2, BOSS].find((i) => !R.cleared.has(i)) ?? 0;
        R.showcase = true;
        this.encounter(enc === BOSS && ![0, 1, 2].every((i) => R.cleared.has(i)) ? 0 : enc);
      },
    };
  }
}
