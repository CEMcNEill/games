// Between-runs progress: achievements, the NG+ save on a win, the title menu rows and End lines.
import { K, meta, achieve, heatRow, TitleRow } from '@shared/kit';
import type { AchievementDef } from '@shared/meta';
import { hooks } from '@shared/hooks';
import { R, BOSS, levelUp, freshParty } from './state';
import { autoEquip } from './gear';
import { saga, saveWin, addBreaks, markWyrm, ngReady } from './save';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: 'Shipped It', desc: 'Beat the boss' },
  { id: 'scan', name: 'Know Thy Bug', desc: 'Scan an enemy' },
  { id: 'break1', name: 'Breaking Change', desc: 'Break an enemy' },
  { id: 'break10', name: 'Break Point', desc: 'Break 10 enemies (all runs)' },
  { id: 'combo', name: 'Pair Programming', desc: 'Use a Ship It combo' },
  { id: 'all_chests', name: 'Treasure Hunter', desc: 'Open every chest in one run' },
  { id: 'secret', name: 'Off The Roadmap', desc: 'Find a secret spot' },
  { id: 'quest', name: 'Lost And Found', desc: 'Finish the side quest' },
  { id: 'wyrm', name: 'Debt Paid', desc: 'Beat the Tech Debt Wyrm', hidden: true },
  { id: 'low_level', name: 'Lean Team', desc: 'Win at LV 4 or lower' },
  { id: 'no_items', name: 'No Crutches', desc: 'Win the No Items challenge' },
  { id: 'solo', name: 'Solo Founder', desc: 'Win the Solo challenge' },
  { id: 'heat3', name: 'Under Pressure', desc: 'Win at heat 3 or higher' },
  { id: 'ngplus', name: 'Sequel', desc: 'Win a New Game+' },
];

/** Title rows: MODE (new, NG+, challenges; locked until the first win) and HEAT. */
export function titleMenu(): TitleRow[] {
  const won = meta.data.wins > 0;
  const rows: TitleRow[] = [{ key: 'mode', label: 'MODE', choices: [
    { label: 'NEW GAME', value: 'standard' },
    { label: 'NEW GAME+', value: 'ngplus', locked: !ngReady() },
    { label: 'SOLO HOG', value: 'solo', locked: !won },
    { label: 'NO ITEMS', value: 'noitems', locked: !won },
    { label: 'SPEEDRUN', value: 'speedrun', locked: !won },
  ] }];
  if (won) rows.push(heatRow(5));
  return rows;
}

export function onBattleEnd(enc: number, breaks: number) {
  addBreaks(breaks);
  if (breaks > 0) achieve('break1');
  if (saga().totalBreaks >= 10) achieve('break10');
  if (R.scans > 0) achieve('scan');
  if (R.combos > 0) achieve('combo');
  if (enc === 9) { markWyrm(); achieve('wyrm'); }
  void enc === BOSS;
}

export function onWin() {
  saveWin(R.party, R.ng, hooks.elapsed, R.mode === 'speedrun');
  achieve('first_win');
  if (Math.max(...R.party.map((m) => m.lv)) <= 4) achieve('low_level');
  if (R.mode === 'noitems') achieve('no_items');
  if (R.mode === 'solo') achieve('solo');
  if (R.heat >= 3) achieve('heat3');
  if (R.mode === 'ngplus') achieve('ngplus');
}

/** Extra End screen lines. */
export function endSummary(): string[] {
  const out: string[] = [];
  const tags = [R.mode === 'ngplus' ? `NG+${R.ng > 1 ? R.ng : ''}` : '', R.mode === 'solo' ? 'SOLO' : '', R.mode === 'noitems' ? 'NO ITEMS' : '',
    R.mode === 'speedrun' ? 'SPEEDRUN' : '', R.heat ? `HEAT ${R.heat}` : ''].filter(Boolean);
  if (tags.length) out.push(tags.join('  '));
  out.push(`BREAKS ${R.breaks}   COMBOS ${R.combos}   GOLD ${R.gold}`);
  const s = saga();
  if (R.mode === 'speedrun' && s.bestTimeS) out.push(`BEST TIME ${fmtTime(s.bestTimeS)}`);
  if (meta.data.wins === 1 && R.cleared.has(BOSS)) out.push('NEW GAME+, CHALLENGES AND HEAT UNLOCKED');
  return out;
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Checked whenever something is found on the map. */
export function checkFinds(totalChests: number) {
  if (R.chests.size >= totalChests) achieve('all_chests');
  if (R.secrets.size > 0) achieve('secret');
  if (R.flags.has('quest_done')) achieve('quest');
  void K;
}

/** debug.unlockAll: the shared one (achievements, heat 5, runs) plus a saved LV 8 party with gear for NG+. */
export function kitUnlockAll(shared?: () => unknown) {
  shared?.();
  const p = freshParty();
  for (const m of p) { while (m.lv < 8) levelUp(m); }
  for (const id of ['merge_hammer', 'query_wand', 'tea_kettle', 'standup_vest', 'standup_vest', 'standup_vest', 'lucky_duck', 'coffee_mug']) autoEquip(p, id);
  saveWin(p, 0, 0, false);
  return { meta: meta.data, saga: saga() };
}
