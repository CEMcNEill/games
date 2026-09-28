// Hog Quest's slice of the between-runs save (meta.kitData): endings found, secrets found, boss rush
// best time, and a few counters the NPCs remember. Every access is guarded: storage that is blocked,
// empty or hand-edited reads as a first run.
import { meta } from '@shared/meta';

export const ENDINGS = ['pacifist', 'neutral', 'bugfix'] as const;
export type Ending = (typeof ENDINGS)[number];

export interface HQSave {
  endings: string[];     // ending ids seen
  secrets: string[];     // secret ids ever found
  rushBest: number;      // boss rush best time in seconds (0 = none)
  lastEnding: string;    // '' before the first finished run
  lastLost: boolean;     // the previous run ended in a loss
  visits: number;        // runs started (NPCs notice returning players)
}

const DEFAULTS: HQSave = { endings: [], secrets: [], rushBest: 0, lastEnding: '', lastLost: false, visits: 0 };

const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max) : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** A clean copy of the save (never throws). */
export function hq(): HQSave {
  try {
    const k = meta.kitData({}) as Record<string, unknown>;
    return {
      endings: strs(k.endings, 10),
      secrets: strs(k.secrets, 40),
      rushBest: num(k.rushBest),
      lastEnding: typeof k.lastEnding === 'string' ? k.lastEnding : '',
      lastLost: k.lastLost === true,
      visits: Math.floor(num(k.visits)),
    };
  } catch {
    return { ...DEFAULTS, endings: [], secrets: [] };
  }
}

/** Merge a patch into the save and write it. */
export function patchHq(p: Partial<HQSave>) {
  try {
    const k = meta.kitData({}) as Record<string, unknown>;
    Object.assign(k, hq(), p);
    meta.save();
  } catch { /* storage problems never break a run */ }
}

export function addEnding(e: Ending) {
  const s = hq();
  if (!s.endings.includes(e)) s.endings.push(e);
  patchHq({ endings: s.endings, lastEnding: e, lastLost: false });
}

export function addSecret(id: string) {
  const s = hq();
  if (!s.secrets.includes(id)) patchHq({ secrets: [...s.secrets, id] });
}
