// Bug Survivors co-op relay: one Durable Object per room code. It runs the lobby (join with a code, ready up, a 3 s
// countdown once everyone is ready) and then the game's input timeline: every TURN_MS it broadcasts one turn with each
// player's latest stick input and any actions (card picks...). The game itself is deterministic lockstep: every client
// simulates the same world from the same seed and the same turns, so the server never runs any game code.
//
// Routes (behind play.funglass.es/mp/*):
//   GET /mp/health           -> "ok"
//   GET /mp/ws/<CODE>        -> WebSocket into room CODE (4 letters; ZZZ1-ZZZ3 = a room with 1-3 bots)

export interface Env { ROOMS: DurableObjectNamespace }

const PROTO = 1;
const MAX_PLAYERS = 4;
const TURN_MS = 50;         // 20 turns a second
const TICKS_PER_TURN = 3;   // the game steps at 60 Hz
const COUNTDOWN_MS = 3000;
const IDLE_INPUT_MS = 1500; // no input for this long: the player stands still
const GONE_MS = 20000;      // disconnected this long mid-game: the player leaves the game
const CODE_RE = /^([A-Z]{4}|ZZZ[1-3])$/;
/** Playtest rooms: ZZZ1-ZZZ3 start with 1-3 bots, which make room for real players who join. */
const botCount = (code: string) => (/^ZZZ[1-3]$/.test(code) ? +code[3] : 0);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/mp/, '');
    if (path === '/health' || path === '/health/') return new Response('ok', { headers: cors() });
    const m = path.match(/^\/ws\/([A-Za-z0-9]{4})\/?$/);
    if (m) {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a websocket', { status: 426 });
      const code = m[1].toUpperCase();
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    return new Response('not found', { status: 404, headers: cors() });
  },
};

const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });

interface Player {
  ws: WebSocket | null;
  token: string;
  name: string;
  info: unknown;       // hog, shop levels...: what every client needs to simulate this player
  ready: boolean;
  slot: number;        // in-game index (set at start)
  move: number;        // latest packed stick input
  moveAt: number;
  goneAt: number;      // ms when the socket dropped mid-game (0 = connected)
  left: boolean;       // out of the current game for good
  over: boolean;       // said the game is over
  bot: boolean;        // a bot seat: always ready, played by the game itself on every client
}

type Phase = 'lobby' | 'countdown' | 'playing';

export class Room {
  players: Player[] = [];
  phase: Phase = 'lobby';
  code = '';
  key = '';            // the game every player must run: build version + theme
  countdownAt = 0;
  countdownTimer: ReturnType<typeof setTimeout> | null = null;
  loop: ReturnType<typeof setInterval> | null = null;
  turn = 0;
  turns: string[] = [];          // every turn so far (for a player coming back after a dropped connection)
  events: [number, unknown][] = [];
  start: string | null = null;
  hashes = new Map<number, number>();
  desynced = false;

