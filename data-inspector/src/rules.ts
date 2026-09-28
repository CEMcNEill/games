// Data Inspector's rule engine. Rules are data from the theme (plus the kit's "desk rules" that come
// with a reference document), but each has a fixed predicate type implemented here, so every record's
// right answer is computed in code. The generator builds a record that obeys every rule of the week,
// then (sometimes) breaks one active rule; violations() is the only source of truth.
import type { Rng } from '@shared/meta';

export type RuleType =
  | 'unknown_event' | 'required_property' | 'property_in_set' | 'value_in_range' | 'property_equals'
  | 'future_timestamp' | 'duplicate_id' | 'blocked_source' | 'internal_user'
  | 'email_mismatch' | 'source_outage' | 'flag_before_release' | 'pii_in_text' | 'currency_mismatch';

/** Rule kinds checked against a reference document; the kit adds one per day from day 2. */
export const DESK_TYPES: RuleType[] = ['email_mismatch', 'source_outage', 'flag_before_release', 'pii_in_text', 'currency_mismatch'];
export type DocId = 'rules' | 'plan' | 'users' | 'uptime' | 'flags';

export interface Rule {
  type: RuleType;
  text: string;
  property?: string;
  value?: string;
  values?: string[];
  min?: number;
  max?: number;
  day: number; // 0-based day it arrives
  kit?: boolean; // added by the kit, not the theme
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
  day: number;            // -1 yesterday, 0 today, >0 days in the future
  mins: number;           // minutes after midnight
  time: string;           // what the card shows
  future: boolean;
  dupe: boolean;          // id was shown earlier today
  props: [string, string][];
  final?: boolean;
  person?: boolean;       // a person profile ($identify) instead of an event: a different card layout
  pattern?: boolean;      // part of the hidden 3-record story (breaks no rule)
}

export interface Outage { source: string; from: number; to: number }
export interface Release { flag: string; day: number; mins: number }

const EXTERNAL = ['gmail.com', 'outlook.com', 'proton.me', 'fastmail.com', 'hey.com', 'icloud.com'];
const PROPERTY_RULES: RuleType[] = ['required_property', 'property_in_set', 'value_in_range', 'property_equals'];
const FALLBACK_RULES: Omit<Rule, 'day'>[] = [
  { type: 'unknown_event', text: 'Flag events that are not in the tracking plan' },
  { type: 'future_timestamp', text: 'Flag events stamped in the future' },
  { type: 'duplicate_id', text: "Flag IDs you've already seen today" },
  { type: 'internal_user', text: "Flag events from our own team's emails" },
  { type: 'blocked_source', text: 'Flag events from staging or localhost', values: ['staging', 'localhost'] },
];
export const FLAG_PROP = '$feature_flag';
export const PERSON_EVENT = '$identify';
/** Rule kinds a person profile can break (the rest don't apply to it). */
const PERSON_RULES: RuleType[] = ['internal_user', 'email_mismatch', 'duplicate_id', 'future_timestamp', 'blocked_source',
  'source_outage', 'property_in_set', 'value_in_range', 'property_equals'];
