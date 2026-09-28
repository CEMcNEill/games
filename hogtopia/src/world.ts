// Hogtopia rules. Pure logic (no Phaser), so it is easy to test headless and the AI can play any side
// (the rivals always; the player's side under __game.debug.autopilot). Content lives in data.ts, maps in
// mapgen.ts and the AI in ai.ts.
import {
  MAX_TURNS, UNITS, UnitType, TECHS, TIER2, BASE_TECHS, TECH_COST, RIVAL_TECHS, DIFF, Diff, HEAT, LEVEL_REWARDS,
  Personality, PERSONALITIES, AUTOPILOT, VET_KILLS, VET_HP, MONUMENTS, MONUMENT_SCORE, PARK_SCORE, Res,
} from './data';
import { MapData, Tile, City, generateMap, landDist, cheb, land, rng, hash } from './mapgen';

export { MAX_TURNS, UNITS, TECHS, cheb, land, rng, hash };
export type { Tile, City, UnitType };
export type Owner = number; // 0 = player (the prospect), 1 = rival (their biggest problem), 2 = second rival (heat 4+)

export interface Unit {
  id: number; owner: Owner; type: UnitType; x: number; y: number; hp: number; maxHp: number; kills: number; vet: boolean;
  moved: boolean; attacked: boolean; done: boolean; rested: boolean; prev: { x: number; y: number } | null;
}
export interface Faction {
  stars: number; techs: string[]; kills: number; lost: number; undoUsed: boolean; named: number; wins: number;
  persona: Personality; alive: boolean; ai: { target: number; assault: boolean };
}
export interface Names { capital: string; cities: string[]; rivalCapital: string; rivalShort: string }
export interface Setup {
  seed: number; biome: string; difficulty: string; products: string[]; names: Names;
  map?: string; heat?: number; personality?: string;
}
export type Over = { won: boolean; reason: 'capital' | 'score' | 'lost' | 'outscored' | 'debug'; bonus: number };

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const team = (o: number) => (o === 0 ? 0 : 1);
export const foes = (a: number, b: number) => team(a) !== team(b);

export class World {
  W: number; H: number; mapType: string; biome: string;
  tiles: Tile[]; cities: City[];
  units: Unit[] = [];
  f: Faction[];
  turn = 1;
  nextId = 1;
  rand: () => number;
  diff: Diff; heat: number; difficulty: string;
  products: string[];
  techList: string[];
  god = false;
  /** Level-up rewards for the player's side are chosen in the UI unless this is on (autopilot). */
  autoPlayer = false;
  pending: { city: City; level: number }[] = [];
  monuments: { id: string; o: Owner; at: number }[] = [];
  truce = 0; // turns of truce left (P2)
  over: Over | null = null;
  onEvent: (e: string, data?: any) => void = () => {};

  constructor(s: Setup, public names: Names = s.names) {
    this.rand = rng(s.seed);
    this.biome = s.biome;
    this.difficulty = DIFF[s.difficulty] ? s.difficulty : 'normal';
    this.diff = DIFF[this.difficulty];
    this.heat = Math.max(0, Math.min(5, Math.floor(s.heat ?? 0)));
    const H0 = HEAT[this.heat];
    this.products = s.products.filter((p) => TECHS[p]?.tier === 1);
    const m: MapData = generateMap(s.seed, s.biome, s.map ?? 'classic', H0.ruins);
    this.W = m.W; this.H = m.H; this.tiles = m.tiles; this.cities = m.cities; this.mapType = m.type;
    const hasWater = this.tiles.some((t) => t.t === 'water');
    this.techList = [...BASE_TECHS.filter((b) => b !== 'sailing' || hasWater), ...this.products.flatMap((p) => [p, TIER2[p]].filter(Boolean))];
    const persona = PERSONALITIES[s.personality ?? ''] ?? PERSONALITIES.opportunist;
    const mk = (stars: number, p: Personality): Faction => ({ stars, techs: [], kills: 0, lost: 0, undoUsed: false, named: 0, wins: 0, persona: p, alive: true, ai: { target: -1, assault: false } });
    this.f = [mk(5, AUTOPILOT), mk(this.diff.rivalStars + H0.stars, persona)];
    const [pc, rc] = [this.capital(0)!, this.capital(1)!];
    this.addUnit(0, 'warrior', pc.x, pc.y);
    this.addUnit(1, 'warrior', rc.x, rc.y);
    if (this.diff.extraUnit || this.heat >= 3) {
      const n = this.freeNeighbour(rc.x, rc.y);
      if (n) this.addUnit(1, 'warrior', n[0], n[1]);
    }
    if (H0.rival2) this.addSecondRival(s);
    this.updateFog();
    for (const t of this.tiles) t.fog = t.seen ? 0 : 1;
  }

