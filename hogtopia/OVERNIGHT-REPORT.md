# Hogtopia overnight report (2026-09-27/28)

Branch `overnight/20260927-2143/hogtopia`. Only `hogtopia/` changed. No theme fields were added; every
existing theme (default, 3 examples, the real `ledgerly-hogtopia` prospect) loads and plays.

## What shipped (by milestone, with commits)
- **2ebaa92 P0 core + most of P1.** Code split into data/mapgen/world/ai/setup/progress/menus/scene.
  - Rival AI rewrite: threat map, focus-fire attack scoring, retreat-to-heal, capital garrison, army that
    gathers `mass` units near a target before it goes in, terrain-aware moves, raid response.
  - Four personalities (Aggressor, Expander, Turtle, Opportunist) with their own weights and 3 fixed taunt
    lines each, mixed with the theme's taunts; the advisor names the personality on turn 2.
  - City level-up rewards (2 choices at levels 2-5: Workshop/Explorer, Wall/Stockpile, Borders/Pop Boom,
    Park/Giant) with a modal for you and personality picks for AI sides.
  - Tech breadth: 4 base techs (Roads, Forestry, Climbing, Sailing) + a tier-2 feature per product
    (Funnels, Heatmaps, Rollouts, Multivariate, Alerts, NPS, Pipelines), in a tree-shaped research menu.
  - Veterancy (3 kills: heal, +5 max HP, gold chevron). Juice: lunge, hit flash, kill burst + shake +
    hitstop, capture fanfare, level-up burst, fog fade, eased moves, pop-in, last-4-turns pulse, rival
    turn summary + banner.
  - Map types (Classic, Highlands, Lakes, Continents, Frontier, Skirmish 14x10) with resource densities;
    first game = classic map from the prospect name (byte-identical to the old generator on 1200 seeds x
    4 biomes), later runs rotate by run index, DAILY uses the shared daily seed.
  - Victory types + grading (domination with speed bonus, score at turn 24, S-D grade, End breakdown),
    HEAT 0-5 (bonus stars/income, earlier unlocks, sharper AI, fewer ruins, second rival at 4+),
    4 monuments, 13 achievements, title menu (MAP NEXT/DAILY + HEAT) only for returning players.
  - P2 truce on turn 8 (not in the first game).
- **aea3b8b** balance pass (rival income + growth per difficulty; AI stopped squatting on its cities).
- **93b7c40** rival massing warnings, `debug.flood` (Gate 1 now runs a real load test: 60 fps), rival
  city names keep their number, End shows rivals beaten.
- **7691b69** P2 Catapult siege unit (Funnels), rival moves in the fog no longer wait, menus never stack.
- **16d3709** gentler first game (`FIRST_GAME` overrides), run intro banner, KIT.md/theme prompt/notes.
- **de0c68a** rival-turn banner prioritises fights and captures, key-fuzz playtest tool.
- **5f7d508** fixes from an independent code review (see below).
- **e45ccbf** threatened-city "!" badge, best grade, readable key hints, overnight screenshots.
- **1a1431c** new sounds (warn, fanfare, veteran), End names the next map, rival style in the info
  panel, no second rival on the small map, perks line capped to one line, report.
