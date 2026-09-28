// Enemy turn choreography: instead of a random pattern per turn, every enemy runs a short script
// that escalates. Theme patterns are the enemy's "voice"; each enemy slot also teaches one fixed
// rule (gems, blue bullets, gravity), and the boss has three phases with a signature pattern each.
import { PATTERNS } from './patterns';

export interface Step {
  pats: string[];   // emitters that run together
  busy: number;     // density multiplier
}

/** The rule each enemy slot teaches, in the order the player meets them. */
export const LESSONS = ['gems', 'stoplight', 'gravity'];
/** Boss signature per phase. */
export const BOSS_SIGNATURE = ['laser', 'burst', 'squeeze'];

const known = (ps: unknown): string[] => (Array.isArray(ps) ? ps : []).filter((p) => typeof p === 'string' && PATTERNS[p]);

export function enemySteps(enc: number, themePats: unknown): Step[] {
  const p = known(themePats);
  const lesson = LESSONS[enc % LESSONS.length];
  const a = p[0] ?? 'rain', b = p[1] ?? a, c = p[2] ?? b;
  return [
    { pats: [a], busy: 0.85 },
    { pats: [lesson], busy: 1 },
    { pats: [b], busy: 1.1 },
    { pats: lesson === 'gravity' || lesson === 'stoplight' ? [lesson] : [c, lesson], busy: lesson === 'gravity' || lesson === 'stoplight' ? 1.25 : 0.7 },
  ];
}

/** Turn n of an enemy script: the first 4 steps in order, then steps 2-4 on repeat, a little busier. */
export function enemyStep(steps: Step[], n: number): Step {
  if (n < steps.length) return steps[n];
  const loop = steps.slice(1);
  const s = loop[(n - steps.length) % loop.length];
  return { pats: s.pats, busy: s.busy * 1.1 };
}

/** Boss turn: alternate its own patterns with the phase signature; the bugfix boss always combines. */
export function bossStep(themePats: unknown, phase: number, n: number, hell: boolean): Step {
  const p = known(themePats);
  const own = p.length ? p[n % p.length] : 'spiral';
  const sig = BOSS_SIGNATURE[Math.max(0, Math.min(2, phase))];
  if (hell) return { pats: [sig, own], busy: 0.95 + phase * 0.1 };
  if (n % 2 === 0) return { pats: [sig], busy: 1 + phase * 0.1 };
  return phase >= 2 ? { pats: [own, 'rain'], busy: 0.7 } : { pats: [own], busy: 1 + phase * 0.1 };
}