  /** HEAT 4+: the neutral village furthest from you becomes a second rival capital. */
  private addSecondRival(s: Setup) {
    const pc = this.capital(0)!, rc = this.capital(1)!;
    const v = this.cities.filter((c) => c.owner === -1)
      .sort((a, b) => (cheb(b.x, b.y, pc.x, pc.y) - cheb(b.x, b.y, rc.x, rc.y) / 2) - (cheb(a.x, a.y, pc.x, pc.y) - cheb(a.x, a.y, rc.x, rc.y) / 2))[0];
    if (!v) return;
    const ids = Object.keys(PERSONALITIES);
    const p2 = PERSONALITIES[ids[(ids.indexOf(s.personality ?? '') + 1 + ids.length) % ids.length]];
    this.f.push({ stars: this.diff.rivalStars, techs: [], kills: 0, lost: 0, undoUsed: false, named: 0, wins: 0, persona: p2, alive: true, ai: { target: -1, assault: false } });
    v.owner = 2; v.capital = true; v.home = 2; v.level = 2;
    v.name = `${this.names.rivalShort} Annex`.slice(0, 14);
    this.addUnit(2, 'warrior', v.x, v.y);
  }

  // ------------------------------------------------------------ queries
  tile(x: number, y: number) { return this.tiles[y * this.W + x]; }
  inMap(x: number, y: number) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  idx(x: number, y: number) { return y * this.W + x; }
  capital(o: Owner) { return this.cities.find((c) => c.capital && c.home === o); }
  unitAt(x: number, y: number) { return this.units.find((u) => u.x === x && u.y === y); }
  cityAt(x: number, y: number) { const t = this.tile(x, y); return t && t.city >= 0 ? this.cities[t.city] : undefined; }
  owners() { return this.f.map((_, i) => i); }
  rivals() { return this.owners().filter((o) => o !== 0 && this.f[o].alive); }
  has(o: Owner, tech: string) {
    if (o !== 0) return RIVAL_TECHS.some(([t, turn]) => t === tech && this.turn >= turn + this.unlockShift());
    return this.f[o].techs.includes(tech);
  }
  unlockShift() { return this.diff.rivalUnlock + HEAT[this.heat].unlock; }
  unlocked(o: Owner, type: UnitType) {
    const tech = UNITS[type].tech;
    if (!tech) return true;
    if (o === 0) return this.has(0, tech);
    const at = ({ archer: 5, defender: 8, catcher: 12 } as Record<string, number>)[type] ?? 99;
    return this.turn >= at + this.unlockShift();
  }
  /** Effective unit numbers after techs. */
  stats(u: { owner: Owner; type: UnitType }) {
    const s = { ...UNITS[u.type] };
    if (s.range > 1 && this.has(u.owner, 'funnels')) s.atk += 1;
    if (u.type === 'defender' && this.has(u.owner, 'rollouts')) { s.hp += 5; s.move = 2; }
    if (u.type === 'catcher' && this.has(u.owner, 'alerts')) { s.atk += 1; s.splash = 3; }
    if (this.has(u.owner, 'heatmaps')) s.vision += 1;
    return s;
  }
  myCities(o: Owner) { return this.cities.filter((c) => c.owner === o); }
  myUnits(o: Owner) { return this.units.filter((u) => u.owner === o); }
  unitCap(o: Owner) { return this.myCities(o).reduce((s, c) => s + c.level + 1 + (c.capital ? 1 : 0), 0); }
  cityIncome(c: City) {
    return c.level + (c.capital ? 1 : 0) + (c.perks.includes('workshop') ? 1 : 0) + (c.owner === 0 && this.has(0, 'pipelines') ? 1 : 0);
  }
  income(o: Owner) {
    let s = this.myCities(o).reduce((a, c) => a + this.cityIncome(c), 0);
    if (this.has(o, 'data_warehouse')) s += 2;
    s += this.f[o].techs.filter((t) => TECHS[t].tier === 1).length; // every PostHog product pays for itself: +1 star a turn
    if (o !== 0) s += this.diff.rivalIncome + HEAT[this.heat].income + Math.floor(this.turn * this.diff.growth); // rivals scale with time
    return s;
  }
  techCost(o: Owner, tech?: string) { return TECH_COST[tech ? TECHS[tech]?.tier ?? 1 : 1] + 3 * this.f[o].techs.length; }
  territory(o: Owner) { return this.tiles.filter((t) => t.terr >= 0 && this.cities[t.terr].owner === o).length; }
  scoreParts(o: Owner) {
    const cs = this.myCities(o), fa = this.f[o];
    return {
      cities: cs.length * 100,
      pop: cs.reduce((s, c) => s + c.level, 0) * 40,
      techs: this.techCount(o) * 40,
      territory: this.territory(o) * 5,
      army: this.myUnits(o).length * 10,
      kills: fa.kills * 20,
      wonders: this.monuments.filter((m) => m.o === o).length * MONUMENT_SCORE + cs.filter((c) => c.perks.includes('park')).length * PARK_SCORE,
    };
  }
  /** Rivals have no tech tree; their turn-based unlocks count as techs for score and monuments. */
  techCount(o: Owner) {
    if (o === 0) return this.f[0].techs.length;
    const s = this.unlockShift();
    return RIVAL_TECHS.filter(([, t]) => this.turn >= t + s).length + [5, 8, 12].filter((t) => this.turn >= t + s).length;
  }
  score(o: Owner) { return Object.values(this.scoreParts(o)).reduce((a, b) => a + b, 0); }
  rivalScore() { return Math.max(0, ...this.rivals().map((o) => this.score(o))); }
  popNeeded(c: City) { return c.level + 1; }

