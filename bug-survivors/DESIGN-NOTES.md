# Bug Survivors: overnight design notes

North star: the Vampire Survivors "one more run" pull. The first run (heat 0, RUN, default hero) must
still be a ~4 minute win for a novice on easy/normal; depth comes from later runs.

## Code layout (after the restructure)
- `src/content.ts`: every data table (weapons + evolutions, passives, enemy archetypes, elites, events,
  heat, shop, heroes, achievements). Adding content = adding a row.
- `src/game.ts`: the GameScene (loop, player, enemies, pickups, boss, HUD).
- `src/weapons.ts`: one function per weapon (base + evolved form), called by the scene.
- `src/cards.ts`: level-up choice weighting and the autopilot's card ranking.
- `src/save.ts`: kit save data on top of `meta.kitData` (shop levels, hero, totals, daily best, codex).
- `src/shop.ts`: SHOP / HEROES / CODEX screen reached from the title menu.
- `src/main.ts`: kit definition: title menu, end summary, achievements.

## M1 juice
What: hitstop on elite/boss kills and crit kills of big bugs, knockback (kept), white flash (kept),
merged damage numbers (per-bug 0.25 s accumulation + a global budget, N toggles, saved), gem vacuum with
a rising "whoop", level-up fanfare (ring burst + 0.4 s slow-mo before the cards), boss arrival/death
shake + hitstop, a death pop in each bug's own sprite colours (sampled from the texture at start, so
themed Flux sprites pop in their own colours). Why: every hit should be felt, and the chaos should read
as "I did this". Interaction: the step is skipped while `hitstopped(this)`; `debug.speed(n)` calls
`setJuiceSpeed(n)` so bots aren't slowed; slow-mo runs on sim time so it shrinks at bot speed.

## M2 enemy archetypes + elites
Theme enemies stay 3 (names, pain text, sprites). Each theme enemy drives two behaviours:
| theme enemy | base | variant (tinted) |
|---|---|---|
| 1 (fast swarmer) | swarmer | exploder: fuse when close, area blast; kill it at range |
| 2 (sturdy mid) | splitter: splits in two minis | charger: telegraphed dash (flash + line) |
| 3 (slow tank) | tank: slow, armoured (60% damage), heavy | spitter: keeps distance, slow shots |
Variants get a one-time "NEW TRICK" banner with a kit line that tells a novice what to do.
Elites: 1.6x size, 8x HP, tinted by modifier (fast / shielded / regenerating), drop a chest.
Timeline (heat 0): swarmers first, splitters from 0:30, exploders 1:00, chargers + tanks 1:40,
spitters 2:30. Elites at 1:30 and 2:30, elite pack at 3:00.

## M3 evolutions + passives
Weapon at level 5 + its partner passive (any level) evolves when you open a chest (elite or boss).
| weapon | partner passive | evolution |
|---|---|---|
| Experiments | Pair Programming | Multivariate Barrage |
| Error Tracking | Rubber Duck | Stack Trace Storm |
| Session Replay | Autocapture | Rage Click Vortex |
| Feature Flags | Hot Reload | Kill Switch Grid |
| Product Analytics | Big Monitor | Funnel Quake |
| Surveys | Code Review | NPS Blizzard |
Passives (11): Hedgehog Sprint (speed), Autocapture (magnet), Snack Break (max HP), Hot Reload (cooldown),
Code Review (armour), Big Monitor (area), Pair Programming (+projectiles), Rubber Duck (crit),
Docs Day (XP), Lucky Commit (luck), Rollback (revive, max 1). Max 6 passives held: a real choice.
Cards show "EVOLVES WITH X" hints.

## M4 level-up choices
Reroll (R), Skip (X, +gold), Banish (B: removes that card for the run) 1 each per run, more from the
shop. Weighted pool: owned items and evolution partners are favoured, new weapons stay likely early.

## M5 pickups + events
Food (heal), vacuum magnet (all gems fly in), hotfix bomb (clears the screen, boss takes a chip),
gold coins (banked for the shop). 1:00 ring encirclement, 2:00 stampede across the screen (with
warning arrows), 3:00 elite pack.

## P1
Heat 0-5 (title HEAT row, stacking): 1 more bugs, 2 faster bugs, 3 elites early, 4 less healing,
5 boss rage phase + 45 s overtime after the boss. Gold x(1 + 0.25 heat).
Title mode row: RUN, DAILY, ENDLESS (after first win), SHOP. Enter = RUN heat 0.
Shop: might, max HP, speed, magnet, reroll, luck, skip/banish, rollback. Heroes: 4 hog variants
(tint + hat), unlocked by achievements. Endless: boss every 2:00 after the first, stronger; score =
time + kills. Daily: seeded weapon, spawns, drops, events, cards; best daily score on the title.

## Balance log
(filled in as measured)
