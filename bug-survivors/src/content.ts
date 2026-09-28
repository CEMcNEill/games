// Bug Survivors content tables: weapons and their evolutions, passives, enemy archetypes, elites,
// events, heat levels, shop, heroes and achievements. Fixed kit text (never per prospect): plain ASCII
// that fits the 5x7 font. Prospect words (bug names, pain, boss) always come from the theme.
import type { AchievementDef } from '@shared/meta';

export type ProductId = 'session_replay' | 'feature_flags' | 'experiments' | 'error_tracking' | 'product_analytics' | 'surveys';
export type PassiveId = 'speed' | 'magnet' | 'maxhp' | 'cooldown' | 'armour' | 'area' | 'amount' | 'crit' | 'growth' | 'luck' | 'revive';

export const MAX_LEVEL = 5;
export const MAX_PASSIVES = 6;
export const BOSS_AT = 210; // seconds (3:30)

/** Player numbers every weapon and system reads; rebuilt from base + shop + hero + passives. */
export interface Stats {
  might: number;   // damage multiplier
  area: number;    // weapon size multiplier
  cd: number;      // cooldown multiplier (lower = faster)
  amount: number;  // extra projectiles / orbs / flags
  crit: number;    // crit chance (x2 damage)
  armour: number;  // fraction of contact damage ignored
  luck: number;    // drop + chest luck multiplier
  growth: number;  // xp multiplier
  magnet: number;  // pickup radius in px
  speed: number;   // px/s
  maxHp: number;
  revives: number;
}

export const baseStats = (): Stats => ({ might: 1, area: 1, cd: 1, amount: 0, crit: 0.05, armour: 0, luck: 1, growth: 1,
  magnet: 48, speed: 80, maxHp: 100, revives: 0 });

// ---------------------------------------------------------------- weapons

export interface WeaponDef {
  upgrade: string;  // level-up card line for levels 2-5
  short: string;    // end-screen damage label
  evo: { passive: PassiveId; name: string; line: string };
}

export const WEAPONS: Record<ProductId, WeaponDef> = {
  experiments: { upgrade: 'More shots per variant', short: 'Tests',
    evo: { passive: 'amount', name: 'Multivariate Barrage', line: 'Every variant, every direction' } },
  error_tracking: { upgrade: 'Faster, pierces more bugs', short: 'Errors',
    evo: { passive: 'crit', name: 'Stack Trace Storm', line: 'Homing swarm that chains on kills' } },
  session_replay: { upgrade: '+1 replay orb, wider orbit', short: 'Replay',
    evo: { passive: 'magnet', name: 'Rage Click Vortex', line: 'Pulsing orbs that pull in gems' } },
  feature_flags: { upgrade: 'More flags, faster zaps', short: 'Flags',
    evo: { passive: 'cooldown', name: 'Kill Switch Grid', line: 'Flags chain zaps to 3 bugs' } },
  product_analytics: { upgrade: 'Bigger, more frequent pulse', short: 'Analytics',
    evo: { passive: 'area', name: 'Funnel Quake', line: 'Double shockwave, huge knockback' } },
  surveys: { upgrade: 'Wider area, stronger slow', short: 'Surveys',
    evo: { passive: 'armour', name: 'NPS Blizzard', line: 'Freezing aura that shreds bugs' } },
};

/** Hidden super evolution: two evolved weapons + a chest. */
export const SUPER = { a: 'session_replay' as ProductId, b: 'error_tracking' as ProductId, name: 'Full Stack Nova',
  line: 'Replay and errors, fused' };

// ---------------------------------------------------------------- passives

export interface PassiveDef { name: string; line: string; max: number; apply: (s: Stats, lvl: number) => void }

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  speed: { name: 'Hedgehog Sprint', line: '+10% move speed', max: 5, apply: (s, l) => { s.speed *= 1 + 0.1 * l; } },
  magnet: { name: 'Autocapture', line: '+35% gem pickup range', max: 5, apply: (s, l) => { s.magnet *= 1 + 0.35 * l; } },
  maxhp: { name: 'Snack Break', line: '+20 max HP and heal 20', max: 5, apply: (s, l) => { s.maxHp += 20 * l; } },
  cooldown: { name: 'Hot Reload', line: 'Weapons fire 8% faster', max: 5, apply: (s, l) => { s.cd *= 1 - 0.08 * l; } },
  armour: { name: 'Code Review', line: 'Take 8% less damage', max: 5, apply: (s, l) => { s.armour += 0.08 * l; } },
  area: { name: 'Big Monitor', line: '+10% weapon area', max: 5, apply: (s, l) => { s.area *= 1 + 0.1 * l; } },
  amount: { name: 'Pair Programming', line: '+1 projectile or orb', max: 3, apply: (s, l) => { s.amount += l; } },
  crit: { name: 'Rubber Duck', line: '+6% critical hits', max: 5, apply: (s, l) => { s.crit += 0.06 * l; } },
  growth: { name: 'Docs Day', line: '+12% XP from gems', max: 5, apply: (s, l) => { s.growth *= 1 + 0.12 * l; } },
  luck: { name: 'Lucky Commit', line: 'More drops, better chests', max: 5, apply: (s, l) => { s.luck *= 1 + 0.15 * l; } },
  revive: { name: 'Rollback', line: 'Revive once at half HP', max: 1, apply: (s, l) => { s.revives += l; } },
};

