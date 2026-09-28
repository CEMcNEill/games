// Level-up cards: a weighted pool that leans toward the player's current build (owned items and
// evolution partners), plus the autopilot's ranking so the test bot builds toward evolutions.
import { WEAPONS, PASSIVES, MAX_LEVEL, MAX_PASSIVES, WeaponId, PassiveId } from './content';
import type { WState } from './weapons';

export interface Card { kind: 'weapon' | 'passive' | 'heal' | 'gold'; id: string }

export interface Build {
  weapons: Map<WeaponId, WState>;
  passives: Map<PassiveId, number>;
  banished: Set<string>;
  products: WeaponId[];   // theme products, plus the Act 2 tools once unlocked
  luck: number;
}

/** Passives that evolve a weapon the player holds (and hasn't evolved yet). */
export const partnersOf = (b: Build) => new Set([...b.weapons.values()].filter((w) => !w.evo && WEAPONS[w.id].evo)
  .map((w) => WEAPONS[w.id].evo!.passive));
const evoPassive = (id: WeaponId) => WEAPONS[id].evo?.passive;

export function cardPool(b: Build): { c: Card; w: number }[] {
  const pool: { c: Card; w: number }[] = [];
  const partners = partnersOf(b);
  const nW = b.weapons.size;
  for (const id of b.products) {
    if (b.banished.has(id)) continue;
    const w = b.weapons.get(id);
    if (!w) pool.push({ c: { kind: 'weapon', id }, w: nW < 3 ? 2.4 : nW < 4 ? 1.3 : 0.8 });
    else if (w.level < MAX_LEVEL) {
      const ep = evoPassive(id);
      pool.push({ c: { kind: 'weapon', id }, w: 3 + (ep && b.passives.has(ep) ? 1.5 * b.luck : 0) });
    }
  }
  for (const id of Object.keys(PASSIVES) as PassiveId[]) {
    if (b.banished.has(id)) continue;
    const lvl = b.passives.get(id) ?? 0;
    if (lvl >= PASSIVES[id].max) continue;
    if (!lvl && b.passives.size >= MAX_PASSIVES) continue;
    pool.push({ c: { kind: 'passive', id }, w: (lvl ? 1.8 : 0.9) + (partners.has(id) ? 1.6 * b.luck : 0) });
  }
  return pool;
}

/** Up to `n` distinct cards by weighted draw; heal/gold filler when the build is complete. */
export function drawCards(b: Build, rnd: () => number, n = 3): Card[] {
  const pool = cardPool(b);
  const out: Card[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let x = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x <= 0) break; }
    out.push(pool[i].c);
    pool.splice(i, 1);
  }
  if (out.length === 0) out.push({ kind: 'heal', id: 'heal' }, { kind: 'gold', id: 'gold' });
  return out;
}

/** Autopilot: how much it wants a card. Goes wide early, then chases evolutions. */
export function botRank(c: Card, b: Build): number {
  const partners = partnersOf(b);
  if (c.kind === 'weapon') {
    const w = b.weapons.get(c.id as WeaponId);
    if (!w) return b.weapons.size < 3 ? 9 : b.weapons.size < 4 ? 5 : 2;
    const ep = evoPassive(w.id);
    return 7 + w.level + (ep && b.passives.has(ep) ? 4 : 0);
  }
  if (c.kind === 'passive') {
    const id = c.id as PassiveId;
    let r = b.passives.has(id) ? 4 : 3;
    if (partners.has(id)) r += 6;
    if (id === 'maxhp' || id === 'armour' || id === 'revive') r += 2;
    return r;
  }
  return 1;
}
