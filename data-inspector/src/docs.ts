// Reference documents on the desk: generated from the theme and today's world state, so they always
// agree with violations(). Each doc is a list of short lines (the panel is 36 characters wide).
import { World, Rule, DocId, FLAG_PROP, hhmm, timeLabel } from './rules';

export interface Line { t: string; c?: 'ink' | 'key' | 'new' | 'bad' | 'ok'; indent?: number }
export interface Doc { id: DocId; tab: string; title: string; lines: Line[] }

export const COLS = 36;
export const TABS: Record<DocId, string> = { rules: 'RULES', plan: 'PLAN', users: 'USERS', uptime: 'UPTIME', flags: 'FLAGS' };

export interface DocCtx { world: World; day: number; rules: Rule[]; personas: { name: string; role: string }[]; deals: string[] }

function rules(c: DocCtx): Line[] {
  // Today's rules first (numbers stay the rulebook order, which INSIGHT and the reason picker use).
  const out: Line[] = c.deals.map((d) => ({ t: `DEAL: ${d}`, c: 'bad' as const }));
  const fresh = c.rules.filter((r) => r.day === c.day);
  if (fresh.length && fresh.length < c.rules.length) out.push({ t: 'NEW TODAY', c: 'key' });
  for (const r of fresh) out.push({ t: `${c.rules.indexOf(r) + 1}. ${r.text}`, c: 'new' });
  if (fresh.length && fresh.length < c.rules.length) out.push({ t: 'STILL IN FORCE', c: 'key' });
  c.rules.forEach((r, i) => { if (r.day !== c.day) out.push({ t: `${i + 1}. ${r.text}`, c: 'ink' }); });
  return out;
}

function plan(c: DocCtx): Line[] {
  const w = c.world;
  const req = new Set(c.rules.filter((r) => r.type === 'required_property').map((r) => r.property));
  const out: Line[] = [];
  for (const e of w.events) {
    out.push({ t: e.name, c: 'ink' });
    const props = e.props.map((p) => (req.has(p.name) ? `${p.name}*` : p.name));
    const m = w.money;
    if (m && c.rules.some((r) => r.type === 'currency_mismatch') && e.props.some((p) => p.name === m.prop) && !props.includes(m.curProp)) props.push(m.curProp);
    out.push({ t: props.length ? props.join(', ') : '(no properties)', c: 'key', indent: 2 });
  }
  if (req.size) out.push({ t: '* required', c: 'key' });
  if (c.day >= 3) out.push({ t: '$identify: a person profile. Event rules (names, required props) skip it.', c: 'new' });
  const has = (t: string) => c.rules.some((r) => r.type === t);
  if (has('currency_mismatch') && w.money) out.push({ t: `${w.money.prop}: always in ${w.money.cur}`, c: 'new' });
  if (has('pii_in_text')) out.push({ t: `${w.textProp}: free text, no emails/phones`, c: 'new' });
  if (has('flag_before_release')) out.push({ t: `${FLAG_PROP}: any event (see FLAGS)`, c: 'new' });
  return out;
}

function users(c: DocCtx): Line[] {
  const w = c.world;
  const out: Line[] = [];
  w.directory.forEach((email, i) => {
    const p = c.personas[i];
    out.push({ t: `${p?.name ?? 'user'}${p?.role ? ` (${p.role})` : ''}`, c: 'ink' });
    out.push({ t: email, c: 'key', indent: 2 });
  });
  out.push({ t: 'OUR TEAM (internal)', c: 'ink' });
  out.push({ t: `anyone@${w.internalDomain}`, c: 'bad', indent: 2 });
  return out;
}

function uptime(c: DocCtx): Line[] {
  const w = c.world;
  const out: Line[] = [];
  for (const s of w.sources) {
    const o = w.outages.find((x) => x.source === s);
    out.push({ t: `${s}: ${o ? `DOWN TODAY ${hhmm(o.from)}-${hhmm(o.to)}` : 'OK all day'}`, c: o ? 'bad' : 'ok' });
  }
  out.push({ t: 'Events sent while DOWN are junk.', c: 'key' });
  return out;
}

function flags(c: DocCtx): Line[] {
  const w = c.world;
  const out: Line[] = [{ t: `RELEASE LOG (${FLAG_PROP})`, c: 'key' }];
  for (const r of w.releases) {
    out.push({ t: r.flag, c: 'ink' });
    out.push({ t: `LIVE ${timeLabel(r.day, r.mins)}`, c: 'ok', indent: 2 });
  }
  out.push({ t: 'Events with a flag from before it went LIVE are wrong.', c: 'key' });
  return out;
}

const BUILD: Record<DocId, [string, (c: DocCtx) => Line[]]> = {
  rules: ['', rules],
  plan: ['TRACKING PLAN', plan],
  users: ['USER DIRECTORY', users],
  uptime: ['SOURCE HEALTH', uptime],
  flags: ['FEATURE FLAGS', flags],
};

/** Build one document; never throws (a broken doc becomes a one-line apology and a themeIssue). */
export function buildDoc(id: DocId, c: DocCtx, issues: string[]): Doc {
  const [title, fn] = BUILD[id];
  try {
    return { id, tab: TABS[id], title, lines: fn(c) };
  } catch (e) {
    const msg = `doc ${id}: ${String(e).slice(0, 80)}`;
    if (!issues.includes(msg)) issues.push(msg);
    return { id, tab: TABS[id], title, lines: [{ t: '(this page is smudged)', c: 'key' }] };
  }
}
