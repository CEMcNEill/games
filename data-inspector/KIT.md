# Data Inspector (kit 2)

A Papers, Please-style desk game. The PostHog hedgehog inspects the prospect's own analytics events
for a 5-day week (~50 s a day, 4-5 minutes in total). The **record card** (left) shows EVENT, ID, USER
(+ portrait), EMAIL, SOURCE, TIME and its properties. The **document stack** (right) sits beside it, so the
player cross-references without leaving the record: RULES (the rulebook, today's rules on top) and PLAN
(the tracking plan) from day 1, then USERS (directory), UPTIME (source health board) and FLAGS (release
log) arrive as the week goes on. TAB/E and Q flip documents, W/S scroll, R jumps to RULES.

LEFT/A approves. RIGHT/D flags, then asks **why** (1-4: up to 4 active rules, one of them broken if the
record is bad; no question while only one rule is active). Keys 1-4 are PostHog tools during the shift:

| Product | Tool | Effect |
|---|---|---|
| Session Replay | REWIND | points at the broken field and opens the document that proves it |
| Product Analytics | INSIGHT | names the broken rule number |
| Feature Flags | KILL SWITCH | skips a record with no penalty |
| Error Tracking | AUTO-CATCH | forgives the next mistake that day |
| Surveys | SURVEY | +12 seconds on the clock |
| Experiments | A/B BOOST | double points for 5 records |

The tools are the first 4 of `products` that the kit supports (fewer at HEAT 3+). After day 5 comes the
"final record": no clock, it breaks the oldest rule in the subtlest way (two rules at HEAT 5).

**The week around the desk.**
- *End of day*: stats, a day grade (S-D from accuracy and quota) and credits, then bills: INFRA (skip:
  -8 quality tomorrow), ON-CALL COFFEE (skip: -8 s tomorrow and stress), TOOL UPGRADE (one tool gets
  2 uses a day for the rest of the week). Pre-ticked when affordable, so Enter just continues.
- *Manager requests* (mornings of days 2-5, A = yes / D = no): let the CEO's demo junk through
  (source `demo` is waved through that day), a vendor's bribe (source `vendor` waved through all week),
  overtime (+10 s and +1 tool use tomorrow, stress), deleting flagged records for the board deck.
  Waved-through sources show a DEAL sticker and a DEAL line in RULES; approving their junk counts
  toward an audit.
- *Endings*: CLEAN DATA HERO, PERFECT WEEK (95%+ accuracy, every quota, no shortcuts), CUT CORNERS
  (2+ deals), AUDITED (deals plus junk or misses), BURNOUT (stress 3+), and a hidden one: flag all three
  of one user's 3 AM records (days 2-4; legal, so flagging them costs nothing) for PATTERN SPOTTED.
  The ending name is the End headline; `text.win/lose` stays the main line; the kit line under the stats
  is generic text with theme names. Title shows `ENDINGS n/5 - BEST GRADE g (HEAT h)`.
- *Title menu*: MODE WEEK / ENDLESS (after the first win: no clock, a new rule every 6 records, quality
  drains, score = records called right) / DAILY (seeded record stream, same for everyone that day), and
  HEAT 0-5 (shorter days, bigger quota, subtler breaks, fewer tools, pricier bills, double final).
- 14 achievements (`src/story.ts`). Meta lives in `localStorage` per slug + kit (`kitData`: endings,
  bestGrade per heat, endlessBest); blocked storage = first run.

**Scoring.** Right call: +100 (+streak bonus up to +50, doubled by A/B BOOST), quality +2; a flag with
the right reason +50 more, with the wrong reason 60% and no quality. Approving bad data: quality -8;
flagging good data: -5 (x0.7 easy, x1.3 hard). Missing the daily quota costs 4 quality per missing record;
meeting it gives +250. Quality 0 = lose. Final record: +1000 (+250 right reason) or -30 quality.
Leftover credits x5 at a win.

**Rules are data, logic is code.** `src/rules.ts` has 14 predicate types: the theme's 9 (unknown_event,
blocked_source, internal_user, required_property, property_in_set, value_in_range, property_equals,
future_timestamp, duplicate_id) and 5 "desk rules" checked against a document: email_mismatch (USERS),
source_outage (UPTIME: source DOWN hh:mm-hh:mm today), flag_before_release (FLAGS: `$feature_flag` value
used before it went LIVE), pii_in_text (an email/phone/card in the free-text `comment`, or a theme
property) and currency_mismatch (the money property's `currency` must be the plan's). The kit adds one
desk rule per day from day 2 (first week: USERS, UPTIME, FLAGS on days 2-4; later weeks: 3 random kinds,
a 4th on day 5 at HEAT 2+). Themes may use the 5 types too (optional; the kit then swaps in another kind).
Records are generated to obey every rule of the week, then 35-55% break one active rule; the right answer
is always recomputed from the record by `violations()`. Documents are generated from the same world
state (`src/docs.ts`), so they always agree. Invalid theme rules are skipped and logged to
`__game.themeIssues`; a day left with no rules gets a safe fallback rule.

**Fields that matter most** (in order): `game.events` (their real tracking plan is the personal hook),
`game.days[].rules` + `intro` (their pain points as rules), `personas`, `manager`, `desk.name`.

**Sprite slots.** Generated per prospect: `manager` (32x32, 2 frames: mouth closed/open),
`persona_1..4` (32x32), `desk` (32x32 tile). Fixed kit art: `inspector` hedgehog, stamps, product icons.
Defaults are procedural pixel portraits in `art.py`, recoloured with the brand palette.

**Files.** `src/rules.ts` (World: validation, generation, violations), `src/docs.ts` (documents),
`src/desk.ts` (HUD, card, document stack, picker, bottom bar, juice), `src/story.ts` (requests, bills,
endings, heat, grades, achievements), `src/game.ts` (scene flow, bot, hooks), `src/main.ts` (KitDef).
Tools: `tools/botrun.py` (N bot games -> stats), `tools/shots.py` (every screen + contact sheet),
`tools/selftest.py` (rule engine check on default/examples/prospects/fuzz), `tools/gate2.sh`.

**Known limits.** Numbers in `value_in_range` are compared as plain numbers (no units). Duplicate IDs
come from the last 3 records (the SEEN line shows 3). Only the EVENT record layout exists.
Theme persona/manager names aren't checked against request text length (requests wrap to 5 lines).

**Debug hooks** (`window.__game.debug`): autopilot (answers right 92%, right reason 88%, says no to
requests, pays bills), `botPlan({requests, bills, pattern, pace, accuracy, reasons})`, speed, god, lose,
win, skipDay, rules, `day(n)` (jump to day n's morning), `docs()`, `tab(id)`, `choose(yes)`, `reason(i)`,
`bills({...})`, `story()`, `ending()`, `world()`, `endings()`, `pattern()`, `peek()`, `heat(n)` and
`mode(m)` (restart with a heat/mode), `selfTest(n)`, `flood()` (load test), `showcase()` (day 4, every doc),
`unlockAll()` (shared + every ending).
