// Who does what in battle: each enemy archetype's AI script (FoeMove) and the autopilot's party
// choices. Pure decisions from a read-only view of the battle; battle.ts carries them out.
import { R, SKILLS, Member, SkillId, stat, knows } from './state';
import { AI, AFFINITY, COMBOS, ComboId, Kind, METER, WEAK_MULT, RESIST_MULT, BREAK_MULT, StatusId, STATUS } from './rules';
import type { Foe, Act } from './battle';

export interface BattleView {
  foes: Foe[];          // alive only
  boss: boolean;
  shield: number;       // Feature Flags rounds left
  round: number;
  scanned: boolean;     // someone already scanned this round
  hasItems: boolean;    // items allowed (no-items challenge)
}

export type FoeMoveId = 'attack' | 'double' | 'heavy' | 'windup' | 'miss' | 'guard' | 'harden' | 'cure' | 'focus'
  | 'storm' | 'hex' | 'charge' | 'outage' | 'slam' | 'rollback';
export interface FoeMove { id: FoeMoveId; target?: Member; ally?: Foe; status?: StatusId }

const rnd = Math.random;
const alive = () => R.party.filter((m) => m.hp > 0);
const frac = (m: Member) => m.hp / m.maxHp;
const hasBad = (s: Partial<Record<StatusId, number>>) => (Object.keys(s) as StatusId[]).some((k) => (s[k] ?? 0) > 0 && !STATUS[k].good);

/** Random member, the hedgehog a bit more often (it's the tank of the party). */
export function randomVictim(): Member | null {
  const a = alive();
  if (!a.length) return null;
  const w = a.map((m) => (m.cls === 'hero' ? 1.4 : 1));
  let r = rnd() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; }
  return a[0];
}

const weakestMember = () => [...alive()].sort((a, b) => frac(a) - frac(b))[0] ?? null;

export function foeMove(v: BattleView, f: Foe): FoeMove {
  const victim = randomVictim() ?? undefined;
  const allies = v.foes.filter((o) => o !== f && o.alive);
  switch (f.arch) {
    case 'swarm': {
      const t = rnd() < AI.swarm.focusWeakest ? weakestMember() ?? victim : victim;
      return { id: 'attack', target: t, status: rnd() < AI.swarm.leak && !t?.status.leak ? 'leak' : undefined };
    }
    case 'fast':
      return { id: rnd() < AI.fast.again ? 'double' : 'attack', target: victim, status: rnd() < AI.fast.throttle ? 'throttled' : undefined };
    case 'brute':
      if (f.windup) return { id: 'heavy', target: victim, status: rnd() < AI.brute.freeze ? 'frozen' : undefined };
      if (rnd() < AI.brute.windup) return { id: 'windup' };
      if (rnd() < AI.brute.miss) return { id: 'miss', target: victim };
      return { id: 'attack', target: victim };
    case 'tank': {
      const hurt = allies.filter((o) => o.hp / o.maxHp < AI.tank.guardBelow && !o.guardedBy).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && !f.guarding) return { id: 'guard', ally: hurt };
      if (f.hardened <= 0 && rnd() < AI.tank.harden) return { id: 'harden' };
      return { id: 'attack', target: victim };
    }
    case 'caster': {
      const sick = allies.find((o) => hasBad(o.status) || o.broken);
      if (sick && rnd() < AI.caster.cure) return { id: 'cure', ally: sick };
      const ally = allies.find((o) => !o.status.focused);
      if (ally && rnd() < AI.caster.focusAlly) return { id: 'focus', ally };
      if (rnd() < AI.caster.storm) return { id: 'storm' };
      return { id: 'hex', target: victim, status: rnd() < AI.caster.leak ? 'leak' : undefined };
    }
    case 'wyrm':
    case 'boss': {
      if (f.telegraph) return { id: 'outage' };
      if (f.canRollback && f.hp < f.maxHp * 0.35) return { id: 'rollback' };
      f.charge++;
      if (f.charge >= AI.boss.chargeEvery) { f.charge = 0; return { id: 'charge' }; }
      if (rnd() < AI.boss.aoe) return { id: 'storm' };
      const st: StatusId | undefined = f.phase >= 2 && rnd() < AI.boss.statusP2 ? (rnd() < 0.5 ? 'frozen' : 'leak') : undefined;
      return { id: 'slam', target: victim, status: st };
    }
  }
  return { id: 'attack', target: victim };
}

