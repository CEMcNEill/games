// Which game to play this run: map type, seed and rival personality. The first run for a prospect is
// always the classic map from the prospect's name (what the kit has always shown); later runs rotate map
// types and personalities from name + run index, so they reproduce exactly; DAILY uses the shared daily seed.
import { K, meta } from '@shared/kit';
import { hash, MAP_ROTATION, MAP_TYPES } from './mapgen';
import { PERSONALITY_IDS } from './data';

export interface RunSetup { seed: number; map: string; personality: string; heat: number; daily: boolean; runIndex: number }

export function chooseSetup(over: Partial<RunSetup> = {}): RunSetup {
  const g = K.theme.game;
  const base = K.theme.prospect.name + g.biome;
  let runIndex = 0;
  try { runIndex = Math.max(0, Math.floor(Number(meta.data.runs) || 0)); } catch { runIndex = 0; }
  const heat = Math.max(0, Math.min(5, Math.floor(Number(K.run?.heat) || 0)));
  let s: RunSetup;
  if (K.run?.daily) {
    const seed = K.run.seed >>> 0;
    s = { seed, map: MAP_ROTATION[seed % MAP_ROTATION.length], personality: PERSONALITY_IDS[(seed >>> 8) % PERSONALITY_IDS.length], heat, daily: true, runIndex };
  } else if (runIndex === 0) {
    // First game: the classic map every prospect has always had, and the gentlest rival to read.
    s = { seed: hash(base), map: 'classic', personality: 'expander', heat, daily: false, runIndex };
  } else {
    const seed = hash(`${base}#${runIndex}`);
    s = { seed, map: MAP_ROTATION[(runIndex - 1) % MAP_ROTATION.length], personality: PERSONALITY_IDS[(runIndex + (seed >>> 5)) % PERSONALITY_IDS.length], heat, daily: false, runIndex };
  }
  s = { ...s, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) };
  if (!MAP_TYPES[s.map]) s.map = 'classic';
  if (!PERSONALITY_IDS.includes(s.personality)) s.personality = 'opportunist';
  return s;
}
