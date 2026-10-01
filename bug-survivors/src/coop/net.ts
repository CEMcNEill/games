// The co-op connection: one WebSocket to the room's Durable Object at play.funglass.es/mp (see mp-server/). It carries
// the lobby (room state, ready, countdown) and then the game's turns. It lives outside the scenes, so the lobby, the
// game and the end screen share it, and it reconnects by itself (same token = same seat) when a phone drops off.
import { hash32 } from '@shared/meta';
import { K } from '@shared/kit';

/** Bump when anything in the co-op sim changes: players on different versions can't share a room (they'd desync). */
export const SIM_VERSION = 'coop-8';
const PROTO = 1;

export interface HogInfo {
  hog: string;                      // hoggie id
  name: string;                     // what the others see
  shop?: Record<string, number>;    // (old builds: upgrade levels; unused)
  merch?: Record<string, number>;   // store merch owned, copies of each (they change the hog's numbers)
  pals: string[];                   // a few unlocked hoggies (Hedgehog Mode pals, ALL HANDS)
  heat: number;                     // the room's first player sets the heat
  bot?: boolean;                    // a bot seat (rooms ZZZ1-ZZZ4), added by the server
  follow?: boolean;                 // a bot that sticks close to its player (room ZZZ4)
}
export interface RoomPlayer { name: string; info: HogInfo | null; ready: boolean; on: boolean; bot?: boolean }
export interface RoomState { code: string; phase: 'lobby' | 'countdown' | 'playing'; you: number; token: string; cd: number; players: RoomPlayer[] }
export interface StartMsg { seed: number; tps: number; tpt: number; players: { name: string; info: HogInfo }[] }
export interface Turn { n: number; m: number[]; e?: [number, SimEvent][] }
export type SimEvent =
  | { t: 'pick'; i: number; k?: string }
  | { t: 'reroll'; k?: string } | { t: 'skip'; k?: string } | { t: 'banish'; i: number; k?: string }
  | { t: 'act'; i: number }
  | { t: 'view'; w: number; h: number }
  | { t: 'leave' }
  | { t: 'tray'; open: boolean }
  | { t: 'dbg'; c: string; a?: unknown[] };

/** Where the relay lives: play.funglass.es/mp, or ?mp=ws://localhost:8787/mp for a local `wrangler dev`. */
export function serverUrl() {
  try {
    const q = new URLSearchParams(location.search).get('mp');
    if (q) return q.replace(/\/$/, '');
    const ls = localStorage.getItem('bs-mp-url');
    if (ls) return ls;
  } catch { /* no storage */ }
  return 'wss://play.funglass.es/mp';
}

/** Letters for room codes: no I or O (they read as 1 and 0). */
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** A code the server takes: 4 letters, or ZZZ1-ZZZ4 (a playtest room with 1-3 bots; ZZZ4 = 3 that stick close). */
export const validCode = (c: string) => /^[A-HJ-NP-Z]{4}$/.test(c) || /^ZZZ[1-4]$/.test(c);
export const randomCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');

