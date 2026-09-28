# Hog Saga (kit 4)

A short classic JRPG in the Dragon Quest / early Final Fantasy mould. The PostHog hedgehog and two
companions (an analyst and a support) start in the prospect's town, walk east through three regions
of one hand-made overworld (meadow, forest with a cave, desert with the boss lair), fight 8 visible
monster encounters in turn-based battles and topple the boss. About 6-8 minutes; best for founders,
execs and growth/marketing buyers who like a story.

## How it plays
- Tile-by-tile walking with two followers. ENTER talks to townsfolk, rests at the inn or a coffee
  station (full heal), and opens chests; walking into a chest or a monster also triggers it. ESC shows
  the party (and uses a Potion on the most hurt member).
- Firewall gates between regions (and at the lair door) drop once that area's monsters are beaten, so
  the route is linear and the party levels naturally from 1 to about 6. No random encounters, no grinding.
- Battles: each round everyone acts in speed order. FIGHT / SKILL / ITEM / DEFEND / RUN (no running
  from the boss). Damage numbers, HP/MP bars, level-up messages with stat gains and new skills.
- Skills (fixed in code; a star marks the prospect's own products):

| Member | Skill (product) | Effect | Learned |
|---|---|---|---|
| Hedgehog (fighter) | Error Tracking | big hit, target takes +30% damage for 3 rounds | LV 1 |
| | Experiments | A/B strike: two hits on random foes | LV 2 |
| | Feature Flags | party takes half damage for 3 rounds | LV 4 |
| Analyst (mage) | Web Analytics | strong single-target magic | LV 1 |
| | Product Analytics | chart blast on every foe | LV 2 |
| | Data Warehouse | magic hit, party regains 4 MP | LV 4 |
| Support (healer) | Session Replay | heal one ally, or revive a knocked-out one | LV 1 |
| | Surveys | foes deal 30% less for 3 rounds; some lose a turn | LV 3 |
| | Coffee Run (not a product) | heal the whole party | LV 5 |

- Items: Potion (60 HP), Ether (25 MP), Hotfix (revive at half HP); start with 3/1/1, chests add more,
  plus a relic ("<top product> Badge", party +3 ATK/MAG, +2 DEF).
- Enemies: 5 theme monsters with fixed archetypes (swarm comes in pairs, fast may act twice, brute
  heavy blows, tank hardens, caster hits the whole party) scaled by encounter tier. The boss has two
  phases (taunt, then an angry phase-2 line with system-wide outages and extra attacks).

## What the theme changes
| Field | Where it shows | Matters most because |
|---|---|---|
| `title`, `tagline` | Title screen | First impression |
| `game.enemies[].name/pain` | Battle opener, map | Their pains as monsters, in their words |
| `game.boss.*` | Lair banner, boss battle | The climax |
| `game.npcs[].line` | Town dialogue | Their users' and team's voice |
| `game.regions`, `game.town` | Banners, HUD | Their product's world as a map |
| `game.party` | Party names in battle, map followers | Their roles on the team |
| `products`, `game.product_lines` | Starred skills, skill descriptions, relic | Which PostHog products they see |
| `palette` | UI, roofs, cave and lair walls, gates | Brand feel |
| `text.*`, `music.mood` | End screen, music | Tone |
| `*.sprite_prompt` | Flux sprites for companions, townsfolk, 5 enemies, boss | Look |

Fixed in the kit: the map, encounter order and groups, stats, skills, items, the hedgehog, tiles.

## Balance (bot, 20 runs while tuning)
Easy: always wins, boss ~8 rounds. Normal: 5/5 wins, boss 11-13 rounds, party down to ~50% HP.
Hard: ~2/3 wins. Fights take 2-5 rounds. The party ends around LV 6.

## Test hooks
`__game.debug`: autopilot (walks the route: talk, chests, rest when below 75% HP, fights in order;
battle AI heals, revives, buffs, uses AoE), speed, god, lose, win, showcase (LV 5 party into the 3-monster
fight), warp(n) (clear encounters before n and stand next to it), levels(n).
`__game.stats`: levels, hp, mp, cleared, chests, kills, rounds, items, pos, battles (per-battle log).

## Known limits
- One map for every prospect; only names, colours and sprites change.
- Flux sprites for people are 16x16 on the map (32x32 on screen in battle panels); fine detail is lost.
- The overworld music plays in battles too (no separate battle track).
- Enemy map sprites are 32x32 on 16px tiles, so they overlap neighbouring tiles a little.
