// Things off the main road: chest contents (with the seeded NG+ remix), secrets, the side quest and
// the optional superboss's words. Fixed kit text; nothing here names a real company.
import { K } from '@shared/kit';
import { rng } from '@shared/meta';
import { R, CHESTS } from './state';
import { RARE_POOL, TOP_POOL } from './gear';

/** Secrets counted on the HUD. */
export const SECRETS = ['grove', 'vault', 'quest', 'wyrm'] as const;
export type SecretId = typeof SECRETS[number];
export const SECRET_TEXT: Record<SecretId, string> = {
  grove: 'A hidden grove behind a fake tree!',
  vault: 'A cracked wall hides an old server room!',
  quest: 'Side quest complete!',
  wyrm: 'The Tech Debt Wyrm is paid off!',
};

export const QUEST = {
  npc: 'Old Dev',
  item: 'Lucky Keyboard',
  ask: 'I dropped my Lucky Keyboard somewhere in the north woods. Bring it back and I will make it worth your while!',
  waiting: 'Still no keyboard? Try the north woods, past the river.',
  thanks: 'My Lucky Keyboard! Here, take my old Coffee Mug and some gold. It never runs dry.',
  after: 'Back to shipping. Watch out for the Tech Debt Wyrm down by the desert lake!',
  found: 'Found the Lucky Keyboard! The Old Dev in town will want this back.',
  reward: { gear: 'coffee_mug', gold: 60 },
};

export const WYRM_LINES = {
  warn: 'The Tech Debt Wyrm blocks nothing but your peace of mind. It looks VERY strong. Walk into it again to fight.',
  reward: { gear: 'big_data_staff', gold: 150 },
};

/** This run's chest contents: fixed on a first run, remixed with the run seed on New Game+. */
export function chestContents(): string[][] {
  const out = CHESTS.map((c) => [...c]);
  if (R.ng <= 0) return out;
  const r = rng((K.run?.seed ?? 1) ^ 0x5a6a);
  const rare = r.shuffle([...RARE_POOL]);
  for (const i of [0, 1, 2, 4, 5]) out[i] = [out[i][0], rare[i % rare.length]];
  out[6] = [r.pick(TOP_POOL), 'hotfix'];
  return out;
}
