// Content tables for the week around the desk: manager requests (moral choices), bills, endings,
// heat levels, grades and achievements. Fixed kit text; {manager}, {company}, {desk}, {persona}
// are filled from the theme. Plain ASCII, short enough for the 5x7 font at 480x270.
import type { AchievementDef } from '@shared/meta';

export interface Effect {
  credits?: number;
  quality?: number;     // now
  clock?: number;       // seconds added to the next shift
  charges?: number;     // extra use of every tool for the next shift
  corners?: number;     // corners cut (drives the AUDITED / CUT CORNERS endings)
  integrity?: number;   // refused a shady deal
  stress?: number;      // drives BURNOUT
  score?: number;
  exemptToday?: string; // source to wave through for the coming shift
  exemptWeek?: string;  // source to wave through for the rest of the week
}

export interface Option { label: string; effect: Effect; reply: string }
export interface Request { id: string; day: number; title: string; text: string; yes: Option; no: Option }

/** One request each morning from day 2 (day = 0-based day it's asked on). */
export const REQUESTS: Request[] = [
  { id: 'demo', day: 1, title: 'THE BIG DEMO',
    text: "The CEO demos to investors today and the demo account's events are a mess. Just let the demo source through today?",
    yes: { label: 'LET THEM IN', reply: "Great. Nobody needs to know. I'll send credits.",
      effect: { credits: 25, corners: 1, exemptToday: 'demo' } },
    no: { label: 'NO EXCEPTIONS', reply: 'Fine. I will explain it to the CEO. Took me a while.',
      effect: { integrity: 1, clock: -5 } } },
  { id: 'vendor', day: 2, title: 'A GENEROUS OFFER',
    text: 'A data vendor offers us 40 credits if we stop flagging their noisy vendor feed. For the rest of the week.',
    yes: { label: 'TAKE THE DEAL', reply: 'Credits are credits. Wave the vendor feed through.',
      effect: { credits: 40, corners: 1, exemptWeek: 'vendor' } },
    no: { label: 'REPORT IT', reply: 'Reported. Legal says thanks. So does the data.',
      effect: { integrity: 1, quality: 5 } } },
  { id: 'overtime', day: 3, title: 'OVERTIME?',
    text: 'The backlog is huge. Stay late tonight and pre-sort tomorrow: more time and a spare tool use tomorrow.',
    yes: { label: 'STAY LATE', reply: "You're a hero. Get some sleep. Eventually.",
      effect: { stress: 2, clock: 0, score: 150 } },
    no: { label: 'GO HOME', reply: 'Fair. Rested inspectors catch more bugs.',
      effect: { stress: -1 } } },
  { id: 'board', day: 4, title: 'THE BOARD DECK',
    text: 'The board deck is tonight. Delete this week\'s flagged records so the chart goes up and to the right?',
    yes: { label: 'DELETE THEM', reply: 'Look at that chart go. What could go wrong?',
      effect: { score: 500, corners: 1 } },
    no: { label: 'KEEP THEM', reply: 'Honest numbers it is. The board will live.',
      effect: { integrity: 1 } } },
];
/** Overtime pays off the next morning: applied when day `day+1` starts. */
export const OVERTIME_BONUS: Effect = { clock: 10, charges: 1 };

export interface Bill { id: 'infra' | 'coffee' | 'tooling'; name: string; cost: number; skip: string; buy?: string; optional?: boolean }
export const BILLS: Bill[] = [
  { id: 'infra', name: 'INFRA', cost: 20, skip: '-8 quality tomorrow' },
  { id: 'coffee', name: 'ON-CALL COFFEE', cost: 10, skip: '-8s tomorrow, +stress' },
  { id: 'tooling', name: 'TOOL UPGRADE', cost: 35, skip: '', buy: '2 uses a day, 1 tool', optional: true },
];
export const START_CREDITS = 20;
export const earned = (correct: number, quotaMet: boolean, grade: string) =>
  10 + correct * 4 + (quotaMet ? 15 : 0) + (({ S: 15, A: 10, B: 5 } as Record<string, number>)[grade] ?? 0);

export interface Ending { id: string; name: string; text: string }
export const ENDINGS: Ending[] = [
  { id: 'hero', name: 'CLEAN DATA HERO', text: '{company} trusts its dashboards again. {manager} frames your rulebook.' },
  { id: 'perfect', name: 'PERFECT WEEK', text: 'Every quota, every catch, no shortcuts. {desk} will talk about this week for years.' },
  { id: 'corners', name: 'CUT CORNERS', text: 'The charts look amazing. Nobody asks why. Yet.' },
  { id: 'audited', name: 'AUDITED', text: 'The auditors found the deals and the junk. {manager} is suddenly very busy elsewhere.' },
  { id: 'burnout', name: 'BURNOUT', text: 'You kept the data clean, but you need a long nap. Take a week off.' },
];
export const SECRET_ENDING: Ending = { id: 'pattern', name: 'PATTERN SPOTTED', text: 'You caught {persona} scraping the whole app across three days. Security sends cake.' };

