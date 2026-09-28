// Hogtopia content tables: units, techs, city level-up rewards, rival personalities, difficulty and heat.
// Everything here is fixed kit content (plain ASCII, no company names); themes only rename things.
export const MAX_TURNS = 24;

export type Terrain = 'plain' | 'forest' | 'mountain' | 'water';
export type Res = 'data' | 'fruit' | 'fish' | null;
export type UnitType = 'scout' | 'warrior' | 'archer' | 'defender' | 'catcher' | 'catapult' | 'giant';

export interface UnitDef { cost: number; hp: number; atk: number; def: number; move: number; range: number; vision: number; tech: string | null; splash?: number }
export const UNITS: Record<UnitType, UnitDef> = {
  scout: { cost: 2, hp: 10, atk: 1, def: 1, move: 2, range: 1, vision: 2, tech: null },
  warrior: { cost: 2, hp: 10, atk: 2, def: 2, move: 1, range: 1, vision: 1, tech: null },
  archer: { cost: 3, hp: 10, atk: 2, def: 1, move: 1, range: 2, vision: 2, tech: 'product_analytics' },
  defender: { cost: 3, hp: 15, atk: 1, def: 3, move: 1, range: 1, vision: 1, tech: 'feature_flags' },
  catcher: { cost: 5, hp: 12, atk: 3, def: 2, move: 2, range: 1, vision: 1, tech: 'error_tracking', splash: 2 },
  // Siege: long range, paper thin. Unlocked by Funnels (tier 2 of Product Analytics).
  catapult: { cost: 6, hp: 8, atk: 4, def: 1, move: 1, range: 3, vision: 1, tech: 'funnels' },
  // Only from a level-5 city reward; never trained.
  giant: { cost: 99, hp: 30, atk: 4, def: 3, move: 1, range: 1, vision: 2, tech: 'never' },
};
/** Trainable units in menu order (frame index in the units sheet = this order; giant has its own art). */
export const UNIT_ORDER: UnitType[] = ['scout', 'warrior', 'archer', 'defender', 'catcher'];
/** Everything the train menu offers (catapult and giant art live in the fixed `extra` sheet). */
export const TRAINABLE: UnitType[] = [...UNIT_ORDER, 'catapult'];
export const VET_KILLS = 3;
export const VET_HP = 5;

export interface TechDef { tier: 0 | 1 | 2; name?: string; requires?: string; effect: string }
/** Tier 1 = the PostHog products (the theme picks which), tier 2 = a feature of that product,
 *  tier 0 = generic base techs everyone can research. Every tech changes something you can see. */
export const TECHS: Record<string, TechDef> = {
  roads: { tier: 0, name: 'Roads', effect: 'Units move 1 further inside your borders.' },
  climbing: { tier: 0, name: 'Climbing', effect: 'Units can climb mountains: +50% defence there.' },
  forestry: { tier: 0, name: 'Forestry', effect: 'Forests no longer stop your units moving.' },
  sailing: { tier: 0, name: 'Sailing', effect: 'Units can cross water as boats.' },
  product_analytics: { tier: 1, effect: 'Reveals the whole map. Unlocks ranged units.' },
  session_replay: { tier: 1, effect: 'U: rewind a unit\'s move once a turn. Units heal more.' },
  feature_flags: { tier: 1, effect: 'Unlocks shield units. Your cities defend twice as well.' },
  experiments: { tier: 1, effect: 'Harvests grow cities twice as fast.' },
  error_tracking: { tier: 1, effect: 'Unlocks catchers: attacks also hit nearby enemies.' },
  surveys: { tier: 1, effect: 'Capture neutral villages the turn you arrive.' },
  data_warehouse: { tier: 1, effect: '+2 stars every turn.' },
  funnels: { tier: 2, name: 'Funnels', requires: 'product_analytics', effect: 'Ranged units +1 attack. Unlocks catapults.' },
  heatmaps: { tier: 2, name: 'Heatmaps', requires: 'session_replay', effect: 'Units see 1 further. Red marks show rival reach.' },
  rollouts: { tier: 2, name: 'Rollouts', requires: 'feature_flags', effect: 'Shield units get +5 HP and move 2.' },
  multivariate: { tier: 2, name: 'Multivariate', requires: 'experiments', effect: 'Investing is 3 stars cheaper and gives 2 pop.' },
  alerts: { tier: 2, name: 'Alerts', requires: 'error_tracking', effect: 'Catchers get +1 attack and splash 3.' },
  nps: { tier: 2, name: 'NPS', requires: 'surveys', effect: 'Villages you capture start at level 2.' },
  pipelines: { tier: 2, name: 'Pipelines', requires: 'data_warehouse', effect: '+1 star per city every turn.' },
};
export const BASE_TECHS = ['roads', 'forestry', 'climbing', 'sailing'];
export const TIER2: Record<string, string> = Object.fromEntries(Object.entries(TECHS).filter(([, t]) => t.requires).map(([id, t]) => [t.requires!, id]));
export const TECH_COST = [4, 5, 8];
/** Autopilot research order (the rival has no tech tree). */
export const TECH_PRIORITY = ['data_warehouse', 'experiments', 'product_analytics', 'feature_flags', 'roads', 'error_tracking', 'pipelines',
  'multivariate', 'surveys', 'funnels', 'forestry', 'rollouts', 'alerts', 'climbing', 'nps', 'session_replay', 'heatmaps', 'sailing'];
