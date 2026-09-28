// ACT puzzles: every enemy offers CHECK plus three verbs from a fixed table, and wants a hidden
// sequence of them. The sequence is seeded from the enemy's name, so one prospect's game always
// has the same puzzles (knowledge carries between runs). CHECK spells out the hint.
import { hash32, rng } from '@shared/meta';

export interface Verb {
  id: string;
  label: string;   // menu label, <= 10 chars
  want: string;    // CHECK hint fragment: "It {want}"
  wrong: string;   // shown when used at the wrong moment ({name} = enemy)
}

export const VERBS: Verb[] = [
  { id: 'listen', label: 'LISTEN', want: 'wants to be heard', wrong: 'You nod along. {name} was not talking. It feels ignored.' },
  { id: 'ask', label: 'ASK', want: 'wants a good question', wrong: 'You ask if it tried turning it off and on again. {name} bristles.' },
  { id: 'joke', label: 'JOKE', want: 'could use a laugh', wrong: 'You tell a joke about UDP. {name} did not get it.' },
  { id: 'demo', label: 'DEMO', want: 'wants to see it working', wrong: 'You start a demo. The wifi drops. {name} sighs loudly.' },
  { id: 'praise', label: 'PRAISE', want: 'wants some credit', wrong: 'Your praise sounds sarcastic somehow. {name} scowls.' },
  { id: 'coffee', label: 'COFFEE', want: 'needs a coffee', wrong: 'You offer a coffee. {name} is already jittery. Bad idea.' },
  { id: 'sketch', label: 'SKETCH', want: 'thinks in diagrams', wrong: 'You draw boxes and arrows. {name} finds a typo in them.' },
  { id: 'wait', label: 'WAIT', want: 'needs a quiet moment', wrong: 'You wait. {name} takes the silence as a challenge.' },
];

export interface Puzzle {
  verbs: Verb[];     // the three offered verbs, in menu order
  seq: string[];     // verb ids in the order the enemy wants them
}

/** Seeded per enemy name; `steps` is 2 for enemies, 3 for the boss (and on high heat). */
export function makePuzzle(name: string, steps: number, salt = 0): Puzzle {
  const r = rng(hash32(`hq:${name}:${salt}`));
  const verbs = r.shuffle([...VERBS]).slice(0, 3);
  const seq = r.shuffle(verbs.map((v) => v.id)).slice(0, Math.max(1, Math.min(3, steps)));
  return { verbs, seq };
}

/** "It wants to be heard first, then could use a laugh." */
export function hint(p: Puzzle): string {
  const w = p.seq.map((id) => VERBS.find((v) => v.id === id)!.want);
  if (w.length === 1) return `It ${w[0]}.`;
  if (w.length === 2) return `It ${w[0]} first, then ${w[1]}.`;
  return `It ${w[0]} first, then ${w[1]}, and last it ${w[2]}.`;
}

/** "wants to be heard" for a verb id. */
export const wantOf = (id: string | undefined) => VERBS.find((v) => v.id === id)?.want ?? 'wants something';

export const verbLabel = (id: string) => VERBS.find((v) => v.id === id)?.label ?? id.toUpperCase();
