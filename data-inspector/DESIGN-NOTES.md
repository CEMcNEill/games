# Data Inspector: overnight design notes

Goal: turn the one-layout approve/flag loop into a Papers, Please-style desk: several documents to
cross-reference, pressure with consequences, choices that change how the week ends, and reasons to
play again. The first week stays 5 timed days (~4-5 min) and day 1 stays a one-rule warm-up.

## M1: the desk (layout + juice)
- **Record card left, documents right.** The card (236 px) keeps EVENT/ID/USER/EMAIL/SOURCE/TIME +
  properties, with the sender's portrait in its corner and the stamp hints (A APPROVE / FLAG D) at its foot.
  The right half is a document stack with paper tabs: RULES (the rulebook, always visible now instead of
  an overlay that hid the record), PLAN (tracking plan), then USERS, UPTIME, FLAGS as they unlock.
  TAB / Q / E switch tabs, W/S (UP/DOWN) scroll, R jumps to RULES. The footer shows the IDs seen today.
  Why: cross-referencing only works if the record and the doc are on screen together.
- **Bottom bar:** the inspector's line, the 4 tools as icon + key + name, and the manager's portrait
  in the corner, which reacts (bounce + "!" on a miss, a nod on streaks, typing mouth on news).
- **Juice:** record slides in from the top with a small overshoot; APPROVED slides out left, FLAGGED drops
  into the drawer. Stamp = thunk sfx + 2 px shake + 40 ms hitstop + ink burst. Clock ticks every second
  in the last 10 s and twice a second in the last 5, bar blinks red. Streak flames next to the score
  (3+/6+/10+ streak = 1/2/3 flames). Paper rustle when a tab changes or a record lands.

## M2: cross-reference documents + new predicates
Kit "desk rules" are added on top of the theme's rules, one per day from day 2 (first run: USERS on
day 2, UPTIME on day 3, FLAGS on day 4; later runs shuffle 4 of the 5 kinds onto days 2-5, seeded).
Each one comes with its document, generated from the theme and the day, and checked in code:
| type | doc | the check |
|---|---|---|
| email_mismatch | USERS | EMAIL must equal the directory email for USER (persona emails are fixed per run) |
| source_outage | UPTIME | SOURCE was DOWN hh:mm-hh:mm today and TIME is inside that window |
| flag_before_release | FLAGS | `$feature_flag` value used before that flag went LIVE (TODAY or YESTERDAY time) |
| pii_in_text | PLAN | a free-text `comment` (or the theme's property) holds an email, phone or card number |
| currency_mismatch | PLAN | the money property's record has `currency` other than the plan's currency |
Themes may also use these types (optional schema enum entries; params optional). Baselines are made
legal by rejection sampling on time/source/flag, then targeted fixes; the right answer is always
`violations(record)`. Anything a fuzzed theme can't support (no numeric prop -> no currency rule, one
source -> no outage) is skipped and logged to `themeIssues`.

**Flag with a reason.** FLAG opens a 1-4 picker over the doc panel with up to 4 active rules (one of
the broken ones included when the record is bad). Right reason: full points + 50 bonus; a correct flag
with the wrong reason: 60% points, no quality gain, streak kept. With one active rule there's no picker.

## M3: consequences (budget, requests, endings, grades)
- End of day screen = stats + grade (S-D from accuracy and quota) + bills. Credits earned from correct
  calls and the quota. Bills: INFRA (skip: -8 quality tomorrow), COFFEE (skip: -8 s tomorrow, +1 stress),
  TOOLING (optional: one tool gets 2 uses a day for the rest of the week). Defaults are pre-ticked, so
  Enter just continues. Leftover credits are worth points at the end.