// ---------------------------------------------------------------- enemies

export type ArchId = 'swarmer' | 'splitter' | 'tank' | 'exploder' | 'charger' | 'spitter' | 'mini' | 'runner' | 'crate';

export interface ArchDef {
  sprite: number;      // theme enemy index (0-2): name, pain, sprite
  hp: number; speed: number; dmg: number; xp: number; r: number;
  scale?: number;
  tint?: number;       // variants are tinted so they read as a different trick
  armour?: number;     // damage taken multiplier
  kb?: number;         // knockback taken multiplier
  trick?: string;      // one-time banner line for variants ({n} = plural bug name)
  key?: string;        // fixed kit sprite instead of the theme enemy (crates)
}

export const ARCH: Record<ArchId, ArchDef> = {
  swarmer: { sprite: 0, hp: 6, speed: 54, dmg: 6, xp: 1, r: 6 },
  splitter: { sprite: 1, hp: 16, speed: 38, dmg: 10, xp: 2, r: 7 },
  tank: { sprite: 2, hp: 55, speed: 25, dmg: 14, xp: 5, r: 8, scale: 1.25, armour: 0.6, kb: 0.3 },
  exploder: { sprite: 0, hp: 9, speed: 60, dmg: 0, xp: 2, r: 6, tint: 0xf8b800, trick: '{n} with a fuse: pop them from afar' },
  charger: { sprite: 1, hp: 22, speed: 34, dmg: 12, xp: 3, r: 7, tint: 0xf87858, trick: '{n} that charge: sidestep the dash' },
  spitter: { sprite: 2, hp: 26, speed: 30, dmg: 9, xp: 4, r: 7, tint: 0xb8f818, trick: '{n} that spit from range: close in' },
  mini: { sprite: 1, hp: 5, speed: 60, dmg: 5, xp: 1, r: 5, scale: 0.65 },
  runner: { sprite: 1, hp: 14, speed: 125, dmg: 9, xp: 1, r: 7, tint: 0xf8d878 },
  crate: { sprite: 0, hp: 10, speed: 0, dmg: 0, xp: 0, r: 7, kb: 0, key: 'crate' },
};

/** Spawn weights by time (heat 0). The last row whose `at` has passed is used. */
export const SPAWN_TABLE: { at: number; w: Partial<Record<ArchId, number>> }[] = [
  { at: 0, w: { swarmer: 1 } },
  { at: 30, w: { swarmer: 0.75, splitter: 0.25 } },
  { at: 60, w: { swarmer: 0.5, splitter: 0.3, exploder: 0.2 } },
  { at: 100, w: { swarmer: 0.32, splitter: 0.25, exploder: 0.1, charger: 0.18, tank: 0.15 } },
  { at: 150, w: { swarmer: 0.26, splitter: 0.2, exploder: 0.1, charger: 0.14, tank: 0.18, spitter: 0.12 } },
];

export type EliteMod = 'fast' | 'shield' | 'regen';
export const ELITE_MODS: Record<EliteMod, { label: string; tint: number }> = {
  fast: { label: 'Fast', tint: 0xf8f858 },
  shield: { label: 'Shielded', tint: 0x78c8f8 },
  regen: { label: 'Regenerating', tint: 0x78f878 },
};

/** Seconds at which a lone elite shows up (heat 0; heat 3+ uses ELITES_EARLY). */
export const ELITES_AT = [90, 150];
export const ELITES_EARLY = [45, 85, 125, 165];

// ---------------------------------------------------------------- events

export type EventId = 'ring' | 'stampede' | 'pack';
export const EVENTS: Record<EventId, { title: string; body: string }> = {
  ring: { title: 'SURROUNDED!', body: 'Break out of the ring of {n0}s' },
  stampede: { title: 'STAMPEDE!', body: 'A herd of {n1}s is crossing: dodge!' },
  pack: { title: 'ELITE PACK!', body: 'Big bugs with chests. Evolve your weapons!' },
};
export const EVENT_TIMES = [60, 120, 180];
export const EVENT_ORDER: EventId[] = ['ring', 'stampede', 'pack'];

