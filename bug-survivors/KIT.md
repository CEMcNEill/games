# Bug Survivors (kit 1)

A Vampire Survivors-style game. The PostHog hedgehog stands in the prospect's arena while swarms of
bugs named after their pain points close in. Weapons fire on their own and every weapon is a PostHog
product, picked from 3 cards at each level-up. At 3:30 a boss (their biggest generic problem) arrives;
beating it is ACT 1 CLEAR: cash out with the win (about 4 minutes), or continue into Act 2 for new PostHog
tools, powerups and a final boss (about 7-8 minutes in all). Best for engineering buyers.

The first run (Enter on the title = RUN, heat 0, hero Max) plays like the original through the 3:30 boss:
same length, same boss time, winnable by a novice on easy/normal. Depth comes from Act 2 and later runs:
evolutions, heat 1-5, the shop, heroes, endless and the daily run.

## What the theme changes (unchanged contract: no new theme fields)
| Field | Where it shows | Matters most because |
|---|---|---|
| `title`, `tagline` | Title screen, browser tab | First thing the prospect reads |
| `game.enemies[].name/pain` | "NEW BUG" banner, "NEW TRICK" / "ELITE" banners, event banners | The personal hook: their own problems, in their words |
| `game.boss.name/taunt` | Boss banner, HP bar, how-to text | The climax |
| `products`, `game.starting_product` | Level-up cards, HUD icons, hero start weapons | Which PostHog products they "try" |
| `game.product_lines` | Level-up card text for a new product | Tailored pitch without a pitch |
| `palette` | Background, boxes, highlights, recoloured default art | Brand feel |
| `game.arena.name` | Start banner | Setting |
| `text.win/lose/credits` | End screen | Last impression |
| `game.difficulty` | Enemy HP/damage/spawn, regen | easy for execs, hard for gamers |
| `*.sprite_prompt` | Flux sprites for enemies, boss, floor tile | Look |

Fixed in the kit (never per prospect): the hedgehog and hats, product and passive icons, projectiles, gem,
coin, chest, food, hotfix bomb, vacuum magnet, crate, level curve, weapon behaviour, evolutions, timeline, and all
of Act 2 (tool icons, Max AI drone and bolt, vault drum, the four powerups: tools/make_act2_sprites.py).
New sprites use master-palette letters only (no brand digits), so existing prospect builds show them correctly
without re-rendering.

## How a run plays
- **Timeline (heat 0):** swarmers, then splitters (0:30), exploders (1:00), chargers + tanks (1:40), spitters (2:30).
  Elites at 1:30 and 2:30. Events: 1:00 ring encirclement, 2:00 stampede (warning chevrons, always a gap),
  3:00 elite pack. Heat or daily runs shuffle the event order. Boss at 3:30.
- **Enemy archetypes:** each theme enemy drives two behaviours: enemy 1 swarmer / exploder (fuse, area blast),
  enemy 2 splitter (two minis) / charger (telegraphed dash), enemy 3 tank (armoured) / spitter (keeps distance,
  slow shots). Variants are tinted and get a one-time "NEW TRICK" banner with a tip.
- **Elites:** 1.6x size, ~9x HP, one modifier (fast / shielded / regenerating), drop a chest + coins.
- **Chests:** evolve a weapon if one is ready, else fuse (secret), else level up 1-3 owned items. Always gold.
- **Weapons (level 1-5) and evolutions** (weapon at level 5 + partner passive + a chest):
  Experiments + Pair Programming = Multivariate Barrage; Error Tracking + Rubber Duck = Stack Trace Storm;
  Session Replay + Autocapture = Rage Click Vortex; Feature Flags + Hot Reload = Kill Switch Grid;
  Product Analytics + Big Monitor = Funnel Quake; Surveys + Code Review = NPS Blizzard.
  Secret: Rage Click Vortex + Stack Trace Storm + another chest = Full Stack Nova (orbs fire stack traces).
- **Passives (max 6 held):** Hedgehog Sprint (speed), Autocapture (magnet), Snack Break (max HP),
  Hot Reload (cooldown), Code Review (armour), Big Monitor (area), Pair Programming (+projectiles, max 3),
  Rubber Duck (crit), Docs Day (XP), Lucky Commit (luck), Rollback (revive, max 1).
- **Level-up:** cards weighted toward the build (owned items, evolution partners), "Evolves with X" hints.
  R reroll, X skip (+3 gold), B banish: 1 each per run (more from the shop).