const FLAG_NAMES = ['new-checkout', 'dark-mode', 'beta-export', 'fast-search', 'smart-alerts', 'bulk-edit', 'quick-share', 'new-onboarding'];
const COMMENTS = ['love it', 'too slow', 'where is export?', 'great support', 'bug on step 2', 'pls add dark mode', 'works now, thx',
  'confusing menu', 'more charts pls', 'nice update'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const MONEY = /amount|price|revenue|total|cost|value|usd|eur|gbp|mrr|arr|spend|fee|paid/i;
/** An email, a phone number or a card number inside free text. */
export const PII = /[^\s@]+@[^\s@]+\.[a-z]{2,}|\d{3}[- .]\d{4}|\d{4} \d{4}/i;

const isNum = (v: string) => v.trim() !== '' && isFinite(Number(v));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export { hhmm };
/** "TODAY 09:30", "YESTERDAY 17:02", "TOMORROW 03:10"... */
export function timeLabel(day: number, mins: number) {
  if (day >= 999) return `2099-01-01 ${hhmm(mins)}`;
  const d = day < 0 ? 'YESTERDAY' : day === 0 ? 'TODAY' : day === 1 ? 'TOMORROW' : day >= 7 ? 'NEXT WEEK' : `IN ${day} DAYS`;
  return `${d} ${hhmm(mins)}`;
}
const before = (d1: number, m1: number, d2: number, m2: number) => d1 < d2 || (d1 === d2 && m1 < m2);

export interface WorldOpts {
  rng: Rng;
  /** Desk rule kinds for days 2..5 (index 0 = day 2); null = none that day. */
  desk: (RuleType | null)[];
}

export class World {
  r: Rng;
  events: EventDef[];
  sources: string[];
  personas: number;
  personaNames: string[];
  internalDomain: string;
  directory: string[] = [];   // persona index -> their one true email
  days: Rule[][] = [];        // rules arriving each day, validated
  all: Rule[] = [];
  today = 0;
  outages: Outage[] = [];
  releases: Release[] = [];
  textProp = 'comment';       // free-text property for pii_in_text
  textKit = true;             // textProp is added by the kit (not in the theme's events)
  money: { prop: string; cur: string; curProp: string; curKit: boolean } | null = null;
  exempt = new Set<string>(); // sources the manager's deals say to wave through
  private seenToday: string[] = [];
  private count = 0;

  constructor(theme: any, issues: string[], opts: WorldOpts) {
    this.r = opts.rng;
    const g = theme.game;
    // Events: dedupe names, drop props with no values.
    const names = new Set<string>();
    this.events = (g.events as EventDef[]).filter((e) => {
      if (!e?.name || names.has(e.name)) { issues.push(`events: duplicate or empty event ${e?.name}`); return false; }
      names.add(e.name);
      e.props = (e.props ?? []).filter((p) => p?.name && p.values?.length);
      return true;
    });
    this.personaNames = (g.personas ?? []).map((p: any) => String(p?.name ?? 'user'));
    this.personas = Math.max(1, this.personaNames.length);
    const domain = String(theme.prospect.domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    this.internalDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : 'ourteam.dev';
    this.sources = [...new Set((g.sources as string[]).map((s) => s.toLowerCase()))];
    const ext = EXTERNAL.filter((d) => d !== this.internalDomain);
    for (let i = 0; i < this.personas; i++) {
      const user = this.user(i);
      let email: string;
      do email = `${user}${this.r.chance(0.6) ? this.r.int(2, 99) : ''}@${this.r.pick(ext)}`;
      while (this.directory.includes(email));
      this.directory.push(email);
    }

    const usedProps = new Map<string, RuleType>();
    const usedTypes = new Set<string>();
    const accept = (r: Rule) => {
      usedTypes.add(r.type === 'required_property' ? `req:${r.property}` : PROPERTY_RULES.includes(r.type) ? `val:${r.property}` : r.type);
      if (PROPERTY_RULES.includes(r.type) && r.type !== 'required_property') usedProps.set(r.property!, r.type);
      if (r.type === 'pii_in_text' && !this.textKit) usedProps.set(this.textProp, r.type);
      if (r.type === 'currency_mismatch' && this.money && !this.money.curKit) usedProps.set(this.money.curProp, r.type);
    };
    (g.days as { rules: Omit<Rule, 'day'>[] }[]).forEach((day, d) => {
      const out: Rule[] = [];
      for (const r0 of day.rules ?? []) {
        const r: Rule = { ...r0, day: d };
        const why = this.check(r, usedProps, usedTypes);
        if (why) { issues.push(`days[${d}] rule ${r.type}: ${why}, skipped`); continue; }
        out.push(r);
        accept(r);
      }
      if (!out.length) {
        const fb = FALLBACK_RULES.find((f) => !usedTypes.has(f.type) && !this.check({ ...f, day: d }, usedProps, usedTypes));
        if (fb) {
          issues.push(`days[${d}]: no usable rules, using "${fb.text}"`);
          const r = { ...fb, values: fb.values ? [...fb.values] : undefined, day: d };
          out.push(r);
          accept(r);
        }
      }
      this.days.push(out);
    });
    while (this.days.length < 5) this.days.push([]);
    // Desk rules: one kit rule (with its document) per day from day 2, if the theme can support it.
    // A kind the theme already uses is swapped for an unused one, so every day still brings something new.
    const planned = new Set(opts.desk.filter(Boolean));
    const spare = DESK_TYPES.filter((t) => !planned.has(t) && !usedTypes.has(t));
    opts.desk = opts.desk.map((t) => (t && usedTypes.has(t) ? spare.shift() ?? null : t));
    opts.desk.forEach((type, i) => {
      const d = Math.min(i + 1, this.days.length - 1); // extras (endless) pile onto the last day
      if (!type || d < 1) return;
      // If this theme can't support the kind (e.g. no numeric property for money), try a spare kind.
      for (const t of [type, ...spare]) {
        const r: Rule = { type: t, text: '', day: d, kit: true };
        const why = this.check(r, usedProps, usedTypes);
        if (why) { issues.push(`desk rule ${t}: ${why}, skipped`); continue; }
        this.days[d].push(r);
        accept(r);
        if (spare.includes(t)) spare.splice(spare.indexOf(t), 1);
        return;
      }
    });
    this.all = this.days.flat();
    // Legit sources must never be blocked by any rule; keep at least one.
    const blocked = new Set(this.all.filter((r) => r.type === 'blocked_source').flatMap((r) => r.values!));
    this.sources = this.sources.filter((s) => !blocked.has(s));
    if (!this.sources.length) this.sources = ['web'].filter((s) => !blocked.has(s)).concat(blocked.has('web') ? ['app'] : []);
  }

  private user(i: number) {
    return (this.personaNames[i] ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  }

  private propDef(name?: string) { return this.events.flatMap((e) => e.props).find((p) => p.name === name); }

  /** Why a rule can't be used (null = fine). Normalises its params (and fills kit rule text) in place. */
  private check(r: Rule, usedProps: Map<string, RuleType>, usedTypes: Set<string>): string | null {
    const has = (p?: string) => !!p && this.events.some((e) => e.props.some((q) => q.name === p));
    if (DESK_TYPES.includes(r.type) && usedTypes.has(r.type)) return 'duplicate';
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
      case 'email_mismatch':
        r.text ||= 'EMAIL must match the USERS directory';
        return null;
      case 'source_outage':
        if (this.sources.length < 2) return 'needs 2+ sources';
        r.text ||= 'Flag events sent while their source was DOWN';
        return null;
      case 'flag_before_release':
        r.text ||= 'Flag events using a flag before it went LIVE';
        return null;
      case 'pii_in_text': {
        if (r.property && has(r.property)) {
          if (usedProps.has(r.property)) return `property "${r.property}" already has a value rule`;
          const ok = this.propDef(r.property)!.values.filter((v) => !PII.test(v));
          if (!ok.length) return `property "${r.property}" has no clean values`;
          this.textProp = r.property; this.textKit = false;
        } else {
          const theirs = this.propDef('comment');
          if (theirs && !usedProps.has('comment') && theirs.values.some((v) => !PII.test(v))) { this.textProp = 'comment'; this.textKit = false; }
          else { this.textProp = theirs ? 'user_note' : 'comment'; this.textKit = true; }
        }
        r.property = this.textProp;
        r.text ||= `No emails or phone numbers in ${this.textProp}`;
        return null;
      }
      case 'currency_mismatch': {
        const numeric = (p: PropDef) => p.values.some(isNum);
        let prop = r.property && this.propDef(r.property) && numeric(this.propDef(r.property)!) ? r.property : undefined;
        if (!prop) {
          const all = this.events.flatMap((e) => e.props).filter(numeric);
          prop = (all.find((p) => MONEY.test(p.name)) ?? all[0])?.name;
        }
        if (!prop) return 'no numeric property for money';
        const ev = this.events.find((e) => e.props.some((p) => p.name === prop))!;
        const theirs = ev.props.find((p) => /^currency$|_currency$/i.test(p.name));
        const curProp = theirs && !usedProps.has(theirs.name) ? theirs.name : 'currency';
        if (curProp === 'currency' && usedProps.has('currency')) return 'currency already has a value rule';
        const suffix = /_(usd|eur|gbp|jpy|cad|aud)$/i.exec(prop)?.[1]?.toUpperCase();
        const given = typeof r.value === 'string' && /^[A-Za-z]{3}$/.test(r.value) ? r.value.toUpperCase() : undefined;
        const fromTheirs = theirs?.values.find((v) => /^[A-Za-z]{3}$/.test(v))?.toUpperCase();
        const cur = given ?? suffix ?? fromTheirs ?? 'USD';
        this.money = { prop, cur, curProp, curKit: !ev.props.some((p) => p.name === curProp) };
        r.property = prop;
        r.value = cur;
        r.text ||= `${prop} is in ${cur}: currency must be ${cur}`;
        return null;
      }
      default:
        return 'unknown rule type';
    }
  }

  active(day: number) { return this.days.slice(0, day + 1).flat(); }
  activeHas(type: RuleType) { return this.active(this.today).some((r) => r.type === type); }

  /** Morning: clear the seen IDs and post today's outage board and release log. */
  newDay(day: number) {
    this.today = day;
    this.seenToday = [];
    const src = this.r.shuffle([...this.sources]);
    const from = this.r.int(8, 14) * 60 + this.r.pick([0, 30]);
    this.outages = [{ source: src[0], from, to: from + this.r.pick([60, 90, 120]) }];
    const flags = this.r.shuffle([...FLAG_NAMES]);
    this.releases = [
      { flag: flags[0], day: 0, mins: this.r.int(36, 58) * 15 },   // 09:00-14:30 today
      { flag: flags[1], day: -1, mins: this.r.int(36, 64) * 15 },  // yesterday
    ];
  }
  recentIds(n = 3) { return this.seenToday.slice(-n).reverse(); }

  /** Which reference documents are on the desk today. */
  docs(day = this.today): DocId[] {
    const t = new Set(this.active(day).map((r) => r.type));
    const out: DocId[] = ['rules', 'plan'];
    if (t.has('email_mismatch') || t.has('internal_user')) out.push('users');
    if (t.has('source_outage')) out.push('uptime');
    if (t.has('flag_before_release')) out.push('flags');
    return out;
  }

  // ------------------------------------------------------------ generation
  private legalValue(p: PropDef): string {
    const r = this.r;
    const rule = this.all.find((x) => x.property === p.name && x.type !== 'required_property' && x.type !== 'currency_mismatch');
    if (rule?.type === 'property_in_set') return r.pick(rule.values!);
    if (rule?.type === 'value_in_range') {
      const lo = Math.ceil(rule.min!), hi = Math.floor(rule.max!);
      const nums = p.values.filter(isNum).map(Number).filter((v) => v >= rule.min! && v <= rule.max!);
      if (nums.length && r.chance(0.6)) return String(r.pick(nums));
      if (hi >= lo) return String(r.int(lo, hi));
      return String(rule.min);
    }
    if (rule?.type === 'property_equals') {
      const ok = p.values.filter((v) => v !== rule.value);
      return ok.length ? r.pick(ok) : `${rule.value}_ok`.slice(0, 16);
    }
    if (rule?.type === 'pii_in_text') return r.pick(p.values.filter((v) => !PII.test(v)));
    if (this.money && !this.money.curKit && p.name === this.money.curProp && this.all.some((x) => x.type === 'currency_mismatch')) return this.money.cur;
    return r.pick(p.values);
  }

  setTime(rec: Rec, day: number, mins: number) {
    rec.day = day; rec.mins = mins; rec.future = day > 0; rec.time = timeLabel(day, mins);
  }

  private email(persona: number, internal: boolean) {
    if (internal) return `${this.r.pick(['qa', 'test', 'admin', this.user(persona).slice(0, 6), `${this.user(persona).slice(0, 6)}.dev`])}@${this.internalDomain}`;
    return this.directory[persona] ?? `user@${EXTERNAL[0]}`;
  }

  freshId() {
    let id: string;
    do id = `evt_${this.r.int(0, 0xffff).toString(16).padStart(4, '0')}`; while (this.seenToday.includes(id));
    return id;
  }

  private setProp(rec: Rec, name: string, v: string) {
    const kv = rec.props.find((p) => p[0] === name);
    if (kv) kv[1] = v; else rec.props.push([name, v]);
  }

  /** With the currency rule active, any record carrying the money property also carries its currency. */
  private addCurrency(rec: Rec) {
    const m = this.money;
    if (!m || !this.activeHas('currency_mismatch')) return;
    if (rec.props.some((p) => p[0] === m.prop) && !rec.props.some((p) => p[0] === m.curProp)) rec.props.push([m.curProp, m.cur]);
  }

  /** A record that obeys every rule of the week (as far as today's documents allow). */
  baseline(forEvent?: EventDef): Rec {
    const r = this.r;
    const ev = forEvent ?? r.pick(this.events);
    const persona = r.int(0, this.personas - 1);
    const rec: Rec = {
      n: ++this.count, event: ev.name, id: this.freshId(), persona, email: this.email(persona, false),
      source: r.pick(this.sources), day: 0, mins: 0, time: '', future: false, dupe: false,
      props: ev.props.map((p) => [p.name, this.legalValue(p)] as [string, string]),
    };
    this.setTime(rec, r.chance(0.2) ? -1 : 0, r.int(420, 1079));
    if (this.activeHas('flag_before_release') && r.chance(0.4)) {
      const rel = r.pick(this.releases);
      rec.props.push([FLAG_PROP, rel.flag]);
      if (before(rec.day, rec.mins, rel.day, rel.mins)) this.setTime(rec, rel.day, r.int(rel.mins, 1079));
    }
    if (this.activeHas('pii_in_text') && this.textKit && r.chance(0.45)) rec.props.push([this.textProp, r.pick(COMMENTS)]);
    this.addCurrency(rec);
    if (this.activeHas('source_outage')) {
      for (const o of this.outages) {
        if (rec.source !== o.source || rec.day !== 0 || rec.mins < o.from || rec.mins > o.to) continue;
        // Move it just outside the window, keeping any flag's release time satisfied.
        const flag = rec.props.find((p) => p[0] === FLAG_PROP)?.[1];
        const rel = this.releases.find((x) => x.flag === flag);
        const after = o.to + 1 + r.int(0, 60);
        const early = o.from - 1 - r.int(0, 60);
        const pickEarly = early >= 420 && (!rel || !before(0, early, rel.day, rel.mins)) && r.chance(0.5);
        this.setTime(rec, 0, Math.min(1079, pickEarly ? early : after));
      }
    }
    return rec;
  }

  /** A person profile ($identify) that obeys the week's rules: who they are plus a few person properties. */
  personBaseline(): Rec {
    const r = this.r;
    const rec = this.baseline();
    const skip = new Set([this.textProp, this.money?.prop, this.money?.curProp, FLAG_PROP]);
    const uniq = this.events.flatMap((e) => e.props).filter((p, i, a) => a.findIndex((q) => q.name === p.name) === i && !skip.has(p.name));
    const personish = uniq.filter((p) => !MONEY.test(p.name)); // plan, referrer... not amounts
    const defs = r.shuffle(personish.length ? personish : uniq);
    rec.event = PERSON_EVENT;
    rec.person = true;
    rec.props = defs.slice(0, 3).map((p) => [p.name, this.legalValue(p)] as [string, string]);
    if (rec.day === 0) {
      for (const o of this.outages) if (this.activeHas('source_outage') && rec.source === o.source && rec.mins >= o.from && rec.mins <= o.to) this.setTime(rec, -1, rec.mins);
    }
    return rec;
  }

  /** Break one rule in a record; returns false if this rule can't be broken right now. */
  breakRule(rec: Rec, rule: Rule, subtle = false): boolean {
    const r = this.r;
    if (rec.person && !PERSON_RULES.includes(rule.type)) return false;
    const withProp = (name: string) => {
      if (rec.person) {
        const def = this.propDef(name);
        if (!def) return false;
        if (!rec.props.some((p) => p[0] === name)) rec.props.push([name, this.legalValue(def)]);
        return true;
      }
      const evs = this.events.filter((e) => e.props.some((p) => p.name === name));
      if (!evs.length) return false;
      if (!rec.props.some((p) => p[0] === name)) {
        // Swap in an event that has the property; keep the kit's extra fields (flag, comment).
        const ev = r.pick(evs);
        const own = new Set(this.events.flatMap((e) => e.props.map((p) => p.name)));
        const kit = rec.props.filter(([k]) => !own.has(k) && k !== this.money?.curProp);
        rec.event = ev.name;
        rec.props = [...ev.props.map((p) => [p.name, this.legalValue(p)] as [string, string]), ...kit];
        this.addCurrency(rec);
      }
      return true;
    };
    switch (rule.type) {
      case 'unknown_event': rec.event = mangle(rec.event, this.events.map((e) => e.name), r, subtle); return true;
      case 'future_timestamp': this.setTime(rec, r.pick([1, 3, 7, 999]), r.int(60, 1380)); return true;
      case 'duplicate_id':
        if (!this.seenToday.length) return false;
        rec.id = r.pick(this.seenToday.slice(-3)); rec.dupe = true; return true;
      case 'blocked_source': rec.source = r.pick(rule.values!); return true;
      case 'internal_user': rec.email = this.email(rec.persona, true); return true;
      case 'required_property':
        if (!withProp(rule.property!)) return false;
        rec.props = rec.props.filter((p) => p[0] !== rule.property); return true;
      case 'property_equals':
        if (!withProp(rule.property!)) return false;
        this.setProp(rec, rule.property!, rule.value!); return true;
      case 'property_in_set': {
        if (!withProp(rule.property!)) return false;
        const def = this.propDef(rule.property)!;
        const outside = def.values.filter((v) => !rule.values!.includes(v));
        const base = r.pick(rule.values!);
        const variants = [base.toUpperCase(), base[0].toUpperCase() + base.slice(1), `${base}s`, `${base}_old`, 'null', 'N/A', 'unknown']
          .filter((v) => !rule.values!.includes(v));
        const choices = subtle ? variants.slice(0, 2) : outside.length && r.chance(0.5) ? outside : variants;
        this.setProp(rec, rule.property!, (choices.length ? r.pick(choices) : 'zzz').slice(0, 16));
        return true;
      }
      case 'value_in_range': {
        if (!withProp(rule.property!)) return false;
        const span = Math.max(1, rule.max! - rule.min!);
        const v = r.chance(0.5) || subtle ? rule.max! + Math.max(1, Math.round(span * (subtle ? 0.02 : r.next() * 20))) : rule.min! - Math.max(1, Math.round(span * r.next()));
        this.setProp(rec, rule.property!, String(v));
        return true;
      }
      case 'email_mismatch': {
        const good = this.directory[rec.persona];
        if (!good) return false;
        const [u, d] = good.split('@');
        const stem = u.replace(/\d+$/, '');
        const others = this.directory.filter((e, i) => i !== rec.persona);
        const opts = [
          () => `${stem}${r.int(2, 99)}@${d}`,
          () => `${u}@${r.pick(EXTERNAL.filter((x) => x !== d && x !== this.internalDomain))}`,
          () => `${u}@${d.replace(/^(.)(.)/, '$2$1')}`,
          ...(others.length && !subtle ? [() => r.pick(others)] : []),
          ...(!subtle ? [() => `${stem}.${r.pick(['work', 'old', 'alt'])}@${d}`] : []),
        ];
        for (let i = 0; i < 20; i++) {
          const e = r.pick(opts)();
          if (e !== good && !e.endsWith('@' + this.internalDomain)) { rec.email = e; return true; }
        }
        return false;
      }
      case 'source_outage': {
        const o = r.pick(this.outages);
        if (!o) return false;
        rec.source = o.source;
        const m = subtle ? r.pick([o.from + r.int(0, 4), o.to - r.int(0, 4)]) : r.int(o.from, o.to);
        this.setTime(rec, 0, m);
        return true;
      }
      case 'flag_before_release': {
        const rel = r.pick(this.releases);
        if (!rel) return false;
        this.setProp(rec, FLAG_PROP, rel.flag);
        if (rel.day === 0 && (r.chance(0.7) || subtle)) {
          this.setTime(rec, 0, subtle ? rel.mins - r.int(1, 10) : r.int(420, Math.max(420, rel.mins - 20)));
        } else {
          this.setTime(rec, -1, rel.day === -1 ? r.int(420, rel.mins - 1) : r.int(420, 1079));
        }
        return true;
      }
      case 'pii_in_text': {
        if (!this.textKit && !withProp(this.textProp)) return false;
        const u = this.user(rec.persona).slice(0, 6);
        const pii = [`call 555-0${r.int(100, 199)}`, `${u}@gmail.com`, `card 4242 4242`, `txt me 555-${r.int(1000, 9999)}`,
          `mail ${u}@hey.com`, `ph 555 ${r.int(1000, 9999)}`];
        this.setProp(rec, this.textProp, r.pick(subtle ? pii.slice(0, 2) : pii).slice(0, 18));
        return true;
      }
      case 'currency_mismatch': {
        const m = this.money;
        if (!m || !withProp(m.prop)) return false;
        const wrong = CURRENCIES.filter((c) => c !== m.cur);
        this.setProp(rec, m.curProp, subtle ? r.pick([m.cur.toLowerCase(), r.pick(wrong)]) : r.pick(wrong));
        return true;
      }
    }
    return false;
  }

  /** Rules the record breaks (computed from the record itself, not from how it was made).
   * A source the manager told you to wave through (a deal) breaks nothing, whatever it looks like. */
  violations(rec: Rec, rules: Rule[], ignoreDeals = false): Rule[] {
    if (!ignoreDeals && this.exempt.has(rec.source)) return [];
    const props = new Map(rec.props);
    const defFor = this.events.find((e) => e.name === rec.event);
    return rules.filter((r) => {
      switch (r.type) {
        case 'unknown_event': return !(rec.person && rec.event === PERSON_EVENT) && !this.events.some((e) => e.name === rec.event);
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
        case 'email_mismatch': return rec.email !== this.directory[rec.persona];
        case 'source_outage':
          return rec.day === 0 && this.outages.some((o) => o.source === rec.source && rec.mins >= o.from && rec.mins <= o.to);
        case 'flag_before_release': {
          const rel = this.releases.find((x) => x.flag === props.get(FLAG_PROP));
          return !!props.get(FLAG_PROP) && (!rel || before(rec.day, rec.mins, rel.day, rel.mins));
        }
        case 'pii_in_text': return PII.test(props.get(this.textProp) ?? '');
        case 'currency_mismatch':
          return !!this.money && props.has(this.money.prop) && props.get(this.money.curProp) !== this.money.cur;
      }
      return false;
    });
  }

  /** Mark a record as shown (for duplicate checks). */
  shown(rec: Rec) { if (!this.seenToday.includes(rec.id)) this.seenToday.push(rec.id); }
}

/** Which record line a rule points at (for hints). */
export function fieldFor(r: Rule, w?: World): string {
  switch (r.type) {
    case 'unknown_event': return 'EVENT';
    case 'future_timestamp': return 'TIME';
    case 'duplicate_id': return 'ID';
    case 'blocked_source': return 'SOURCE';
    case 'internal_user': case 'email_mismatch': return 'EMAIL';
    case 'source_outage': return 'TIME';
    case 'flag_before_release': return FLAG_PROP;
    case 'pii_in_text': return w?.textProp ?? r.property ?? '';
    case 'currency_mismatch': return w?.money?.curProp ?? 'currency';
    default: return r.property ?? '';
  }
}

/** Which document helps with a rule (for hints and the reason picker). */
export function docFor(r: Rule): DocId {
  switch (r.type) {
    case 'email_mismatch': case 'internal_user': return 'users';
    case 'source_outage': return 'uptime';
    case 'flag_before_release': return 'flags';
    case 'unknown_event': case 'required_property': case 'pii_in_text': case 'currency_mismatch': return 'plan';
    default: return 'rules';
  }
}

/** Typo an event name so it's no longer in the plan. Subtle = case or separator only. */
export function mangle(name: string, known: string[], r: Rng, subtle = false): string {
  const ops: ((s: string) => string)[] = [
    (s) => s.replace(/_/, '-'),
    (s) => s[0].toUpperCase() + s.slice(1),
    (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase()),
  ];
  if (!subtle) ops.push(
    (s) => { const i = 1 + r.int(0, s.length - 3); return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2); },
    (s) => { const i = 1 + r.int(0, s.length - 2); return s.slice(0, i) + s.slice(i + 1); },
    (s) => s.toUpperCase(),
    (s) => s.replace(/_/g, ' '),
    (s) => `${s}_v2`,
    (s) => { const i = r.int(0, s.length - 1); return s.slice(0, i) + s[i] + s.slice(i); },
  );
  for (let tries = 0; tries < 30; tries++) {
    const out = r.pick(ops)(name).slice(0, 24);
    if (out && !known.includes(out)) return out;
  }
  let out = `${name}_x`;
  while (known.includes(out)) out += 'x';
  return out.slice(0, 26);
}
