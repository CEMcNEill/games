// The AI. One generator plays one side (every rival, and the player's side under autopilot). It reads
// the board like a person would: threats to its cities, attacks that kill or trade well, where to heal,
// and it gathers an army before it commits to an assault. A personality (data.ts) sets the weights.
import { UNITS, UnitType, TECH_PRIORITY, HEAT, Personality } from './data';
import { World, Unit, City, Owner, foes, cheb } from './world';

export type Action =
  | { kind: 'research'; tech: string }
  | { kind: 'harvest'; x: number; y: number }
  | { kind: 'train'; city: City; type: UnitType }
  | { kind: 'move'; u: Unit; x: number; y: number }
  | { kind: 'attack'; u: Unit; target: Unit }
  | { kind: 'capture'; u: Unit }
  | { kind: 'invest'; city: City };

const VALUE: Record<UnitType, number> = { scout: 2, warrior: 3, archer: 4, defender: 4, catcher: 6, giant: 10 };

/** The side's personality after difficulty and heat. */
export function profile(w: World, o: Owner): Personality {
  const P = { ...w.f[o].persona };
  if (o !== 0) {
    P.aggroTurn = Math.max(3, P.aggroTurn + w.diff.aggro + HEAT[w.heat].aggro);
    P.mass = Math.max(2, P.mass + w.diff.mass);
    P.risk += w.diff.risk - (w.heat >= 2 ? 1 : 0);
  }
  return P;
}

/** Expected enemy damage on each tile next turn (who could reach and hit it). */
export function dangerMap(w: World, o: Owner) {
  const d = new Array(w.W * w.H).fill(0);
  for (const e of w.units) {
    if (!foes(e.owner, o)) continue;
    const s = w.stats(e);
    const reach = s.move + s.range;
    const pow = s.atk * 2.2 * (e.hp / e.maxHp);
    for (let y = Math.max(0, e.y - reach); y <= Math.min(w.H - 1, e.y + reach); y++) {
      for (let x = Math.max(0, e.x - reach); x <= Math.min(w.W - 1, e.x + reach); x++) d[y * w.W + x] += pow;
    }
  }
  return d;
}

/** Enemy strength within `r` tiles of a city. */
function threatAt(w: World, o: Owner, c: City, r = 3) {
  let s = 0;
  for (const e of w.units) if (foes(e.owner, o) && cheb(e.x, e.y, c.x, c.y) <= r) s += w.stats(e).atk * (e.hp / e.maxHp) * (cheb(e.x, e.y, c.x, c.y) <= 1 ? 2 : 1);
  return s;
}

function attackScore(w: World, u: Unit, t: Unit, P: Personality) {
  const fc = w.forecast(u, t);
  const hurt = 1 - t.hp / t.maxHp;
  let s = fc.kills ? 12 + VALUE[t.type] * 2 + (t.vet ? 4 : 0) : fc.dmg * 1.5 * (1 + hurt);
  s -= u.hp - fc.ret <= 0 ? 30 : fc.ret * 1.2;
  const c = w.cityAt(t.x, t.y);
  if (c && c.owner === u.owner) s += 10; // it is about to take our city
  else if (w.myCities(u.owner).some((m) => cheb(m.x, m.y, t.x, t.y) <= 1)) s += 4;
  if (w.stats(u).range > 1 && !fc.kills) s += 1; // soften up first, finish with melee
  return s - P.risk;
}

/** Best attack available right now among `units` (focus fire falls out of it: hurt targets score higher). */
function bestAttack(w: World, units: Unit[], P: Personality): { u: Unit; target: Unit } | null {
  let best: { u: Unit; target: Unit } | null = null, bs = 1;
  for (const u of units) {
    if (!w.units.includes(u)) continue;
    for (const t of w.targets(u)) {
      const s = attackScore(w, u, t, P);
      if (s > bs) { bs = s; best = { u, target: t }; }
    }
  }
  return best;
}