export interface EndingInput { won: boolean; corners: number; integrity: number; stress: number; junk: number; missed: number;
  accuracy: number; quotasMet: number; days: number; pattern: boolean }
export function pickEnding(e: EndingInput): Ending | null {
  const by = (id: string) => ENDINGS.find((x) => x.id === id)!;
  if (e.won && e.pattern) return SECRET_ENDING;
  if (e.corners >= 2 && (e.junk >= 3 || e.missed >= 4 || !e.won)) return by('audited');
  if (e.stress >= 3) return by('burnout');
  if (!e.won) return null;
  if (e.corners >= 2) return by('corners');
  if (e.corners === 0 && e.accuracy >= 95 && e.quotasMet >= e.days) return by('perfect');
  return by('hero');
}

/** Heat 0-5 on top of the theme's difficulty. */
export interface Heat { len: number; quota: number; subtle: number; bad: number; tools: number; bills: number; pen: number; final2: boolean; deskOn5: boolean }
export const HEAT: Heat[] = [
  { len: 0, quota: 0, subtle: 0, bad: 0, tools: 4, bills: 1, pen: 1, final2: false, deskOn5: false },
  { len: -4, quota: 1, subtle: 0.1, bad: 0.03, tools: 4, bills: 1, pen: 1.1, final2: false, deskOn5: false },
  { len: -6, quota: 1, subtle: 0.25, bad: 0.05, tools: 4, bills: 1.2, pen: 1.2, final2: false, deskOn5: true },
  { len: -8, quota: 2, subtle: 0.35, bad: 0.06, tools: 3, bills: 1.2, pen: 1.35, final2: false, deskOn5: true },
  { len: -10, quota: 2, subtle: 0.45, bad: 0.08, tools: 3, bills: 1.4, pen: 1.5, final2: false, deskOn5: true },
  { len: -12, quota: 3, subtle: 0.55, bad: 0.1, tools: 2, bills: 1.5, pen: 1.7, final2: true, deskOn5: true },
];

/** Day grade from accuracy (0-1) and quota progress (0-1+). */
export const letter = (pts: number) => (pts >= 95 ? 'S' : pts >= 86 ? 'A' : pts >= 74 ? 'B' : pts >= 60 ? 'C' : 'D');
export function grade(acc: number, quota: number): { g: string; pts: number } {
  const pts = Math.round(acc * 70 + Math.min(1.15, quota) * 26);
  return { g: letter(pts), pts };
}
export const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D'];
export const gradeColor = (g: string) => ({ S: 0xf8b800, A: 0x00b800, B: 0x3cbcfc, C: 0xfcfcfc, D: 0xf83800 } as Record<string, number>)[g] ?? 0xfcfcfc;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_week', name: 'FIRST WEEK DONE', desc: 'Survive a whole week at the desk' },
  { id: 'clean_day3', name: 'SPOTLESS DAY 3', desc: 'No mistakes on day 3' },
  { id: 'no_tools', name: 'BARE HANDS', desc: 'Win a week without using a tool' },
  { id: 'reasons', name: 'CASE CLOSED', desc: 'Win a week with every flag reason right' },
  { id: 'streak15', name: 'ON FIRE', desc: '15 right calls in a row' },
  { id: 'grade_s', name: 'S RANK WEEK', desc: 'Get an S grade for a week' },
  { id: 'final', name: 'EAGLE EYE', desc: 'Catch the final record' },
  { id: 'heat3', name: 'FEELING THE HEAT', desc: 'Win a week on HEAT 3+' },
  { id: 'heat5', name: 'MELTDOWN PROOF', desc: 'Win a week on HEAT 5' },
  { id: 'honest', name: 'INCORRUPTIBLE', desc: 'Refuse every request in a week' },
  { id: 'endless50', name: 'NIGHT SHIFT', desc: '50 records in one endless shift' },
  { id: 'daily', name: 'DAILY HABIT', desc: 'Finish a daily shift' },
  { id: 'all_endings', name: 'SEEN IT ALL', desc: 'Find all 5 endings' },
  { id: 'pattern', name: 'PATTERN SPOTTED', desc: 'Find the hidden story', hidden: true },
];

export const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