// ---------------------------------------------------------------- autopilot (party)

/** Damage multiplier the party *knows* about for this kind on this foe (unknown counts as 1). */
export function knownMult(f: Foe, kind: Kind) {
  const a = AFFINITY[f.key];
  let m = 1;
  if (a.weak === kind && knows(f.key, 'weak')) m = WEAK_MULT;
  if (a.resist === kind && knows(f.key, 'resist')) m = RESIST_MULT;
  if (f.broken) m *= BREAK_MULT;
  if (f.exposed > 0) m *= 1.3;
  if (f.hardened > 0) m *= 0.6;
  return m;
}

const physEst = (atk: number, def: number) => Math.max(1, atk * 1.5 - def * 0.8);
const magEst = (mag: number, pow: number, def: number) => Math.max(1, mag * pow * 1.4 - def * 0.3);

/** Extra value for a hit that will knock a shield point off (more if it breaks the foe). */
function breakBonus(f: Foe, kind: Kind, hits = 1) {
  const a = AFFINITY[f.key];
  if (f.broken || a.weak !== kind || !knows(f.key, 'weak')) return 0;
  return hits >= f.shield ? f.maxHp * 0.25 : 4 * hits;
}

interface Option { act: Act; score: number }

function attackOptions(m: Member, foes: Foe[]): Option[] {
  const out: Option[] = [];
  const atk = stat(m, 'atk'), mag = stat(m, 'mag');
  const can = (id: SkillId) => m.skills.includes(id) && m.mp >= SKILLS[id].mp;
  const cap = (f: Foe, d: number) => Math.min(f.hp, d);
  for (const f of foes) {
    out.push({ act: { kind: 'fight', target: f }, score: cap(f, physEst(atk, f.def) * knownMult(f, 'strike')) + breakBonus(f, 'strike') });
    if (can('error_tracking') && f.exposed <= 0) {
      out.push({ act: { kind: 'skill', id: 'error_tracking', target: f },
        score: cap(f, physEst(atk, f.def) * 1.6 * knownMult(f, 'data')) + breakBonus(f, 'data') + (f.hp > 60 ? 8 : 0) - 3 });
    }
    if (can('web_analytics')) {
      const unknown = !knows(f.key, 'weak');
      out.push({ act: { kind: 'skill', id: 'web_analytics', target: f },
        score: cap(f, magEst(mag, 1.8, f.def) * knownMult(f, 'magic')) + breakBonus(f, 'magic') + (unknown ? 10 : 0) - 3 });
    }
    if (can('data_warehouse')) {
      const needMp = R.party.some((p) => p !== m && p.hp > 0 && p.mp < p.maxMp * 0.5);
      out.push({ act: { kind: 'skill', id: 'data_warehouse', target: f },
        score: cap(f, magEst(mag, 1.2, f.def) * knownMult(f, 'data')) + breakBonus(f, 'data') + (needMp ? 12 : 0) - 3 });
    }
  }
  for (const f of foes) {
    if (can('code_review')) {
      out.push({ act: { kind: 'skill', id: 'code_review', target: f },
        score: cap(f, physEst(atk, f.def) * 2.6 * knownMult(f, 'strike')) + breakBonus(f, 'strike', 2) - 6 });
    }
  }
  if (can('dashboards') && foes.length >= 1) {
    const unknown = foes.some((f) => !knows(f.key, 'weak'));
    const s = foes.reduce((a, f) => a + cap(f, magEst(mag, 1.3, f.def) * knownMult(f, 'magic')) + breakBonus(f, 'magic'), 0);
    out.push({ act: { kind: 'skill', id: 'dashboards' }, score: s + (unknown ? 10 : 0) - 6 });
  }
  if (can('product_analytics') && foes.length >= 2) {
    const s = foes.reduce((a, f) => a + cap(f, magEst(mag, 1.1, f.def) * knownMult(f, 'magic')) + breakBonus(f, 'magic'), 0);
    out.push({ act: { kind: 'skill', id: 'product_analytics' }, score: s - 4 });
  }
  if (can('experiments') && foes.length >= 2) {
    const s = foes.reduce((a, f) => a + (cap(f, physEst(atk, f.def) * 0.9 * knownMult(f, 'strike')) * 2) / foes.length, 0);
    out.push({ act: { kind: 'skill', id: 'experiments' }, score: s - 4 });
  }
  return out;
}

