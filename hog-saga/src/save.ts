// Hog Saga's between-runs save, on top of the shared meta blob (localStorage per game slug + kit,
// never throws). Holds the New Game+ party, the NG+ cycle, the best speedrun time and a few
// lifetime counters for achievements. Anything malformed reads as "no save" (a first run).
import { meta } from '@shared/kit';
import { CLASSES, SKILLS, ClassId, Member, SkillId } from './state';
import { isGear, gearDef, GearId, Slot } from './gear';

export interface SavedMember {
  cls: ClassId; lv: number; xp: number; maxHp: number; maxMp: number; atk: number; def: number; mag: number; spd: number;
  skills: SkillId[]; gear: Partial<Record<Slot, GearId>>;
}

interface SagaSave {
  ngParty: SavedMember[] | null;
  ngCycle: number;       // NG+ cycles won (0 = only the first game)
  bestTimeS: number;     // fastest speedrun win, 0 = none
  totalBreaks: number;
  wyrm: boolean;         // superboss beaten at least once
  tips: string[];        // first-time tips already shown
}

const DEFAULTS: SagaSave = { ngParty: null, ngCycle: 0, bestTimeS: 0, totalBreaks: 0, wyrm: false, tips: [] };

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : null);

function cleanMember(raw: any): SavedMember | null {
  if (!raw || typeof raw !== 'object' || !(raw.cls in CLASSES)) return null;
  const out: any = { cls: raw.cls };
  for (const [k, lo, hi] of [['lv', 1, 99], ['xp', 0, 1e7], ['maxHp', 1, 9999], ['maxMp', 0, 999], ['atk', 0, 999], ['def', 0, 999],
    ['mag', 0, 999], ['spd', 0, 999]] as [string, number, number][]) {
    const v = num(raw[k], lo, hi);
    if (v === null) return null;
    out[k] = v;
  }
  out.skills = Array.isArray(raw.skills) ? raw.skills.filter((s: unknown) => typeof s === 'string' && s in SKILLS) : [];
  out.gear = {};
  if (raw.gear && typeof raw.gear === 'object') {
    for (const [slot, id] of Object.entries(raw.gear)) {
      if (typeof id === 'string' && isGear(id) && gearDef(id)!.slot === slot) out.gear[slot] = id;
    }
  }
  return out as SavedMember;
}

export function saga(): SagaSave {
  try {
    const d = meta.kitData({ ...DEFAULTS }) as unknown as SagaSave;
    return {
      ngParty: Array.isArray(d.ngParty) ? d.ngParty.map(cleanMember).filter((m): m is SavedMember => !!m) : null,
      ngCycle: num(d.ngCycle, 0, 99) ?? 0,
      bestTimeS: num(d.bestTimeS, 0, 1e6) ?? 0,
      totalBreaks: num(d.totalBreaks, 0, 1e7) ?? 0,
      wyrm: d.wyrm === true,
      tips: Array.isArray(d.tips) ? d.tips.filter((t): t is string => typeof t === 'string').slice(0, 50) : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function patch(p: Partial<SagaSave>) {
  try {
    const d = meta.kitData({ ...DEFAULTS }) as Record<string, unknown>;
    Object.assign(d, p);
    meta.save();
  } catch { /* storage is optional */ }
}

export const ngReady = () => { const s = saga(); return !!s.ngParty && s.ngParty.length > 0; };

/** After a win: keep this party (levels, stats, skills, gear) for New Game+. */
export function saveWin(party: Member[], cycle: number, timeS: number, speedrun: boolean, keepParty = true) {
  if (!keepParty) return;
  const s = saga();
  // Keep whichever party is further along, so a plain win after NG+ doesn't reset the NG+ party.
  const total = (ms: { lv: number }[]) => ms.reduce((a, m) => a + m.lv, 0);
  if (s.ngParty && total(s.ngParty) > total(party)) {
    patch({ ngCycle: Math.max(s.ngCycle, cycle),
      bestTimeS: speedrun && timeS > 0 && (s.bestTimeS === 0 || timeS < s.bestTimeS) ? Math.round(timeS) : s.bestTimeS });
    return;
  }
  // Keep saved members this run didn't have (if any).
  const keep = party.map((m) => ({ cls: m.cls, lv: m.lv, xp: m.xp, maxHp: m.maxHp, maxMp: m.maxMp, atk: m.atk, def: m.def, mag: m.mag,
    spd: m.spd, skills: [...m.skills], gear: { ...m.gear } }));
  const merged = [...keep];
  for (const old of s.ngParty ?? []) if (!merged.some((m) => m.cls === old.cls)) merged.push(old);
  patch({ ngParty: merged, ngCycle: Math.max(s.ngCycle, cycle),
    bestTimeS: speedrun && timeS > 0 && (s.bestTimeS === 0 || timeS < s.bestTimeS) ? Math.round(timeS) : s.bestTimeS });
}

export function addBreaks(n: number) { if (n > 0) patch({ totalBreaks: saga().totalBreaks + n }); }
export function markWyrm() { patch({ wyrm: true }); }

/** Remember a first-time tip; true if it hadn't been shown before. */
export function markTip(id: string): boolean {
  const s = saga();
  if (s.tips.includes(id)) return false;
  patch({ tips: [...s.tips, id] });
  return true;
}
