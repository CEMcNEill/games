# Hog Saga: overnight report (2026-09-27 22:00 -> 2026-09-28)

Branch `overnight/20260927-2143/hog-saga`. Only `hog-saga/` changed. **No theme fields were added**; every
existing theme (default, 3 examples, the acme-rockets prospect) loads and plays. Design notes and the
tuning history are in `DESIGN-NOTES.md`; how it plays now, the hooks and the balance table are in `KIT.md`.

## What shipped
| Commit | Milestone |
|---|---|
| `d2ad2a9` | **P0 battle depth + P1 world/replay.** Damage kinds (STRIKE/MAGIC/DATA) with a weakness and a resistance per archetype, SCAN, shields and BREAK; statuses LEAK/FROZEN/SLOW/FOCUS with 8x8 icons; the Ship It meter and 4 pair combos with cut-ins; enemy AI scripts per archetype (swarm focus-fire, tank guard, caster cure/buff, brute wind-up, boss telegraphed MASS OUTAGE and a moving weak spot); juice (lunges, slashes, sparkles, flashes, crit hitstop + shake, bouncy numbers, WEAK!/RESIST/BREAK! pops, swirl transition, victory jingle, level-up fanfare) and **battle + boss music** from `music.py` (fixed kit audio, `public/assets/kit/`). Gold, 15 gear pieces in weapon/armour/charm slots with auto-equip, a town shop, a secret grove, a cracked-wall vault, the Old Dev side quest, the optional Tech Debt Wyrm, footer completion (gold, chests x/7, secrets x/4), heat 0-5, New Game+ (party carried over, chests remixed by seed), SOLO HOG / NO ITEMS / SPEEDRUN, 14 achievements. |
| `0791cbb` | **P2.** Seeded overworld events (travelling Merchant with discounted rare gear, stray chests that are sometimes Mimics), FRONT/BACK row formation, `tools/reach.mjs` map check (found and fixed a real unreachable-item bug), a "newcomer" autopilot to check first-run approachability, and balance for newcomer/hard/solo/NG+/heat. `debug.flood()` so the Gate 1 load test runs (60 fps). |
| `215050a` | DAILY mode (shared daily seed: same events for everyone that day), readable boss "!" and BREAK! (were under the top box), how-to hint about SHIP IT and "!", `debug.fight(n)`. |
| `eb7bd16` | Enemy moves as a handler table (`foemoves.ts`) instead of a switch; status names in the turn prompt; `debug.status`. |
| `8363722` | First-visit title is clean again (the MODE/HEAT rows only appear after a first win); score now rewards breaks, combos and secrets with multipliers for heat, NG+ and challenges; `overnight-shots/`. |
| `3ec8782` | Fixes from self-review: NO ITEMS shop sells gear only; a solo win no longer overwrites the NG+ party. |
| `f34642e` | Fixes from an independent code review (7 issues, none softlocking): the Wyrm achievement unlocked on a *loss*, the first-win "NEW GAME+... UNLOCKED" line never showed, a wrong item target wasted the turn, a phase change erased a BREAK from the same hit, ENTER skipped the Wyrm warning, the READY blink stopped after one fight, the bot could combo with a frozen partner; plus a plain win no longer replaces a stronger NG+ party. |
| `8d74f27` | First-time tips, once per browser (first WEAK hit, BREAK, full meter, red "!", new gear): a banner under the battle message, a toast on the map. |
| `661dec2` | The Tech Debt Wyrm is a real superboss (2400 HP, angry from the start: 13-16 rounds vs 8-10 for the final boss); sturdier Mimic. |
| `3d8ce20` | LV 7 skills for NG+ and optional-heavy runs: Code Review (hedgehog), Dashboards (analyst), Standup (support). |
| `73ca23a` | Ship It combo effects as a table (`combos.ts`), like enemy moves (`foemoves.ts`). |

## Balance (bot, tools/bot.py; full table in KIT.md)
- normal 10/10, boss 8-10 rounds, ~56% party HP left; hard 10/10, boss 9-12, ~48%; easy 10/10.
- **Newcomer bot** (ignores SCAN, weaknesses, DEFEND and rows; does press the flashing SHIP IT!):
  normal 9/10, hard 7/8 with near-wipes. This was 6/8 on normal before softening MASS OUTAGE.