export function bestCombo(v: BattleView, m: Member): ComboId | null {
  if (R.meter < METER.max) return null;
  const up = (c: string) => R.party.some((p) => p.cls === c && p.hp > 0 && p !== m && !(p.status.frozen ?? 0));
  const opts = (Object.keys(COMBOS) as ComboId[]).filter((id) => {
    const pair = COMBOS[id].pair;
    if (!pair.includes(m.cls)) return false;
    if (pair.length === 1) return R.party.length === 1;
    return pair.filter((c) => c !== m.cls).every(up);
  });
  if (!opts.length) return null;
  const hurt = alive().filter((p) => frac(p) < 0.5).length;
  const pref: ComboId[] = hurt >= 2 ? ['hotfix_rush', 'insight_loop', 'launch_day', 'solo_ship']
    : v.foes.length >= 2 || v.boss ? ['launch_day', 'insight_loop', 'hotfix_rush', 'solo_ship'] : ['hotfix_rush', 'launch_day', 'insight_loop', 'solo_ship'];
  return pref.find((p) => opts.includes(p)) ?? opts[0];
}

/** The pre-overnight autopilot: no scanning, no weakness reading, no combos, no row changes. Used by
 * debug.naive(true) to check that a player who ignores the new systems still gets through. */
function naiveMove(v: BattleView, m: Member): Act {
  const foes = v.foes;
  // A newcomer does press the flashing SHIP IT! at the top of the menu.
  const combo = bestCombo(v, m);
  if (combo) return { kind: 'combo', id: combo, target: [...foes].sort((a, b) => b.hp - a.hp)[0] };
  const party = R.party;
  const ko = party.filter((p) => p.hp <= 0);
  const hurt = party.filter((p) => p.hp > 0 && frac(p) < 0.45).sort((a, b) => frac(a) - frac(b));
  const can = (id: SkillId) => m.skills.includes(id) && m.mp >= SKILLS[id].mp;
  const tough = [...foes].sort((a, b) => b.hp - a.hp)[0];
  const weakest = [...foes].sort((a, b) => a.hp - b.hp)[0];
  if (m.cls === 'support') {
    if (ko.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: ko[0] };
    if (party.filter((p) => p.hp > 0 && frac(p) < 0.6).length >= 2 && can('coffee_run')) return { kind: 'skill', id: 'coffee_run' };
    if (hurt.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: hurt[0] };
  }
  if (v.hasItems && ko.length && R.items.hotfix > 0) return { kind: 'item', id: 'hotfix', target: ko[0] };
  if (v.hasItems && hurt.length && R.items.potion > 0) return { kind: 'item', id: 'potion', target: hurt[0] };
  if (m.cls === 'support') {
    if ((foes.length >= 2 || v.boss) && can('surveys') && !foes.some((f) => f.weak > 0)) return { kind: 'skill', id: 'surveys' };
    return { kind: 'fight', target: weakest };
  }
  if (m.cls === 'analyst') {
    if (foes.length >= 2 && can('product_analytics')) return { kind: 'skill', id: 'product_analytics' };
    if (can('web_analytics')) return { kind: 'skill', id: 'web_analytics', target: tough };
    return { kind: 'fight', target: weakest };
  }
  if (v.boss && can('feature_flags') && v.shield <= 0) return { kind: 'skill', id: 'feature_flags' };
  if (can('error_tracking') && tough.exposed <= 0 && tough.hp > 30) return { kind: 'skill', id: 'error_tracking', target: tough };
  if (foes.length >= 2 && can('experiments')) return { kind: 'skill', id: 'experiments' };
  return { kind: 'fight', target: tough };
}

