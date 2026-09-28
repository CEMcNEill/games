# Hog Saga (kit 4)

A short classic JRPG in the Dragon Quest / early Final Fantasy mould. The PostHog hedgehog and two
companions (an analyst and a support) start in the prospect's town, walk east through three regions
of one hand-made overworld (meadow, forest with a cave, desert with the boss lair), fight 8 visible
monster encounters in turn-based battles and topple the boss. About 6-8 minutes; best for founders,
execs and growth/marketing buyers who like a story. Later runs add New Game+, heat, challenges,
secrets and a superboss.

## How it plays
- Tile-by-tile walking with two followers. ENTER talks, rests at the inn or a coffee station (full
  heal), opens chests and shops; walking into a chest or a monster also triggers it. ESC shows the
  party: UP/DOWN pick a member, LEFT/RIGHT set FRONT/BACK row, ENTER uses a Potion on them.
- Firewall gates between regions (and at the lair door) drop once that area's monsters are beaten, so
  the route is linear and the party levels naturally from 1 to about 6. No random encounters, no grinding.
- **Battles**: each round everyone acts in speed order. FIGHT / SKILL / ITEM / SCAN / DEFEND / RUN (no
  running from the boss or the Wyrm), plus SHIP IT! at the top when the meter is full.
  - Every attack has a kind: STRIKE, MAGIC or DATA. Each archetype is weak to one and resists one;
    icons under each foe show its shield count, `W` (weak) and `R` (resist) kinds, "?" until known.
    SCAN (free, costs the turn) or Web Analytics reveals a foe; any hit reveals the kind it used.
    Knowledge lasts the run.
  - Weak hits do x1.5 and knock a shield point off. At 0 the foe **BREAKs**: it loses its next turn,
    takes x1.5 damage, and any wind-up or charged attack is cancelled. Resisted hits do x0.5.
  - Statuses (8x8 icons): LEAK (memory leak, -6% HP a round), FROZEN (lose a turn), SLOW (throttled,
    acts last), FOCUS (crits often). DEFEND halves damage and grants FOCUS next round.
  - The **Ship It meter** (top right) fills on hits, weak hits, breaks and damage taken, and carries
    between fights. Full: pick a pair combo with a short cut-in.
  - Enemy AI: swarms gang up on the weakest member and leak; fast foes strike twice and slow you; brutes
    wind up (a red "!") then hit hard and freeze; tanks guard hurt allies (taking their single-target
    hits) or harden; casters cure/focus their friends, storm the party or leak one member. The boss
    telegraphs MASS OUTAGE a turn ahead (DEFEND or Feature Flags!), moves its weak spot at 50% HP, and
    on heat 3+ gets a phase 3 at 25% (weak spot moves again, one ROLLBACK heal, more double hits).
