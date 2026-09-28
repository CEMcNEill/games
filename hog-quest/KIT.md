# Hog Quest (kit 3): Undertale-lite

The PostHog hedgehog walks 3-4 rooms of the prospect's "office", talks to their team, and meets
four of their problems as monsters (3 enemies + a boss). Battles use FIGHT / TALK / POSTHOG /
SPARE; enemy turns are 4.5-6 s bullet-dodging rounds in a box. The intended route is pacifist:
use the right PostHog product (`solved_by`) or TALK enough, then SPARE. About 4-6 minutes.
Best for champions and top accounts: the most personal kit, since it is mostly their words.

## What the theme controls (game.*)
| Field | Matters because |
| --- | --- |
| `enemies[].solved_by`, `solve_line` | The PostHog pitch: the moment a product fixes their problem. Most important text in the game. |
| `npcs[].lines` | Their team in their own voice; sets up each problem before the player meets it. |
| `enemies[].name/pain/intro/talk`, `boss.*` | The prospect's pain points, made friendly. |
| `rooms[]` | Picks 3-4 of 5 fixed layouts and names them. 3 rooms = shorter game. |
| `intro`, `ending`, `text.*` | Framing narration and end screen. |
| `difficulty` | easy: 30 HP, slower/sparser bullets. hard: 20 HP, faster, denser. |
| `patterns` | Picks from a fixed library: rain, sweep, spiral, bounce, aimed, wall, orbit. |

## Fixed in code
- Room layouts (`src/rooms.ts`): lobby, open_office, server_room, meeting_room, kitchen. 28x15
  tiles each, doors on row 7, fixed spots for NPCs (3), the door blocker, a mid-room guard and the
  boss. With 4 rooms, enemy i guards the exit of room i and the boss has room 4. With 3 rooms,
  enemy 3 guards mid-room 3 and the boss appears there once all three enemies are cleared.
- Bullet patterns (`src/patterns.ts`) and product effects (`src/battle.ts` EFFECTS): each
  product that isn't the enemy's `solved_by` still does something distinct (slow, shield, crit,
  damage, heal, +mercy, shorter turn). Each product can be used once per battle.
- HP is refilled after every battle ("a PostHog coffee").

## Semantic fixes at load (reported in __game.themeIssues)
- `solved_by` not in `products`: replaced with a featured product.
- NPC `room` out of range: moved to room i mod n; a full room overflows to the next room with
  space; NPCs beyond the available spots are dropped.

## Sprite slots
Generated per prospect (Flux, from `sprite_prompt`): `npc_1..6` (16x16, 2 frames), `enemy_1..3`
(32x32, 2 frames), `boss` (48x48, 2 frames). Fixed kit art, recoloured with the brand palette:
`player` (8 frames: down, up, left, right x 2), `tiles` (17-frame sheet, `kind: "sheet"`, never
sent to Flux), `soul`, `bullet`, product icons.

## Test hooks
`__game.debug`: `autopilot`, `speed`, `god`, `lose`, `win`, `room(i)`, and `showcase()`, which jumps
into a battle with an 8 s dense bullet turn (for the gameplay GIF). `hooks.state`:
title / howto / explore / dialogue / battle / win / lose.

## Known limits
- 16x16 NPCs from Flux are tiny; faces rarely survive pixelisation. The default people read better.
- There is no FIGHT timing for the bot (it always spares), so the kill path is covered only by fuzzing
  and manual play.
- No second (battle) music track; the exploration track keeps playing.
- The dialogue box sits at the bottom, or at the top when the player is low in the room; long NPC
  lines paginate automatically (4 lines of 70 characters per box).
