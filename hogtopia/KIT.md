# Hogtopia (kit 5)

A 24-turn, Polytopia-style 4X on an 18x12 map. The prospect's company grows from its HQ: capture
villages, harvest resources, invest in cities, train units and research PostHog products as the
tech tree. An AI rival (their biggest generic problem) does the same from the other side. Win by
taking the rival capital, or by out-scoring it when the turns run out. About 6-10 minutes. Best for
executive and strategy buyers.

## What the theme changes
| Field | Where it shows | Matters most because |
|---|---|---|
| `products` | The tech tree (research menu, T) | Which PostHog products they "adopt" |
| `game.faction`, `game.cities` | City names, info panel, capture messages | It's their company on the map |
| `game.rival` | Rival name, portrait (Flux), taunts, final line | The villain, and the fun |
| `game.tips` | Hedgehog advisor panel, every few turns | Strategy tied to their world |
| `game.tech_lines` | Research menu, under the fixed effect | Tailored pitch |
| `game.units` | Unit names in menus and info panel | Flavour |
| `game.biome` | Terrain look (meadow, desert, tundra, circuit) | Feel |
| `game.hq_prompt` | Title screen HQ (Flux) | Personal touch |

Fixed in code: map generation (seeded from the prospect name, point-symmetric so both sides are equal,
validated so every city is reachable), rules, combat, tech effects, the AI and all unit/terrain art.

## Rules in brief
- Stars: each city pays its level (+1 for a capital) per turn; Data Warehouse +2.
- Harvest a resource in your land: 2 stars, +1 city pop (Experiments: +2). Invest: 5+3xlevel stars, +1 pop.
- Units: Intern/scout (move 2), Engineer (basic), Analyst (range 2, Product Analytics), Flag Guard
  (shield, Feature Flags), Bug Catcher (strong + splash, Error Tracking). Unit cap: city levels + 1 each.
- Combat is Polytopia's: attack vs defence scaled by HP, defence bonus in forests and your cities
  (Feature Flags doubles city defence), retaliation if the defender survives and is in range.
- Capture: start a turn on a village or enemy city, press C (Surveys: neutral villages the turn you arrive).
- Session Replay: U rewinds one move per turn. Product Analytics reveals the map. Ruins give stars, a map
  or a free tech.
- Rival: no tech tree; it unlocks unit types by turn and gets bonus stars (easy 0, normal +1, hard +2).

## Test hooks
`__game.debug`: autopilot (the same AI plays your side and ends turns), speed (n >= 4: no animation),
god, lose, win, reveal, stars(n), showcase. `__game.stats`: turn, stars, income, techs, cities,
rivalCities, neutral, units, rivalUnits, score, rivalScore.

## Known limits
- The AI is simple: it expands, harvests, invests and attacks when the odds are good; it rarely
  masses an assault, so most games end on score, not a capital capture.
- No undo beyond Session Replay; no diplomacy; one rival.
