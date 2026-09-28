// Hog Saga battle rules as data: damage kinds and archetype weaknesses, status effects, the Ship It
// pair combos and each archetype's AI script. Numbers only; battle.ts and ai.ts read these tables.
import type { Arch, ClassId } from './state';

export type Kind = 'strike' | 'magic' | 'data';
export const KINDS: Kind[] = ['strike', 'magic', 'data'];
export const KIND_NAME: Record<Kind, string> = { strike: 'STRIKE', magic: 'MAGIC', data: 'DATA' };
/** Frame in the saga_icons sheet. */
export const KIND_ICON: Record<Kind, number> = { strike: 0, magic: 1, data: 2 };
export const ICON = { unknown: 3, gold: 8, weapon: 9, armor: 10, charm: 11, brk: 12, alert: 13, star: 14, chest: 15 };

export type FoeKey = Arch | 'boss' | 'boss2' | 'boss3' | 'wyrm';
export interface Affinity { weak: Kind; resist: Kind; shield: number }

export const AFFINITY: Record<FoeKey, Affinity> = {
  swarm: { weak: 'magic', resist: 'data', shield: 1 },
  fast: { weak: 'strike', resist: 'magic', shield: 2 },
  brute: { weak: 'magic', resist: 'strike', shield: 2 },
  tank: { weak: 'data', resist: 'strike', shield: 3 },
  caster: { weak: 'strike', resist: 'magic', shield: 2 },
  boss: { weak: 'data', resist: 'strike', shield: 4 },
  boss2: { weak: 'magic', resist: 'data', shield: 5 },
  boss3: { weak: 'strike', resist: 'magic', shield: 5 },
  wyrm: { weak: 'data', resist: 'magic', shield: 6 },
};

export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;
export const BREAK_MULT = 1.5;

export type StatusId = 'leak' | 'frozen' | 'throttled' | 'focused';
export interface StatusDef { name: string; icon: number; turns: number; good: boolean; color: number; line: string }

export const STATUS: Record<StatusId, StatusDef> = {
  leak: { name: 'LEAK', icon: 4, turns: 3, good: false, color: 0xb8f818, line: 'memory leak: loses HP each turn' },
  frozen: { name: 'FROZEN', icon: 5, turns: 1, good: false, color: 0xa4e4fc, line: 'frozen: loses a turn' },
  throttled: { name: 'SLOW', icon: 6, turns: 3, good: false, color: 0xf8b800, line: 'throttled: acts last' },
  focused: { name: 'FOCUS', icon: 7, turns: 2, good: true, color: 0xf85898, line: 'focused: crits more' },
};
export const LEAK_FRAC = 0.06;
export const CRIT_BASE = 0.08;
export const CRIT_FOCUSED = 0.5;

/** Ship It meter gains. */
export const METER = { max: 100, hit: 2, weak: 3, brk: 6, hurtScale: 18 };

export type ComboId = 'launch_day' | 'hotfix_rush' | 'insight_loop' | 'solo_ship';
export interface ComboDef { name: string; pair: ClassId[]; line: string }
export const COMBOS: Record<ComboId, ComboDef> = {
  launch_day: { name: 'LAUNCH DAY', pair: ['hero', 'analyst'], line: 'Strike, magic and data on every foe' },
  hotfix_rush: { name: 'HOTFIX RUSH', pair: ['hero', 'support'], line: 'Huge strike; heal and cure the party' },
  insight_loop: { name: 'INSIGHT LOOP', pair: ['analyst', 'support'], line: 'Magic on all; party FOCUSED, +MP' },
  solo_ship: { name: 'SOLO SHIP', pair: ['hero'], line: 'Strike every foe three times' },
};

/**
 * Enemy AI scripts, one per archetype: chances for each move, checked in order by ai.ts.
 * swarm focuses the weakest member; tank guards hurt allies; caster supports; brute telegraphs.
 */
export const AI = {
  swarm: { focusWeakest: 0.75, leak: 0.3 },
  fast: { again: 0.35, throttle: 0.25 },
  brute: { windup: 0.35, freeze: 0.35, miss: 0.1 },
  tank: { guardBelow: 0.6, harden: 0.25 },
  caster: { cure: 0.8, focusAlly: 0.3, storm: 0.4, leak: 0.35 },
  boss: { chargeEvery: 3, aoe: 0.25, statusP2: 0.35 },
};

/** Heat 0-5: enemy scaling, extra formation members, fewer starting potions, boss phase 3 at 3+. */
export const HEAT = [
  { hp: 1, dmg: 1, extra: false, potions: 3, phase3: false },
  { hp: 1.12, dmg: 1.06, extra: false, potions: 3, phase3: false },
  { hp: 1.22, dmg: 1.1, extra: true, potions: 2, phase3: false },
  { hp: 1.32, dmg: 1.14, extra: true, potions: 2, phase3: true },
  { hp: 1.45, dmg: 1.2, extra: true, potions: 1, phase3: true },
  { hp: 1.6, dmg: 1.26, extra: true, potions: 0, phase3: true },
];