- **Pickups:** gems (XP), coins (gold for the shop), food (+25 HP), vacuum magnet (all gems fly in),
  hotfix bomb (clears the screen, chips the boss). Breakable crates are the steady source of food.
- **Hazards:** tech-debt puddles spread and slow the hog to 55%.
- **Boss:** attack library of ring, telegraphed charge, spiral (heat 2+ or angry) and summon (angry). Angry at
  50% HP or after 50 s (then 1.5x faster); at heat 5 it rages at 25%. From 50 s it also "crumbles": +5% damage taken
  per second (max x8), so weak first-run builds still finish near 4-5 minutes.
- **Pause (ESC):** each weapon with its evolution status (EVOLVED, READY, needs LV 5 / the partner passive), and the act.

## Act 2 (after the 3:30 boss)
- **ACT 1 CLEAR** (the field is cleared, gems fly in): CONTINUE (default, Enter) or CASH OUT (today's win screen,
  "BUGS SQUASHED!"). The bot takes CONTINUE.
- **PostHog Toolbox:** pick 1 of 3 Act 2 tools, free. From then on the level-up pool also offers the tools.
  Act 2 starts with full HP and a Self-Driving Mode pickup a few steps away.
- **Act 2 (3:00):** all six bug behaviours mixed from the start, x1.35 spawns, bug HP x1.3 ramping to x2.6 over the
  act (on top of the usual time scaling), x1.3 damage. Elites at +0:15, 0:50, 1:25, 2:05. Events: +0:20 TRAFFIC SPIKE
  (double spawns for 10 s after a burst), 1:00 stampede, 1:40 INCIDENT (a spiral of 44 bugs around the screen edge
  over ~3 s), 2:30 elite pack.
- **Final boss** at +3:00: the theme boss as "<boss name> 2.0": x1.35 size, lavender tint, x7 boss HP, and a new
  telegraphed attack, **Rollout**: four lines from the boss blink for 0.9 s, then go live for 0.45 s. Beating it is
  a full win: "FULL STACK CLEAR!" (+5000 score). Heat 5's 45 s overtime comes after the final boss.
- **Act 2 tools** (kit-fixed like evolutions; not theme products, so the theme contract is unchanged; level 1-5):
  | tool | weapon | behaviour | evolution |
  |---|---|---|---|
  | Web Analytics | Traffic Beam | beam(s) sweeping around the hog (2 from LV 4, +Pair Programming) | - |
  | Heatmaps | Heat Trail | hot tiles left behind the hog | + Hedgehog Sprint = Heat Wave (bigger, longer, slows bugs) |
  | PostHog AI | Max AI | a drone that shoots homing bolts at the highest-HP bug in range | + Docs Day = Deep Research (3 bolts that jump) |
  | Data Warehouse | Warehouse Vault | 1-3 heavy drums orbiting wide, big knockback | - |
  | Workflows | Pipeline | a zap that hops bug to bug (3-7 hops) | - |
- **Powerups** (pickups with a bobbing glow ring; at most 2 on the floor). Act 1: elites 15%, crates 4%, bugs 0.05%.
  Act 2: elites 50%, crates 12%, bugs 0.12%.
  | powerup | effect |
  |---|---|
  | Self-Driving Mode | 5 s: keys ignored, the hog steers itself toward gems and away from crowds at x1.25 speed; no damage taken. Blue screen tint, rings, countdown under the clock, "BACK TO YOU" |
  | Feature Freeze | 4 s: bugs and their shots stop (and are harmless), the boss moves and attacks at half speed |
  | Ship It! | 8 s: every weapon fires twice as fast (cooldown x0.5) |
  | Rewind | HP back to where it was 5 s ago (at least +15), 1.5 s invulnerable, a replay of your path |
- **Endless:** the first boss kill opens the Toolbox and switches on Act 2 content (spawn table, events, elites, tools,
  powerup rates); the boss keeps returning every 2:00 as before.
- **Juice:** merged damage numbers (N toggles, saved), crit numbers in gold, white hit flash, knockback,
  hitstop on elite/boss kills and big crit kills, death pops in each bug's own sprite colours, level-up burst +
  slow-mo, gem pitch climbs as the XP bar fills, vacuum "whoop", boss arrival/death shake + flash.

