# Hogtopia (kit 5)

A 24-turn, Polytopia-style 4X. The prospect's company grows from its HQ: capture villages, harvest
resources, pick a reward every time a city levels up, train units and research PostHog products (plus a
feature of each, and a few base techs) as the tech tree. An AI rival (their biggest generic problem) with
a personality you learn to read does the same from the other side. Win by taking the rival capital, or by
out-scoring it when the turns run out; the End screen grades the run S-D. About 6-10 minutes. Best for
executive and strategy buyers.

The first game for a prospect is always the same: the classic 18x12 map seeded from the prospect name
(identical to the map this kit always generated) against the gentlest rival to read (Expander). Later
games rotate map types and rival personalities, and a returning player can pick the DAILY map and a HEAT
level on the title (Enter still starts at once with the defaults).

## What the theme changes
| Field | Where it shows | Matters most because |
|---|---|---|
| `products` | The tech tree (research menu, T): each product plus its tier-2 feature | Which PostHog products they "adopt" |
| `game.faction`, `game.cities` | City names, info panel, capture messages | It's their company on the map |
| `game.rival` | Rival name, portrait (per-prospect sprite), taunts, final line | The villain, and the fun |
| `game.tips` | Hedgehog advisor panel, every few turns | Strategy tied to their world |
| `game.tech_lines` | Research menu, under the fixed effect (products only) | Tailored pitch |
| `game.units` | Unit names in menus and info panel (the 5 basic units) | Flavour |
| `game.biome` | Terrain look (meadow, desert, tundra, circuit) | Feel |
| `game.difficulty` | Rival income, unlock timing and aggression | Challenge |
| `game.hq_prompt` | Title screen HQ (per-prospect sprite) | Personal touch |

No theme fields were added overnight. Fixed in code: maps, rules, combat, techs, rewards, personalities
(and their extra taunt lines), monuments, achievements and all unit/terrain art (new art lives in the
fixed `extra` sheet: giant, catapult, boat, monument, wall, park).

## Rules in brief
- Stars: each city pays its level (+1 capital, +1 Workshop); every product owned +1; Data Warehouse +2;
  Pipelines +1 per city.
- Harvest a resource in your land: 2 stars, +1 pop (Experiments: +2). Invest: 5+3xlevel stars, +1 pop
  (Multivariate: 3 cheaper, +2 pop).
- City level-up (Polytopia): pick one of two rewards. L2 Workshop (+1 star/turn) or Explorer (free scout);
  L3 City Wall (defence x2) or Stockpile (+6 stars); L4 Border Growth (radius 2, new resources) or Pop Boom
  (+3 pop); L5 Park (+250 score) or Giant (30 HP super unit). Unchosen rewards are auto-picked at end of turn.
- Units: Intern/scout (move 2), Engineer (basic), Analyst (range 2, Product Analytics), Flag Guard (shield,
  Feature Flags), Bug Catcher (strong + splash, Error Tracking), Catapult (range 3, paper thin, Funnels),
  Giant (L5 reward). Unit cap: city levels + 1 each (+1 capital).
- Techs: 4 base techs (Roads: +1 move inside your borders; Forestry: forests don't stop you; Climbing:
  mountains, +50% defence; Sailing: cross water as boats, only on maps with water), the theme's products
  (tier 1, effects unchanged) and each product's tier-2 feature (Funnels, Heatmaps, Rollouts, Multivariate,
  Alerts, NPS, Pipelines). Cost 4/5/8 by tier + 3 per tech owned.
- Combat is Polytopia's: attack vs defence scaled by HP, defence bonus in forests (x1.25), mountains (x1.5),
  your cities (x1.5; x2 with a Wall or Feature Flags; x2.5 with both), boats x0.8; retaliation if the
  defender survives and is in range. 3 kills make a veteran: full heal, +5 max HP, gold chevron.
- Capture: start a turn on a village or enemy city, press C (Surveys: neutral villages the turn you arrive;
  NPS: they start at level 2). Taking a rival's capital knocks that rival out.
- Monuments (in-game achievements, +150 score each, built on a tile of your land): see the whole map, 3
  cities at level 3, win 10 battles, own 6 techs. Rivals can build the last three too.
- Score: cities x100, city levels x40, techs x40, territory tiles x5, units x10, kills x20, monuments,
  parks, and a speed bonus of 50 per turn left for a domination win. Grade: S 4200+, A 3300+, B 2400+,
  C 1500+, D below (a loss tops out at C).
- The rival: no tech tree; it unlocks units and base techs by turn, gets bonus stars by difficulty and heat,
  and plays one of four personalities: Aggressor, Expander, Turtle, Opportunist (see DESIGN-NOTES.md).
  The advisor names it on turn 2; the rival warns you when it is massing near one of your cities.
- HEAT 0-5 (title, unlocked by winning the level below): rival bonus stars and income, earlier unlocks,
  sharper AI, fewer ruins; HEAT 4+ adds a second rival (a converted village) on the same team.
- P2 truce: on turn 8 (not in the first game) the rival offers a 5-turn truce. Accept: no fights, it turns
  greedy. Refuse: it turns aggressive at once.

## Map types
Classic (first game; the original generator), Highlands, Lakes, Continents, Frontier (4 villages a side),
Archipelago (islands: everyone starts with Sailing, cities reachable by land or sea, the two capitals on
different islands), Skirmish (14x10, 2 villages a side, centred on screen). All point-symmetric and
validated so every city is reachable (over land, except Archipelago). Run n>1 uses seed hash(name+biome+'#'+n) and map rotation[n-1]; DAILY uses the shared
daily seed for the map and the personality.

## Test hooks
`__game.debug`: autopilot (the same AI plays your side, picks rewards, answers the truce and ends turns),
speed (n >= 4: no animation, no particles), god, lose, win, reveal, stars(n), showcase (mid-game skirmish
with a veteran and a monument), flood(n) (load test: fills the map with units).
Hogtopia systems: setup() (seed/map/personality/heat/run index), restart(over), map(type), heat(n),
personality(id), levelUp(cityId?) (opens the reward panel), reward(i), vet(), monument(id), research(id),
truce(), summary() (fake rival turn summary), turn(n), rivalTurn(), techTree(), trainMenu().
Shared: resetMeta, unlockAll, meta(patch), reducedMotion, kitDef, goto, juiceTest.
`__game.stats`: turn, stars, income, techs, cities, rivalCities, neutral, units, rivalUnits, score,
rivalScore, map, mapSize, personality, heat, rivals, daily, runIndex, vets, rivalVets, monuments,
rivalMonuments, perks, pending, truce, battlesWon, kills, lost, scoreParts, assault.

## Tools
`tools/run-sim.sh [N] [difficulties] [personalities|all] [heat] [map|rotate] [passive]`: headless
AI-vs-AI games with the real rules (TABLE=1 for a markdown table, PRODUCTS=a,b,c for a product set).
`SIM=trace tools/run-sim.sh seed diff personality heat map`: one game turn by turn. `tools/shots.py`:
screenshots of every system. `tools/timing.py`: real-time length of an autopilot game at normal speed.

## Known limits
- The rival has no tech tree (by design: PostHog products are the player's edge); its bonus income is
  what difficulty tunes.
- Maps are at most 18x12 (no scrolling). HEAT 4+ second rival sits on a village of the classic layout,
  so those maps are not symmetric.
- The autopilot is stronger than a first-time human; the win rates in DESIGN-NOTES.md are autopilot vs rival.
