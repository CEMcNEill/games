// Leaderboards: one Durable Object per board, each a tiny SQLite table holding that board's top 20. No accounts: a
// player sends 3 letters, a score and a few stats. A board is "<game>:<mode>" (e.g. bug-survivors:run, nerdy:yolo),
// so every game built from a template gets its own boards without any setup.
//
// Routes (behind play.funglass.es/mp/*):
//   GET    /mp/lb/<board>        -> { top: Entry[] }  (best first, at most 20)
//   POST   /mp/lb/<board>        <- { name: "ABC", score, stats: { wave, time, level, kills, hog, players } }
//                                -> { rank: 1-20 | null, id, top }
//   DELETE /mp/lb/<board>/<id>   (header x-admin-key: the LB_ADMIN secret) removes one entry
//
// Anyone can post a fake score with dev tools; that's the trade for no logins. The checks keep it honest-ish: A-Z
// initials minus a blocklist, sane stats, a score that fits the run's length, and a few posts a minute per IP.

export interface BoardEnv { LB_ADMIN?: string }

export const BOARD_RE = /^[a-z0-9][a-z0-9-]{0,47}:[a-z0-9-]{1,24}$/;
const KEEP = 20;
const POSTS_PER_MIN = 6;
const BLOCK = new Set(['ASS', 'CUM', 'COK', 'COC', 'DIC', 'DIK', 'FAG', 'FCK', 'FUC', 'FUK', 'FUX', 'GAY', 'JIZ', 'KKK',
  'KYS', 'NAZ', 'NIG', 'NGR', 'PIS', 'POO', 'SEX', 'SHT', 'SUK', 'TIT', 'VAG', 'WTF', 'XXX', 'HIV', 'ANL', 'CNT', 'KUM']);

export interface Entry { id: number; name: string; score: number; stats: Record<string, number | string>; at: number }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
});

const int = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.floor(v) : null;

/** The stats a board keeps: known keys only, each in range; anything else is dropped. */
function cleanStats(raw: unknown): Record<string, number | string> | null {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number | string> = {};
  const nums: [string, number][] = [['wave', 99], ['time', 4 * 3600], ['level', 999], ['kills', 1e7], ['players', 4], ['heat', 9]];
  for (const [k, hi] of nums) {
    if (s[k] === undefined) continue;
    const v = int(s[k], 0, hi);
    if (v === null) return null;
    out[k] = v;
  }
  if (typeof s.hog === 'string' && /^[ -~]{1,24}$/.test(s.hog) && !/[<>"\\]/.test(s.hog)) out.hog = s.hog; // printable ASCII
  return out;
}

export class Board {
  posts = new Map<string, number[]>(); // ip -> post times (ms), last minute

  constructor(readonly state: DurableObjectState, readonly env: BoardEnv) {
    state.storage.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, stats TEXT NOT NULL, at INTEGER NOT NULL)`);
  }

  top(): Entry[] {
    return [...this.state.storage.sql.exec('SELECT id, name, score, stats, at FROM scores ORDER BY score DESC, at ASC LIMIT ?', KEEP)]
      .map((r) => ({ id: Number(r.id), name: String(r.name), score: Number(r.score), stats: JSON.parse(String(r.stats)), at: Number(r.at) }));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const del = url.pathname.match(/\/(\d+)\/?$/);
    if (req.method === 'GET') return json({ top: this.top() });
    if (req.method === 'DELETE' && del) {
      if (!this.env.LB_ADMIN || req.headers.get('x-admin-key') !== this.env.LB_ADMIN) return json({ error: 'forbidden' }, 403);
      this.state.storage.sql.exec('DELETE FROM scores WHERE id = ?', Number(del[1]));
      return json({ top: this.top() });
    }
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    // Read the body first: answering before it's read breaks the request stream.
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    // A few posts a minute per IP.
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local', now = Date.now();
    const recent = (this.posts.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= POSTS_PER_MIN) return json({ error: 'slow down' }, 429);
    recent.push(now);
    this.posts.set(ip, recent);
    if (this.posts.size > 5000) this.posts.clear();

    const name = typeof body.name === 'string' ? body.name.toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(name)) return json({ error: 'name: 3 letters A-Z' }, 400);
    if (BLOCK.has(name)) return json({ error: 'try other letters' }, 400);
    const score = int(body.score, 1, 1e9);
    const stats = cleanStats(body.stats);
    if (score === null || !stats) return json({ error: 'bad score or stats' }, 400);
    // The score has to fit the run: a generous cap per second played.
    const time = typeof stats.time === 'number' ? stats.time : 0;
    if (score > 6000 * Math.max(10, time) + 600_000) return json({ error: 'score does not fit the run' }, 400);

    const sql = this.state.storage.sql;
    sql.exec('INSERT INTO scores (name, score, stats, at) VALUES (?, ?, ?, ?)', name, score, JSON.stringify(stats), now);
    const id = Number([...sql.exec('SELECT last_insert_rowid() AS id')][0].id);
    // Keep only the top KEEP (earlier entries win ties).
    sql.exec(`DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, at ASC LIMIT ?)`, KEEP);
    const top = this.top();
    const i = top.findIndex((e) => e.id === id);
    return json({ rank: i >= 0 ? i + 1 : null, id, top });
  }
}