/** The rival learns base techs by turn instead of researching. */
export const RIVAL_TECHS: [string, number][] = [['roads', 7], ['forestry', 10], ['climbing', 12], ['sailing', 14]];

// ---------------------------------------------------------------- city level-up rewards (Polytopia)
export interface Reward { id: string; name: string; desc: string }
export const LEVEL_REWARDS: Record<number, [Reward, Reward]> = {
  2: [{ id: 'workshop', name: 'Workshop', desc: '+1 star every turn' }, { id: 'explorer', name: 'Explorer', desc: 'A free scout' }],
  3: [{ id: 'wall', name: 'City Wall', desc: 'Units here defend x2' }, { id: 'stockpile', name: 'Stockpile', desc: '+6 stars now' }],
  4: [{ id: 'borders', name: 'Border Growth', desc: 'Bigger land, new resources' }, { id: 'growth', name: 'Pop Boom', desc: '+3 pop' }],
  5: [{ id: 'park', name: 'Park', desc: '+250 score' }, { id: 'giant', name: 'Giant', desc: 'A free super unit' }],
};

// ---------------------------------------------------------------- rival personalities
export interface Personality {
  id: string; name: string;
  aggroTurn: number;   // first turn it goes after enemy cities
  mass: number;        // units gathered before an assault
  expand: number;      // weight on neutral villages
  garrison: number;    // 0 = only when threatened, 1 = keep the capital manned from turn 6
  risk: number;        // attack threshold: lower = takes worse trades
  retreat: number;     // HP fraction to pull back and heal
  invest: number;      // spare stars to cities (vs units)
  terrain: number;     // weight on forests/hills when moving
  army: UnitType[];    // training preferences (first unlocked + affordable wins)
  rewards: string[];   // preferred level-up rewards
  lines: string[];     // fixed taunts mixed with the theme's
}
export const PERSONALITIES: Record<string, Personality> = {
  aggressor: { id: 'aggressor', name: 'Aggressor', aggroTurn: 5, mass: 3, expand: 0.8, garrison: 0, risk: -2, retreat: 0.25, invest: 0.5, terrain: 0.5,
    army: ['catcher', 'warrior', 'archer', 'warrior', 'catapult'], rewards: ['explorer', 'stockpile', 'growth', 'giant'],
    lines: ['Charge! Every city will be mine.', 'Your borders look soft today.', 'I brought friends. Lots of friends.'] },
  expander: { id: 'expander', name: 'Expander', aggroTurn: 11, mass: 4, expand: 2, garrison: 0, risk: 0, retreat: 0.35, invest: 1.3, terrain: 0.7,
    army: ['archer', 'warrior', 'catcher', 'defender'], rewards: ['workshop', 'stockpile', 'borders', 'park'],
    lines: ['So much empty land. All mine.', 'Growth is my middle name.', 'Every village joins me in the end.'] },
  turtle: { id: 'turtle', name: 'Turtle', aggroTurn: 14, mass: 5, expand: 1, garrison: 1, risk: 1, retreat: 0.5, invest: 1, terrain: 1.5,
    army: ['defender', 'archer', 'warrior', 'catcher'], rewards: ['workshop', 'wall', 'borders', 'giant'],
    lines: ['My walls have walls.', 'Come and try it. I will wait.', 'Slow and steady wins.'] },
  opportunist: { id: 'opportunist', name: 'Opportunist', aggroTurn: 8, mass: 3, expand: 1.2, garrison: 0, risk: -1, retreat: 0.4, invest: 0.9, terrain: 1,
    army: ['archer', 'catcher', 'catapult', 'warrior', 'scout'], rewards: ['workshop', 'stockpile', 'growth', 'giant'],
    lines: ['A hurt unit? How lucky for me.', 'I only pick fights I can win.', 'You left a gap. I noticed.'] },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES);
