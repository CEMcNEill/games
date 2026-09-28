// Gear: weapon, armour and charm per member. Fixed kit names, small readable stat changes and at
// most one special effect each. New gear auto-equips on whoever gains the most from it; anything
// nobody needs is sold on the spot, so there is no inventory screen to manage.
import type { Member, ClassId } from './state';

export type Slot = 'weapon' | 'armor' | 'charm';
export type GearFx = 'mpRegen' | 'healUp' | 'critUp' | 'guard' | 'magicUp' | 'leakProof';
export type GearId = keyof typeof GEAR;

export interface GearDef { name: string; slot: Slot; cls: ClassId | 'any'; atk?: number; def?: number; mag?: number; hp?: number; fx?: GearFx; price: number }

export const FX_TEXT: Record<GearFx, string> = {
  mpRegen: '+2 MP each round',
  healUp: 'heals 30% more',
  critUp: 'crits more often',
  guard: 'takes 10% less damage',
  magicUp: 'spells hit 10% harder',
  leakProof: 'immune to LEAK',
};

export const GEAR = {
  // weapons
  rubber_mallet: { name: 'Rubber Mallet', slot: 'weapon', cls: 'hero', atk: 3, price: 40 },
  merge_hammer: { name: 'Merge Hammer', slot: 'weapon', cls: 'hero', atk: 6, fx: 'critUp', price: 120 },
  prod_breaker: { name: 'Prod Breaker', slot: 'weapon', cls: 'hero', atk: 10, fx: 'critUp', price: 300 },
  laser_pointer: { name: 'Laser Pointer', slot: 'weapon', cls: 'analyst', mag: 3, price: 40 },
  query_wand: { name: 'Query Wand', slot: 'weapon', cls: 'analyst', mag: 6, fx: 'magicUp', price: 120 },
  big_data_staff: { name: 'Big Data Staff', slot: 'weapon', cls: 'analyst', mag: 10, fx: 'magicUp', price: 300 },
  care_package: { name: 'Care Package', slot: 'weapon', cls: 'support', mag: 2, fx: 'healUp', price: 40 },
  tea_kettle: { name: 'Tea Kettle', slot: 'weapon', cls: 'support', mag: 6, fx: 'healUp', price: 150 },
  // armour
  hoodie: { name: 'Hoodie', slot: 'armor', cls: 'any', def: 2, hp: 6, price: 30 },
  standup_vest: { name: 'Standup Vest', slot: 'armor', cls: 'any', def: 4, hp: 10, price: 70 },
  firewall_mail: { name: 'Firewall Mail', slot: 'armor', cls: 'any', def: 7, hp: 16, fx: 'guard', price: 260 },
  // charms
  lucky_duck: { name: 'Lucky Duck', slot: 'charm', cls: 'any', atk: 1, fx: 'critUp', price: 80 },
  coffee_mug: { name: 'Coffee Mug', slot: 'charm', cls: 'any', mag: 1, fx: 'mpRegen', price: 90 },
  uptime_badge: { name: 'Uptime Badge', slot: 'charm', cls: 'any', def: 2, fx: 'leakProof', price: 90 },
  replay_tape: { name: 'Replay Tape', slot: 'charm', cls: 'support', mag: 2, fx: 'healUp', price: 110 },
} satisfies Record<string, GearDef>;

const G = GEAR as Record<string, GearDef>;
export const gearDef = (id: string): GearDef | undefined => G[id];
export const isGear = (id: string) => id in G;

/** Stat bonus from a member's gear. */
export function gearStat(m: Member, k: 'atk' | 'def' | 'mag' | 'hp'): number {
  let n = 0;
  for (const id of Object.values(m.gear)) if (id && G[id]) n += G[id][k] ?? 0;
  return n;
}

export const hasFx = (m: Member, fx: GearFx) => Object.values(m.gear).some((id) => id && G[id]?.fx === fx);

/** How good a piece is for a member, as one number (stats plus a flat value for the effect). */
function value(m: Member, id: string | undefined) {
  const d = id ? G[id] : undefined;
  if (!d) return 0;
  const w = m.cls === 'hero' ? { atk: 1.2, mag: 0.3 } : m.cls === 'analyst' ? { atk: 0.3, mag: 1.2 } : { atk: 0.5, mag: 1 };
  return (d.atk ?? 0) * w.atk + (d.mag ?? 0) * w.mag + (d.def ?? 0) + (d.hp ?? 0) / 5 + (d.fx ? 3 : 0);
}

export const canWear = (m: Member, id: string) => !!G[id] && (G[id].cls === 'any' || G[id].cls === m.cls);

/** Put a new piece on whoever gains the most. Returns who took it, or null if nobody wants it. */
export function autoEquip(party: Member[], id: string): Member | null {
  const d = G[id];
  if (!d) return null;
  let best: Member | null = null, gain = 0;
  for (const m of party) {
    if (!canWear(m, id)) continue;
    const g = value(m, id) - value(m, m.gear[d.slot]);
    if (g > gain) { gain = g; best = m; }
  }
  if (!best) return null;
  const old = best.gear[d.slot];
  const hpBefore = gearStat(best, 'hp');
  best.gear[d.slot] = id as GearId;
  const hpDelta = gearStat(best, 'hp') - hpBefore;
  best.maxHp += hpDelta;
  best.hp = Math.max(best.hp > 0 ? 1 : 0, Math.min(best.maxHp, best.hp + Math.max(0, hpDelta)));
  // The replaced piece goes to someone else if it helps them.
  if (old) autoEquip(party.filter((p) => p !== best), old);
  return best;
}

/** "ATK +6, crits more often" */
export function gearLine(id: string) {
  const d = G[id];
  if (!d) return '';
  const parts: string[] = [];
  for (const k of ['atk', 'def', 'mag', 'hp'] as const) if (d[k]) parts.push(`${k.toUpperCase()} +${d[k]}`);
  if (d.fx) parts.push(FX_TEXT[d.fx]);
  return parts.join(', ');
}

export const SHOP: string[] = ['potion', 'ether', 'hotfix', 'hoodie', 'rubber_mallet', 'laser_pointer', 'care_package', 'standup_vest', 'lucky_duck', 'coffee_mug'];
export const ITEM_PRICE: Record<string, number> = { potion: 12, ether: 25, hotfix: 30 };
export const price = (id: string) => ITEM_PRICE[id] ?? G[id]?.price ?? 999;

/** Pools the seeded NG+ remix draws chest contents from, by map chest index. */
export const RARE_POOL = ['merge_hammer', 'query_wand', 'tea_kettle', 'firewall_mail', 'uptime_badge', 'replay_tape', 'coffee_mug', 'lucky_duck'];
export const TOP_POOL = ['prod_breaker', 'big_data_staff', 'firewall_mail', 'tea_kettle'];
