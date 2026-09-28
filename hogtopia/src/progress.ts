// Between-games progress: the S-D grade, the achievement table and the End-screen summary.
import { achieve, meta } from '@shared/meta';
import type { AchievementDef } from '@shared/meta';
import type { EndData } from '@shared/scenes';
import { World, Over } from './world';
import { MAX_TURNS, PERSONALITY_IDS } from './data';
import { MAP_ROTATION, MAP_TYPES } from './mapgen';
import type { RunSetup } from './setup';

/** Final score (with the domination speed bonus) to a letter. A loss tops out at C. */
export function grade(final: number, _w: World, over: Over) {
  const g = final >= 4200 ? 'S' : final >= 3300 ? 'A' : final >= 2400 ? 'B' : final >= 1500 ? 'C' : 'D';
  return over.won || g === 'D' ? g : g === 'S' || g === 'A' || g === 'B' ? 'C' : g;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: 'First Victory', desc: 'Win a game' },
  { id: 'domination', name: 'Capital Gains', desc: 'Win by taking the rival capital' },
  { id: 'blitz', name: 'Blitzscaling', desc: 'Win before turn 15' },
  { id: 'flawless', name: 'Zero Downtime', desc: 'Win without losing a unit' },
  { id: 'know_enemy', name: 'Know Your Enemy', desc: 'Beat all four rival personalities' },
  { id: 'world_tour', name: 'World Tour', desc: 'Win on four different map types' },
  { id: 'veteran', name: 'Battle Tested', desc: 'Promote a unit to veteran' },
  { id: 'giant', name: 'Big Friend', desc: 'Raise a Giant in a level 5 city' },
  { id: 'wonders', name: 'Wonder Hog', desc: 'Build 3 monuments in one game' },
  { id: 'grade_s', name: 'Straight S', desc: 'Earn an S grade' },
  { id: 'heat3', name: 'Feeling the Heat', desc: 'Win at HEAT 3 or more' },
  { id: 'heat5', name: 'Hottest Hog', desc: 'Win at HEAT 5', hidden: true },
  { id: 'daily', name: 'Daily Standup', desc: 'Win a daily map' },
];

export function checkAchievements(w: World, over: Over, s: RunSetup, run: { lostUnits: number }) {
  try {
    const won = over.won && over.reason !== 'debug';
    const kd = meta.kitData({ beaten: [] as string[], mapsWon: [] as string[], bestGrade: '' as string });
    if (!Array.isArray(kd.beaten)) kd.beaten = [];
    if (!Array.isArray(kd.mapsWon)) kd.mapsWon = [];
    if (w.units.some((u) => u.owner === 0 && u.vet)) achieve('veteran');
    if (w.units.some((u) => u.owner === 0 && u.type === 'giant')) achieve('giant');
    if (w.monuments.filter((m) => m.o === 0).length >= 3) achieve('wonders');
    if (!won) return;
    const g = grade(w.score(0) + over.bonus, w, over);
    const best = typeof kd.bestGrade === 'string' ? kd.bestGrade : '';
    if (!best || 'SABCD'.indexOf(g) < 'SABCD'.indexOf(best)) (kd as Record<string, unknown>).bestGrade = g;
    if (!kd.beaten.includes(w.f[1].persona.id)) kd.beaten.push(w.f[1].persona.id);
    if (!kd.mapsWon.includes(w.mapType)) kd.mapsWon.push(w.mapType);
    meta.save();
    achieve('first_win');
    if (over.reason === 'capital') achieve('domination');
    if (w.turn < 15) achieve('blitz');
    if (run.lostUnits === 0 && w.f[0].lost === 0) achieve('flawless');
    if (PERSONALITY_IDS.every((p) => kd.beaten.includes(p))) achieve('know_enemy');
    if (kd.mapsWon.length >= 4) achieve('world_tour');
    if (grade(w.score(0) + over.bonus, w, over) === 'S') achieve('grade_s');
    if (w.heat >= 3) achieve('heat3');
    if (w.heat >= 5) achieve('heat5');
    if (s.daily) achieve('daily');
  } catch (e) {
    console.warn('[hogtopia] achievements', e);
  }
}

/** Two extra End lines: the score breakdown and what to try next. */
export function endSummary(d: EndData): string[] {
  const p = (d.props ?? {}) as { breakdown?: Record<string, number>; turns?: number };
  const b = p.breakdown;
  if (!b) return [];
  const parts = [['city', b.cities], ['pop', b.pop], ['tech', b.techs], ['land', b.territory], ['war', b.kills + b.army], ['wonder', b.wonders], ['speed', b.speed]]
    .filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
  const lines = [parts.join('  ')];
  const top = meta.heatUnlocked();
  let beaten = 0, best = '';
  try {
    const kd = meta.kitData({ beaten: [] as string[], bestGrade: '' as string });
    beaten = Array.isArray(kd.beaten) ? kd.beaten.length : 0;
    best = typeof kd.bestGrade === 'string' ? kd.bestGrade : '';
  } catch { beaten = 0; }
  // The next NEXT-mode run's map (meta.data.runs already counts this run).
  let nextMap = 'a new map';
  try { const i = Math.max(1, meta.data.runs); nextMap = `${MAP_TYPES[MAP_ROTATION[(i - 1) % MAP_ROTATION.length]].name} map`; } catch { /* keep generic */ }
  const next = top > 0 ? `next: ${nextMap}, or HEAT ${top}` : `next: ${nextMap}, new rival`;
  lines.push(d.won ? `Rivals beaten ${beaten}/${PERSONALITY_IDS.length}${best ? ` - best grade ${best}` : ''} - ${next}` : 'Tip: gather 3 units before you attack a city');
  return lines;
}

export const turnsLeft = (w: World) => MAX_TURNS - w.turn;
