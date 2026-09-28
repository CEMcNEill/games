// Hogtopia rules, map generation and AI. Pure logic (no Phaser), so it is easy to test and the AI
// can play either side (the rival always; the player's side under __game.debug.autopilot).
export const MW = 18;
export const MH = 12;
export const MAX_TURNS = 24;

export type Terrain = 'plain' | 'forest' | 'mountain' | 'water';
export type Res = 'data' | 'fruit' | 'fish' | null;
export type UnitType = 'scout' | 'warrior' | 'archer' | 'defender' | 'catcher';
export type Owner = 0 | 1; // 0 = player (the prospect), 1 = rival (their biggest problem)

export interface Tile { t: Terrain; res: Res; ruins: boolean; city: number; terr: number; seen: boolean }
export interface City { id: number; x: number; y: number; owner: -1 | 0 | 1; name: string; level: number; pop: number; capital: boolean }
export interface Unit {
  id: number; owner: Owner; type: UnitType; x: number; y: number; hp: number;
  moved: boolean; attacked: boolean; done: boolean; rested: boolean; prev: { x: number; y: number } | null;
}
export interface Faction { stars: number; techs: string[]; kills: number; lost: number; undoUsed: boolean; named: number }

export const UNITS: Record<UnitType, { cost: number; hp: number; atk: number; def: number; move: number; range: number; vision: number; tech: string | null; splash?: number }> = {
  scout: { cost: 2, hp: 10, atk: 1, def: 1, move: 2, range: 1, vision: 2, tech: null },
  warrior: { cost: 2, hp: 10, atk: 2, def: 2, move: 1, range: 1, vision: 1, tech: null },
  archer: { cost: 3, hp: 10, atk: 2, def: 1, move: 1, range: 2, vision: 2, tech: 'product_analytics' },
  defender: { cost: 3, hp: 15, atk: 1, def: 3, move: 1, range: 1, vision: 1, tech: 'feature_flags' },
  catcher: { cost: 5, hp: 12, atk: 3, def: 2, move: 2, range: 1, vision: 1, tech: 'error_tracking', splash: 2 },
};
export const UNIT_ORDER: UnitType[] = ['scout', 'warrior', 'archer', 'defender', 'catcher'];

/** What each PostHog product does as a tech. Effects are fixed in code; themes only add flavour lines. */
export const TECHS: Record<string, { effect: string }> = {
  product_analytics: { effect: 'Reveals the whole map. Unlocks ranged units.' },
  session_replay: { effect: 'U: rewind a unit\'s move once a turn. Units heal more.' },
  feature_flags: { effect: 'Unlocks shield units. Your cities defend twice as well.' },
  experiments: { effect: 'Harvests grow cities twice as fast.' },
  error_tracking: { effect: 'Unlocks catchers: attacks also hit nearby enemies.' },
  surveys: { effect: 'Capture neutral villages the turn you arrive.' },
  data_warehouse: { effect: '+2 stars every turn.' },
};
export const TECH_PRIORITY = ['data_warehouse', 'experiments', 'product_analytics', 'feature_flags', 'error_tracking', 'surveys', 'session_replay'];

export const DIFF = {
  easy: { rivalStars: 3, rivalIncome: 0, rivalUnlock: 3, aggroTurn: 12 },
  normal: { rivalStars: 5, rivalIncome: 1, rivalUnlock: 0, aggroTurn: 8 },
  hard: { rivalStars: 8, rivalIncome: 2, rivalUnlock: -2, aggroTurn: 5 },
};

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MW && y < MH;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const land = (t: Tile) => t.t === 'plain' || t.t === 'forest';

export interface Names { capital: string; cities: string[]; rivalCapital: string; rivalShort: string }

export class World {
  tiles: Tile[] = [];
  cities: City[] = [];
  units: Unit[] = [];
  f: [Faction, Faction];
  turn = 1;
  nextId = 1;
  rand: () => number;
  diff: typeof DIFF.normal;
  products: string[];
  god = false;
  over: null | { won: boolean; reason: 'capital' | 'score' | 'lost' | 'debug' } = null;
  log: (msg: string, who?: 'advisor' | 'rival' | 'info') => void = () => {};
  onEvent: (e: string, data?: any) => void = () => {};