- Heat 3: 6/6 (boss 12-14 rounds with phase 3). Heat 5: 4/6 (0 potions; losses in the first fights).
- SOLO HOG 7/8 (boss 17-26 rounds, tight). NG+ after a real win: LV 6 -> 8, boss 11 rounds.
- Optional content bot (`debug.optional(true)`): 6/6 wins, all 7 chests, 4/4 secrets, LV 7; the Wyrm
  takes 13-16 rounds and leaves the party at 25-54%.
- Run length: `__game.elapsed` median 338 s on normal (now counts battle time too; no reading time),
  so a human first run stays around 6-8 minutes. Encounter count and route are unchanged.

## Cut, changed or not done
- Challenge "toggles" are exclusive MODE choices (the shared title supports 2 rows of single choices).
- Party/foe status icons are 8x8 (tiny at 1x zoom); the turn prompt now names them to compensate.
- A per-run "bestiary" that persists weakness knowledge across runs was considered and skipped: it
  would remove the SCAN decision from later runs.
- `battle.ts` is still ~1,250 lines: party skills are a switch as before; enemy moves (`foemoves.ts`) and
  combos (`combos.ts`) moved to tables.
- The shared `debug.goto('Title')` shows a black screen when called while already on the title
  (debug-only; works from in-game). Not touched (shared/).

## Please decide
- **Difficulty feel for execs.** The newcomer bot wins normal 9/10 and easy always. Real execs may
  play worse than the bot (it never wastes turns). If first-run losses show up in PostHog, lower
  `OUTAGE` in `foemoves.ts` (1.7) or the boss HP (1400) a little.
- **Music.** The two battle tracks came straight from `music.py` (one take each, 40 s and 45 s loops,
  levels match the overworld track). Nobody has listened to them: worth a quick listen and a re-roll.
- **Kit NPC names** (Old Dev, Merchant, Tech Debt Wyrm, Mimic Chest) and gear names are fixed text.
  The theme prompt now asks the writer not to reuse them.
- Achievements toast mid-game (4 of them usually pop on a first win) and first-time tips appear once.
  Fine for delight, but noisy if you'd rather keep the first run clean; `progress.ts` is the place.
- **Casters cure BROKEN allies** (their AI's "patch up" also ends a break). It makes "kill the caster
  first" a real decision, but some players may read it as the break being wasted.

## Screenshots (`overnight-shots/`)
01 first-visit title, 02 title after a win (MODE + HEAT rows, NG+ stars), 03 SHIP IT ready, 04 guard
+ wind-up + revealed weaknesses, 05 BREAK, 06 boss telegraph "!", 07 status icons, 08 shop, 09 merchant,
10 party screen with rows and gear, 11 secret grove toast, 12 side quest, 13 the Wyrm on the map,
14 mimic fight, 15 End screen after a first win (unlock line + new achievements), 16 frames from the
Gate 2 GIF on acme-rockets (scan, chart blast, LAUNCH DAY cut-in, BREAK!, a caster curing an ally),
17 combo menu and HOTFIX RUSH cut-in, 18 first-time tip banner, 19 LV 7 skill list, 20 Gate 2 contact
sheet for acme-rockets.

## SHARED-REQUESTS (see SHARED-REQUESTS.md)
End-screen achievement line overflow, kit debug hooks before the game scene, shared extra music tracks,
a bouncy `pop` option, a `runRng(salt)` helper, multi-select title toggles.

## Gates at the final commit
- Gate 1 (`node build-kits.mjs hog-saga`, `npx tsc --noEmit -p .`, `tests/accept.py hog-saga`): PASS on
  every code commit; at the final code commit: 4 themes PASS, bot win (game 299 s), fuzz 20/20, load test
  60 fps min (new `debug.flood`). Re-run on the final docs commit: see the last line of the session log.
- Gate 2 (`game_check.py` on `~/games/play/acme-rockets-hog-saga` with this build): passed, bot win,
  no errors, no fallbacks, no text warnings, 40 GIF frames. It is the only real prospect on the hog-saga kit.
- `node hog-saga/tools/reach.mjs`: every goal reachable with all event spots occupied.
