# Bug Survivors: overnight report (2026-09-27/28)

Branch `overnight/20260927-2143/bug-survivors`. Only `bug-survivors/` changed. No theme fields added or changed;
every existing theme (default, 3 examples, 2 real prospects) loads and plays. Gate 1 passed at every commit;
Gate 2 passes on both real prospects (nimbus-grocer, tidewater-logistics).

## What shipped
| Milestone | Commit | Notes |
|---|---|---|
| P0: juice, 6 enemy archetypes + elites + chests, 6 evolutions, 11 passives, reroll/skip/banish + weighted cards, food/vacuum/hotfix/coins, ring/stampede/elite-pack events; P1 scaffolding (heat, shop, heroes, endless, daily, 13 achievements, end summary) | bee00fd | game.ts split into content/weapons/cards/save/shop modules; 14 new fixed sprites (coin, chest, food, hotfix, vacuum, crate, 5 hats, 7 passive icons) using master-palette letters only |
| Heat tuning, separate seeded RNG streams (daily determinism), `tools/sim.py` | d7f0356 | |
| Novice autopilot style, boss enrage timer, endless ramp, UI moved above the shared juice layer | 5c6aea2 | first run back to ~4:00 for weak builds |
| P2 arena hazards: breakable crates, spreading tech-debt puddles | c3fc3f0 | |
| End summary sized to fit the shared lines, calmer GIF showcase, KIT.md, theme prompt note, SHARED-REQUESTS | 6618537 | |
| Exploder fuse ring + visible blasts, `debug.win` in overtime, `tools/shots.py` + overnight-shots | fe87973 | |
| Shop-vs-skill pass: heat gold bonus +25% -> +10%/level, Sprinter unlock at 2000 lifetime kills | 6bb2eb3 | |
| Report, KIT analytics section | (final commit) | |

P2 status: arena hazards done; secret super evolution done (Rage Click Vortex + Stack Trace Storm + a chest =
**Full Stack Nova**, hidden achievement); boss pattern library done (ring, telegraphed charge, spiral, summon;
the pool grows with heat and phase; heat 5 adds a rage phase at 25% HP).

How it plays now, the hooks and the limits are all in `KIT.md`. The design reasoning and every balance run are in
`DESIGN-NOTES.md`.

## Balance (autopilot at speed 6 via `tools/sim.py`, 4 runs per row unless noted)
| config | wins | game s | notes |
|---|---|---|---|
| before tonight, easy h0 | win | 227 | level 22, 766 kills |
| easy h0, novice bot (first card, no rerolls, no pickups) | 4/4 | 228-242 | the first-run target: ~4:00 |
| easy h0, smart bot | 4/4 | 220-307 | every run evolved one weapon, ~100 gold |
| normal h0, smart | 4/4 | 221-260 | 4/4 evolved |
| hard h0, smart (before later tuning) | 1/4 | 87-221 | |
| normal h1 | 4/4 | 223-404 | |
| normal h3 | 3/4 | ~229 avg | 107 gold avg |
| normal h5, no shop | 1/4 | 57-269 | bimodal: early death or 4-evolution snowball |
| normal h5, might 2 + HP 2 | 1/4 | 74-275 | |
| normal h5, might 3 + HP 3 + luck 2 + reroll 1 | 4/4 | 263-274 | led to the gold cut; see "decide" below |
| endless normal, smart | alive at 15:00 | 850-900 | level ~90, 3-5 bosses killed |
Gate 1 bot (easy, speed 6): win at 219-277 s game time on every run tonight.
Perf: `flood(300)` x2 with every weapon evolved, the fusion and 6 passives at level 5: 60 fps (about 90 projectiles, 300
bugs). Gate 1 load test: 60 fps min.

## Screenshots worth a look (`bug-survivors/overnight-shots/`)
`sheet.png` has all of them. Highlights: `01-levelup-hints` (evolution hints on the cards), `02-evolution-chest`,
`03-evolved-chaos`, `04-stampede-warning`, `06-tricks-elite-hazards`, `10-overtime`, `11-end-screen` (damage split,
heat unlock, achievements), `13-15` shop tabs, `16-17` heat 2 with the Sprinter hero (cap).
Gate 2 contact sheets and GIFs showed evolved weapons (gold-framed HUD icons) with the prospects' own bug names; the
Tidewater bot run even reached the fusion.

## Cut, reverted, or changed from the brief
- "Kill 500 bugs" unlock became **2000 lifetime kills**: a heat-0 win is ~1100 kills, so 500 unlocked the Sprinter
  (and the evolve-unlocked Wizard) during run one, leaving nothing to chase.
- Passives: the brief's list (armour, luck, area, duration, amount, crit, growth, revive) became 7 new ones;
  **duration was dropped** (few weapons have a duration worth scaling). 11 total, max 6 held.
- Heat has 5 levels and 6 named modifiers, so level 5 combines "boss rage phase" and "45 s overtime". Every heat level
  also adds +8% bug HP / +6% damage / +6% spawns; named modifiers alone didn't bite (more bugs = more XP).
- Character select lives in SHOP > HEROES (the shared title menu has room for only 2 rows: mode + heat).
- Endless is a title mode unlocked by the first win, not a "continue?" prompt after the boss (that would block the
  End screen the tests rely on).
- No per-weapon damage *chart* on the End screen: EndScene is shared, so it's one DAMAGE line (top 4 %).

## For a human to decide
1. **Shop strength vs heat 5.** ~545 gold of upgrades (about 5 runs) takes the smart bot from 1/4 to 4/4 at heat 5.
   I cut the heat gold bonus rather than weaken the upgrades. If heat 5 should stay a skill check, lower might/HP
   per level (content.ts SHOP + `recalc()`).
2. **Normal h0 is easier than before tonight** (smart bot 4/4 vs "usually dies near the boss"). That keeps the
   first run safe for execs but may feel soft to gamers on `normal`; `hard` still loses 3/4.
3. **Endless never ends for the smart bot** by 15:00. Humans will die much sooner; a hard cap (a VS-style reaper at
   20:00) is a one-liner if wanted.
4. Banner text uses plural bug names ("Flaky Tests that charge"). Theme names that start with "The" read oddly
   there; I added a note to `prompts/theme.md` rather than new theme fields.

## Shared requests (`bug-survivors/SHARED-REQUESTS.md`)
debug.goto to the active scene leaves a black screen; juice depth 1000 draws over kit UIs (moved ours to 1100+);
a title choice that opens a kit scene (SHOP currently hooks HowTo's create event); floatText scale; EndScene line
budget; sfx pitch parameter; a "debug hooks return plain data" note (a hook returning a sprite made Playwright eat
17 GB).

## Verification at the final commit
- `node build-kits.mjs bug-survivors`, `npx tsc --noEmit -p .`: clean.
- Gate 1 `tests/accept.py bug-survivors`: PASS (4 themes, bot win, fuzz 20/20, load 60 fps).
- Gate 2 `game_check.py` on nimbus-grocer-bug-survivors and tidewater-logistics-bug-survivors: exit 0; contact sheets
  and GIF frames checked.
- Blocked `localStorage` (getter throws): title, shop, run, win, End, replay all fine, no page errors.
- Daily: two fresh daily starts get the same seed and start weapon.