  constructor(seed: number, public biome: string, difficulty: string, products: string[], public names: Names) {
    this.rand = rng(seed);
    this.diff = DIFF[difficulty as keyof typeof DIFF] ?? DIFF.normal;
    this.products = products.filter((p) => TECHS[p]);
    this.f = [
      { stars: 5, techs: [], kills: 0, lost: 0, undoUsed: false, named: 0 },
      { stars: this.diff.rivalStars, techs: [], kills: 0, lost: 0, undoUsed: false, named: 0 },
    ];
    this.generate(seed);
    const [pc, rc] = [this.capital(0)!, this.capital(1)!];
    this.addUnit(0, 'warrior', pc.x, pc.y);
    this.addUnit(1, 'warrior', rc.x, rc.y);
    if (difficulty === 'hard') {
      const n = this.freeNeighbour(rc.x, rc.y);
      if (n) this.addUnit(1, 'warrior', n[0], n[1]);
    }
    this.updateFog();
  }

  // ------------------------------------------------------------ map
  tile(x: number, y: number) { return this.tiles[y * MW + x]; }

  private generate(seed: number) {
    const bio = { meadow: [0.25, 0.1, 0.14], desert: [0.1, 0.14, 0.08], tundra: [0.28, 0.14, 0.12], circuit: [0.2, 0.1, 0.16] }[this.biome] ?? [0.25, 0.12, 0.12];
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = rng(seed + attempt * 7919);
      if (this.tryGenerate(r, bio as number[])) return;
    }
    this.fallbackMap();
  }

  /** Point-symmetric map: generate half, mirror through the centre, so both sides are equal. */
  private tryGenerate(r: () => number, [pf, pm, pw]: number[]): boolean {
    const N = MW * MH;
    // Two passes of smoothing make blobby lakes and ranges; ranks give exact terrain shares.
    const blur = (a: number[]) => a.map((v, i) => {
      const x = i % MW, y = (i / MW) | 0;
      let s = v, n = 1;
      for (const [dx, dy] of DIRS) if (inMap(x + dx, y + dy)) { s += a[(y + dy) * MW + x + dx]; n++; }
      return s / n;
    });
    const height = blur(blur(Array.from({ length: N }, () => r())));
    const half = height.slice(0, N / 2);
    const ranked = [...half].sort((a, b) => a - b);
    const waterCut = ranked[Math.floor(pw * half.length)] ?? -1;
    const mountCut = ranked[Math.floor((1 - pm) * half.length)] ?? 2;
    this.tiles = [];
    for (let i = 0; i < N; i++) {
      const v = height[Math.min(i, N - 1 - i)];
      const t: Terrain = v < waterCut ? 'water' : v >= mountCut ? 'mountain' : r() < pf ? 'forest' : 'plain';
      this.tiles.push({ t, res: null, ruins: false, city: -1, terr: -1, seen: false });
    }
    for (let i = N / 2; i < N; i++) this.tiles[i].t = this.tiles[N - 1 - i].t; // exact mirror
    this.cities = [];
    const mirror = (x: number, y: number): [number, number] => [MW - 1 - x, MH - 1 - y];
    const px = 2 + Math.floor(r() * 2), py = 3 + Math.floor(r() * 6);
    const spots: [number, number][] = [[px, py]];
    // 3 villages per side, in the left half, spread out.
    for (let tries = 0; spots.length < 4 && tries < 400; tries++) {
      const x = 1 + Math.floor(r() * (MW / 2 - 1)), y = 1 + Math.floor(r() * (MH - 2));
      if (spots.every(([sx, sy]) => cheb(sx, sy, x, y) >= 3) && cheb(x, y, ...mirror(x, y)) >= 3) spots.push([x, y]);
    }
    if (spots.length < 4) return false;
    const all = [...spots, ...spots.map(([x, y]) => mirror(x, y))];
    all.forEach(([x, y], i) => {
      const t = this.tile(x, y);
      t.t = 'plain';
      const capital = i === 0 || i === 4;
      this.cities.push({ id: i, x, y, owner: capital ? (i === 0 ? 0 : 1) : -1, name: '', level: 1, pop: 0, capital });
      t.city = i;
    });
    // Capitals get dry land around them.
    for (const c of [this.cities[0], this.cities[4]]) {
      for (const [dx, dy] of DIRS) {
        const x = c.x + dx, y = c.y + dy;
        if (inMap(x, y) && this.tile(x, y).t === 'mountain') this.tile(x, y).t = 'plain';
      }
    }
    // Territory: radius 1, capitals first.
    for (const c of [this.cities[0], this.cities[4], ...this.cities.filter((c) => !c.capital)]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (inMap(x, y) && this.tile(x, y).terr < 0) this.tile(x, y).terr = c.id;
      }
    }
    // Resources + ruins decided on the left half and mirrored.
    for (let i = 0; i < N / 2; i++) {
      const t = this.tiles[i];
      if (t.city >= 0) continue;
      const kind: Res = t.t === 'plain' ? 'data' : t.t === 'forest' ? 'fruit' : t.t === 'water' ? 'fish' : null;
      if (kind && t.terr >= 0 && r() < 0.5) t.res = kind;
    }
    for (let n = 0, tries = 0; n < 2 && tries < 200; tries++) {
      const i = Math.floor(r() * (N / 2));
      const t = this.tiles[i], x = i % MW, y = (i / MW) | 0;
      if (land(t) && t.city < 0 && t.terr < 0 && !t.res && this.cities.every((c) => cheb(c.x, c.y, x, y) >= 2)) { t.ruins = true; n++; }
    }
    // Every capital needs at least 3 resources.
    const cap = this.cities[0];
    let have = 0;
    for (let i = 0; i < N; i++) if (this.tiles[i].terr === cap.id && this.tiles[i].res) have++;
    for (const [dx, dy] of DIRS) {
      if (have >= 3) break;
      const t = this.tile(cap.x + dx, cap.y + dy);
      if (t && !t.res && t.t !== 'mountain') { t.res = t.t === 'water' ? 'fish' : t.t === 'forest' ? 'fruit' : 'data'; have++; }
    }
    // Mirror resources/ruins both ways (the capital top-up may have touched either half).
    for (let i = 0; i < N / 2; i++) {
      const a = this.tiles[i], b = this.tiles[N - 1 - i];
      a.res = b.res = a.res ?? b.res;
      a.ruins = b.ruins = a.ruins || b.ruins;
    }
    for (const c of this.cities) { const t = this.tile(c.x, c.y); t.t = 'plain'; t.res = null; t.ruins = false; }
    // Validate: every city reachable over land from the player's capital; capitals far apart.
    const d = this.landDist(this.cities[0].x, this.cities[0].y);
    if (this.cities.some((c) => d[c.y * MW + c.x] < 0)) return false;
    return cheb(this.cities[0].x, this.cities[0].y, this.cities[4].x, this.cities[4].y) >= 10;
  }

  private fallbackMap() {
    this.tiles = Array.from({ length: MW * MH }, () => ({ t: 'plain' as Terrain, res: null, ruins: false, city: -1, terr: -1, seen: false }));
    const spots = [[2, 5], [7, 2], [7, 9], [4, 9], [15, 6], [10, 9], [10, 2], [13, 2]];
    this.cities = spots.map(([x, y], i) => ({ id: i, x, y, owner: i === 0 ? 0 : i === 4 ? 1 : -1, name: '', level: 1, pop: 0, capital: i === 0 || i === 4 }) as City);
    for (const c of this.cities) {
      this.tile(c.x, c.y).city = c.id;
      for (const [dx, dy] of [[0, 0], ...DIRS]) { const x = c.x + dx, y = c.y + dy; if (inMap(x, y) && this.tile(x, y).terr < 0) this.tile(x, y).terr = c.id; }
    }
    for (const c of [this.cities[0], this.cities[4]]) for (const [dx, dy] of DIRS.slice(0, 3)) this.tile(c.x + dx, c.y + dy).res = 'data';
  }

  /** BFS distance over land from (x, y), ignoring units; -1 = unreachable. */
  landDist(x: number, y: number): number[] {
    const d = new Array(MW * MH).fill(-1);
    const q = [[x, y]];
    d[y * MW + x] = 0;
    while (q.length) {
      const [cx, cy] = q.shift()!;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inMap(nx, ny) || d[ny * MW + nx] >= 0 || !land(this.tile(nx, ny))) continue;
        d[ny * MW + nx] = d[cy * MW + cx] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  }

  // ------------------------------------------------------------ queries
  capital(o: Owner) { return this.cities.find((c) => c.capital && c.owner === o) ?? this.cities.find((c) => c.capital && ((c.id === 0 && o === 0) || (c.id === 4 && o === 1))); }
  unitAt(x: number, y: number) { return this.units.find((u) => u.x === x && u.y === y); }
  cityAt(x: number, y: number) { const t = this.tile(x, y); return t && t.city >= 0 ? this.cities[t.city] : undefined; }
  has(o: Owner, tech: string) { return this.f[o].techs.includes(tech); }
  unlocked(o: Owner, type: UnitType) {
    const tech = UNITS[type].tech;
    if (!tech) return true;
    if (o === 0) return this.has(0, tech);
    const at = { archer: 5, defender: 8, catcher: 12 }[type as 'archer'] ?? 99;
    return this.turn >= at + this.diff.rivalUnlock;
  }
  unitCap(o: Owner) { return this.cities.filter((c) => c.owner === o).reduce((s, c) => s + c.level + 1 + (c.capital ? 1 : 0), 0); }
  income(o: Owner) {
    let s = this.cities.filter((c) => c.owner === o).reduce((a, c) => a + c.level + (c.capital ? 1 : 0), 0);
    if (this.has(o, 'data_warehouse')) s += 2;
    s += this.f[o].techs.length; // every PostHog product pays for itself: +1 star a turn
    if (o === 1) s += this.diff.rivalIncome;
    return s;
  }
  techCost(o: Owner) { return 5 + 2 * this.f[o].techs.length; }
  score(o: Owner) {
    const cs = this.cities.filter((c) => c.owner === o);
    return cs.length * 100 + cs.reduce((s, c) => s + c.level, 0) * 40 + this.f[o].techs.length * 50 +
      this.units.filter((u) => u.owner === o).length * 10 + this.f[o].kills * 20;
  }
  popNeeded(c: City) { return c.level + 1; }

  // ------------------------------------------------------------ movement & combat
  moveCost(t: Tile) { return t.t === 'forest' ? 99 : 1; } // entering a forest ends movement

  reachable(u: Unit): Map<number, number> {
    const out = new Map<number, number>(); // tile index -> remaining move
    if (u.moved || u.done) return out;
    const start = u.y * MW + u.x;
    const best = new Map<number, number>([[start, UNITS[u.type].move]]);
    const q = [[u.x, u.y]];
    while (q.length) {
      const [x, y] = q.shift()!;
      const left = best.get(y * MW + x)!;
      if (left <= 0) continue;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const t = this.tile(nx, ny);
        if (!land(t)) continue;
        const other = this.unitAt(nx, ny);
        if (other && other.owner !== u.owner) continue;
        const rem = Math.max(0, left - this.moveCost(t));
        const i = ny * MW + nx;
        if ((best.get(i) ?? -1) >= rem) continue;
        best.set(i, rem);
        if (!other) out.set(i, rem);
        q.push([nx, ny]);
      }
    }
    out.delete(start);
    return out;
  }

  targets(u: Unit, fromX = u.x, fromY = u.y): Unit[] {
    if (u.attacked || u.done) return [];
    const r = UNITS[u.type].range;
    return this.units.filter((e) => e.owner !== u.owner && cheb(fromX, fromY, e.x, e.y) <= r);
  }

  defBonus(d: Unit) {
    const c = this.cityAt(d.x, d.y);
    if (c && c.owner === d.owner) return this.has(d.owner, 'feature_flags') ? 2 : 1.5;
    return this.tile(d.x, d.y).t === 'forest' ? 1.25 : 1;
  }

  /** Polytopia-style combat forecast: damage dealt and retaliation taken. */
  forecast(a: Unit, d: Unit) {
    const A = UNITS[a.type], D = UNITS[d.type];
    const aF = A.atk * (a.hp / A.hp);
    const dF = D.def * (d.hp / D.hp) * this.defBonus(d);
    const total = aF + dF || 1;
    const dmg = Math.max(1, Math.round((aF / total) * A.atk * 4.5));
    const kills = dmg >= d.hp;
    const ret = kills || cheb(a.x, a.y, d.x, d.y) > D.range ? 0 : Math.round((dF / total) * D.def * 4.5);
    return { dmg, ret, kills };
  }

  addUnit(o: Owner, type: UnitType, x: number, y: number) {
    const u: Unit = { id: this.nextId++, owner: o, type, x, y, hp: UNITS[type].hp, moved: true, attacked: true, done: true, rested: false, prev: null };
    this.units.push(u);
    return u;
  }

  freeNeighbour(x: number, y: number): [number, number] | null {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (inMap(nx, ny) && land(this.tile(nx, ny)) && !this.unitAt(nx, ny)) return [nx, ny];
    }
    return null;
  }

  // ------------------------------------------------------------ actions (return false if not allowed)
  move(u: Unit, x: number, y: number) {
    if (!this.reachable(u).has(y * MW + x)) return false;
    u.prev = { x: u.x, y: u.y };
    u.x = x; u.y = y;
    u.moved = true;
    if (this.targets(u).length === 0 && !this.canCapture(u)) u.done = true;
    const t = this.tile(x, y);
    if (t.ruins) this.explore(u, t);
    this.updateFog();
    return true;
  }

  undo(u: Unit) {
    if (u.owner !== 0 || !this.has(0, 'session_replay') || this.f[0].undoUsed || !u.prev || u.attacked) return false;
    u.x = u.prev.x; u.y = u.prev.y;
    u.prev = null; u.moved = false; u.done = false;
    this.f[0].undoUsed = true;
    return true;
  }

  attack(a: Unit, d: Unit) {
    if (!this.targets(a).includes(d)) return null;
    const fc = this.forecast(a, d);
    const god = this.god;
    if (!(god && d.owner === 0)) d.hp -= fc.dmg;
    if (!(god && a.owner === 0)) a.hp -= fc.ret;
    a.attacked = true; a.done = true; a.moved = true;
    const died: Unit[] = [];
    const splash = UNITS[a.type].splash ?? 0;
    if (splash) {
      for (const e of this.units) {
        if (e.owner !== a.owner && e !== d && cheb(e.x, e.y, d.x, d.y) <= 1 && !(god && e.owner === 0)) e.hp -= splash;
      }
    }
    for (const e of [...this.units]) if (e.hp <= 0) died.push(e);
    for (const e of died) {
      this.units = this.units.filter((x) => x !== e);
      this.f[e.owner].lost++;
      this.f[e.owner === 0 ? 1 : 0].kills++;
    }
    // Melee attackers step into the tile they cleared.
    if (fc.kills && died.includes(d) && UNITS[a.type].range === 1 && !died.includes(a) && !this.unitAt(d.x, d.y)) {
      a.prev = null; a.x = d.x; a.y = d.y;
    }
    this.updateFog();
    return { ...fc, died };
  }

  canCapture(u: Unit) {
    const c = this.cityAt(u.x, u.y);
    if (!c || c.owner === u.owner || u.attacked) return false;
    if (this.god && c.owner === 0) return false;
    if (!u.moved) return true;
    return c.owner === -1 && this.has(u.owner, 'surveys');
  }

  capture(u: Unit) {
    if (!this.canCapture(u)) return null;
    const c = this.cityAt(u.x, u.y)!;
    const from = c.owner;
    c.owner = u.owner;
    c.name = this.nameCity(u.owner, c);
    u.done = true; u.moved = true; u.attacked = true;
    if (c.capital && from !== -1) {
      this.over = { won: u.owner === 0, reason: u.owner === 0 ? 'capital' : 'lost' };
    }
    this.updateFog();
    this.onEvent('capture', { city: c, from, by: u.owner });
    return c;
  }

  nameCity(o: Owner, c: City) {
    if (c.capital) return c.owner === 0 ? this.names.capital : this.names.rivalCapital;
    const f = this.f[o];
    f.named++;
    if (o === 0) return this.names.cities[(f.named - 1) % this.names.cities.length] || `City ${f.named}`;
    return `${this.names.rivalShort} Node ${f.named}`.slice(0, 14);
  }

  canHarvest(o: Owner, x: number, y: number) {
    const t = this.tile(x, y);
    if (!t || !t.res || t.terr < 0) return false;
    return this.cities[t.terr].owner === o && this.f[o].stars >= 2;
  }

  harvest(o: Owner, x: number, y: number) {
    if (!this.canHarvest(o, x, y)) return null;
    const t = this.tile(x, y);
    const c = this.cities[t.terr];
    this.f[o].stars -= 2;
    t.res = null;
    c.pop += this.has(o, 'experiments') ? 2 : 1;
    let grew = false;
    while (c.pop >= this.popNeeded(c) && c.level < 5) { c.pop -= this.popNeeded(c); c.level++; grew = true; }
    if (c.level >= 5) c.pop = 0;
    return { city: c, grew };
  }

  investCost(c: City) { return 5 + c.level * 3; }

  canInvest(o: Owner, c: City) { return c.owner === o && c.level < 5 && this.f[o].stars >= this.investCost(c); }

  /** Spend stars to grow a city (the late-game star sink when resources run out). */
  invest(o: Owner, c: City) {
    if (!this.canInvest(o, c)) return null;
    this.f[o].stars -= this.investCost(c);
    c.pop += 1;
    let grew = false;
    while (c.pop >= this.popNeeded(c) && c.level < 5) { c.pop -= this.popNeeded(c); c.level++; grew = true; }
    return { city: c, grew };
  }

  canTrain(o: Owner, c: City, type: UnitType) {
    return c.owner === o && !this.unitAt(c.x, c.y) && this.unlocked(o, type) && this.f[o].stars >= UNITS[type].cost &&
      this.units.filter((u) => u.owner === o).length < this.unitCap(o);
  }

  train(o: Owner, c: City, type: UnitType) {
    if (!this.canTrain(o, c, type)) return null;
    this.f[o].stars -= UNITS[type].cost;
    const u = this.addUnit(o, type, c.x, c.y);
    this.updateFog();
    return u;
  }

  canResearch(o: Owner, tech: string) {
    return this.products.includes(tech) && !this.has(o, tech) && this.f[o].stars >= this.techCost(o);
  }

  research(o: Owner, tech: string) {
    if (!this.canResearch(o, tech)) return false;
    this.f[o].stars -= this.techCost(o);
    this.f[o].techs.push(tech);
    this.updateFog();
    return true;
  }

  private explore(u: Unit, t: Tile) {
    t.ruins = false;
    const roll = this.rand();
    const open = this.products.filter((p) => !this.has(u.owner, p));
    if (roll < 0.25 && open.length) {
      const tech = open[Math.floor(this.rand() * open.length)];
      this.f[u.owner].techs.push(tech);
      this.onEvent('ruins', { u, kind: 'tech', tech });
    } else if (roll < 0.45) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inMap(u.x + dx, u.y + dy) && u.owner === 0) this.tile(u.x + dx, u.y + dy).seen = true;
      this.f[u.owner].stars += 2;
      this.onEvent('ruins', { u, kind: 'map' });
    } else {
      this.f[u.owner].stars += 5;
      this.onEvent('ruins', { u, kind: 'stars' });
    }
  }

  updateFog() {
    if (this.has(0, 'product_analytics')) { for (const t of this.tiles) t.seen = true; return; }
    const see = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inMap(x + dx, y + dy)) this.tile(x + dx, y + dy).seen = true;
    };
    for (const u of this.units) if (u.owner === 0) see(u.x, u.y, UNITS[u.type].vision);
    for (const c of this.cities) if (c.owner === 0) see(c.x, c.y, c.capital ? 3 : 2);
  }

  // ------------------------------------------------------------ turns
  startTurn(o: Owner) {
    const f = this.f[o];
    f.stars += this.income(o);
    f.undoUsed = false;
    for (const u of this.units) {
      if (u.owner !== o) continue;
      if (u.rested) {
        const c = this.cityAt(u.x, u.y);
        const heal = (c && c.owner === o ? 4 : 2) + (this.has(o, 'session_replay') ? 2 : 0);
        u.hp = Math.min(UNITS[u.type].hp, u.hp + heal);
      }
      u.moved = false; u.attacked = false; u.done = false; u.prev = null;
    }
  }

  /** Units that moved or attacked this turn don't heal next turn. */
  endTurn(o: Owner) {
    for (const u of this.units) if (u.owner === o) u.rested = !u.moved && !u.attacked;
    if (o === 1) {
      this.turn++;
      if (this.turn > MAX_TURNS && !this.over) {
        const won = this.score(0) >= this.score(1);
        this.over = { won, reason: won ? 'score' : 'lost' };
      }
    }
  }
}