export function* aiTurn(w: World, o: Owner): Generator<Action, void, void> {
  const f = w.f[o];
  if (!f.alive) return;
  const P = profile(w, o);
  const mine = () => w.myUnits(o);
  // 1. Research (only the player's side has the tech tree).
  if (o === 0 && w.turn >= 2) {
    for (const tech of TECH_PRIORITY) {
      if (w.canResearch(o, tech) && f.stars >= w.techCost(o, tech) + 2) { yield { kind: 'research', tech }; break; }
    }
  }
  const harvestAll = function* (reserve: number) {
    for (let guard = 0; guard < 20; guard++) {
      if (f.stars < 2 + reserve) return;
      let best = -1, bestScore = -1;
      for (let i = 0; i < w.tiles.length; i++) {
        const t = w.tiles[i];
        if (!t.res || t.terr < 0 || w.cities[t.terr].owner !== o) continue;
        const c = w.cities[t.terr];
        const s = 10 - (w.popNeeded(c) - c.pop) + (c.capital ? 1 : 0);
        if (s > bestScore) { bestScore = s; best = i; }
      }
      if (best < 0) return;
      yield { kind: 'harvest' as const, x: best % w.W, y: (best / w.W) | 0 };
    }
  };
  // 2. Grow early, keeping money for a unit.
  if (w.turn <= 6) yield* harvestAll(2);
  // 3. Captures by units that start on a city.
  for (const u of mine()) if (w.canCapture(u)) yield { kind: 'capture', u };
  if (w.over) return;
  // 4. Attacks from where units stand.
  for (let a = bestAttack(w, mine(), P); a; a = bestAttack(w, mine(), P)) yield { kind: 'attack', ...a };

  // 5. Plan: which enemy city the army is after, and whether it has massed enough to go in.
  const myCap = w.capital(o) ?? w.myCities(o)[0];
  const enemyCities = w.cities.filter((c) => c.owner >= 0 && foes(c.owner, o));
  const home = myCap ? w.distFrom(o, myCap.x, myCap.y) : null;
  const aggro = w.turn >= P.aggroTurn;
  let target = enemyCities.find((c) => c.id === f.ai.target) ?? null;
  if (aggro && (!target || w.rand() < 0.1)) {
    const garrison = (c: City) => { const u = w.unitAt(c.x, c.y); return u ? w.stats(u).def * (u.hp / u.maxHp) * 3 : 0; };
    const cost = (c: City) => (home?.[w.idx(c.x, c.y)] ?? 20) + garrison(c) + threatAt(w, o === 0 ? 1 : 0, c, 2) - (c.capital ? 4 : 0) - (P.id === 'opportunist' ? -garrison(c) * 2 : 0);
    target = [...enemyCities].sort((a, b) => cost(a) - cost(b))[0] ?? null;
  }
  f.ai.target = target?.id ?? -1;
  const danger = dangerMap(w, o);
  const capThreat = myCap && myCap.owner === o ? threatAt(w, o, myCap) : 0;
  // Roles.
  const units = mine();
  const neutral = w.cities.filter((c) => c.owner === -1);
  let garrisonUnit: Unit | null = null;
  if (myCap && myCap.owner === o && (capThreat > 0 || (P.garrison > 0 && w.turn >= 6))) {
    const onCap = w.unitAt(myCap.x, myCap.y);
    if (onCap && onCap.owner === o && onCap.type !== 'scout') garrisonUnit = onCap;
    else {
      garrisonUnit = units.filter((u) => u.type !== 'scout' && !u.moved && (u.type === 'defender' || u.type === 'warrior' || capThreat > 0))
        .sort((a, b) => cheb(a.x, a.y, myCap.x, myCap.y) - cheb(b.x, b.y, myCap.x, myCap.y))[0] ?? null;
      if (garrisonUnit && cheb(garrisonUnit.x, garrisonUnit.y, myCap.x, myCap.y) > 4) garrisonUnit = null;
    }
  }
  const army = units.filter((u) => u !== garrisonUnit && u.type !== 'scout');
  if (target) {
    const near = army.filter((u) => cheb(u.x, u.y, target!.x, target!.y) <= 4).length;
    if (near >= P.mass) f.ai.assault = true;
    else if (army.length < Math.max(2, P.mass - 1)) f.ai.assault = false;
  } else f.ai.assault = false;

  // Expansion: pair units with neutral villages, fastest arrivals first (scouts always; others while
  // there is no war on, or when the village is much closer than the front).
  const assigned = new Map<Unit, City>();
  {
    const pairs: { u: Unit; c: City; eta: number }[] = [];
    for (const u of units) {
      if (u === garrisonUnit || u.moved || u.hp < u.maxHp * P.retreat) continue;
      const d = w.distFrom(o, u.x, u.y);
      for (const c of neutral) {
        const dd = d[w.idx(c.x, c.y)];
        if (dd < 0) continue;
        const eta = dd / w.stats(u).move;
        if (u.type === 'scout' || !aggro || eta <= 3 * P.expand) pairs.push({ u, c, eta: eta - (u.type === 'scout' ? 0.5 : 0) });
      }
    }
    pairs.sort((a, b) => a.eta - b.eta);
    const taken = new Set<City>();
    for (const p of pairs) if (!assigned.has(p.u) && !taken.has(p.c)) { assigned.set(p.u, p.c); taken.add(p.c); }
  }
  // 6. Move everyone, nearest the action first.
  const order = [...units].sort((a, b) => (target ? cheb(a.x, a.y, target.x, target.y) - cheb(b.x, b.y, target.x, target.y) : 0));
  for (const u of order) {
    if (!w.units.includes(u) || u.done || u.moved) continue;
    if (w.canCapture(u)) { yield { kind: 'capture', u }; continue; }
    const S = w.stats(u);
    let goal: [number, number] | null = null;
    let hold = 0; // stop this far from the goal (gathering)
    let caution = 1;
    const onCity = w.cityAt(u.x, u.y);
    if (u === garrisonUnit) {
      // Guard the capital: on it when an enemy is close, else next to it so the city can still train.
      const close = w.units.some((e) => foes(e.owner, o) && cheb(e.x, e.y, myCap!.x, myCap!.y) <= 2);
      if (close && onCity === myCap) continue;
      goal = [myCap!.x, myCap!.y];
      if (!close) hold = 1;
      caution = 2;
    } else if (u.hp < u.maxHp * P.retreat) {
      // Pull back to heal: the nearest free city of ours, or rest where it stands.
      const safe = w.myCities(o).filter((c) => !w.unitAt(c.x, c.y) || w.unitAt(c.x, c.y) === u)
        .sort((a, b) => cheb(a.x, a.y, u.x, u.y) - cheb(b.x, b.y, u.x, u.y))[0];
      if (!safe || (onCity && onCity.owner === o) || cheb(safe.x, safe.y, u.x, u.y) > 4) { if (danger[w.idx(u.x, u.y)] < u.hp) continue; }
      if (safe) goal = [safe.x, safe.y];
      caution = 3;
    }
    if (!goal) {
      // Defend: an enemy standing on or next to one of our cities.
      const raid = w.myCities(o).map((c) => ({ c, t: threatAt(w, o, c, 1) })).filter((x) => x.t > 0 && cheb(x.c.x, x.c.y, u.x, u.y) <= 4)
        .sort((a, b) => b.t - a.t)[0];
      if (raid && u.type !== 'scout') goal = [raid.c.x, raid.c.y];
    }
    if (!goal) {
      const ruins = u.type === 'scout' ? w.tiles.findIndex((t, i) => t.ruins && cheb(u.x, u.y, i % w.W, (i / w.W) | 0) <= 2) : -1;
      const vill = assigned.get(u);
      if (ruins >= 0) goal = [ruins % w.W, (ruins / w.W) | 0];
      else if (vill) { goal = [vill.x, vill.y]; caution = 0.4; }
      else if (u.type === 'scout' && !target) {
        // Nothing left to claim: scout toward the unexplored side.
        const e = w.capital(o === 0 ? 1 : 0);
        if (e) { goal = [e.x, e.y]; hold = 4; }
      } else if (target) {
        goal = [target.x, target.y];
        if (!f.ai.assault) hold = 3;
        else caution = 0.35;
      }
    }
    if (!goal) continue;
    const gd = w.distFrom(o, goal[0], goal[1]);
    const here = w.idx(u.x, u.y);
    const tileScore = (i: number) => {
      const g = gd[i] < 0 ? 60 : gd[i];
      let s = -Math.abs(g - hold) * 10 - (g < hold ? 4 : 0);
      const t = w.tiles[i];
      const c = t.city >= 0 ? w.cities[t.city] : null;
      const def = c && c.owner === o ? 2 : t.t === 'forest' ? 1.25 : t.t === 'mountain' ? 1.5 : t.t === 'water' ? 0.6 : 1;
      s += (def - 1) * 8 * P.terrain;
      const exp = danger[i] / Math.max(1, S.def * def);
      s -= exp * caution * (exp >= u.hp ? 3 : 1);
      // Can hit something from there next?
      if (S.range > 1) for (const e of w.units) if (foes(e.owner, o) && cheb(e.x, e.y, i % w.W, (i / w.W) | 0) <= S.range) { s += 3; break; }
      return s;
    };
    let pick = here, ps = tileScore(here);
    for (const i of w.reachable(u).keys()) {
      const s = tileScore(i);
      if (s > ps) { ps = s; pick = i; }
    }
    if (pick !== here) {
      yield { kind: 'move', u, x: pick % w.W, y: (pick / w.W) | 0 };
      if (w.over) return;
    }
    if (!w.units.includes(u)) continue;
    const a = bestAttack(w, [u], P);
    if (a) yield { kind: 'attack', ...a };
    if (w.over) return;
  }
  // 7. Anyone who can still hit something.
  for (let a = bestAttack(w, mine(), P); a; a = bestAttack(w, mine(), P)) yield { kind: 'attack', ...a };
  if (w.over) return;

  // 8. Train.
  const count = (t: UnitType) => mine().filter((u) => u.type === t).length;
  for (const c of w.myCities(o).sort((a, b) => Number(b.capital) - Number(a.capital))) {
    const threat = threatAt(w, o, c) > 0;
    // Big spenders on growth keep money for their cities when nothing is on fire.
    if (!threat && P.invest > 1.1 && mine().length >= w.myCities(o).length * 2 + 2 && w.turn > 4) continue;
    const reachableVillages = neutral.length;
    const prefs: UnitType[] = threat ? ['defender', 'archer', 'warrior']
      : count('scout') < Math.min(2, reachableVillages) && w.turn < 14 && (count('scout') < 1 || P.expand > 1.4) ? ['scout', 'warrior']
      : rotate(P.army, mine().length);
    const type = prefs.find((t) => w.canTrain(o, c, t)) ?? (threat ? (['warrior'] as UnitType[]).find((t) => w.canTrain(o, c, t)) : undefined);
    if (type) yield { kind: 'train', city: c, type };
  }
  // 9. Late growth with the change: harvest, then invest what is left over.
  yield* harvestAll(w.turn > 6 ? 1 : 0);
  const keep = P.invest >= 1 ? 3 : 6;
  for (let guard = 0; guard < 10; guard++) {
    const c = w.myCities(o).filter((c) => w.canInvest(o, c)).sort((a, b) => w.investCost(a) - w.investCost(b))[0];
    if (!c || f.stars - w.investCost(c) < keep) break;
    yield { kind: 'invest', city: c };
  }
}

function rotate<T>(a: T[], n: number): T[] {
  const k = n % a.length;
  return [...a.slice(k), ...a.slice(0, k)];
}
