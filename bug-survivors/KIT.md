# Bug Survivors (kit 1)

A Vampire Survivors-style game. The PostHog hedgehog stands in the prospect's arena while swarms of
bugs named after their pain points close in. Weapons fire on their own and every weapon is a PostHog
product, picked from 3 cards at each level-up. At 3:30 a boss (their biggest generic problem) arrives;
beating it wins. A run lasts about 4 minutes. Best for engineering buyers.

## What the theme changes
| Field | Where it shows | Matters most because |
|---|---|---|
| `title`, `tagline` | Title screen, browser tab | First thing the prospect reads |
| `game.enemies[].name/pain` | "NEW BUG" banner when each type first appears | The personal hook: their own problems, in their words |
| `game.boss.name/taunt` | Boss banner, HP bar, how-to text | The climax |
| `products`, `game.starting_product` | Level-up cards, HUD icons | Which PostHog products they "try" |
| `game.product_lines` | Level-up card text for a new product | Tailored pitch without a pitch |
| `palette` | Background, boxes, highlights, recoloured default art | Brand feel |
| `game.arena.name` | Start banner | Setting |
| `text.win/lose/credits` | End screen | Last impression |
| `game.difficulty` | Enemy HP/damage/spawn, regen | easy for execs, hard for gamers |
| `*.sprite_prompt` | Flux sprites for enemies, boss, floor tile | Look |

Fixed in the kit (never per prospect): the hedgehog, product icons, projectiles, gem, level curve,
weapon behaviour, spawn timeline (swarms at 1:00/2:00/3:00, boss at 3:30).

## Weapons (level 1-5)
Experiments (A/B shots both ways), Error Tracking (homing, pierces), Session Replay (orbiting orbs),
Feature Flags (planted flags that zap), Product Analytics (bar-chart shockwave), Surveys (slowing aura).
Passives: Hedgehog Sprint (speed), Autocapture (magnet), Snack Break (max HP), Hot Reload (cooldown).

## Test hooks
`__game.debug`: autopilot, speed, god, lose, win, warp(seconds), spawnBoss, hurtBoss(frac), giveAll,
maxAll, xp(n), flood(n). `__game.stats`: hp, level, enemies, kills, gems, weapons, boss hp.

## Known limits
- Default art is generic; Flux sprites at 16px keep colour and silhouette but lose fine detail.
- Enemies don't collide with each other beyond a cheap per-cell separation; big swarms can overlap.
- The bot (autopilot) wins on easy; on normal/hard it usually dies around the boss, which is fine for
  Gate 2 (it only needs to reach an end screen).