/** Your autopilot: balanced, a bit bolder than the rival. */
export const AUTOPILOT: Personality = { id: 'auto', name: 'Autopilot', aggroTurn: 7, mass: 3, expand: 1.5, garrison: 0, risk: -1, retreat: 0.35, invest: 1,
  terrain: 1, army: ['catcher', 'archer', 'catapult', 'warrior', 'defender'], rewards: ['workshop', 'stockpile', 'borders', 'giant'], lines: [] };

// ---------------------------------------------------------------- difficulty + heat
export interface Diff { rivalStars: number; rivalIncome: number; growth: number; rivalUnlock: number; aggro: number; mass: number; risk: number; extraUnit: boolean }
export const DIFF: Record<string, Diff> = {
  easy: { rivalStars: 3, rivalIncome: -2, growth: 0, rivalUnlock: 3, aggro: 5, mass: 1, risk: 2, extraUnit: false },
  normal: { rivalStars: 6, rivalIncome: 5, growth: 0.35, rivalUnlock: 0, aggro: 0, mass: 0, risk: 0, extraUnit: false },
  hard: { rivalStars: 10, rivalIncome: 5, growth: 0.62, rivalUnlock: -2, aggro: -2, mass: 0, risk: -1, extraUnit: true },
};
/** The first game keeps the original kit's rival economy (depth comes from later runs, not a harder first game). */
export const FIRST_GAME: Record<string, Partial<Diff>> = {
  easy: { rivalIncome: -3, aggro: 8, mass: 2 },
  normal: { rivalIncome: -3, growth: 0.1, aggro: 6, mass: 2, risk: 2 },
  hard: { rivalIncome: -3, growth: 0.1, aggro: 5, mass: 1, risk: 1 },
};
/** HEAT n: rival bonus stars, earlier units, sharper AI, a second rival at 4+, fewer ruins. */
export const HEAT = [
  { stars: 0, income: 0, unlock: 0, aggro: 0, ruins: 2, rival2: false },
  { stars: 2, income: 0, unlock: -1, aggro: -1, ruins: 2, rival2: false },
  { stars: 3, income: 1, unlock: -2, aggro: -2, ruins: 1, rival2: false },
  { stars: 5, income: 1, unlock: -3, aggro: -3, ruins: 1, rival2: false },
  { stars: 5, income: 1, unlock: -3, aggro: -3, ruins: 1, rival2: true },
  { stars: 7, income: 2, unlock: -4, aggro: -4, ruins: 0, rival2: true },
];

// ---------------------------------------------------------------- monuments (in-game achievements)
export interface MonumentDef { id: string; name: string; desc: string }
export const MONUMENTS: MonumentDef[] = [
  { id: 'explorer', name: 'Tower of Insight', desc: 'See the whole map' },
  { id: 'metro', name: 'Grand Plaza', desc: '3 cities at level 3' },
  { id: 'warlord', name: 'Hall of Wins', desc: 'Win 10 battles' },
  { id: 'scholar', name: 'Data Library', desc: 'Research 6 techs' },
];
export const MONUMENT_SCORE = 150;
export const PARK_SCORE = 250;
