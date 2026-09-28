# Data Inspector: overnight report (2026-09-27/28)

Branch `overnight/20260927-2143/data-inspector`. Only `data-inspector/` changed. The theme contract is
backward compatible: the only schema change is 5 extra (optional) values in the rule `type` enum. Every
existing theme loads and plays: default, 3 examples, 20 fuzzed themes and the real Ledgerly prospect.

## What shipped
| milestone | commit | what |
|---|---|---|
| P0 + P1 core | 96bfdc5 | New desk: the record card on the left, a **document stack** on the right (RULES, PLAN, then USERS / UPTIME / FLAGS as they arrive, TAB/Q/E to flip, W/S to scroll). **5 new predicates**: email_mismatch, source_outage, flag_before_release, pii_in_text, currency_mismatch, generated from the theme and checked by `violations()`. **Flag with a reason** (1-4 picker, +50 for the right reason, 60% for the wrong one). **Juice**: stamp slam + thunk + 2 px shake + 45 ms hitstop + ink burst, card drops in from the top, approved slides out left and flagged drops into the drawer, the clock ticks every second in the last 10 s and twice a second in the last 5 with a blinking bar, streak flames, the manager's portrait reacts (jolt + "!!" on a miss, a nod on 5-streaks, talking), paper rustle on tab changes. **Bills** at the end of each day (infra / coffee / tool upgrade), **4 manager requests**, **5 endings**, **S-D grades** (best per heat), **HEAT 0-5**, **ENDLESS**, **DAILY**, **14 achievements**, title menu, `ENDINGS n/5`. |
| P2 + tooling | ca7acd5 | Hidden 3 AM story (flag all three: secret ending). Seeded daily stream (checked: two daily runs got identical records, a week run didn't). `debug.botPlan`, `flood` load test (60 fps). Tools: `botrun.py`, `shots.py`, `gate2.sh`. |
| hardening | 62f3d88 | Optional schema entries + prompt docs for the 5 new types; if a theme already uses a desk kind, or can't support one, the kit swaps in another. Currency fix found by the new `selfTest` hook / `tools/selftest.py`. The new document opens by itself on the day it arrives. |
| P2 | 929719e | **Person profile** records (`$identify`) from day 4: a blue card with a big photo, only person-relevant rules apply. Harsher heat penalties. KIT.md and prompts/theme.md rewritten. |
| polish | 308f066, 77969e3, 4caef69, 188525d | First-picker hint, grade details, day grades on End. Answering a request now starts the shift straight away (one screen less per day). Repairs junk kit saves. Page flip on tab change, HEAT/DAILY tags, NEXT label in endless. Achievements only count full weeks. |

## Cut or changed
- The reply screen after a request was cut: it added about 4 s per day. The reply now appears in the speech line and the effect as a toast.
- Sessions layout (P2 says "sessions or persons"): only persons were built.
- No coffee cup or other desk props. The only "clutter" is the tabs and the DEAL stickers, because the desk has no free space at 480x270.
- Own tweens (card slide, manager jolt, stamp slam) ignore reduced motion. See SHARED-REQUESTS #4.

## Balance (details in DESIGN-NOTES.md)
- **Test bot** (0.9 s per record, 92% right), normal difficulty, heat 0: 4/4 wins, 257-266 s of shift time. That's the same as before the rework (250 s). Gate 1 bot: 45 s real time at speed 6, well inside the 150 s limit.
- **Human-paced bot** (4.5 s per record, 85% right, 70% right reasons): won 4/4 at heat 0-4, 5/6 at heat 5. Grades A/B at heat 0.
- **Weak bot** (6 s per record, 75% right): won 4/4 at heat 0. The first week is still forgiving.
- Every ending has been reached by a bot plan: hero, perfect (100% bot), corners (yes to demo and board), audited (yes to everything), burnout (skip every bill), secret pattern.
- Rule engine self-test: 0 inconsistencies on the default theme, the 3 examples, Ledgerly and 20 fuzzed themes, across 750 records each.

## Screenshots (`overnight-shots/`)
- `contact.png`: every screen with the default theme (title, day 1, day 5 with all 5 docs, picker, request, bills, end, returning title, endless).
- `contact-ledgerly.png`: the same screens with Ledgerly's theme, using the default sprites.
- `gameplay-ledgerly.gif`: the Gate 2 GIF with the real sprites.
- `person-profile.png`, `request-answered.png`, `stamp-sequence.png` (flag, then approve, 30 ms apart).

## For a human to decide
1. **Difficulty.** The first week may be too forgiving: even the weak bot wins. Playing it yourself is the real test. The knobs are DIFF / HEAT in `src/story.ts` and `game.ts`.
2. **Tone of the requests.** "Delete flagged records for the board deck" and "a vendor's bribe" are generic, but a prospect might read them as pointed. The text lives in `REQUESTS` in `src/story.ts`.
3. **First-week load.** Day 4 brings 2 theme rules, 1 desk rule and person profiles (15% of records). If that's too much for execs, set `PERSON_DAY` to 4, or only start persons after the first week.
4. **Dates.** The DAILY date is the UTC date, to match `dailySeed()`. In the US evening it shows tomorrow's date.
5. **Endless best score.** Endless shares `meta.bestScore` with week runs (SHARED-REQUESTS #3).

## SHARED-REQUESTS (full text in `SHARED-REQUESTS.md`)
1. `debug.goto` to the scene that's already running gives a black screen.
2. PixelText collapses runs of spaces.
3. Keep a best score per mode.
4. Export `reducedMotion()` for kit tweens.
5. Type-check `kitData`.
6. EndScene should wrap endSummary lines.
7. Toast position option.

## Verification at the final commit
Gate 1 (`node build-kits.mjs data-inspector`, `npx tsc --noEmit -p .`, `tests/accept.py data-inspector`): PASS.
All 4 themes pass, the bot wins, fuzz 20/20, load test 60 fps.
Gate 2 (`tools/gate2.sh`, Ledgerly, the only real prospect on this kit): PASS. The bot wins, no errors, the GIF has 40 frames.