// ------------------------------------------------------------ AI
export type Action =
  | { kind: 'research'; tech: string }
  | { kind: 'harvest'; x: number; y: number }
  | { kind: 'train'; city: City; type: UnitType }
  | { kind: 'move'; u: Unit; x: number; y: number }
  | { kind: 'attack'; u: Unit; target: Unit }
  | { kind: 'capture'; u: Unit }
  | { kind: 'invest'; city: City };

/** The AI plays one side: research, harvest, fight, expand, train. Yields one action at a time; the
 *  caller applies it (and animates) before asking for the next, so each step sees the current state. */
export function* aiTurn(w: World, o: Owner): Generator<Action, void, void> {
  const f = w.f[o];
  const enemy: Owner = o === 0 ? 1 : 0;
  const myUnits = () => w.units.filter((u) => u.owner === o);
  // 1. Research (only the player's side has techs; the rival unlocks units by turn).
  if (o === 0) {
    for (const tech of TECH_PRIORITY) {
      if (w.turn >= 2 && w.canResearch(o, tech) && f.stars >= w.techCost(o) + 2) { yield { kind: 'research', tech }; break; }
    }
  }
  // 2. Grow early: harvest while keeping money for a unit.
  const harvestAll = function* (reserve: number) {
    for (let guard = 0; guard < 20; guard++) {
      if (f.stars < 2 + reserve) return;
      let best: [number, number] | null = null, bestScore = -1;
      for (let i = 0; i < MW * MH; i++) {
        const t = w.tiles[i];
        if (!t.res || t.terr < 0 || w.cities[t.terr].owner !== o) continue;
        const c = w.cities[t.terr];
        const s = 10 - (w.popNeeded(c) - c.pop) + (c.capital ? 1 : 0);
        if (s > bestScore) { bestScore = s; best = [i % MW, (i / MW) | 0]; }
      }
      if (!best) return;
      yield { kind: 'harvest' as const, x: best[0], y: best[1] };
    }
  };
  if (w.turn <= 6) yield* harvestAll(2);
  // 3. Captures by units that start on a city.
  for (const u of myUnits()) if (w.canCapture(u)) yield { kind: 'capture', u };
  // 4. Units: attack, or move toward a goal (then attack if possible).
  const claimed = new Set<number>();
  const enemyCap = w.capital(enemy)!;
  const myCap = w.capital(o)!;
  const aggro = o === 0 || w.turn >= w.diff.aggroTurn;
  const order = myUnits().sort((a, b) => cheb(a.x, a.y, enemyCap.x, enemyCap.y) - cheb(b.x, b.y, enemyCap.x, enemyCap.y));
  for (const u of order) {
    if (!w.units.includes(u) || u.done) continue;
    if (w.canCapture(u)) { yield { kind: 'capture', u }; continue; }
    const best = bestTarget(w, u);
    if (best) { yield { kind: 'attack', u, target: best }; continue; }
    const threat = w.units.some((e) => e.owner === enemy && cheb(e.x, e.y, myCap.x, myCap.y) <= 3);
    // Badly hurt: stay put and heal (or step back into a city).
    if (u.hp < UNITS[u.type].hp * 0.35 && !threat) continue;
    let goal: [number, number] | null = null;
    if (threat && (u.type === 'defender' || cheb(u.x, u.y, myCap.x, myCap.y) <= 2)) {
      goal = w.unitAt(myCap.x, myCap.y) ? nearestEnemy(w, u, myCap) : [myCap.x, myCap.y];
    }
    // Late game with the bigger army: march on the enemy capital.
    const strong = myUnits().length >= w.units.filter((e) => e.owner === enemy).length + 2;
    if (!goal && aggro && w.turn >= 14 && strong && u.type !== 'defender') goal = [enemyCap.x, enemyCap.y];
    if (!goal) {
      const cands = w.cities.filter((c) => c.owner !== o && !claimed.has(c.id) && (c.owner === -1 || aggro));
      const ruins = w.tiles.map((t, i) => (t.ruins ? i : -1)).filter((i) => i >= 0 && cheb(u.x, u.y, i % MW, (i / MW) | 0) <= 3);
      if (ruins.length && u.type === 'scout') goal = [ruins[0] % MW, (ruins[0] / MW) | 0];
      else if (cands.length) {
        const d = w.landDist(u.x, u.y);
        const score = (c: City) => { const dd = d[c.y * MW + c.x]; return (dd < 0 ? 99 : dd) + (c.owner === enemy ? (c.capital ? 2 : 1) : 0) - (u.type === 'scout' && c.owner === -1 ? 2 : 0); };
        cands.sort((a, b) => score(a) - score(b));
        const c = cands[0];
        claimed.add(c.id);
        goal = [c.x, c.y];
      } else if (aggro) goal = [enemyCap.x, enemyCap.y];
    }
    if (!goal) continue;
    const reach = w.reachable(u);
    if (!reach.size) continue;
    const gd = w.landDist(goal[0], goal[1]);
    let pick: number | null = null, pd = gd[u.y * MW + u.x] < 0 ? 999 : gd[u.y * MW + u.x];
    for (const i of reach.keys()) {
      const dd = gd[i] < 0 ? 999 : gd[i];
      const bonus = w.tiles[i].t === 'forest' ? -0.2 : 0;
      if (dd + bonus < pd) { pd = dd + bonus; pick = i; }
    }
    if (pick === null) continue;
    yield { kind: 'move', u, x: pick % MW, y: (pick / MW) | 0 };
    if (!w.units.includes(u)) continue;
    const after = bestTarget(w, u);
    if (after) yield { kind: 'attack', u, target: after };
  }
  // 5. Train.
  for (const c of w.cities.filter((c) => c.owner === o).sort((a, b) => Number(b.capital) - Number(a.capital))) {
    const threat = w.units.some((e) => e.owner === enemy && cheb(e.x, e.y, c.x, c.y) <= 3);
    const scouts = myUnits().filter((u) => u.type === 'scout').length;
    const neutral = w.cities.some((x) => x.owner === -1);
    const prefs: UnitType[] = threat ? ['defender', 'warrior', 'archer']
      : scouts < 1 && neutral ? ['scout', 'warrior']
      : ['catcher', 'archer', 'warrior', 'defender'].sort(() => w.rand() - 0.5) as UnitType[];
    const type = prefs.find((t) => w.canTrain(o, c, t));
    if (type) yield { kind: 'train', city: c, type };
  }
  // 6. Late growth with the change: harvest, then invest what is left over.
  yield* harvestAll(w.turn > 6 ? 1 : 0);
  for (let guard = 0; guard < 10; guard++) {
    const c = w.cities.filter((c) => c.owner === o && w.canInvest(o, c)).sort((a, b) => w.investCost(a) - w.investCost(b))[0];
    if (!c || f.stars - w.investCost(c) < 4) break;
    yield { kind: 'invest', city: c };
  }
}

function nearestEnemy(w: World, u: Unit, near: City): [number, number] | null {
  let best: Unit | null = null, bd = 99;
  for (const e of w.units) if (e.owner !== u.owner) { const d = cheb(e.x, e.y, near.x, near.y); if (d < bd) { bd = d; best = e; } }
  return best ? [best.x, best.y] : [near.x, near.y];
}

function bestTarget(w: World, u: Unit): Unit | null {
  let best: Unit | null = null, bs = -99;
  for (const t of w.targets(u)) {
    const fc = w.forecast(u, t);
    const s = (fc.kills ? 20 : 0) + fc.dmg * 2 - fc.ret * 1.5 + (t.type === 'catcher' ? 2 : 0);
    if (s > bs) { bs = s; best = t; }
  }
  return bs > 0 ? best : null;
}