export function partyMove(v: BattleView, m: Member): Act {
  if (R.naive) return naiveMove(v, m);
  const foes = v.foes;
  const party = R.party;
  const ko = party.filter((p) => p.hp <= 0);
  const hurt = party.filter((p) => p.hp > 0 && frac(p) < 0.45).sort((a, b) => frac(a) - frac(b));
  const can = (id: SkillId) => m.skills.includes(id) && m.mp >= SKILLS[id].mp;
  const items = v.hasItems;
  const telegraph = foes.some((f) => f.telegraph || f.windup);
  const worth = foes.reduce((a, f) => a + f.hp, 0) > 45 || v.boss;
  // A big hit is coming next turn: shield the party, or brace.
  if (telegraph) {
    if (m.cls === 'hero' && can('feature_flags') && v.shield <= 0) return { kind: 'skill', id: 'feature_flags' };
    if (v.shield <= 0 && frac(m) < 0.8 && !(m.cls === 'support' && (ko.length || hurt.length))) return { kind: 'defend' };
  }
  // Ship It when the meter is full and the fight is worth it.
  const combo = worth ? bestCombo(v, m) : null;
  if (combo) {
    const t = [...foes].sort((a, b) => b.hp - a.hp)[0];
    return { kind: 'combo', id: combo, target: t };
  }
  if (m.cls === 'support') {
    if (ko.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: ko[0] };
    const sick = party.filter((p) => p.hp > 0 && (frac(p) < 0.6 || hasBad(p.status)));
    if (sick.length >= 2 && can('coffee_run')) return { kind: 'skill', id: 'coffee_run' };
    if (hurt.length && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: hurt[0] };
    const frozenOrLeak = party.find((p) => p.hp > 0 && (p.status.leak ?? 0) > 1 && frac(p) < 0.7);
    if (frozenOrLeak && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: frozenOrLeak };
  }
  if (items && ko.length && R.items.hotfix > 0) return { kind: 'item', id: 'hotfix', target: ko[0] };
  const healer = party.length > 2 && party[2].hp > 0 && party[2].mp >= 4 && m.cls !== 'support';
  if (items && hurt.length && R.items.potion > 0 && (!healer || hurt.length >= 2 || frac(hurt[0]) < 0.25))
    return { kind: 'item', id: 'potion', target: hurt[0] };
  if (items && v.boss && m.mp < 5 && m.cls !== 'hero' && R.items.ether > 0) return { kind: 'item', id: 'ether', target: m };
  // Solo hedgehog: patch itself up when potions are gone.
  if (m.cls === 'hero' && hurt.includes(m) && can('session_replay')) return { kind: 'skill', id: 'session_replay', target: m };
  // Read the enemy first: scan an unknown foe once per round in a fight that matters.
  const unknown = foes.filter((f) => !knows(f.key, 'weak'));
  if (unknown.length && worth && !v.scanned && !(m.cls === 'analyst' && can('web_analytics')))
    return { kind: 'scan', target: unknown[0] };
  if (m.cls === 'support' && (foes.length >= 2 || v.boss) && can('surveys') && !foes.some((f) => f.weak > 0))
    return { kind: 'skill', id: 'surveys' };
  if (m.cls === 'support' && worth && can('standup') && !party.some((p) => (p.status.focused ?? 0) > 0))
    return { kind: 'skill', id: 'standup' };
  if (m.cls === 'hero' && v.boss && can('feature_flags') && v.shield <= 0 && m.mp >= 12) return { kind: 'skill', id: 'feature_flags' };
  const opts = attackOptions(m, foes);
  opts.sort((a, b) => b.score - a.score);
  return opts[0]?.act ?? { kind: 'defend' };
}
