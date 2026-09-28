# HogShop (kit 6)

An Overcooked-style packing game. The PostHog hedgehog runs the back room of the prospect's shop (default:
HogShop, PostHog's demo store at shop.hogflix.dev). Orders arrive as tickets, products ride in on two
conveyor belts, and the player packs each order at a table and carries the sealed box to the right shipping
door before the customer loses patience. 5 days of ~75 s; a first week takes about 6-7 minutes.
Best for e-commerce, retail, marketplace and operations buyers.

## Controls
Arrows/WASD move. SPACE (also E, J, Enter) does the obvious thing where you stand: grab an item off a belt,
pack it into its order's box, take bubble wrap, lift a sealed box, ship it through a door, bin a return, pull
a jammed belt's lever, or put something back on a belt. A bouncing hint (▼ PACK, ▲ MEALWORMS, ▼ SHIP)
always shows what SPACE will do. Keys 1-4 are PostHog tools.

## What the theme changes (contract: kit/game.schema.json)
| Field | Where it shows |
|---|---|
| `title`, `tagline` | Title screen, browser tab |
| `game.store.name` | Day intros, how-to, endings ("{store}") |
| `game.manager` | Morning briefings (portrait + name + title) |
| `game.items[]` (6-8) | The products on the belts and tickets (sprites item_1..8), names in the grab hint; `fragile` ones need wrap from day 3 |
| `game.hot_item` | Day 4-5 limited-stock order (sprite hot_item): only two ever come down the belt |
| `game.customers[]` | Names on the order tickets |
| `game.docks` | Names on the three doors (standard / express / international) |
| `game.days[].intro` | The manager's morning line, one per day |
| `game.jam.name`, `game.rush.name` | Day 4's breakdown banner, day 5's sale-day banner |
| `products` | First 4 become tools on keys 1-4 |
| `palette` | Background, boxes, the door frames and lever knob (brand tokens in the default art) |
| `*.sprite_prompt` | manager portrait, floor tile, item and hot-item sprites (per-prospect art) |

Fixed in the kit: the hog (hog-quest art), boxes, belts, tables, doors, levers, bins, wrap, icons, timings.

## How a week plays
| Day | New | Orders | Notes |
|---|---|---|---|
| 1 | packing basics | STD only, 1-2 items, every ~11 s | quota 4 (easy) / 5 / 6 |
| 2 | EXPRESS orders | ~45% EXP (34 s patience vs 52 s) | orange door |
| 3 | FRAGILE items | up to 3 items | wrap first, then the fragile item (a red ! on the ticket) |
| 4 | INTERNATIONAL + JAMS + HOT ITEM | all three doors | a belt stops every 15-24 s until its lever is pulled; 2 limited-stock orders (the hot item spawns at most twice per order) |
| 5 | RUSH | every ~6 s | sale banner, speed bonus doubled, quota +2 |

- Tables: 3. An order gets a table as soon as one is free (ticket badge T1-T3, ".." = waiting). Max 5 open orders.
- The belts favour items that open orders need (~72%), else random stock; unclaimed items fall back into the chutes.
- Stars (start 5.0): lost order -0.5, wrong door -0.45 (and the box comes back on a belt as a return: bin it for +30
  or lose 0.2 more), each order short of the day's target -0.2; fast shipments (+0.1) and any shipment (+0.03)
  earn stars back. Scaled by difficulty (easy x0.7) and heat. 0 stars = the shop closes (lose).
- Score: 100 per order (+50 EXP, +60 INT, +150 hot item) + speed bonus + combo (3+ fast in a row), +200 per met
  target, + rating x 200 at the end of a won week.
- Grades per day S-D (shipped vs target, minus mistakes); 5 endings (five-star, order machine, open for business,
  still standing, closed).

## Tools (products, keys 1-4, cooldowns ~26-30 s)
INSIGHTS (product_analytics): needed items glow on the belts for 10 s. REWIND (session_replay): the last lost or
misdelivered order comes back with its stars. SLOW-MO (feature_flags): belts at 40% for 9 s and every jam clears.
A/B TEST (experiments): +50% speed for 10 s. SURVEY (surveys): every open order +40% patience, +0.2 stars.
CATCH (error_tracking): the next star loss is forgiven, and until then the ship hint warns WRONG DOOR.

## Modes and meta
Title rows: MODE (WEEK, ENDLESS after the first win, DAILY) and HEAT 0-5 (faster orders, less patience, faster belts,
bigger losses, longer cooldowns; heat 3+ jams from day 2). Endless: one shift with every mechanic, orders speed up
until the stars run out. 12 achievements (one hidden). Kit save: endings found, best grade per heat, endless best.

## Test hooks (window.__game.debug)
autopilot, speed, god, lose, win, skipDay, day(n), rating(v), jam(i), tool(i), hog(x, y), hint(), orders(), heat(n),
mode(m), unlockAll, endings, flood (load test), showcase (busy day-4 shift for the GIF).
`hogshop/tools/shots.py [out] [--theme t.json]` takes review screenshots and plays a bot week.

## Analytics (optional PostHog capture)
day_started, order_shipped {ship, items, fast}, order_lost, order_misdelivered, tool_used, ending_reached, plus the
shared game_opened/game_started/game_finished.
