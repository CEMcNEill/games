# Hog Quest: overnight report (2026-09-27 -> 28)

Branch `overnight/20260927-2143/hog-quest`. Everything is inside `hog-quest/`. Gate 1 passed at
every commit; Gate 2 (pawprint-hog-quest, the only real prospect on this kit) passes.
Details and design reasoning: `DESIGN-NOTES.md`. How it plays now: `KIT.md`.

## What shipped
| Commit | Milestone |
| --- | --- |
| e0fb304 | P0: ACT menu (CHECK + 3 verbs, seeded hidden sequence, CHECK hints), mercy meter + moods (CALM / ANNOYED / READY / FURIOUS), 14 bullet patterns (+ laser, thread, gems, stoplight/blue, gravity, squeeze, burst), escalating 4-step choreography with one "lesson" pattern per enemy, 3-phase boss, grazing + TP (reuse a product for 40% TP), FIGHT crit zone, juice (soul flash/blink, shake, hitstop, spare sparkle, death dust in the enemy's own colours, stripe battle transition), battle + boss music (music.py), debug.flood load test |
| 4db5d8d | P1/P2: routes (pacifist / neutral / bugfix) with different bosses and endings, optional `ending_pacifist` / `ending_bugfix`, endings on the title; gold, vending machine (4 items), 6-slot bag, ITEM command; a secret in every layout, a hidden door to the "Tech Debt" miniboss, "true" last line; save stars (checkpoint, 2 retries); heat 0-5; boss rush (unlocked by a win, timed, best kept); 14 achievements; NPC memory between runs |
| 3214726 | First CHECK per battle is free; the boss's CHECK only shows its current want (mood shifts after each right act); annoyed tint; "ready" cue; docs; SHARED-REQUESTS |
| add5ebb | Enemy speech bubbles, heat in the HUD, "+N%" mercy float, rush best on the title, lose() re-entry guard |
| 75e217e | First run kept short: heat 0 = 1 right act per enemy (boss 2); sequences grow with heat and reshuffle per run from heat 1. `debug.humanize()` for run-length measurement. Looser "thread" pattern |
| e4ad69b | Battle text tables moved to `battletext.ts`; `overnight-shots/` |
| 81b609c | NPCs react when you talk to them again (spared vs debugged so far); a guilty line for debugging a problem that was ready to be spared |
| (final) | Music resumes after a checkpoint retry; review fixes; report |

## Cut or changed
- Nothing from the brief was cut. Two things were changed after measuring:
  - The first design used 2-act puzzles (boss 3) from the first run. A humanized autopilot put the
    first run at ~5 min vs 3.1 min before tonight, so heat 0 now asks for 1 right act (boss 2);
    depth arrives with heat. First run is now 4.2 min (see below).
  - The bullet-hell boss (bugfix route) started at 90 HP and beat the autopilot on normal 2/3
    times; now 80 HP (3/3 wins on normal, with retries).
- The vending machine is in every room after the first, not only kitchen/lobby: a theme may pick
  neither layout, and the first room has no gold to spend yet.

## Balance (tools/botbatch.py; game_s = in-game seconds at speed 6)
| Setting | Result |
| --- | --- |
| Pacifist autopilot, easy / normal / hard, heat 0 | 2/2 wins each, ~149 game_s (before tonight: 117) |
| Example themes (acme-rockets, ledgerly 3 rooms, pawprint), normal | win each, 169-176 game_s (before the heat-0 change) |
| Bugfix route (`debug.route('bugfix')`), easy / normal | 3/3, 3/3 (normal uses the save-star retries) |
| Bugfix route, hard (boss at 90 HP) | 0/3 (hard is meant to be hard) |
| Heat 2 / heat 4, normal | 2/2 / 2/2, ends with 11-20 HP |
| Heat 5, easy / hard | 2/2 / 0/2 (hard heat 5 = 10 max HP) |
| Boss rush, easy / hard | 2/2 each, 114 game_s |
| Load test (debug.flood: spiral+laser+rain+orbit, ~80 bullets) | 60 fps min |
First-run length, humanized autopilot (reads ~25 chars/s, 1.2 s per menu, CHECKs every enemy), speed
1 = real seconds, easy, pacifist: **before tonight 186 s (3.1 min), now 250 s (4.2 min)**. The extra
is reading CHECK and the bot's vending machine visits, both optional.

## Screenshots worth a look (`overnight-shots/`, `sheet.png` = all)
- `01-title-returning.png`: endings found + rush best + mode/heat rows for a returning player.
- `03-act-menu.png`, `04-check-hint.png`, `05-wrong-act-annoyed.png`: the puzzle loop.
- `06`-`12`: the new patterns with their one-line captions.
- `13-fight-bar.png`: crit zone. `14-bugfix-boss-hell.png`: the FURIOUS boss.
- `15-vending-machine.png`, `16-hidden-door.png`, `17-miniboss.png`, `18-end-pacifist.png`.

## For a human to decide
1. **Is 4.2 min vs 3.1 min OK for the first run?** It is inside the brief's 4-6 minutes. To get
   closer to before: make CHECK optional reading (it already is), or shorten regular enemy turns
   from 4.5 s to 4 s.
2. **Bugfix route difficulty.** The FURIOUS boss is a real bullet hell; on hard the autopilot loses.
   That's the intent ("harder, pure bullet hell"), but a sales demo might want it softer.
3. **Theme writer prompt**: `prompts/theme.md` now mentions the new patterns and the optional route
   endings. Existing prospect themes don't need regenerating (no required fields changed).
4. **The pacifist tease line** on the end screen ("What if you FOUGHT every problem?") nudges
   players to the violent route. On-brand for Undertale; say if sales would rather not.
5. Music: battle.ogg / boss.ogg were generated once and not listened to by a human (the boss track
   was 5 dB louder than the others and was normalised).

## Shared requests (`SHARED-REQUESTS.md`)
1. `debug.goto('Title')` from the Title shows a black screen (stop-then-start of the same scene).
2. The sanitiser fills missing optional fields with default.json text (prospect leak risk); hog-quest
   undoes it in postSanitize. Suggest an "optional, leave missing" schema flag.
3. A shared way to load and switch extra music tracks (battle/boss).
4. A `titleLines()` hook for kit lines on the title (hog-quest draws endings via titleArt).
5. `cleanText` collapses runs of spaces (columns need separate texts).

## New hooks (all on `__game.debug`)
`battle(i)`, `pattern(name)`, `flood()`, `route(r)`, `outcomes('sds')`, `heat(n)`, `humanize()`,
`gold(n)`, `give(id)`, `shop()`, `warp(col,row,dir)`, `interact()`, `extras()`, `secrets()`.
Tools: `tools/botbatch.py` (N autopilot runs, win rate + stats), `tools/shots.py` (screenshots),
`tools/longtext.py` (max-length theme text check: no cuts, no errors).