- Skills (fixed in code; a star marks the prospect's own products). LV 7 skills come with optional
  content or New Game+:

| Member | Skill (product) | Kind | Effect | Learned |
|---|---|---|---|---|
| Hedgehog (fighter) | Error Tracking | DATA | big hit, target takes +30% for 3 rounds | LV 1 |
| | Experiments | STRIKE | A/B strike: two hits on random foes | LV 2 |
| | Feature Flags | - | party takes half damage and no new statuses for 3 rounds | LV 4 |
| | Code Review (not a product) | STRIKE | two strikes on one foe, the second always crits | LV 7 |
| Analyst (mage) | Web Analytics | MAGIC | strong single-target magic, reveals the target | LV 1 |
| | Product Analytics | MAGIC | chart blast on every foe | LV 2 |
| | Data Warehouse | DATA | magic hit, party regains 4 MP | LV 4 |
| | Dashboards (not a product) | MAGIC | magic on every foe, reveals every weak spot | LV 7 |
| Support (healer) | Session Replay | - | heal and cure one ally, or revive a knocked-out one | LV 1 |
| | Surveys | - | foes deal 30% less and are SLOWed | LV 3 |
| | Coffee Run (not a product) | - | heal and cure the whole party | LV 5 |
| | Standup (not a product) | - | party FOCUSED for 3 rounds, small heal | LV 7 |

| Combo (pair) | Effect |
|---|---|
| LAUNCH DAY (hedgehog + analyst) | a STRIKE, MAGIC and DATA hit on every foe: always finds the weak spot |
| HOTFIX RUSH (hedgehog + support) | a huge STRIKE crit on one foe; party healed 50%, cured, KOs revived |
| INSIGHT LOOP (analyst + support) | strong MAGIC on all; party FOCUSED and +40% MP |
| SOLO SHIP (hedgehog alone) | three STRIKE waves on every foe |

| Archetype | Weak | Resists | Shield |
|---|---|---|---|
| swarm | MAGIC | DATA | 1 |
| fast | STRIKE | MAGIC | 2 |
| brute | MAGIC | STRIKE | 2 |
| tank | DATA | STRIKE | 3 |
| caster | STRIKE | MAGIC | 2 |
| boss phase 1 / 2 / 3 | DATA / MAGIC / STRIKE | STRIKE / DATA / MAGIC | 4 / 5 / 5 |
| Tech Debt Wyrm | DATA | MAGIC | 6 |

- Items: Potion (60 HP, cures LEAK), Ether (25 MP), Hotfix (revive at half HP); start with 3/1/1.
- **Gold and gear**: fights drop gold. Weapon, armour and charm slots per member; 15 fixed pieces
  (Rubber Mallet, Query Wand, Tea Kettle, Hoodie, Firewall Mail, Lucky Duck, Coffee Mug...) with small
  stat bonuses and at most one effect (+2 MP a round, heals 30% more, crits more, -10% damage taken,
  spells +10%, LEAK-proof). New gear equips itself on whoever gains most (the old piece moves on or is
  sold), so there's no inventory screen. The south-west house in town (coin sign) is the shop.
- Chests: 5 on the road (an item plus a piece of gear, and the "<top product> Badge" relic) and 2 hidden.
- **Off the main road** (none of it blocks the route): a secret grove behind a fake tree in the north
  woods (a sparkle twinkles on it), a cracked wall in the cave hiding an old server room, the Old Dev's
  side quest (find the Lucky Keyboard in the north woods), and the optional **Tech Debt Wyrm** by the
  desert lake (first touch warns, the second fights). The footer shows gold, chests x/7, secrets x/4.
- **Overworld events** (seeded per run from 6 fixed spots): a travelling Merchant (rare gear at 80%)
  and two stray chests, each either supplies or a Mimic Chest fight (loot + gold).
- **First-time tips**: the first WEAK hit, BREAK, full meter, red "!" and new gear each show a one-line
  hint once per browser (a banner under the battle message, or a toast on the map; never for the bot).
- **Formation**: back row takes and deals x0.7 physical damage (magic and heals unaffected). Everyone
  starts in the front row; the autopilot puts the analyst and support in the back.

## Replay (meta, localStorage per game slug + kit; blocked storage = first run)
- Title rows (after the first win): MODE `NEW GAME / NEW GAME+ / SOLO HOG / NO ITEMS / SPEEDRUN` and
  `HEAT 0-5`. Enter always starts NEW GAME at heat 0 straight away; on a first visit there is no menu.
- Heat: enemy HP x1.12-1.6 and damage x1.06-1.26, heat 2+ adds a monster to small formations, starting
  potions 3/3/2/2/1/0, heat 3+ boss phase 3.
- New Game+: a win saves the party (levels, stats, skills, gear). NG+ monsters count 3 tiers higher,
  the boss and Wyrm get +35% HP and +15% power per cycle (max 3), and chest gear is remixed from a rare
  pool with the run seed. Stars and "NG+ READY" on the title after a win.
- Challenges: SOLO HOG, NO ITEMS (item chests sell for gold), SPEEDRUN (clock in the footer, best time
  on the End screen).
- 14 achievements (Shipped It, Scanner, Breaker, Break Point, Pair Up, Treasure Hunter, Off The
  Roadmap, Lost And Found, Debt Paid (hidden), Lean Team, No Crutches, Solo Founder, Under Pressure,
  Sequel). End screen extra lines: run tags, breaks/combos/gold, best speedrun time, unlock notice.

## What the theme changes
| Field | Where it shows | Matters most because |
|---|---|---|
| `title`, `tagline` | Title screen | First impression |
| `game.enemies[].name/pain` | Battle opener, map | Their pains as monsters, in their words |
| `game.enemies[].archetype` | Battle AI, weakness and resistance | How each fight plays |
| `game.boss.*` | Lair banner, boss battle | The climax |
| `game.npcs[].line` | Town dialogue | Their users' and team's voice |
| `game.regions`, `game.town` | Banners, HUD | Their product's world as a map |
| `game.party` | Party names in battle, map followers, combo cut-ins | Their roles on the team |
| `products`, `game.product_lines` | Starred skills, skill descriptions, relic | Which PostHog products they see |
| `palette` | UI, roofs, cave and lair walls, gates | Brand feel |
| `text.*`, `music.mood` | End screen, music | Tone |
| `*.sprite_prompt` | Flux sprites for companions, townsfolk, 5 enemies, boss | Look |

No theme fields were added overnight. Fixed in the kit: the map, encounter order and groups, stats,
skills, combos, weaknesses, statuses, items, gear, the shop, the Old Dev, the Merchant, the Tech Debt
Wyrm, the Mimic, the hedgehog, tiles, the battle and boss music (`public/assets/kit/*.ogg`).

## Balance
Autopilot at speed 8, default theme, 10 runs per row unless noted (2026-09-28). "Game s" is
`__game.elapsed` (explore + battle time at 1x, no reading time), so a human first run is ~6-8 min.

| Setting | Wins | Game s (median, range) | Boss rounds | Party HP left after boss (median) | Breaks / combos / scans per run |
|---|---|---|---|---|---|
| easy | 10/10 | 303 (288-328) | 5-8 | 60% | 11.5 / 2.8 / 4.5 |
| normal | 10/10 | 338 (297-366) | 8-10 | 56% | 15.9 / 4.0 / 5.1 |
| hard | 10/10 | 385 (356-420) | 9-12 | 48% | 20.0 / 4.8 / 5.3 |
| normal, newcomer bot (`naive`: no scan, weakness, DEFEND or rows; does press SHIP IT!) | 9/10 | 322 (301-343) | 8-12 | 49% | 9.5 / 3.7 / 0 |
| hard, newcomer bot (8 runs) | 7/8 | ~373 | 10-19 | ~27%, several near-wipes | 12 / 5.2 / 0 |
| normal + optional content (`optional`, 6 runs) | 6/6 | 528 | boss 4-7, Wyrm 13-16 | boss 49-83%, Wyrm 25-54% | all 7 chests, 4/4 secrets, LV 7; a Mimic takes 5-6 rounds at LV 1 |
| heat 3 / heat 5 (6 runs each) | 6/6 / 4/6 | 454 / 520 | 12-14 / 14-18 | 46-57% / 34-41% | heat 5 losses come in the first fights (0 potions, 3-monster packs) |
| SOLO HOG (8 runs) | 7/8 | 407 | 17-26 | 9-34% | - |
| NEW GAME+ after a real win (2 chains) | 2/2 | - | 11 | 52% | party LV 6 -> 8 |

Everyone ends around LV 6 (7 with the Wyrm). Gold per run ~165-180 (enough for 2-3 shop pieces).
Tuning notes: boss 1400 HP (x diff x heat x NG), MASS OUTAGE x1.7 (was x2.0: the newcomer bot lost
2/8), hard = HP x1.25 / damage x1.06, solo monsters HP x0.55 / damage x0.65.

## Test hooks
`__game.debug`: autopilot (walks the route: talks, shops for empty gear slots and potions, chests,
rests below 75% HP, fights in order; in battle it scans unknown foes, targets known weaknesses to
break them, uses combos when the meter is full, defends or casts Feature Flags against telegraphed
attacks, heals, revives, buffs; puts casters in the back row), speed, god, lose, win (also saves the
NG+ party), showcase (LV 5 party with a nearly full meter into the 3-monster fight), warp(n),
levels(n), plus:
- `optional(on)`: the autopilot also does the side quest, secrets, both hidden chests, the merchant,
  the event chests and the Wyrm (off by default).
- `run(mode, heat, seed?)`: restart as standard/ngplus/solo/noitems/speedrun at heat 0-5.
- `heat(n)`, `gold(n)`, `gear(id)`, `meter(n)`, `breakAll()`, `wyrm()`, `mimic()`, `flood()` (load test:
  endless showcase fight with a combo every turn), `place(spot)` (shop, quest, item, grove, vault, wyrm,
  merchant, ev0, ev1), `events()`, `secrets()`, `saga()` (the kit save), `botGoal()`.
- `unlockAll()` (works on the title too): shared unlockAll plus a saved LV 8 geared party for NG+.
`__game.stats`: levels, hp, mp, cleared, chests, kills, rounds, items, relic, pos, battles (per-battle log),
meter, known, breaks, combos, scans, gold, secrets, flags, mode, heat, ng, itemsUsed, gear, status.
Tools: `tools/bot.py` (N bot runs -> balance numbers), `tools/shots.py` (scripted screenshots),
`tools/reach.mjs` (map check: every goal reachable with all event spots occupied).

## Known limits
- One map for every prospect; only names, colours and sprites change.
- Flux sprites for people are 16x16 on the map (32x32 on screen in battle panels); fine detail is lost.
- Enemy map sprites are 32x32 on 16px tiles, so they overlap neighbouring tiles a little.
- Challenge modes are exclusive (one MODE at a time) because the shared title menu has 2 rows.
- Status and kind icons are 8x8 at 1x: readable at the usual 2x+ zoom, tiny at 1x.
