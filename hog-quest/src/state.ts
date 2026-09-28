// Run state shared by the Explore and Battle scenes, plus difficulty and product helpers.
import { K } from '@shared/kit';
import products from '../../shared/products.json';

export const DIFF = {
  easy: { hp: 30, bulletSpeed: 0.75, density: 0.7, dmg: 3, fight: 1.3 },
  normal: { hp: 24, bulletSpeed: 1, density: 1, dmg: 4, fight: 1 },
  hard: { hp: 20, bulletSpeed: 1.2, density: 1.2, dmg: 5, fight: 0.9 },
};
export type Diff = (typeof DIFF)['normal'];

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
};

export function resetRun() {
  R.diff = DIFF[K.theme.game.difficulty as keyof typeof DIFF] ?? DIFF.normal;
  R.hp = R.maxHp = R.diff.hp;
  R.cleared = new Set();
  R.spared = 0;
  R.debugged = 0;
  R.met = new Set();
  R.over = false;
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

export function endData(won: boolean) {
  const npcs = K.theme.game.npcs.length;
  return {
    won,
    score: score(won),
    headline: won ? (R.debugged === 0 ? 'ALL SOLVED!' : 'QUEST COMPLETE!') : 'STAY DETERMINED',
    stats: [
      ['Problems spared', `${R.spared}/4`],
      ['Debugged the hard way', R.debugged],
      ['Team members met', `${R.met.size}/${npcs}`],
    ] as [string, string | number][],
    props: { spared: R.spared, debugged: R.debugged, met: R.met.size },
  };
}
