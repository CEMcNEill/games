// Hog Saga rules: party classes, PostHog-product skills, items, enemy archetypes and the fixed
// encounter table. All numbers live here; the theme only names and flavours things.
import { K } from '@shared/kit';
import products from '../../shared/products.json';

export type ClassId = 'hero' | 'analyst' | 'support';
export type SkillId = 'error_tracking' | 'experiments' | 'feature_flags' | 'web_analytics' | 'product_analytics'
  | 'data_warehouse' | 'session_replay' | 'surveys' | 'coffee_run';
export type Target = 'enemy' | 'enemies' | 'ally' | 'party';
export type ItemId = 'potion' | 'ether' | 'hotfix';
export type Arch = 'swarm' | 'fast' | 'brute' | 'tank' | 'caster';

export const DIFF = {
  easy: { hp: 0.72, dmg: 0.7 },
  normal: { hp: 1, dmg: 0.9 },
  hard: { hp: 1.2, dmg: 0.98 },
};

interface ClassDef {
  base: { hp: number; mp: number; atk: number; def: number; mag: number; spd: number };
  grow: { hp: number; mp: number; atk: number; def: number; mag: number; spd: number };
  learn: [number, SkillId][];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  hero: { base: { hp: 38, mp: 8, atk: 11, def: 7, mag: 4, spd: 9 }, grow: { hp: 8, mp: 2, atk: 3, def: 2, mag: 1, spd: 1 },
    learn: [[1, 'error_tracking'], [2, 'experiments'], [4, 'feature_flags']] },
  analyst: { base: { hp: 27, mp: 18, atk: 6, def: 4, mag: 12, spd: 10 }, grow: { hp: 5, mp: 4, atk: 1, def: 1, mag: 3, spd: 1 },
    learn: [[1, 'web_analytics'], [2, 'product_analytics'], [4, 'data_warehouse']] },
  support: { base: { hp: 31, mp: 16, atk: 7, def: 6, mag: 9, spd: 11 }, grow: { hp: 6, mp: 3, atk: 2, def: 2, mag: 2, spd: 1 },
    learn: [[1, 'session_replay'], [3, 'surveys'], [5, 'coffee_run']] },
};

export interface SkillDef { name: string; product: string | null; mp: number; target: Target; line: string; sfx: string }

export const SKILLS: Record<SkillId, SkillDef> = {
  error_tracking: { name: 'Error Tracking', product: 'error_tracking', mp: 3, target: 'enemy', line: 'Big hit; exposes its weak spot', sfx: 'crit' },
  experiments: { name: 'Experiments', product: 'experiments', mp: 4, target: 'enemies', line: 'A/B strike: two random hits', sfx: 'hit' },
  feature_flags: { name: 'Feature Flags', product: 'feature_flags', mp: 6, target: 'party', line: 'Shield: party takes half damage', sfx: 'shield' },
  web_analytics: { name: 'Web Analytics', product: 'web_analytics', mp: 3, target: 'enemy', line: 'Traffic spike on one foe', sfx: 'magic' },
  product_analytics: { name: 'Product Analytics', product: 'product_analytics', mp: 5, target: 'enemies', line: 'Chart blast hits every foe', sfx: 'magic' },
  data_warehouse: { name: 'Data Warehouse', product: 'data_warehouse', mp: 4, target: 'enemy', line: 'Query a foe; party regains MP', sfx: 'magic' },
  session_replay: { name: 'Session Replay', product: 'session_replay', mp: 4, target: 'ally', line: 'Rewind: heal or revive one ally', sfx: 'heal' },
  surveys: { name: 'Surveys', product: 'surveys', mp: 5, target: 'enemies', line: 'Foes weaken and get distracted', sfx: 'debuff' },
  coffee_run: { name: 'Coffee Run', product: null, mp: 9, target: 'party', line: 'Heal the whole party', sfx: 'heal' },
};

export const ITEMS: Record<ItemId, { name: string; line: string; target: Target }> = {
  potion: { name: 'Potion', line: 'Heal 60 HP', target: 'ally' },
  ether: { name: 'Ether', line: 'Restore 25 MP', target: 'ally' },
  hotfix: { name: 'Hotfix', line: 'Revive with half HP', target: 'ally' },
};

export const ARCH: Record<Arch, { hp: number; atk: number; def: number; mag: number; spd: number; xp: number }> = {
  swarm: { hp: 30, atk: 12, def: 3, mag: 4, spd: 8, xp: 6 },
  fast: { hp: 42, atk: 13, def: 5, mag: 5, spd: 15, xp: 9 },
  brute: { hp: 72, atk: 18, def: 6, mag: 4, spd: 6, xp: 13 },
  tank: { hp: 92, atk: 13, def: 12, mag: 5, spd: 5, xp: 14 },
  caster: { hp: 50, atk: 8, def: 5, mag: 15, spd: 10, xp: 13 },
};

/** The 8 map encounters in order (index = map marker digit - 1), then the boss (index 8). */
export const ENCOUNTERS: { tier: number; group: number[]; region: number }[] = [
  { tier: 1, group: [0], region: 0 },
  { tier: 2, group: [1, 0], region: 0 },
  { tier: 3, group: [2], region: 1 },
  { tier: 4, group: [2, 1], region: 1 },
  { tier: 5, group: [3, 0], region: 1 },
  { tier: 6, group: [3, 1], region: 2 },
  { tier: 7, group: [4, 4], region: 2 },
  { tier: 7.5, group: [4, 3, 2], region: 2 },
];
export const BOSS = 8;
/** Map gates and the encounters that open them. */
export const GATES: Record<string, number[]> = { G: [0, 1], g: [2, 3, 4], X: [5, 6, 7] };
/** Chest contents in map order (c markers top to bottom, left to right). */
export const CHESTS: (ItemId | 'relic')[] = ['potion', 'ether', 'hotfix', 'relic', 'potion'];