## Title menu, meta and modes
- Title rows: `RUN  DAILY  ENDLESS  SHOP` and `HEAT 0-5`. Enter = RUN heat 0. ENDLESS unlocks after the first win.
  Heat n unlocks by winning heat n-1 (shared meta).
- **Heat (stacking):** 1 more bugs, 2 faster bugs, 3 elites early (4 lone elites), 4 no regen + half food,
  5 boss rage phase + 45 s overtime after the boss. Each level also adds pressure that ramps in over 2:30: up to
  +15% bug HP and +10% spawns per level, plus a flat +8% damage. The elite pack stays the 3:00 event.
  Gold x(1 + 0.1 heat), score x(1 + 0.2 heat).
- **SHOP** (title choice): UPGRADES (might, max HP, speed, magnet, luck, reroll, skip+banish, rollback), HEROES,
  RECORDS (achievements, evolution codex, lifetime totals). Gold per run is roughly 60-110 at heat 0 and ~110 at heat 3; the full shop costs ~2900, so about 15-25 runs.
- **Heroes:** Max (theme start weapon), Sprinter (Session Replay + speed, unlocked by 2000 lifetime kills), Wizard (Product
  Analytics + area, by evolving a weapon), Hacker (Error Tracking + crit, by winning heat 2). A hero's weapon is used only
  if the theme features it, else the theme's starting product.
- **Endless:** boss returns every 2:00 (HP x2 each time); bugs ramp hard after 5:00; score = time + kills + bosses.
- **Daily:** today's seed fixes the start weapon, spawn order, events, drops and cards; hero is always Max;
  best daily score shows on the title.
- **Achievements:** 13 (one hidden), shown in SHOP > RECORDS and as toasts.
- Save: shared meta blob per slug + kit (`meta.data.kit`: shop, hero, lifetime kills/gold/chests, codex, daily best,
  damage-number setting). Blocked storage = first run, never a crash.

## Analytics (optional PostHog capture, unchanged transport)
Kit events: `product_picked` (product, level, player_level), `weapon_evolved` (product, evolution, t), `bug_event`
(event, t), `act2_start` (t, level, tools), `cash_out` (t, level, kills), `powerup` (kind, t, act), plus the shared
`achievement`. `game_finished` props add gold, hero, evolutions, elites, boss_kills, act, full_clear, cashed_out, powerups.

## Test hooks
`__game.debug`: autopilot(on, style) (`'novice'` = first card, no rerolls, ignores pickups), speed, god, lose, win,
showcase (evolved weapons for the GIF), warp(seconds), spawnBoss, hurtBoss(frac), giveAll, maxAll, xp(n), flood(n),
evolve(id), evolveAll, superNova, passives(lvl), chest(big), pickup(kind), hotfix, crate, puddle, elite(arch),
event(id), spawn(arch, n), heat(n), gold(n), numbers(on); Act 2: act2 (kills the Act 1 boss: ACT 1 CLEAR screen),
startAct2, finalBoss, bossHere(dx), bossHp(mult), tool(id), tools, powerup(kind) (drop), activate(kind); in the shop: shopBuy(id), hero(id), tab(i); plus the shared
resetMeta, unlockAll, meta(patch), goto, juiceTest.
`__game.stats`: hp, level, enemies, kills, gems, items, weapons ('evo' when evolved), passives, gold, heat, mode, hero,
elites, chests, evolutions, bossKills, superNova, rerolls, dmg (per weapon), act, act2At, finalBoss, fullClear, cashedOut,
tools, powerups, pu (active timers), bossMode. States add `actbreak` and `toolbox` (modals).
Act 2 screenshots: `uv run -q --with playwright python bug-survivors/tools/shots_act2.py [out_dir]`.
Balance runs: `uv run -q --with playwright python bug-survivors/tools/sim.py --n 6 --diff normal --heat 3 [--novice]`.

## Known limits
- Default art is generic; Flux sprites at 16px keep colour and silhouette but lose fine detail. Variant
  archetypes are told apart by tint, size and behaviour, which is weaker on very dark themed sprites.
- Enemies don't collide with each other beyond a cheap per-cell separation; big swarms can overlap.
- The smart bot wins easy and normal heat 0 almost always and survives 15:00 of endless; high heat is bimodal
  (early death or a 3-4 evolution snowball). See DESIGN-NOTES.md for the numbers.
- `debug.goto('Title')` while already on the title leaves a black screen (shared); tools save + reload instead.