- Manager requests: one each morning of days 2-5 (fixed kit text using theme names). A = yes, D = no.
  DEMO (let the demo account's junk in: `demo` source is exempt today, +credits, cuts corners),
  VENDOR (bribe: `vendor` source exempt all week, +credits), OVERTIME (+10 s and +1 tool tomorrow, stress),
  BOARD DECK (delete flagged data: +500 score, cuts corners).
- Endings (5, generic kit text with theme names): AUDITED, BURNOUT, PERFECT WEEK, CUT CORNERS, CLEAN DATA
  HERO. Title shows ENDINGS n/5.

## M4: replay (heat, modes, achievements)
HEAT 0-5 (shorter days, bigger quota, subtler breaks, fewer tools, pricier bills, a second hidden
violation in the final record at 5). Modes: WEEK, ENDLESS (after the first win: rules keep stacking,
quality drains, score = records), DAILY (seeded stream). 12+ achievements. Best grade per heat.

## M5 (P2): the hidden story + person profiles
- Days 2-4: one record a day from the same user (last persona), same event, stamped 03:00-03:40. It breaks
  no rule, so flagging it is free (NOTED, no penalty, counts as a right call). The inspector mutters
  "Hm. Sam, up at 3 AM?" when it lands. Flag all three and win: secret ending PATTERN SPOTTED + hidden
  achievement.
- From day 4, 15% (first week) / 25% of records are person profiles (`$identify`): a blue card with a
  big photo, name and role, EMAIL/ID/SOURCE/SEEN and 3 person properties. Only rules that make sense
  for a person apply (internal/email/duplicate/future/source/outage/value rules); event-name and
  required-property rules skip it (PLAN says so).

## Changes after play-testing
- Answering a manager request now starts the shift directly (reply in the speech line, effect as a
  toast): one screen less per day, so the first week stays close to the old length.
- The document that arrives today opens on top of the stack when the shift starts.
- RULES lists today's rules first ("NEW TODAY" / "STILL IN FORCE"), numbers unchanged.
- First time the reason picker opens, the inspector explains it in one line.
- Speech lines were cut at 65 chars: "Right call, wrong reason: it was rule #n." and the field is highlighted.

## Balance log
`tools/botrun.py` (autopilot through `__game.debug`, speed 8, normal difficulty unless noted). "Human-paced"
= `botPlan({pace: 4.5, accuracy: 0.85, reasons: 0.7})` (one record per ~4.5 s, 85% right calls, 70% right
reasons), "weak" = pace 6 / 75% / 50%.

| setup | wins | avg score | notes |
|---|---|---|---|
| test bot (0.9 s/record, 92%), heat 0 | 4/4 | 29,660 | ~34 records/day, grades A-S, 45 s real at speed 6 |
| human-paced, heat 0 | 4/4 | 8,647 | 48 records/week, grades A/B, 68-95 credits left, quality 86-100 |
| weak, heat 0 | 4/4 | 5,871 | 35 records/week (quota 7 met on the nose), grades C-S, quality 68-95 |
| human-paced, easy | 4/4 | 10,918 | 60 s days |
| human-paced, hard | 4/4 | 6,395 | |
| human-paced, heat 1 / 2 / 3 / 4 | 4/4 each | 8,306 / 7,969 / 6,128 / 6,394 | before heat penalty scaling for 1-2 and 4 |
| human-paced, heat 5 (with penalty x1.7) | 5/6 | 5,821 | quality ends 31-81 |
| test bot, heat 5 | 4/4 | 23,642 | |
| perfect bot (100%) | 3/3 | 35,780 | PERFECT WEEK, SSSSS |
| bot says yes to every request | 2/2 | 33,236 | AUDITED (corners 3, junk 9) |
| human-paced, yes to demo + board | 3/3 | 10,950 | CUT CORNERS (corners 2, junk 0) |
| bot skips every bill | 2/2 | 27,780 | BURNOUT (stress 3) |
| bot flags the 3 AM records | 3/3 | 32,710 | PATTERN SPOTTED |

First week length: 5 x 50 s shifts + 5 mornings + 4 requests + 5 evenings + final record; the bot's
in-game shift time is 257-266 s, the same as before the rework (250 s).

Rule engine (`tools/selftest.py`, 750 records per theme incl. person profiles, every desk rule on):
0 baselines breaking a rule and 0 breaks missing from `violations()` on default, 3 examples, the real
Ledgerly theme and 20 fuzzed themes.
