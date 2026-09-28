# Data Inspector (kit 2)

A Papers, Please-style desk game. The PostHog hedgehog inspects the prospect's own analytics events
for 5 in-game days (~50s each, 4-5 minutes in total). Each record shows EVENT, ID, USER, EMAIL,
SOURCE, TIME and up to 4 properties. The player approves (LEFT/A) or flags (RIGHT/D) it against the
rulebook (R), which gains 1-2 rules each morning. Keys 1-4 are PostHog tools, once per day each:

| Product | Tool | Effect |
|---|---|---|
| Session Replay | REWIND | points at the broken field (or says it's clean) |
| Product Analytics | INSIGHT | names the broken rule number |
| Feature Flags | KILL SWITCH | skips a record with no penalty |
| Error Tracking | AUTO-CATCH | forgives the next mistake that day |
| Surveys | SURVEY | +12 seconds on the clock |
| Experiments | A/B BOOST | double points for 5 records |

The tools are the first 4 of `products` that the kit supports. After day 5 comes the "final record":
no clock, and it breaks the oldest rule in the subtlest way (case change, just out of range...).

**Scoring.** Right call: +100 (+streak bonus, doubled by A/B BOOST), quality +2. Approving bad data:
quality -8; flagging good data: -5 (x0.7 easy, x1.3 hard). Missing the daily quota costs 4 quality
per missing record; meeting it gives +250. Quality 0 = lose. Final record: +1000 or -30 quality.

**Rules are data, logic is code.** `src/rules.ts` has 9 fixed predicate types (unknown_event,
blocked_source, internal_user, required_property, property_in_set, value_in_range, property_equals,
future_timestamp, duplicate_id). Records are generated to obey every rule of the week, then
35-51% of them break exactly one active rule; the right answer is recomputed from the record, so it's
always correct. `World` validates the theme's rules: unknown properties, conflicting value rules on
one property, duplicates or missing params are skipped (logged to `__game.themeIssues`), and a day
left with no rules gets a safe fallback rule.

**Fields that matter most** (in order): `game.events` (their real tracking plan is the personal hook),
`game.days[].rules` + `intro` (their pain points as rules), `personas`, `manager`, `desk.name`.

**Sprite slots.** Generated per prospect: `manager` (32x32, 2 frames: mouth closed/open),
`persona_1..4` (32x32), `desk` (32x32 tile). Fixed kit art: `inspector` hedgehog, stamps, product icons.
Defaults are procedural pixel portraits in `art.py`, recoloured with the brand palette.

**Known limits.** Numbers in `value_in_range` are compared as plain numbers (no units). Duplicate IDs
compare against the last 5 records, which the RECENT IDS panel shows 3 of. Event names use a fixed
"EVENT" header; there are no separate person/funnel record layouts yet.

**Debug hooks** (`window.__game.debug`): autopilot (answers right 92% of the time), speed, god,
lose, win, skipDay, rules.