export const xpNext = (lv: number) => Math.round(12 * lv ** 1.55);

export interface Member {
  cls: ClassId; name: string; role: string; sprite: string;
  lv: number; xp: number; hp: number; mp: number;
  maxHp: number; maxMp: number; atk: number; def: number; mag: number; spd: number;
  skills: SkillId[];
}

function makeMember(cls: ClassId, name: string, role: string, sprite: string): Member {
  const b = CLASSES[cls].base;
  const m: Member = { cls, name, role, sprite, lv: 1, xp: 0, hp: b.hp, mp: b.mp, maxHp: b.hp, maxMp: b.mp,
    atk: b.atk, def: b.def, mag: b.mag, spd: b.spd, skills: [] };
  m.skills = CLASSES[cls].learn.filter(([l]) => l <= 1).map(([, s]) => s);
  return m;
}

/** Raise a member one level; returns the stat gains and any new skill. */
export function levelUp(m: Member): { gains: Record<string, number>; learned: SkillId | null } {
  const g = CLASSES[m.cls].grow;
  m.lv++;
  m.maxHp += g.hp; m.maxMp += g.mp; m.atk += g.atk; m.def += g.def; m.mag += g.mag; m.spd += g.spd;
  m.hp = Math.min(m.maxHp, m.hp + g.hp);
  m.mp = Math.min(m.maxMp, m.mp + g.mp);
  const learn = CLASSES[m.cls].learn.find(([l]) => l === m.lv);
  if (learn && !m.skills.includes(learn[1])) m.skills.push(learn[1]);
  return { gains: { HP: g.hp, MP: g.mp, ATK: g.atk, DEF: g.def, MAG: g.mag }, learned: learn ? learn[1] : null };
}

export const R = {
  party: [] as Member[],
  items: { potion: 3, ether: 1, hotfix: 1 } as Record<ItemId, number>,
  relic: false,
  cleared: new Set<number>(),
  chests: new Set<number>(),
  talked: new Set<number>(),
  kills: 0,
  battles: 0,
  rounds: 0,
  pos: { x: 0, y: 0 },
  diff: DIFF.normal,
  autopilot: false,
  speed: 1,
  god: false,
  over: false,
  started: false,
  log: [] as { enc: number; rounds: number; startHp: number; minHp: number; ko: number; lv: number }[],
};

/** Live numbers for playtests (window.__game.stats). */
export function publishStats(hooks: { stats: Record<string, unknown>; score: number }) {
  hooks.stats = {
    levels: R.party.map((m) => m.lv), hp: R.party.map((m) => `${m.hp}/${m.maxHp}`), mp: R.party.map((m) => `${m.mp}/${m.maxMp}`),
    cleared: [...R.cleared].sort((a, b) => a - b), chests: R.chests.size, kills: R.kills, rounds: R.rounds,
    items: { ...R.items }, relic: R.relic, pos: { ...R.pos }, battles: R.log,
  };
  hooks.score = score(R.cleared.has(8));
}

export function resetRun() {
  const g = K.theme.game;
  R.diff = DIFF[g.difficulty as keyof typeof DIFF] ?? DIFF.normal;
  R.party = [
    makeMember('hero', 'Hog', 'Hedgehog', 'hero'),
    makeMember('analyst', g.party[0].name, g.party[0].role, 'party_1'),
    makeMember('support', g.party[1].name, g.party[1].role, 'party_2'),
  ];
  R.items = { potion: 3, ether: 1, hotfix: 1 };
  R.relic = false;
  R.cleared = new Set();
  R.chests = new Set();
  R.talked = new Set();
  R.kills = 0;
  R.battles = 0;
  R.rounds = 0;
  R.over = false;
  R.started = false;
  R.log = [];
}

/** Effective stats including the relic bonus. */
export const stat = (m: Member, k: 'atk' | 'def' | 'mag') => m[k] + (R.relic ? (k === 'def' ? 2 : 3) : 0);

export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;

/** The product the relic chest holds: the prospect's top product. */
export const relicName = () => `${productName(K.theme.products[0])} Badge`;

export function skillLine(id: SkillId) {
  const s = SKILLS[id];
  return (s.product && K.theme.game.product_lines?.[s.product]) || s.line;
}

/** Skills for products the prospect cares about get a star in menus. */
export const featured = (id: SkillId) => !!SKILLS[id].product && (K.theme.products as string[]).includes(SKILLS[id].product!);

export const theName = (n: string) => (/^the\s/i.test(n) ? `the ${n.slice(4)}` : `the ${n}`);

export function score(won: boolean) {
  const lv = R.party.reduce((a, m) => a + m.lv, 0);
  return R.kills * 60 + lv * 120 + R.chests.size * 150 + (won ? 4000 : 0) + Math.max(0, 1500 - R.rounds * 15);
}

export function endData(won: boolean) {
  return {
    won,
    score: score(won),
    headline: won ? 'QUEST COMPLETE!' : 'PARTY DEFEATED',
    stats: [
      ['Monsters beaten', R.kills],
      ['Party level', R.party.map((m) => m.lv).join(' / ')],
      ['Chests found', `${R.chests.size}/${CHESTS.length}`],
      ['Battle rounds', R.rounds],
    ] as [string, string | number][],
    props: { kills: R.kills, level: R.party[0]?.lv, chests: R.chests.size, rounds: R.rounds },
  };
}