- **f610fdb Archipelago map** (the brief's "if boats are feasible"): islands, everyone starts with Sailing, the
  capitals on different islands (home island >= 12 tiles); boats drawn under units. Rivals get +4 income
  there because the AI is clumsier at sea; it still favours the player a little (normal ~73%).
  Hard growth nudged 0.55 -> 0.62 to keep the rotation average in range.
- **e95a2bd** E ends the turn from the research/train menus too (found in a scripted human session).
- **bc9cb8a** second review fixes: archipelago capitals could start on a one-tile island (19% of maps;
  home islands are now >= 12 tiles), autopilot switched on mid-animation now resumes, E in the reward/
  truce popups takes the highlighted choice and ends the turn, firstGame stat; a Giant in the GIF showcase.
- Final commit: report and notes.

## Review fixes (5f7d508, bc9cb8a)
Two independent code reviews ran during the night. The first found: losing a *non-home* capital (heat 4+, a rival retaking a capital
you took) ended the game as a loss; your own attack could resolve during the rival turn if you pressed E
during the lunge; the AI's target cost counted its *own* units instead of defenders; a Giant/Explorer
could vanish with no free tile; Session Replay undo could stack two units; monuments were only checked
on some actions; the scene kept using rival 1 after it was knocked out; the classic generator used 80
map attempts instead of the original 60 (a first-game difference on rare seeds). All fixed.

## Balance (headless AI vs AI, `tools/run-sim.sh`, details in DESIGN-NOTES.md)
Later runs (map rotation, heat 0, 80 seeds per cell, autopilot win rate):
easy 96-99%, normal 54-69% (avg 63%), hard 30-50% (avg 40%). ~40% of normal wins are dominations;
normal Aggressors take the autopilot's capital in 20% of games.
First game (classic map, Expander, `FIRST_GAME` overrides): autopilot 100/99/96%, a "casual first-timer"
stand-in 80/54/9% (the original kit gave that stand-in 44/20/14%). A passive player loses the capital on
normal around turn 15. Heat scales smoothly (normal: 61% at heat 0 down to ~5% at heat 5).
Rival behaviour: 72% of its attacks hit already-damaged targets, 38% of moves end on defensive terrain.
Real-time: an autopilot game at normal speed ~150 s, ~1.9 s per rival turn.

## Cut or not done
- No map larger than 18x12 (would need a scrolling viewport); size variety is Skirmish 14x10 vs 18x12.
- The rival still has no tech tree (by design: PostHog products are the player's edge). Its techs are
  turn-based unlocks, which count for score and monuments.
- Easy sits at ~98% for the autopilot instead of ~90%: easy is tuned for a casual first-timer (~80%).

## Screenshots (`hogtopia/overnight-shots/`)
`01-start` first turn, `02-tech` research tree, `03-reward` level-up choice, `04-showcase` veteran +
monuments + attack forecast, `07-summary` rival turn banner, `08-truce` truce offer, `10-end` End screen
with grade and breakdown, `11-run2` second run intro banner (Highlands), `12-title-returning` title with
MAP/HEAT rows, `train` train menu with Catapult, `mass-warning` rival massing warning + "!" badge,
`heat5` two rivals, `map-small` / `map-lakes` / `map-archipelago-play` map types (boats).

## For a human to decide
- Grade thresholds (S 4200 / A 3300 / B 2400 / C 1500) are set from autopilot scores; a first-time human
  will mostly see B-D. Lower them if that feels stingy.
- First-game rival is always the Expander (it races for villages, so the competition is visible). The
  Turtle is even gentler (casual stand-in 61% on normal) if prospects find the first game too hard.
- The truce accept/refuse effects are small weight changes; worth a human playtest.
- Theme writer: `prompts/theme.md` now says the rival has a fixed personality and cities earn rewards,
  so taunts/tips stay generic. No schema change.

## SHARED-REQUESTS
See `hogtopia/SHARED-REQUESTS.md`: `debug.goto` on the active scene, PixelText collapsing spaces, toast
position vs a kit HUD, End screen room for achievements, validated `meta.kitData`.

## Gates
Gate 1 (`tests/accept.py hogtopia`) passed before every commit: 4 themes, bot wins on easy in ~5 s of
game time, fuzz 20/20, and a real load test now (`debug.flood`, ~80 units, 60 fps; before tonight the
kit had no load test). Gate 2 (`~/games/tools/game_check.py` on `ledgerly-hogtopia` re-assembled with
the new build) passed at the final build: bot win, no errors, no fallbacks, no text warnings, 39-frame
GIF showing captures, level-ups and rival lines. Also: `tools/keyfuzz.py` (random real-key play, 10+
sessions across all map types) found no errors or stuck states; classic maps match the original
generator on 1200 seeds x 4 biomes.
