// Fixed kit content for HogShop: PostHog tools, the day-by-day mechanics, heat levels, grades, endings and
// achievements. Plain ASCII, short enough for the 5x7 font. {store}, {manager}, {jam}, {rush}, {hot},
// {express}, {intl} are filled from the theme. Never edited per prospect.
import type { AchievementDef } from '@shared/meta';

export type ToolId = 'product_analytics' | 'session_replay' | 'feature_flags' | 'experiments' | 'surveys' | 'error_tracking';
export type Ship = 'std' | 'exp' | 'intl';

export const TOOLS: Record<ToolId, { name: string; effect: string; cd: number; dur: number }> = {
  product_analytics: { name: 'INSIGHTS', effect: 'items your orders need glow on the belts', cd: 26, dur: 10 },
  session_replay: { name: 'REWIND', effect: 'bring back the last lost order', cd: 30, dur: 0 },
  feature_flags: { name: 'SLOW-MO', effect: 'belts slow down and every jam clears', cd: 26, dur: 9 },
  experiments: { name: 'A/B TEST', effect: 'variant B wins: you move 50% faster', cd: 26, dur: 10 },
  surveys: { name: 'SURVEY', effect: 'customers wait longer, rating up', cd: 30, dur: 0 },
  error_tracking: { name: 'CATCH', effect: 'your next mistake costs no stars', cd: 30, dur: 0 },
};

export interface DayRule {
  len: number;          // shift length, seconds (before difficulty)
  every: number;        // seconds between new orders
  maxItems: number;     // items per order (1..maxItems)
  ships: Ship[];        // shipping speeds that can show up
  fragile: boolean;     // bubble wrap needed for fragile items
  jams: boolean;        // belts jam now and then
  hot: number;          // limited-stock orders today
  belt: number;         // belt speed px/s
  rush: boolean;        // sale banners, double points for speed
  news: string;         // what's new today (kit text, filled)
}

export const DAYS: DayRule[] = [
  { len: 70, every: 11, maxItems: 2, ships: ['std'], fragile: false, jams: false, hot: 0, belt: 24, rush: false,
    news: 'Grab items off the belts, pack them at a table, carry the sealed box to the {std} door.' },
  { len: 72, every: 10, maxItems: 2, ships: ['std', 'exp'], fragile: false, jams: false, hot: 0, belt: 26, rush: false,
    news: 'NEW: {exp} orders. Shorter timers and their own door.' },
  { len: 75, every: 9.5, maxItems: 3, ships: ['std', 'exp'], fragile: true, jams: false, hot: 0, belt: 27, rush: false,
    news: 'NEW: FRAGILE items (marked !). Put BUBBLE WRAP in the box before them.' },
  { len: 78, every: 9, maxItems: 3, ships: ['std', 'exp', 'intl'], fragile: true, jams: true, hot: 2, belt: 28, rush: false,
    news: 'NEW: {intl} orders, the {jam} (pull the lever to fix it) and only two {hot} in stock.' },
  { len: 80, every: 6.2, maxItems: 3, ships: ['std', 'exp', 'intl'], fragile: true, jams: true, hot: 1, belt: 32, rush: true,
    news: '{rush}! Orders come fast and quick shipping pays double.' },
];

export const DIFF = {
  easy: { patience: 1.35, quota: 4, loss: 0.7, cd: 0.85, speed: 1.08 },
  normal: { patience: 1.1, quota: 5, loss: 1, cd: 1, speed: 1 },
  hard: { patience: 0.85, quota: 6, loss: 1.25, cd: 1.15, speed: 1 },
};

/** Seconds a customer waits, per shipping speed (before difficulty and heat). */
export const PATIENCE: Record<Ship, number> = { std: 52, exp: 34, intl: 58 };

