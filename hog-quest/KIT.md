# Hog Quest (kit 3): Undertale-lite

The PostHog hedgehog walks 3-4 rooms of the prospect's "office", talks to their team, and meets
four of their problems as monsters (3 enemies + a boss). Battles use FIGHT / ACT / POSTHOG / ITEM /
SPARE; enemy turns are 4.5-6.5 s bullet-dodging rounds in a box. The intended route is pacifist:
find the right ACTs (ACT > CHECK says which) or use the right PostHog product (`solved_by`), then
SPARE. About 5-6 minutes for a first run on easy. Best for champions and top accounts: the most
personal kit, since it is mostly their words.

Replay: three endings (pacifist / neutral / bugfix), secrets in every room, a hidden miniboss,
heat 0-5, a boss rush, 14 achievements, and NPCs who remember your last run.

## What the theme controls (game.*)
| Field | Matters because |
| --- | --- |
| `enemies[].solved_by`, `solve_line` | The PostHog pitch: the moment a product fixes their problem. Most important text in the game. |
| `npcs[].lines` | Their team in their own voice; sets up each problem before the player meets it. |
| `enemies[].name/pain/intro/talk`, `boss.*` | The prospect's pain points, made friendly. `talk` lines are the replies to the right ACTs, in order. `pain` is shown by CHECK. |
| `rooms[]` | Picks 3-4 of 5 fixed layouts and names them. 3 rooms = shorter game. |
| `intro`, `ending`, `text.*` | Framing narration and end screen. |
| `ending_pacifist`, `ending_bugfix` | Optional (1-3 lines, max 90). Route endings; missing = `ending`. |
| `difficulty` | easy: 30 HP, slower/sparser bullets. hard: 20 HP, faster, denser. |
| `patterns` | 1-3 from a fixed library of 14 (see below): the monster's voice in its turn script. |

## Battles (src/battle.ts, acts.ts, choreo.ts, dodge.ts, patterns.ts)
- ACT: CHECK + 3 verbs per enemy from a fixed table (LISTEN, ASK, JOKE, DEMO, PRAISE, COFFEE,
  SKETCH, WAIT). Each enemy wants a hidden sequence (2 acts; boss and miniboss 3), seeded from its
  name, so a given game always has the same puzzles. CHECK prints `pain` + the hint. A right act
  shows the next `talk` line and fills the MERCY meter; a wrong one makes it ANNOYED (denser,
  faster turns) until the next right act. Mood tag: CALM / ANNOYED / READY TO SPARE / FURIOUS.
- POSTHOG: `solved_by` = instant full mercy (60% at heat 4+). Other products keep their effects
  (slow, shield, crit, damage, heal, +mercy, shorter turn). First use per battle is free; reuse
  costs 40% TP.
- TP: graze bullets (pass within ~11 px) or touch gems. ITEM: the 6-slot bag (items.ts).
- FIGHT: timing bar with an accent crit zone in the middle (x1.6 damage, hitstop, shake).
- Enemy turns follow a 4-step escalating script: theme patterns plus one fixed "lesson" per enemy
  slot (enemy 1 gems, 2 blue bullets, 3 gravity; miniboss thread). The boss has 3 phases
  (signatures laser, burst, squeeze), advanced by mercy or damage.
- Pattern library: rain, sweep, spiral, bounce, aimed, wall, orbit, laser (warning line then beam),
  thread (snaking gap), gems (bullets turn into TP gems), stoplight (blue: only hurts while moving),
  gravity (heavy soul, UP jumps), squeeze (the box shrinks), burst (marked pops into rings).
- Routes: all 3 enemies spared = pacifist (boss: mercy puzzle), all debugged = bugfix (boss is
  FURIOUS: no sparing, 80 HP, combined patterns every turn), else neutral.

