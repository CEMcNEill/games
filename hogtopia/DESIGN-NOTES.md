# Hogtopia design notes (overnight 2026-09-27)

Goal: Polytopia's "just one more game". A rival with a readable personality, a choice at every city
level, a broader tech tree, and maps that differ from game to game, while the first game for a prospect
stays the same map it always was and an exec can finish it in 6-10 minutes.

## Code layout
- `src/data.ts`: content tables (units, techs, level rewards, personalities, difficulty, heat, monuments).
- `src/mapgen.ts`: map presets and the point-symmetric generator. `classic` at 18x12 is byte-identical
  to the old generator (checked on 1200 seeds x 4 biomes).
- `src/world.ts`: rules, pure logic. Supports 2 or 3 factions (owner 0 = you, 1 = rival, 2 = second rival
  at heat 4+). Rivals are one team (`team(o)`, `foes(a, b)`).
- `src/ai.ts`: the AI for every side (the autopilot is the same AI with the `AUTOPILOT` personality).
- `src/setup.ts`: which map/personality/seed this run uses. `src/progress.ts`: grade, achievements, End lines.
- `src/menus.ts`: tech tree, train, reward and truce panels. `src/scene.ts`: rendering, input, turn flow, juice.
- `tools/sim.ts` (+ `run-sim.sh`): headless AI-vs-AI balance runner. `tools/trace.ts`: one game turn by turn.
  `tools/shots.py`: screenshots of every new system.

## M1 (P0): rival AI, personalities, level-up rewards, tech breadth, veterancy, juice

**Rival AI.** Each turn: captures, then a focus-fire loop (score every attack: kills worth a lot, damage
worth more on already-hurt targets, retaliation and suicide penalised, bonus for hitting units next to or
on its cities; ranged units soften first), then a plan: pick a target city (distance + garrison, sticky
between turns), count the army within 4 tiles of it and only go in (`assault`) once `mass` units have
gathered; otherwise hold 3 tiles out. Roles: a capital garrison (always for Turtle from turn 6, anyone
when enemies are within 3), hurt units retreat to the nearest free city to heal, expanders are paired
greedily with neutral villages by arrival time, and a raid response sends nearby units to any city with an
enemy on or next to it. Moves are scored per tile: distance to goal, terrain defence (forest, mountain,
own city) x personality `terrain`, and a danger map (who could reach and hit that tile next turn).

**Personalities** (data table, chosen per game): Aggressor (early, masses 3, takes bad trades), Expander
(village race, invests), Turtle (garrison + walls, defenders and archers, late push), Opportunist (hunts
hurt units, soft cities). Each has 3 fixed taunt lines mixed with the theme's taunts, and the advisor names
the personality on turn 2 so the player learns to read it. Difficulty and heat shift aggro turn, mass and
risk.

**Level-up rewards.** Levels 2-5 each offer two rewards (Workshop/Explorer, Wall/Stockpile,
Border Growth/Pop Boom, Park/Giant). The player picks in a modal (LEFT/RIGHT, ENTER, or 1/2); AI sides
pick by personality with sanity checks. Unchosen rewards are auto-picked at end of turn so no level is lost.

**Tech breadth.** 4 base techs (Roads, Forestry, Climbing, Sailing - the last only if the map has water),
every product keeps its effect and gains a tier-2 feature (Funnels, Heatmaps, Rollouts, Multivariate,
Alerts, NPS, Pipelines). Every tech changes something visible (move range highlight, unit stats in the
train menu, red danger ticks, city income). Cost = 4/5/8 by tier + 3 per tech owned. Only products pay
the +1 star/turn. Rivals keep their turn-based unlocks (and those count as techs for score/monuments).

**Veterancy.** 3 kills: full heal, +5 max HP, a gold chevron. Kills counted for the killer on either side.

**Juice.** Attack lunge + white hit flash on both sides, damage float text (shared pool), burst + small
shake + 45 ms hitstop on kills, capture burst + CAPTURED!/LOST! + city punch, level-up burst + LEVEL n,
fog fades out over 380 ms, unit moves ease, new units pop in, last 4 turns pulse the turn counter red,
rival turn summary in the message bar plus a banner when it took a city or killed a unit. At speed >= 4
(bot) every tween/particle is skipped.

**Balance (headless, 40 games per cell, autopilot vs rival, classic map, heat 0).** The new autopilot
is far stronger than the old one, so the rival needed help to hit the brief's targets. Symmetric check
(both sides same AI, no techs): ~50% on easy, so the AI itself is fair; the player's edge is the tech tree
and monuments. Levers: rival start stars, flat income, and `growth` (income + turn x growth).

See the tables at the end (updated after each milestone).
