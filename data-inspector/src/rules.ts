// Data Inspector's rule engine. Rules are data from the theme, but each has a fixed predicate type
// implemented here, so every record's right answer is computed in code. The generator builds a
// record that obeys every rule of the week, then (sometimes) breaks exactly one active rule.
export type RuleType =
  | 'unknown_event' | 'required_property' | 'property_in_set' | 'value_in_range' | 'property_equals'
  | 'future_timestamp' | 'duplicate_id' | 'blocked_source' | 'internal_user';

export interface Rule {
  type: RuleType;
  text: string;
  property?: string;
  value?: string;
  values?: string[];
  min?: number;
  max?: number;
  day: number; // 0-based day it arrives
}

export interface PropDef { name: string; values: string[] }
export interface EventDef { name: string; props: PropDef[] }

export interface Rec {
  n: number;
  event: string;
  id: string;
  persona: number;
  email: string;
  source: string;
  time: string;
  future: boolean;
  dupe: boolean;          // id was shown earlier today
  props: [string, string][];
  final?: boolean;
}

const EXTERNAL = ['gmail.com', 'outlook.com', 'proton.me', 'fastmail.com', 'hey.com', 'icloud.com'];
const PROPERTY_RULES: RuleType[] = ['required_property', 'property_in_set', 'value_in_range', 'property_equals'];
const FALLBACK_RULES: Omit<Rule, 'day'>[] = [
  { type: 'unknown_event', text: 'Flag events that are not in the tracking plan' },
  { type: 'future_timestamp', text: 'Flag events stamped in the future' },
  { type: 'duplicate_id', text: "Flag IDs you've already seen today" },
  { type: 'internal_user', text: "Flag events from our own team's emails" },
  { type: 'blocked_source', text: 'Flag events from staging or localhost', values: ['staging', 'localhost'] },
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
const isNum = (v: string) => v.trim() !== '' && isFinite(Number(v));

export class World {
  events: EventDef[];
  sources: string[];
  personas: number;
  internalDomain: string;
  days: Rule[][] = [];   // rules arriving each day, validated
  all: Rule[] = [];
  private seenToday: string[] = [];
  private count = 0;

  constructor(theme: any, issues: string[]) {
    const g = theme.game;
    // Events: dedupe names, drop props with no values.
    const names = new Set<string>();
    this.events = (g.events as EventDef[]).filter((e) => {
      if (!e?.name || names.has(e.name)) { issues.push(`events: duplicate or empty event ${e?.name}`); return false; }
      names.add(e.name);
      e.props = (e.props ?? []).filter((p) => p?.name && p.values?.length);
      return true;
    });
    this.personas = Math.max(1, (g.personas ?? []).length);
    const domain = String(theme.prospect.domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    this.internalDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : 'ourteam.dev';
    this.sources = [...new Set((g.sources as string[]).map((s) => s.toLowerCase()))];

    const usedProps = new Map<string, RuleType>();
    const usedTypes = new Set<string>();
    (g.days as { rules: Omit<Rule, 'day'>[] }[]).forEach((day, d) => {
      const out: Rule[] = [];
      for (const r0 of day.rules ?? []) {
        const r: Rule = { ...r0, day: d };
        const why = this.check(r, usedProps, usedTypes);
        if (why) { issues.push(`days[${d}] rule ${r.type}: ${why}, skipped`); continue; }
        out.push(r);
        usedTypes.add(r.type === 'required_property' ? `req:${r.property}` : PROPERTY_RULES.includes(r.type) ? `val:${r.property}` : r.type);
        if (PROPERTY_RULES.includes(r.type) && r.type !== 'required_property') usedProps.set(r.property!, r.type);
      }
      if (!out.length) {
        const fb = FALLBACK_RULES.find((f) => !usedTypes.has(f.type) && !this.check({ ...f, day: d }, usedProps, usedTypes));
        if (fb) {
          issues.push(`days[${d}]: no usable rules, using "${fb.text}"`);
          out.push({ ...fb, values: fb.values ? [...fb.values] : undefined, day: d });
          usedTypes.add(fb.type);
        }
      }
      this.days.push(out);
    });
    while (this.days.length < 5) this.days.push([]);
    this.all = this.days.flat();
    // Legit sources must never be blocked by any rule; keep at least one.
    const blocked = new Set(this.all.filter((r) => r.type === 'blocked_source').flatMap((r) => r.values!));
    this.sources = this.sources.filter((s) => !blocked.has(s));
    if (!this.sources.length) this.sources = ['web'].filter((s) => !blocked.has(s)).concat(blocked.has('web') ? ['app'] : []);
  }

  /** Why a rule can't be used (null = fine). Normalises its params in place. */
  private check(r: Rule, usedProps: Map<string, RuleType>, usedTypes: Set<string>): string | null {
    const has = (p?: string) => !!p && this.events.some((e) => e.props.some((q) => q.name === p));
    switch (r.type) {
      case 'required_property':
        if (!has(r.property)) return `property "${r.property}" not in any event`;
        if (usedTypes.has(`req:${r.property}`)) return 'duplicate';
        return null;
      case 'property_in_set':
      case 'value_in_range':
      case 'property_equals':
        if (!has(r.property)) return `property "${r.property}" not in any event`;
        if (usedProps.has(r.property!)) return `property "${r.property}" already has a value rule`;
        if (r.type === 'property_in_set') {
          r.values = [...new Set((r.values ?? []).filter(Boolean))];
          if (!r.values.length) return 'no allowed values';
        }
        if (r.type === 'value_in_range') {
          if (typeof r.min !== 'number' || typeof r.max !== 'number' || !(r.max > r.min)) return 'needs min < max';
        }
        if (r.type === 'property_equals' && !r.value) return 'no value';
        return null;
      case 'blocked_source':
        r.values = [...new Set((r.values ?? []).map((v) => v.toLowerCase()).filter(Boolean))];
        if (!r.values.length) return 'no blocked sources';
        return usedTypes.has(r.type) ? 'duplicate' : null;
      case 'unknown_event':
      case 'future_timestamp':
      case 'duplicate_id':
      case 'internal_user':
        return usedTypes.has(r.type) ? 'duplicate' : null;
      default:
        return 'unknown rule type';
    }
  }

  active(day: number) { return this.days.slice(0, day + 1).flat(); }

  newDay() { this.seenToday = []; }
  recentIds(n = 5) { return this.seenToday.slice(-n).reverse(); }

  // ------------------------------------------------------------ generation
  private legalValue(p: PropDef): string {
    const rule = this.all.find((r) => r.property === p.name && r.type !== 'required_property');
    if (rule?.type === 'property_in_set') return pick(rule.values!);
    if (rule?.type === 'value_in_range') {
      const lo = Math.ceil(rule.min!), hi = Math.floor(rule.max!);
      const nums = p.values.filter(isNum).map(Number).filter((v) => v >= rule.min! && v <= rule.max!);
      if (nums.length && Math.random() < 0.6) return String(pick(nums));
      if (hi >= lo) return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
      return String(rule.min);
    }
    if (rule?.type === 'property_equals') {
      const ok = p.values.filter((v) => v !== rule.value);
      return ok.length ? pick(ok) : `${rule.value}_ok`.slice(0, 16);
    }
    return pick(p.values);
  }

  private time(future: boolean) {
    const hh = String(future ? 1 + Math.floor(Math.random() * 20) : 7 + Math.floor(Math.random() * 10)).padStart(2, '0');
    const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    if (future) return pick([`TOMORROW ${hh}:${mm}`, `IN 3 DAYS ${hh}:${mm}`, `NEXT WEEK ${hh}:${mm}`, `2099-01-01 ${hh}:${mm}`]);
    return Math.random() < 0.2 ? `YESTERDAY ${hh}:${mm}` : `TODAY ${hh}:${mm}`;
  }

  private email(persona: string, internal: boolean) {
    const user = persona.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    if (internal) return `${pick([user, 'qa.' + user, 'test', 'admin', user + '.dev'])}@${this.internalDomain}`;
    return `${user}${Math.random() < 0.4 ? Math.floor(Math.random() * 99) : ''}@${pick(EXTERNAL.filter((d) => d !== this.internalDomain))}`;
  }

  freshId() {
    let id: string;
    do id = `evt_${hex()}`; while (this.seenToday.includes(id));
    return id;
  }

  /** A record that obeys every rule of the week. */
  baseline(personaNames: string[], forEvent?: EventDef): Rec {
    const ev = forEvent ?? pick(this.events);
    const persona = Math.floor(Math.random() * this.personas);
    return {
      n: ++this.count,
      event: ev.name,
      id: this.freshId(),
      persona,
      email: this.email(personaNames[persona] ?? 'user', false),
      source: pick(this.sources),
      time: this.time(false),
      future: false,
      dupe: false,
      props: ev.props.map((p) => [p.name, this.legalValue(p)] as [string, string]),
    };
  }

  /** Break one rule in a record; returns false if this rule can't be broken right now. */
  breakRule(rec: Rec, r: Rule, personaNames: string[], subtle = false): boolean {
    const setProp = (name: string, v: string) => { const kv = rec.props.find((p) => p[0] === name); if (kv) kv[1] = v; };
    const withProp = (name: string) => {
      const evs = this.events.filter((e) => e.props.some((p) => p.name === name));
      if (!evs.length) return false;
      if (!rec.props.some((p) => p[0] === name)) {
        const fresh = this.baseline(personaNames, pick(evs));
        Object.assign(rec, { event: fresh.event, props: fresh.props });
      }
      return true;
    };
    switch (r.type) {
      case 'unknown_event': rec.event = mangle(rec.event, this.events.map((e) => e.name), subtle); return true;
      case 'future_timestamp': rec.time = this.time(true); rec.future = true; return true;
      case 'duplicate_id':
        if (!this.seenToday.length) return false;
        rec.id = pick(this.seenToday.slice(-5)); rec.dupe = true; return true;
      case 'blocked_source': rec.source = pick(r.values!); return true;
      case 'internal_user': rec.email = this.email(personaNames[rec.persona] ?? 'user', true); return true;
      case 'required_property':
        if (!withProp(r.property!)) return false;
        rec.props = rec.props.filter((p) => p[0] !== r.property); return true;
      case 'property_equals':
        if (!withProp(r.property!)) return false;
        setProp(r.property!, r.value!); return true;
      case 'property_in_set': {
        if (!withProp(r.property!)) return false;
        const def = this.events.flatMap((e) => e.props).find((p) => p.name === r.property)!;
        const outside = def.values.filter((v) => !r.values!.includes(v));
        const base = pick(r.values!);
        const variants = [base.toUpperCase(), base[0].toUpperCase() + base.slice(1), `${base}s`, `${base}_old`, 'null', 'N/A', 'unknown']
          .filter((v) => !r.values!.includes(v));
        const choices = subtle ? variants.slice(0, 2) : outside.length && Math.random() < 0.5 ? outside : variants;
        setProp(r.property!, (choices.length ? pick(choices) : 'zzz').slice(0, 16));
        return true;
      }
      case 'value_in_range': {
        if (!withProp(r.property!)) return false;
        const span = Math.max(1, r.max! - r.min!);
        const v = Math.random() < 0.5 || subtle ? r.max! + Math.max(1, Math.round(span * (subtle ? 0.02 : Math.random() * 20))) : r.min! - Math.max(1, Math.round(span * Math.random()));
        setProp(r.property!, String(v));
        return true;
      }
    }
    return false;
  }

  /** Rules the record breaks (computed from the record itself, not from how it was made). */
  violations(rec: Rec, rules: Rule[]): Rule[] {
    const props = new Map(rec.props);
    const defFor = this.events.find((e) => e.name === rec.event);
    return rules.filter((r) => {
      switch (r.type) {
        case 'unknown_event': return !this.events.some((e) => e.name === rec.event);
        case 'future_timestamp': return rec.future;
        case 'duplicate_id': return rec.dupe;
        case 'blocked_source': return r.values!.includes(rec.source);
        case 'internal_user': return rec.email.endsWith('@' + this.internalDomain);
        case 'required_property': return !!defFor?.props.some((p) => p.name === r.property) && !props.has(r.property!);
        case 'property_in_set': return props.has(r.property!) && !r.values!.includes(props.get(r.property!)!);
        case 'value_in_range': {
          if (!props.has(r.property!)) return false;
          const v = props.get(r.property!)!;
          return !isNum(v) || Number(v) < r.min! || Number(v) > r.max!;
        }
        case 'property_equals': return props.get(r.property!) === r.value;
      }
      return false;
    });
  }

  /** Mark a record as shown (for duplicate checks). */
  shown(rec: Rec) { if (!this.seenToday.includes(rec.id)) this.seenToday.push(rec.id); }
}

/** Which record line a rule points at (for hints). */
export function fieldFor(r: Rule): string {
  switch (r.type) {
    case 'unknown_event': return 'EVENT';
    case 'future_timestamp': return 'TIME';
    case 'duplicate_id': return 'ID';
    case 'blocked_source': return 'SOURCE';
    case 'internal_user': return 'EMAIL';
    default: return r.property ?? '';
  }
}

/** Typo an event name so it's no longer in the plan. Subtle = case or separator only. */
export function mangle(name: string, known: string[], subtle = false): string {
  const ops: ((s: string) => string)[] = [
    (s) => s.replace(/_/, '-'),
    (s) => s[0].toUpperCase() + s.slice(1),
    (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase()),
  ];
  if (!subtle) ops.push(
    (s) => { const i = 1 + Math.floor(Math.random() * (s.length - 2)); return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2); },
    (s) => { const i = 1 + Math.floor(Math.random() * (s.length - 1)); return s.slice(0, i) + s.slice(i + 1); },
    (s) => s.toUpperCase(),
    (s) => s.replace(/_/g, ' '),
    (s) => `${s}_v2`,
    (s) => { const i = Math.floor(Math.random() * s.length); return s.slice(0, i) + s[i] + s.slice(i); },
  );
  for (let tries = 0; tries < 30; tries++) {
    const out = pick(ops)(name).slice(0, 24);
    if (out && !known.includes(out)) return out;
  }
  let out = `${name}_x`;
  while (known.includes(out)) out += 'x';
  return out.slice(0, 26);
}
