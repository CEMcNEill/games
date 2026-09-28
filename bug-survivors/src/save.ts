// Kit save data (shop levels, hero, lifetime totals, daily best, evolution codex) on top of the shared
// meta blob. Everything is defensive: a broken or blocked store reads as a first run.
import { meta } from '@shared/meta';
import { SHOP, HEROES } from './content';

export interface KitSave {
  shop: Record<string, number>;
  hero: string;
  kills: number;          // lifetime
  gold: number;           // lifetime earned
  chests: number;
  codex: string[];        // evolution names found
  daily: { date: string; best: number };
  numbers: boolean;       // damage numbers on/off
}

const defaults = (): KitSave => ({ shop: {}, hero: 'max', kills: 0, gold: 0, chests: 0, codex: [], daily: { date: '', best: 0 }, numbers: true });

const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The kit's save, repaired field by field. */
export function save(): KitSave {
  let k: any;
  try { k = meta.kitData(defaults() as unknown as Record<string, unknown>); } catch { return defaults(); }
  if (!k || typeof k !== 'object') return defaults();
  if (!k.shop || typeof k.shop !== 'object' || Array.isArray(k.shop)) k.shop = {};
  for (const s of SHOP) k.shop[s.id] = Math.max(0, Math.min(s.cost.length, Math.floor(n(k.shop[s.id]))));
  if (!HEROES.some((h) => h.id === k.hero)) k.hero = 'max';
  k.kills = Math.max(0, n(k.kills));
  k.gold = Math.max(0, n(k.gold));
  k.chests = Math.max(0, n(k.chests));
  if (!Array.isArray(k.codex)) k.codex = [];
  k.codex = k.codex.filter((x: unknown) => typeof x === 'string').slice(0, 40);
  if (!k.daily || typeof k.daily !== 'object') k.daily = { date: '', best: 0 };
  k.daily = { date: String(k.daily.date ?? ''), best: Math.max(0, n(k.daily.best)) };
  if (typeof k.numbers !== 'boolean') k.numbers = true;
  return k as KitSave;
}

export function persist() {
  try { meta.save(); } catch { /* memory copy is enough */ }
}

export const shopLevel = (id: string) => save().shop[id] ?? 0;

export const today = () => new Date().toISOString().slice(0, 10);

/** Best daily score for today (0 if none yet). */
export function dailyBest(): number {
  const d = save().daily;
  return d.date === today() ? d.best : 0;
}

export function heroUnlocked(id: string): boolean {
  const h = HEROES.find((x) => x.id === id);
  if (!h) return false;
  if (!h.unlock) return true;
  try { return h.unlock in meta.data.achievements; } catch { return false; }
}

/** The hero to play: the saved pick if still unlocked, else Max. */
export function currentHero() {
  const id = save().hero;
  return HEROES.find((h) => h.id === id && heroUnlocked(id)) ?? HEROES[0];
}