export interface Heat { every: number; patience: number; belt: number; loss: number; cd: number; quota: number; earlyJams: boolean }
export const HEAT: Heat[] = [
  { every: 1, patience: 1, belt: 1, loss: 1, cd: 1, quota: 0, earlyJams: false },
  { every: 0.92, patience: 0.95, belt: 1.05, loss: 1.05, cd: 1, quota: 0, earlyJams: false },
  { every: 0.86, patience: 0.9, belt: 1.1, loss: 1.1, cd: 1.05, quota: 1, earlyJams: false },
  { every: 0.8, patience: 0.86, belt: 1.14, loss: 1.2, cd: 1.1, quota: 1, earlyJams: true },
  { every: 0.75, patience: 0.82, belt: 1.18, loss: 1.3, cd: 1.3, quota: 1, earlyJams: true },
  { every: 0.7, patience: 0.78, belt: 1.22, loss: 1.4, cd: 1.4, quota: 2, earlyJams: true },
];

/** Star rating losses (before difficulty and heat). */
export const LOSS = { expired: 0.5, wrongDoor: 0.45, returnLost: 0.2, quotaPer: 0.2 };

export function grade(shipped: number, quota: number, mistakes: number): string {
  const r = shipped / Math.max(1, quota) - mistakes * 0.15;
  return r >= 1.5 ? 'S' : r >= 1.15 ? 'A' : r >= 0.9 ? 'B' : r >= 0.6 ? 'C' : 'D';
}
export const gradeColor = (g: string) => ({ S: 0xf8b800, A: 0x58d854, B: 0x3cbcfc, C: 0xfca044, D: 0xf83800 } as Record<string, number>)[g] ?? 0xfcfcfc;

export interface Ending { id: string; name: string; text: string }
export const ENDINGS: Ending[] = [
  { id: 'five_star', name: 'FIVE-STAR SHOP', text: 'Glowing reviews all week. {manager} framed one and hung it over the belts.' },
  { id: 'machine', name: 'ORDER MACHINE', text: 'You shipped more boxes than {store} has ever seen. The truck driver asked for a raise.' },
  { id: 'steady', name: 'OPEN FOR BUSINESS', text: 'A few bumps, but {store} kept its promises. Customers are coming back.' },
  { id: 'scraped', name: 'STILL STANDING', text: 'The stars wobbled, but the doors are open. Next week will be smoother.' },
  { id: 'closed', name: 'CLOSED FOR REPAIRS', text: 'Too many unhappy customers. {manager} hung a sign: back soon.' },
];

export function pickEnding(o: { won: boolean; rating: number; shipped: number; quotaTotal: number }): Ending {
  const by = (id: string) => ENDINGS.find((e) => e.id === id)!;
  if (!o.won) return by('closed');
  if (o.rating >= 4.5) return by('five_star');
  if (o.shipped >= o.quotaTotal * 1.35) return by('machine');
  if (o.rating >= 2.5) return by('steady');
  return by('scraped');
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_week', name: 'OPEN FOR A WEEK', desc: 'Finish a whole week at the shop' },
  { id: 'five_star', name: 'FIVE STARS', desc: 'End a week with 4.5 stars or more' },
  { id: 'no_wrong', name: 'RIGHT DOOR', desc: 'A week without a box through the wrong door' },
  { id: 'express10', name: 'SPEED DEMON', desc: 'Ship 10 express orders in one week' },
  { id: 'hot', name: 'SOLD OUT', desc: 'Ship every limited-stock order in a week' },
  { id: 'rush12', name: 'SALE SURVIVOR', desc: 'Ship 12 orders on the sale day' },
  { id: 'combo8', name: 'IN THE ZONE', desc: '8 on-time boxes in a row' },
  { id: 'heat3', name: 'PEAK SEASON', desc: 'Win a week on HEAT 3+' },
  { id: 'heat5', name: 'CYBER MONDAY', desc: 'Win a week on HEAT 5' },
  { id: 'endless30', name: 'NIGHT SHIFT', desc: '30 orders in one endless shift' },
  { id: 'daily', name: 'DAILY GRIND', desc: 'Finish a daily week' },
  { id: 'no_tools', name: 'BARE PAWS', desc: 'Win a week without a PostHog tool', hidden: true },
];

export function fill(s: string, names: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (m, k) => names[k] ?? m);
}