## Exploring (src/explore.ts, extras.ts, shop.ts)
- Room layouts (`src/rooms.ts`): lobby, open_office, server_room, meeting_room, kitchen. 28x15
  tiles each, doors on row 7, fixed spots for NPCs (3), the door blocker, a mid-room guard and the
  boss. With 4 rooms, enemy i guards the exit of room i and the boss has room 4. With 3 rooms,
  enemy 3 guards mid-room 3 and the boss appears there once all three enemies are cleared.
- Fixed extra spots per layout (`src/extras.ts`): a vending machine (rooms 2+), a secret in a piece
  of furniture (glints now and then; inspect with Enter), a save star (checkpoint; 2 retries per
  run), and in the first room a cracked wall hiding the "Tech Debt" miniboss (fixed kit text).
- Gold from battles and secrets buys items. After a battle a coffee refills HP at heat 0, half at
  heat 1-2, nothing at heat 3+.

## Meta (src/save.ts, achievements.ts; shared meta.ts)
- Saved per slug + kit: endings found (shown on the title), secrets ever found, boss rush best
  time, last run's result (NPC memory), visit count; shared meta keeps runs, best score, heat.
- Title menu only from the second visit (first visit: Enter starts the story at once): MODE
  STORY / BOSS RUSH (unlocked by any win), HEAT 0-5 (unlocked one by one by wins).

## Fixed in code
- Bullet patterns, ACT verbs, items, secrets text, the miniboss, achievements and NPC memory
  lines are fixed kit text (generic, PostHog-only).
- Battle music `assets/default/battle.ogg`, boss music `boss.ogg` (music.py, kit audio).

## Semantic fixes at load (reported in __game.themeIssues)
- `solved_by` not in `products`: replaced with a featured product.
- NPC `room` out of range: moved to room i mod n; a full room overflows to the next room with
  space; NPCs beyond the available spots are dropped.
- Missing `ending_pacifist` / `ending_bugfix` are not an issue: they fall back to `ending`.

## Sprite slots
Generated per prospect (Flux, from `sprite_prompt`): `npc_1..6` (16x16, 2 frames), `enemy_1..3`
(32x32, 2 frames), `boss` (48x48, 2 frames). Fixed kit art, recoloured with the brand palette:
`player` (8 frames: down, up, left, right x 2), `tiles` (17-frame sheet, `kind: "sheet"`, never
sent to Flux), `soul`, `bullet`, product icons, `props` (7-frame sheet: vending machine, save
star x2, glint x2, cracked wall, open wall) and `miniboss` (32x32, 2 frames). Neither new slot has
a prompt, so existing prospect manifests simply use the default art.

## Test hooks
`__game.debug`: `autopilot` (pacifist through the right acts, buys Cold Brew, drinks it when low),
`speed`, `god`, `lose`, `win`, `room(i)`, `showcase()` (a battle with an 8 s dense turn, for the
GIF), plus:
- `battle(i)` fight encounter i now (0-2 enemies, 3 boss, 4 miniboss); `pattern(name)` showcase
  turn with one pattern; `flood()` load test (densest combo, 60 s).
- `route('bugfix'|'pacifist')` autopilot route; `outcomes('sds')` mark enemies spared/debugged.
- `heat(n)` set this run's heat; `gold(n)`, `give(itemId)`, `shop()`; `warp(col,row,dir)`,
  `interact()`; `extras()` lists every room's fixed spots; `secrets()` finds every secret.
- Shared: `resetMeta`, `unlockAll`, `meta(patch)`, `reducedMotion`, `goto`, `juiceTest`.
`hooks.state`: title / howto / explore / dialogue / shop / battle / win / lose. Battle stats include
mood, mercy, tp, acts progress, current pattern, grazes, hits, route.

## Known limits
- 16x16 NPCs from Flux are tiny; faces rarely survive pixelisation. The default people read better.
- The bullet-hell boss (bugfix route) beats the autopilot on normal and hard most of the time; the
  bugfix path is meant to be the hard one.
- The dialogue box sits at the bottom, or at the top when the player is low in the room; long NPC
  lines paginate automatically (4 lines of 70 characters per box).
- Boss rush time is in-game seconds (it includes dialogue between fights).