  // ------------------------------------------------------------ movement & combat
  passable(o: Owner, t: Tile) {
    return land(t) || (t.t === 'mountain' && this.has(o, 'climbing')) || (t.t === 'water' && this.has(o, 'sailing'));
  }
  private ownLand(o: Owner, i: number) { const t = this.tiles[i]; return t.terr >= 0 && this.cities[t.terr].owner === o; }
  /** Cost of stepping from tile a to tile b (99 = ends the move). */
  stepCost(o: Owner, a: number, b: number) {
    const t = this.tiles[b], from = this.tiles[a];
    if (t.t === 'forest' && !this.has(o, 'forestry')) return 99;
    if (t.t === 'mountain') return 99;
    if (t.t === 'water' && from.t !== 'water') return 99; // embarking ends the move
    if (this.has(o, 'roads') && this.ownLand(o, a) && this.ownLand(o, b)) return 0.5;
    return 1;
  }

  reachable(u: Unit): Map<number, number> {
    const out = new Map<number, number>(); // tile index -> remaining move
    if (u.moved || u.done) return out;
    const W = this.W;
    const start = u.y * W + u.x;
    const best = new Map<number, number>([[start, this.stats(u).move]]);
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i / W) | 0;
      const left = best.get(i)!;
      if (left <= 0) continue;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!this.inMap(nx, ny)) continue;
        const j = ny * W + nx;
        const t = this.tiles[j];
        if (!this.passable(u.owner, t)) continue;
        const other = this.unitAt(nx, ny);
        if (other && foes(other.owner, u.owner)) continue;
        const rem = Math.max(0, left - this.stepCost(u.owner, i, j));
        if ((best.get(j) ?? -1) >= rem) continue;
        best.set(j, rem);
        if (!other) out.set(j, rem);
        q.push(j);
      }
    }
    out.delete(start);
    return out;
  }

  /** Distance map for owner o (passable terrain for them), from (x, y). */
  distFrom(o: Owner, x: number, y: number) { return landDist(this, x, y, (t) => this.passable(o, t)); }

  targets(u: Unit, fromX = u.x, fromY = u.y): Unit[] {
    if (u.attacked || u.done) return [];
    if (this.truce > 0) return []; // every fight is you vs a rival, so a truce stops them all
    const r = this.stats(u).range;
    return this.units.filter((e) => foes(e.owner, u.owner) && cheb(fromX, fromY, e.x, e.y) <= r);
  }

  defBonus(d: { owner: Owner; x: number; y: number }) {
    const c = this.cityAt(d.x, d.y);
    if (c && c.owner === d.owner) {
      const wall = c.perks.includes('wall');
      const ff = this.has(d.owner, 'feature_flags');
      return wall && ff ? 2.5 : wall || ff ? 2 : 1.5;
    }
    const t = this.tile(d.x, d.y).t;
    return t === 'forest' ? 1.25 : t === 'mountain' ? 1.5 : t === 'water' ? 0.8 : 1;
  }

  /** Polytopia-style combat forecast: damage dealt and retaliation taken. Optional `at` = attack from there. */
  forecast(a: Unit, d: Unit, at?: { x: number; y: number }) {
    const A = this.stats(a), D = this.stats(d);
    const aF = A.atk * (a.hp / a.maxHp);
    const dF = D.def * (d.hp / d.maxHp) * this.defBonus(d);
    const total = aF + dF || 1;
    const dmg = Math.max(1, Math.round((aF / total) * A.atk * 4.5));
    const kills = dmg >= d.hp;
    const ax = at?.x ?? a.x, ay = at?.y ?? a.y;
    const ret = kills || cheb(ax, ay, d.x, d.y) > D.range ? 0 : Math.round((dF / total) * D.def * 4.5);
    return { dmg, ret, kills };
  }

  addUnit(o: Owner, type: UnitType, x: number, y: number) {
    const hp = this.stats({ owner: o, type }).hp;
    const u: Unit = { id: this.nextId++, owner: o, type, x, y, hp, maxHp: hp, kills: 0, vet: false, moved: true, attacked: true, done: true, rested: false, prev: null };
    this.units.push(u);
    return u;
  }

  freeNeighbour(x: number, y: number): [number, number] | null {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (this.inMap(nx, ny) && land(this.tile(nx, ny)) && !this.unitAt(nx, ny)) return [nx, ny];
    }
    return null;
  }

  // ------------------------------------------------------------ actions (return false/null if not allowed)
  move(u: Unit, x: number, y: number) {
    if (!this.reachable(u).has(y * this.W + x)) return false;
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
    const from = { x: a.x, y: a.y };
    if (!(god && d.owner === 0)) d.hp -= fc.dmg;
    if (!(god && a.owner === 0)) a.hp -= fc.ret;
    a.attacked = true; a.done = true; a.moved = true;
    const died: Unit[] = [];
    const splash = this.stats(a).splash ?? 0;
    if (splash) {
      for (const e of this.units) {
        if (foes(e.owner, a.owner) && e !== d && cheb(e.x, e.y, d.x, d.y) <= 1 && !(god && e.owner === 0)) e.hp -= splash;
      }
    }
    for (const e of [...this.units]) if (e.hp <= 0) died.push(e);
    for (const e of died) {
      this.units = this.units.filter((x) => x !== e);
      this.f[e.owner].lost++;
      const killer = e === a ? d : a;
      this.f[killer.owner].kills++;
      if (killer.owner === a.owner && e !== a) this.f[a.owner].wins++;
      if (this.units.includes(killer)) this.creditKill(killer);
    }
    // Melee attackers step into the tile they cleared.
    if (fc.kills && died.includes(d) && this.stats(a).range === 1 && !died.includes(a) && !this.unitAt(d.x, d.y) && this.passable(a.owner, this.tile(d.x, d.y))) {
      a.prev = null; a.x = d.x; a.y = d.y;
      const t = this.tile(a.x, a.y);
      if (t.ruins) this.explore(a, t);
    }
    this.updateFog();
    this.checkMonuments();
    return { ...fc, died, from };
  }

  /** Veterancy: 3 kills promote a unit (full heal, +5 max HP, a chevron). */
  private creditKill(u: Unit) {
    u.kills++;
    if (!u.vet && u.kills >= VET_KILLS) {
      u.vet = true;
      u.maxHp += VET_HP;
      u.hp = u.maxHp;
      this.onEvent('veteran', { u });
    }
  }

  canCapture(u: Unit) {
    const c = this.cityAt(u.x, u.y);
    if (!c || c.owner === u.owner || u.attacked) return false;
    if (c.owner >= 0 && !foes(c.owner, u.owner)) return false;
    if (this.god && c.owner === 0) return false;
    if (this.truce > 0 && c.owner >= 0) return false;
    if (!u.moved) return true;
    return c.owner === -1 && this.has(u.owner, 'surveys');
  }

  capture(u: Unit) {
    if (!this.canCapture(u)) return null;
    const c = this.cityAt(u.x, u.y)!;
    const from = c.owner;
    c.owner = u.owner;
    c.name = this.nameCity(u.owner, c);
    if (from === -1 && u.owner === 0 && this.has(0, 'nps') && c.level < 2) { c.level = 2; c.pop = 0; }
    u.done = true; u.moved = true; u.attacked = true;
    this.updateFog();
    this.onEvent('capture', { city: c, from, by: u.owner });
    if (c.capital && from >= 0) this.capitalFell(c, from, u.owner);
    return c;
  }

  private capitalFell(c: City, from: Owner, by: Owner) {
    if (from === 0) { this.over = { won: false, reason: 'lost', bonus: 0 }; return; }
    // A rival whose home capital falls is out of the game (its units disband).
    if (c.home === from) {
      this.f[from].alive = false;
      this.units = this.units.filter((x) => x.owner !== from);
      for (const oc of this.cities) if (oc.owner === from) oc.owner = -1;
      this.onEvent('eliminated', { o: from });
    }
    if (by === 0 && !this.rivals().length) this.over = { won: true, reason: 'capital', bonus: Math.max(0, MAX_TURNS - this.turn + 1) * 50 };
  }

  nameCity(o: Owner, c: City) {
    if (c.capital && c.home === o) return o === 0 ? this.names.capital : c.home === 1 ? this.names.rivalCapital : c.name;
    const f = this.f[o];
    f.named++;
    if (o === 0) return this.names.cities[(f.named - 1) % this.names.cities.length] || `City ${f.named}`;
    return `${this.names.rivalShort} Node ${f.named}`.slice(0, 14);
  }

  canHarvest(o: Owner, x: number, y: number) {
    const t = this.tile(x, y);
    if (!t || !t.res || t.terr < 0 || (!t.seen && o === 0)) return false;
    return this.cities[t.terr].owner === o && this.f[o].stars >= 2;
  }

  harvest(o: Owner, x: number, y: number) {
    if (!this.canHarvest(o, x, y)) return null;
    const t = this.tile(x, y);
    const c = this.cities[t.terr];
    this.f[o].stars -= 2;
    t.res = null;
    return { city: c, grew: this.grow(c, this.has(o, 'experiments') ? 2 : 1) };
  }

  /** Add pop; each level gained queues a reward choice. Returns levels gained. */
  grow(c: City, pop: number) {
    c.pop += pop;
    let grew = 0;
    while (c.pop >= this.popNeeded(c) && c.level < 5) {
      c.pop -= this.popNeeded(c); c.level++; grew++;
      this.onEvent('levelup', { city: c });
      if (LEVEL_REWARDS[c.level]) {
        if (c.owner !== 0 || this.autoPlayer) this.applyReward(c, this.pickReward(c.owner, c, c.level));
        else this.pending.push({ city: c, level: c.level });
      }
    }
    if (c.level >= 5) c.pop = 0;
    this.checkMonuments();
    return grew;
  }

  /** AI choice between the two rewards: the personality's preference, with sense checks. */
  pickReward(o: Owner, c: City, level: number) {
    const [a, b] = LEVEL_REWARDS[level];
    let want = this.f[o].persona.rewards.includes(a.id) ? a.id : b.id;
    const capFull = this.myUnits(o).length >= this.unitCap(o);
    if (capFull && (want === 'explorer')) want = a.id;
    if (want === 'wall' && !c.capital && o !== 0) want = 'stockpile';
    if (want === 'borders' && this.borderGain(c) < 3) want = 'growth';
    return want;
  }

  applyReward(c: City, id: string) {
    const o = c.owner;
    if (o < 0) return;
    const f = this.f[o];
    c.perks.push(id);
    if (id === 'explorer' || id === 'giant') {
      const at = !this.unitAt(c.x, c.y) ? [c.x, c.y] : this.freeNeighbour(c.x, c.y);
      if (at) this.addUnit(o, id === 'explorer' ? 'scout' : 'giant', at[0], at[1]);
      else if (id === 'explorer') f.stars += 3;
    } else if (id === 'stockpile') f.stars += 6;
    else if (id === 'borders') this.growBorders(c);
    else if (id === 'growth') this.grow(c, 3);
    this.onEvent('reward', { city: c, id });
    this.updateFog();
  }

  borderGain(c: City) {
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (this.inMap(c.x + dx, c.y + dy) && this.tile(c.x + dx, c.y + dy).terr < 0) n++;
    }
    return n;
  }

  private growBorders(c: City) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!this.inMap(c.x + dx, c.y + dy)) continue;
      const t = this.tile(c.x + dx, c.y + dy);
      if (t.terr >= 0 || t.city >= 0) continue;
      t.terr = c.id;
      const kind: Res = t.t === 'plain' ? 'data' : t.t === 'forest' ? 'fruit' : t.t === 'water' ? 'fish' : null;
      if (kind && !t.ruins && !t.monument && this.rand() < 0.5) t.res = kind;
    }
  }

  investCost(c: City) { return 5 + c.level * 3 - (c.owner === 0 && this.has(0, 'multivariate') ? 3 : 0); }
  canInvest(o: Owner, c: City) { return c.owner === o && c.level < 5 && this.f[o].stars >= this.investCost(c); }

  /** Spend stars to grow a city (the late-game star sink when resources run out). */
  invest(o: Owner, c: City) {
    if (!this.canInvest(o, c)) return null;
    this.f[o].stars -= this.investCost(c);
    return { city: c, grew: this.grow(c, o === 0 && this.has(0, 'multivariate') ? 2 : 1) };
  }

  canTrain(o: Owner, c: City, type: UnitType) {
    return c.owner === o && type !== 'giant' && !this.unitAt(c.x, c.y) && this.unlocked(o, type) && this.f[o].stars >= UNITS[type].cost &&
      this.myUnits(o).length < this.unitCap(o);
  }

  train(o: Owner, c: City, type: UnitType) {
    if (!this.canTrain(o, c, type)) return null;
    this.f[o].stars -= UNITS[type].cost;
    const u = this.addUnit(o, type, c.x, c.y);
    this.updateFog();
    return u;
  }

  techOpen(o: Owner, tech: string) {
    const t = TECHS[tech];
    return !!t && this.techList.includes(tech) && !this.has(o, tech) && (!t.requires || this.has(o, t.requires));
  }
  canResearch(o: Owner, tech: string) { return o === 0 && this.techOpen(o, tech) && this.f[o].stars >= this.techCost(o, tech); }

  research(o: Owner, tech: string) {
    if (!this.canResearch(o, tech)) return false;
    this.f[o].stars -= this.techCost(o, tech);
    this.gainTech(o, tech);
    return true;
  }

  private gainTech(o: Owner, tech: string) {
    this.f[o].techs.push(tech);
    // Tech that raises max HP applies to units already on the map.
    for (const u of this.myUnits(o)) {
      const hp = this.stats(u).hp + (u.vet ? VET_HP : 0);
      if (hp > u.maxHp) { u.hp += hp - u.maxHp; u.maxHp = hp; }
    }
    this.updateFog();
    this.checkMonuments();
  }

  private explore(u: Unit, t: Tile) {
    t.ruins = false;
    const roll = this.rand();
    const open = u.owner === 0 ? this.techList.filter((p) => this.techOpen(0, p)) : [];
    if (roll < 0.25 && open.length) {
      const tech = open[Math.floor(this.rand() * open.length)];
      this.gainTech(u.owner, tech);
      this.onEvent('ruins', { u, kind: 'tech', tech });
    } else if (roll < 0.45) {
      if (u.owner === 0) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (this.inMap(u.x + dx, u.y + dy)) this.tile(u.x + dx, u.y + dy).seen = true;
      this.f[u.owner].stars += 2;
      this.onEvent('ruins', { u, kind: 'map' });
    } else {
      this.f[u.owner].stars += 5;
      this.onEvent('ruins', { u, kind: 'stars' });
    }
  }

  updateFog() {
    if (this.has(0, 'product_analytics')) { for (const t of this.tiles) t.seen = true; this.checkMonuments(); return; }
    const see = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.inMap(x + dx, y + dy)) this.tile(x + dx, y + dy).seen = true;
    };
    for (const u of this.units) if (u.owner === 0) see(u.x, u.y, this.stats(u).vision);
    for (const c of this.cities) if (c.owner === 0) see(c.x, c.y, c.capital ? 3 : 2);
  }

  // ------------------------------------------------------------ monuments
  private monumentDone(id: string, o: Owner) {
    switch (id) {
      case 'explorer': return o === 0 && this.tiles.every((t) => t.seen); // rivals see everything anyway
      case 'metro': return this.myCities(o).filter((c) => c.level >= 3).length >= 3;
      case 'warlord': return this.f[o].wins >= 10;
      case 'scholar': return this.techCount(o) >= 6;
    }
    return false;
  }

  checkMonuments() {
    if (!this.f?.[0]) return;
    for (const o of this.owners()) for (const m of MONUMENTS) {
      if (!this.f[o].alive || this.monuments.some((x) => x.id === m.id && x.o === o) || !this.monumentDone(m.id, o)) continue;
      // Build it on a free tile of their land, nearest the capital.
      const cap = this.capital(o) ?? this.myCities(o)[0];
      let best = -1, bd = 99;
      this.tiles.forEach((t, i) => {
        if (t.terr < 0 || this.cities[t.terr].owner !== o || t.city >= 0 || t.monument || t.res || t.ruins || !land(t)) return;
        const d = cap ? cheb(i % this.W, (i / this.W) | 0, cap.x, cap.y) : 0;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { this.tiles[best].monument = m.id; if (this.tiles[best].t === 'forest') this.tiles[best].t = 'plain'; }
      this.monuments.push({ id: m.id, o, at: best });
      this.onEvent('monument', { id: m.id, o, at: best });
    }
  }

  // ------------------------------------------------------------ turns
  startTurn(o: Owner) {
    const f = this.f[o];
    if (!f.alive) return;
    f.stars += this.income(o);
    f.undoUsed = false;
    for (const u of this.units) {
      if (u.owner !== o) continue;
      if (u.rested) {
        const c = this.cityAt(u.x, u.y);
        const heal = (c && c.owner === o ? 4 : 2) + (this.has(o, 'session_replay') ? 2 : 0);
        u.hp = Math.min(u.maxHp, u.hp + heal);
      }
      u.moved = false; u.attacked = false; u.done = false; u.prev = null;
    }
  }

  /** Units that moved or attacked this turn don't heal next turn. The last side to move ends the round. */
  endTurn(o: Owner) {
    for (const u of this.units) if (u.owner === o) u.rested = !u.moved && !u.attacked;
    if (o === this.f.length - 1) {
      this.turn++;
      if (this.truce > 0) this.truce--;
      if (this.turn > MAX_TURNS && !this.over) {
        const won = this.score(0) >= this.rivalScore();
        this.over = { won, reason: won ? 'score' : 'outscored', bonus: 0 };
      }
    }
  }
}