function deviceToken() {
  try {
    let t = localStorage.getItem('bs-mp-token');
    if (!t) { t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('bs-mp-token', t); }
    return t;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/** Everyone in a room must run the same build with the same theme. */
export const gameKey = () => `${SIM_VERSION}:${hash32(JSON.stringify(K.theme))}`;

/** Stick input packed in one number: 0 = still, else 256 directions and 15 strengths. */
export function packMove(dx: number, dy: number, mag: number) {
  if (mag <= 0.02 || (dx === 0 && dy === 0)) return 0;
  let a = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 256) % 256;
  if (a < 0) a += 256;
  const l = Math.max(1, Math.min(15, Math.round(mag * 15)));
  return (a << 4) | l;
}
export function moveAngle(m: number) { return ((m >> 4) & 255) / 256 * Math.PI * 2; }
export function moveMag(m: number) { return (m & 15) / 15; }

type Listener = () => void;

class Net {
  ws: WebSocket | null = null;
  status: 'idle' | 'connecting' | 'open' | 'error' = 'idle';
  error = '';
  code = '';
  room: RoomState | null = null;
  start: StartMsg | null = null;
  turns: Turn[] = [];
  desync = -1;
  rtt = 0;
  private hello: { name: string; info: HogInfo } | null = null;
  private token = deviceToken();
  private wanted = false;   // we want to be in the room (reconnect if dropped)
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMove = -1;
  private lastMoveAt = 0;
  onRoom: Listener | null = null;
  onStart: Listener | null = null;
  onError: Listener | null = null;

  join(code: string, name: string, info: HogInfo) {
    this.leave();
    this.code = code.toUpperCase();
    this.hello = { name, info };
    this.wanted = true;
    this.error = '';
    this.retry = 0;
    this.open();
  }

  private open() {
    if (!this.wanted) return;
    this.status = 'connecting';
    let ws: WebSocket;
    try { ws = new WebSocket(`${serverUrl()}/ws/${this.code}`); } catch (e) { this.fail(`Can't connect: ${String(e).slice(0, 60)}`); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.status = 'open';
      this.retry = 0;
      this.raw({ t: 'hello', v: PROTO, name: this.hello!.name, info: this.hello!.info, token: this.token, key: gameKey() });
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.raw({ t: 'ping', at: performance.now() }), 2000);
    };
    ws.onmessage = (ev) => { if (this.ws === ws) this.onMessage(ev.data); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (!this.wanted) { this.status = 'idle'; return; }
      // Dropped: try again (a phone switching networks, a sleeping tab). The server keeps the seat for a while.
      this.status = 'connecting';
      const wait = Math.min(4000, 400 * 2 ** this.retry++);
      if (this.retry > 12) { this.fail('Lost the connection'); return; }
      this.retryTimer = setTimeout(() => this.open(), wait);
    };
  }

  private fail(msg: string) {
    this.wanted = false;
    this.status = 'error';
    this.error = msg;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.onError?.();
  }

  private onMessage(data: unknown) {
    let msg: any;
    try { msg = JSON.parse(String(data)); } catch { return; }
    switch (msg.t) {
      case 'room':
        this.room = msg as RoomState;
        if (msg.token) this.token = msg.token;
        this.onRoom?.();
        break;
      case 'start':
        this.start = { seed: msg.seed, tps: msg.tps, tpt: msg.tpt, players: msg.players };
        this.turns = [];
        this.desync = -1;
        this.lastMove = -1;
        this.onStart?.();
        break;
      case 'turn': {
        const t = msg as Turn;
        if (t.n === this.turns.length) this.turns.push(t);
        break;
      }
      case 'turns':
        for (const t of msg.list as Turn[]) if (t.n === this.turns.length) this.turns.push(t);
        break;
      case 'desync':
        this.desync = msg.n;
        break;
      case 'pong':
        this.rtt = performance.now() - msg.at;
        break;
      case 'err':
        this.fail(String(msg.msg ?? 'The server said no'));
        break;
    }
  }

  private raw(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  ready(on: boolean, name?: string, info?: HogInfo) {
    if (info && this.hello) this.hello = { name: name ?? this.hello.name, info };
    this.raw({ t: 'ready', on, name, info });
  }
  info(name: string, info: HogInfo) {
    if (this.hello) this.hello = { name, info };
    this.raw({ t: 'info', name, info });
  }
  /** The stick: sent when it changes, and every 400 ms as a keep-alive (the server stills a silent player). */
  move(m: number) {
    const now = performance.now();
    if (m === this.lastMove && now - this.lastMoveAt < 400) return;
    this.lastMove = m;
    this.lastMoveAt = now;
    this.raw({ t: 'in', m });
  }
  ev(e: SimEvent) { this.raw({ t: 'ev', e }); }
  hash(n: number, h: number) { this.raw({ t: 'hash', n, h }); }
  over() { this.raw({ t: 'over' }); }

  leave() {
    this.wanted = false;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) { this.raw({ t: 'leave' }); try { this.ws.close(1000); } catch { /* ignore */ } }
    this.ws = null;
    this.status = 'idle';
    this.room = null;
    this.start = null;
    this.turns = [];
  }

  get inRoom() { return this.wanted && !!this.room; }
}

export const net = new Net();

/** Tests poke at the connection (drop it, check the turn log). */
(globalThis as unknown as { __coopNet: Net }).__coopNet = net;