// ---------------------------------------------------------------- heat

export interface HeatDef { desc: string }
/** Heat h applies every row 1..h. */
export const HEAT: HeatDef[] = [
  { desc: 'The standard run' },
  { desc: 'More bugs' },
  { desc: 'Faster bugs' },
  { desc: 'Elites come early' },
  { desc: 'Less healing' },
  { desc: 'Boss rage + overtime' },
];
export const OVERTIME_S = 45;

// ---------------------------------------------------------------- shop

export interface ShopDef { id: string; name: string; line: string; cost: number[] }
export const SHOP: ShopDef[] = [
  { id: 'might', name: 'Might', line: '+5% damage', cost: [30, 60, 100, 150, 220] },
  { id: 'hp', name: 'Max HP', line: '+10 max HP', cost: [25, 50, 90, 140, 200] },
  { id: 'speed', name: 'Speed', line: '+4% move speed', cost: [40, 90, 160] },
  { id: 'magnet', name: 'Magnet', line: '+15% pickup range', cost: [30, 70, 130] },
  { id: 'luck', name: 'Luck', line: '+8% luck', cost: [40, 100, 180] },
  { id: 'reroll', name: 'Reroll', line: '+1 reroll per run', cost: [50, 120, 220] },
  { id: 'skip', name: 'Skip + Banish', line: '+1 skip and banish', cost: [60, 150] },
  { id: 'revive', name: 'Rollback', line: 'Revive once per run', cost: [400] },
];

// ---------------------------------------------------------------- heroes

export interface HeroDef {
  id: string; name: string; line: string;
  tint: number | null; hat: number;             // hat frame, -1 = none
  weapons: ProductId[];                         // first one the theme features is the start weapon
  passive: PassiveId | null;
  unlock: string | null;                        // achievement id
}
export const HEROES: HeroDef[] = [
  { id: 'max', name: 'Max', line: 'Starts with your main product', tint: null, hat: -1, weapons: [], passive: null, unlock: null },
  { id: 'sprinter', name: 'Sprinter', line: 'Fast feet, replay orbs', tint: 0xa8d8f8, hat: 0,
    weapons: ['session_replay', 'experiments'], passive: 'speed', unlock: 'kills_2000' },
  { id: 'wizard', name: 'Wizard', line: 'Big area, pulses', tint: 0xd8b8f8, hat: 1,
    weapons: ['product_analytics', 'feature_flags'], passive: 'area', unlock: 'evolve' },
  { id: 'hacker', name: 'Hacker', line: 'Crits and homing bolts', tint: 0xb8f8b8, hat: 2,
    weapons: ['error_tracking', 'experiments'], passive: 'crit', unlock: 'heat2' },
];

// ---------------------------------------------------------------- achievements

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: 'First Squash', desc: 'Win a run' },
  { id: 'kills_2000', name: 'Exterminator', desc: 'Squash 2000 bugs in total (unlocks Sprinter)' },
  { id: 'evolve', name: 'Evolved', desc: 'Evolve a weapon (unlocks Wizard)' },
  { id: 'heat2', name: 'Feeling The Heat', desc: 'Win on heat 2 (unlocks Hacker)' },
  { id: 'level20', name: 'Senior Engineer', desc: 'Reach level 20 in one run' },
  { id: 'elites5', name: 'Elite Hunter', desc: 'Squash 5 elites in one run' },
  { id: 'hotfix', name: 'Hotfix Deployed', desc: 'Set off a hotfix bomb' },
  { id: 'full_stack', name: 'Full Stack', desc: 'Have 3 weapons at level 5' },
  { id: 'daily', name: 'Daily Standup', desc: 'Finish a daily run' },
  { id: 'endless10', name: 'On Call', desc: 'Survive 10:00 in endless' },
  { id: 'rich', name: 'Series A', desc: 'Earn 500 gold in total' },
  { id: 'heat5', name: 'Meltdown', desc: 'Win on heat 5' },
  { id: 'super', name: 'Full Stack Nova', desc: 'Fuse two evolved weapons', hidden: true },
];

// ---------------------------------------------------------------- arena hazards

/** Breakable crates (food, coins, pickups) and spreading tech-debt puddles that slow the hog. */
export const HAZARDS = {
  crateEvery: 22, crateFrom: 20, crateMax: 3,
  puddleEvery: 30, puddleFrom: 75, puddleMax: 4, puddleLife: 45, puddleGrow: 15, puddleR: 34, puddleSlow: 0.55,
};
