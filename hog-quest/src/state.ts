// Run state shared by the Explore and Battle scenes, plus difficulty and product helpers.
import { K } from '@shared/kit';
import products from '../../shared/products.json';
import type { Ending } from './save';

export const DIFF = {
  easy: { hp: 30, bulletSpeed: 0.75, density: 0.7, dmg: 3, fight: 1.3 },
  normal: { hp: 24, bulletSpeed: 1, density: 1, dmg: 4, fight: 1 },
  hard: { hp: 20, bulletSpeed: 1.2, density: 1.2, dmg: 5, fight: 0.9 },
};
export type Diff = (typeof DIFF)['normal'];

/** Heat 0-5 ("crunch time"): less HP, denser choreography, fewer free heals, stricter mercy. */
export const HEAT = [
  { hpLoss: 0, dens: 1, speed: 1, extraStep: 0, heal: 1, solve: 100 },
  { hpLoss: 2, dens: 1.08, speed: 1.03, extraStep: 0, heal: 0.5, solve: 100 },
  { hpLoss: 4, dens: 1.16, speed: 1.06, extraStep: 1, heal: 0.5, solve: 100 },
  { hpLoss: 6, dens: 1.24, speed: 1.09, extraStep: 1, heal: 0, solve: 100 },
  { hpLoss: 8, dens: 1.32, speed: 1.12, extraStep: 1, heal: 0, solve: 60 },
  { hpLoss: 10, dens: 1.4, speed: 1.15, extraStep: 1, heal: 0, solve: 60 },
];
export const heat = () => HEAT[Math.max(0, Math.min(5, R.heat))];

export interface EncDef {
  name: string; pain: string; intro: string; talk: string[]; solved_by: string; solve_line: string;
  patterns: string[]; taunt?: string;
}

export const R = {
  hp: 24,
  maxHp: 24,
  cleared: new Set<number>(),   // encounter indices 0-2 enemies, 3 boss
  spared: 0,
  debugged: 0,
  met: new Set<number>(),
  autopilot: false,
  speed: 1,
  god: false,
  diff: DIFF.normal as Diff,
  over: false,
  showcase: false, // next battle opens straight into a long, busy enemy turn (GIF capture)
  flood: false,  // debug.flood(): showcase turns are the densest possible, and loop
  showPattern: '' as string, // debug.pattern(): the showcase turn uses this pattern
  outcomes: {} as Record<number, 'spared' | 'debugged'>,
  forceRoute: '' as '' | 'bugfix' | 'pacifist', // debug.route(): the autopilot follows it
  hits: 0,       // times the soul was hit this run
  grazes: 0,
  crits: 0,
  productUses: 0,
  wrongActs: 0,
  solvedBy: 0,   // enemies fixed with their solved_by product
  gems: 0,
  battleHits: [] as number[], // hits per finished battle
  ending: '' as '' | Ending,
  heat: 0,
  rushTime: 0,     // boss rush: seconds so far
  secretsFound: 0, // secrets found this run
};

export function resetRun() {
  R.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
  R.heat = Math.max(0, Math.min(5, Math.floor(Number(K.run?.heat) || 0)));
  R.hp = R.maxHp = R.diff.hp - heat().hpLoss;
  R.cleared = new Set();
  R.spared = 0;
  R.debugged = 0;
  R.met = new Set();
  R.over = false;
  R.outcomes = {};
  R.hits = R.grazes = R.crits = R.productUses = R.wrongActs = R.solvedBy = R.gems = 0;
  R.battleHits = [];
  R.ending = '';
  R.rushTime = 0;
  R.secretsFound = 0;
}

/** How the three regular enemies were handled so far. */
export function route(): 'pacifist' | 'bugfix' | 'neutral' {
  const o = [0, 1, 2].map((i) => R.outcomes[i]);
  if (o.every((x) => x === 'debugged')) return 'bugfix';
  if (o.every((x) => x === 'spared')) return 'pacifist';
  return 'neutral';
}

export const BOSS = 3;

export function encDef(i: number): EncDef {
  const g = K.theme.game;
  return i === BOSS ? g.boss : g.enemies[i] ?? g.enemies[0];
}

export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;

export function score(won: boolean) {
  return R.spared * 1000 + R.debugged * 400 + R.met.size * 150 + Math.max(0, Math.round(R.hp)) * 20 + (won ? 2000 : 0);
}

/** Which ending the finished boss fight leads to. */
export function endingFor(bossHow: 'spared' | 'debugged'): Ending {
  const r = route();
  if (r === 'pacifist' && bossHow === 'spared') return 'pacifist';
  if (r === 'bugfix' && bossHow === 'debugged') return 'bugfix';
  return 'neutral';
}

/** The ending narration: the route's optional theme text, else the theme's ending. */
export function endingPages(e: Ending): string[] {
  const g = K.theme.game;
  const alt = e === 'pacifist' ? g.ending_pacifist : e === 'bugfix' ? g.ending_bugfix : null;
  const ok = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
  return ok(alt) ? alt : ok(g.ending) ? g.ending : ['The office is quiet at last.'];
}

const HEADLINES: Record<Ending, string> = { pacifist: 'ALL SPARED!', neutral: 'QUEST COMPLETE!', bugfix: 'BUGS SQUASHED' };

export function endData(won: boolean) {
  const npcs = K.theme.game.npcs.length;
  const ending: Ending = R.ending || (R.spared >= 4 ? 'pacifist' : R.debugged >= 4 ? 'bugfix' : 'neutral');
  return {
    won,
    score: score(won),
    headline: won ? HEADLINES[ending] : 'STAY DETERMINED',
    stats: [
      ['Problems spared', `${R.spared}/4`],
      ['Debugged the hard way', R.debugged],
      ['Team members met', `${R.met.size}/${npcs}`],
    ] as [string, string | number][],
    props: { spared: R.spared, debugged: R.debugged, met: R.met.size, ending: won ? ending : '', hits: R.hits, grazes: R.grazes },
  };
}