  constructor(readonly state: DurableObjectState, readonly env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.code = url.pathname.split('/').filter(Boolean).pop()!.toUpperCase();
    if (!CODE_RE.test(this.code)) return new Response('bad code', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    let me: Player | null = null;
    server.addEventListener('message', (ev: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!me) {
        if (msg.t !== 'hello') return;
        me = this.hello(server, msg);
        return;
      }
      this.onMessage(me, msg);
    });
    const closed = () => { if (me) this.dropped(me, server); };
    server.addEventListener('close', closed);
    server.addEventListener('error', closed);
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket | null, msg: unknown) {
    if (!ws) return;
    try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* closed */ }
  }

  private refuse(ws: WebSocket, msg: string) {
    this.send(ws, { t: 'err', msg });
    try { ws.close(4000, msg.slice(0, 100)); } catch { /* already closed */ }
  }

  private hello(ws: WebSocket, msg: any): Player | null {
    if (msg.v !== PROTO) { this.refuse(ws, 'Update the game: this code runs a newer version'); return null; }
    const token = String(msg.token ?? '').slice(0, 64);
    const key = String(msg.key ?? '').slice(0, 200);
    const back = this.players.find((p) => p.token === token && token);
    if (back) {
      // Same browser/app again (a reload, or a dropped connection): take over the old seat.
      if (back.ws && back.ws !== ws) { try { back.ws.close(4001, 'replaced'); } catch { /* ignore */ } }
      back.ws = ws;
      back.goneAt = 0;
      if (this.phase === 'playing') {
        if (back.left) { this.refuse(ws, 'That game went on without you. Wait for it to end'); back.ws = null; return null; }
        if (back.over) { this.send(ws, { t: 'room', ...this.roomInfo(back) }); return back; } // finished: just the room
        // Replay the whole game so far; the client fast-forwards to now.
        this.send(ws, { t: 'room', ...this.roomInfo(back) });
        this.send(ws, this.start!);
        for (let i = 0; i < this.turns.length; i += 200) this.send(ws, `{"t":"turns","list":[${this.turns.slice(i, i + 200).join(',')}]}`);
        return back;
      }
      back.name = String(msg.name ?? back.name).slice(0, 24);
      back.info = msg.info ?? back.info;
      this.broadcastRoom();
      return back;
    }
    if (this.phase !== 'lobby') { this.refuse(ws, 'That game already started. Pick another code'); return null; }
    if (this.humans().length && this.key && key !== this.key) { this.refuse(ws, 'That code is in use by a different game or version'); return null; }
    if (!this.humans().length) { this.key = key; this.players = []; }
    if (this.players.length >= MAX_PLAYERS) {
      // A bot gives its seat to a real player.
      const bot = [...this.players].reverse().find((q) => q.bot);
      if (!bot) { this.refuse(ws, `That room is full (${MAX_PLAYERS} players)`); return null; }
      this.players = this.players.filter((q) => q !== bot);
    }
    const p: Player = { ws, token: token || crypto.randomUUID(), name: String(msg.name ?? 'Hog').slice(0, 24), info: msg.info ?? null,
      ready: false, slot: -1, move: 0, moveAt: 0, goneAt: 0, left: false, over: false, bot: false };
    this.players.push(p);
    if (this.players.length === 1) this.addBots();
    this.broadcastRoom();
    return p;
  }

  private humans() { return this.players.filter((p) => !p.bot); }

  /** A playtest room's bots (ZZZ1-ZZZ3), after its first player. */
  private addBots() {
    for (let i = 1; i <= botCount(this.code) && this.players.length < MAX_PLAYERS; i++) {
      const name = `BOT ${i}`;
      this.players.push({ ws: null, token: `bot-${i}`, name, info: { bot: true, hog: '', name, shop: {}, pals: [], heat: 0 }, ready: true, slot: -1,
        move: 0, moveAt: 0, goneAt: 0, left: false, over: false, bot: true });
    }
  }

  private roomInfo(me: Player) {
    return {
      code: this.code, phase: this.phase, you: this.players.indexOf(me), token: me.token,
      cd: this.phase === 'countdown' ? Math.max(0, this.countdownAt - Date.now()) : 0,
      players: this.players.map((p) => ({ name: p.name, info: p.info, ready: p.ready, on: !!p.ws || p.bot, bot: p.bot })),
    };
  }

  private broadcastRoom() {
    for (const p of this.players) this.send(p.ws, { t: 'room', ...this.roomInfo(p) });
  }

  private onMessage(me: Player, msg: any) {
    switch (msg.t) {
      case 'ready':
        if (this.phase === 'playing') return;
        me.ready = !!msg.on;
        if (msg.info) me.info = msg.info;
        if (msg.name) me.name = String(msg.name).slice(0, 24);
        this.checkStart();
        this.broadcastRoom();
        return;
      case 'info':
        if (this.phase !== 'lobby') return;
        me.info = msg.info ?? me.info;
        if (msg.name) me.name = String(msg.name).slice(0, 24);
        this.broadcastRoom();
        return;
      case 'in':
        if (this.phase !== 'playing' || me.left) return;
        me.move = (msg.m | 0) >>> 0;
        me.moveAt = Date.now();
        return;
      case 'ev':
        if (this.phase !== 'playing' || me.left || me.slot < 0) return;
        if (this.events.length < 64) this.events.push([me.slot, msg.e]);
        return;
      case 'hash': {
        if (this.phase !== 'playing' || this.desynced) return;
        const n = msg.n | 0, h = msg.h | 0, seen = this.hashes.get(n);
        if (seen === undefined) { this.hashes.set(n, h); if (this.hashes.size > 64) this.hashes.delete(this.hashes.keys().next().value!); }
        else if (seen !== h) { this.desynced = true; this.broadcast({ t: 'desync', n }); }
        return;
      }
      case 'over':
        if (this.phase !== 'playing') return;
        me.over = true;
        if (this.humans().every((p) => p.over || p.left || !p.ws)) this.endGame();
        return;
      case 'leave':
        this.leave(me);
        return;
      case 'ping':
        this.send(me.ws, { t: 'pong', at: msg.at });
        return;
    }
  }

  private checkStart() {
    const all = this.players.length >= 2 && this.humans().length >= 1 && this.players.every((p) => p.bot || (p.ready && p.ws));
    if (this.phase === 'lobby' && all) {
      this.phase = 'countdown';
      this.countdownAt = Date.now() + COUNTDOWN_MS;
      this.countdownTimer = setTimeout(() => this.beginGame(), COUNTDOWN_MS);
    } else if (this.phase === 'countdown' && !all) {
      this.phase = 'lobby';
      if (this.countdownTimer) clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private beginGame() {
    this.countdownTimer = null;
    if (this.phase !== 'countdown') return;
    this.phase = 'playing';
    this.turn = 0;
    this.turns = [];
    this.events = [];
    this.hashes.clear();
    this.desynced = false;
    this.players.forEach((p, i) => { p.slot = i; p.move = 0; p.moveAt = 0; p.left = false; p.over = false; p.goneAt = 0; });
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 1;
    this.start = JSON.stringify({ t: 'start', seed, tps: 1000 / TURN_MS, tpt: TICKS_PER_TURN,
      players: this.players.map((p) => ({ name: p.name, info: p.info })) });
    this.broadcast(this.start);
    this.broadcastRoom();
    this.loop = setInterval(() => this.tick(), TURN_MS);
  }

  private tick() {
    const now = Date.now();
    for (const p of this.players) {
      if (!p.ws && !p.left && p.goneAt && now - p.goneAt > GONE_MS) {
        p.left = true;
        this.events.push([p.slot, { t: 'leave' }]);
      }
    }
    const m = this.players.map((p) => (p.bot || p.left || !p.ws || now - p.moveAt > IDLE_INPUT_MS ? 0 : p.move));
    const turn: { n: number; m: number[]; e?: [number, unknown][] } = { n: this.turn++, m };
    if (this.events.length) { turn.e = this.events; this.events = []; }
    const s = JSON.stringify(turn);
    this.turns.push(s);
    this.broadcast(`{"t":"turn",${s.slice(1)}`);
    if (this.humans().every((p) => p.left)) this.endGame();
  }

  private broadcast(msg: unknown) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const p of this.players) this.send(p.ws, s);
  }

  private endGame() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.phase = 'lobby';
    this.turns = [];
    this.start = null;
    // Players who left the game (or never came back) leave the room; the rest are back in the lobby, not ready.
    this.players = this.players.filter((p) => p.bot || (p.ws && !p.left));
    if (!this.humans().length) this.players = [];
    this.players.forEach((p) => { p.ready = p.bot; p.slot = -1; p.over = false; p.left = false; });
    this.key = this.players.length ? this.key : '';
    this.broadcastRoom();
  }

  private leave(me: Player) {
    const ws = me.ws;
    me.ws = null;
    if (this.phase === 'playing') {
      if (!me.left) { me.left = true; this.events.push([me.slot, { t: 'leave' }]); }
      if (this.humans().every((p) => p.left || p.over)) this.endGame();
    } else {
      this.players = this.players.filter((p) => p !== me);
      if (!this.humans().length) { this.players = []; this.key = ''; }
      this.checkStart();
      this.broadcastRoom();
    }
    try { ws?.close(1000, 'bye'); } catch { /* ignore */ }
  }

  private dropped(me: Player, ws: WebSocket) {
    if (me.ws !== ws) return; // an old socket for a seat someone took over
    me.ws = null;
    if (this.phase === 'playing') {
      me.goneAt = Date.now();
      if (this.humans().every((p) => !p.ws)) this.endGame();
      return;
    }
    // In the lobby a dropped player is gone (a reload comes back with the same token and rejoins).
    this.players = this.players.filter((p) => p !== me);
    if (!this.humans().length) { this.players = []; this.key = ''; }
    this.checkStart();
    this.broadcastRoom();
  }
}
