# Hog Quest: design notes (overnight 2026-09-27)

North star: a charming 5-minute first run, then "wait, what happens if I...?" drives runs 2 and 3.
First run on easy/heat 0 stays 4-6 minutes: every new system is either optional (secrets, shop,
TP) or teaches itself in one line (CHECK says what the enemy wants).

## M1: battles as puzzles (ACT, mercy meter, mood, FIGHT crit)
- Menu becomes FIGHT / ACT / POSTHOG / SPARE (ITEM joins in M5). TALK is gone: ACT opens a 2x2
  submenu of CHECK + 3 verbs, picked per enemy from a fixed verb table (LISTEN, ASK, JOKE, DEMO,
  PRAISE, COFFEE, WHITEBOARD, WAIT...). Seeded by a hash of the enemy's name, so a given prospect
  game always has the same puzzle (knowledge carries between runs, like Undertale).
- Each enemy has a hidden right sequence of acts (heat 0: 1 act, boss 2; heat 1: 2, boss 3;
  heat 2+: 3; miniboss always 3). Heat 0 puzzles are fixed per game; heat 1+ reshuffles per run. CHECK prints `pain` plus a hint
  ("Wants to be heard first, then could use a laugh."), so a first-timer is never stuck.
  The right act shows the next theme `talk` line (they already build from confusion to relief)
  and fills the mercy meter. A wrong act shows fixed kit text and makes the enemy ANNOYED:
  denser, faster patterns until the next right act.
- Mercy meter (0-100) drawn under the enemy HP bar, with a mood tag: CALM / ANNOYED / READY.
  READY = mercy 100 (or HP <= 25%): patterns get sparser and its name turns accent-coloured.
- solved_by product = instant 100 mercy: the fast pitch moment stays the best move.
- FIGHT: the timing bar gets a narrow crit zone in accent colour. Crit = x2 damage, hitstop and a
  shake. The bugfix route is playable by pressing Enter at the centre.

## M2: pattern depth, choreography, grazing
- Library grows from 7 to 14: + laser (warning line, then beam), thread (a snaking gap through
  columns), gems (bullets that turn into collectible gems: +TP), stoplight (blue bullets: only hurt
  if you are moving), gravity (heavy soul, UP jumps over floor bullets), squeeze (the box shrinks),
  burst (bullets pop into rings).
- Choreography: each enemy's turns escalate over 4 steps built from its theme patterns plus one
  fixed "lesson" pattern per enemy slot (enemy 1 teaches gems, 2 teaches blue, 3 teaches gravity),
  so every fight introduces one new rule. Boss: 3 phases, each with a signature pattern, advanced
  by mercy (pacifist) or HP (violent).
- Grazing: a bullet passing within ~11 px without hitting gives TP (once per bullet) with a
  sparkle. TP (0-100%) lets you reuse an already used PostHog product for 40% TP. Pure skill
  reward: it never makes anything harder.

## M3: juice + music
- Soul hit: white flash, invulnerability blink, shake scaled by damage. Spare: sparkle burst and
  the enemy fades. Kill: dust particles in the enemy's own colours (sampled from its sprite).
- Battle transition: the soul drops out of the player and the screen flashes/stripes into battle.
- Battle music (`assets/default/battle.ogg`) and boss music (`boss.ogg`), fixed kit audio from
  music.py. Exploration music pauses during battles and resumes after.

## M4: routes and endings
- Route = how the three regular enemies ended: all spared = pacifist, all debugged = bugfix, else
  neutral. Pacifist boss: the 3-act mercy puzzle; each right act moves it into its next phase
  (signature patterns laser -> burst -> squeeze). Bugfix boss: FURIOUS, can't be spared, 80 HP,
  every turn combines its signature with its own pattern (pure bullet hell); its solved_by product
  still helps (20 damage) so the pitch survives even on the violent route.
- Optional theme fields `ending_pacifist` / `ending_bugfix` (1-3 lines, max 90), falling back to
  `ending`. When a theme omits them, postSanitize drops the default theme's copy (the sanitiser
  would otherwise borrow default.json's text into a prospect's game).
- Endings found are saved (meta.kitData) and shown on the title ("ENDINGS 1/3: PACIFIST ??? ???");
  the end screen names the ending and teases a missing one ("What if you FOUGHT every problem?").

## M5: items and the vending machine
- Gold drops from battles (spare 10, debug 15, +1 per 3 grazes up to +10) and secrets.
- A vending machine stands in every room after the first (fixed spot per layout, `extras.ts`):
  Cold Brew 12G (+12 HP), Big Donut 22G (+25 HP), Hog Hoodie 16G (half damage next turn),
  Lo-fi Beats 14G (slower next turn). 6-slot bag; ITEM is a 5th battle command (uses the turn).
- Coffee after a battle: full heal at heat 0, half at heat 1-2, none at heat 3+. Items matter there.

## M6: secrets, hidden door, miniboss, save stars
- Every layout has one furniture cell hiding something (plant, shelf, rack, whiteboard, coffee
  machine). It glints for a moment every ~2.6 s. Inspect it (face it, Enter) for fixed kit text and
  15 G or an item.
- The first room's top wall has a cracked cell. Knock on it: "Tech Debt", a fixed kit miniboss
  (3-act puzzle, `thread` lesson), fixed text, fix = one of the theme's products.
- Find every room's secret and settle Tech Debt: a "true" last line after the ending, and the
  hidden achievement.
- Save star per room (fixed floor spot): checkpoint, full heal at heat 0. Losing a battle after a
  checkpoint puts you back at the star as things were (2 retries per run; not in boss rush).

## M7-M9: heat, boss rush, achievements, NPC memory
- Title menu appears from the second visit on (first visit: clean title, Enter = story):
  MODE STORY / BOSS RUSH (unlocked by any win) and HEAT 0-5 (shared heatRow).
- Heat per level: -2 max HP, +8% density, +3% bullet speed; act sequences 1 -> 2 -> 3 steps
  (boss 2 -> 3) and reshuffled every run from heat 1;
  heat 3+: no free coffee; heat 4+: the solved_by product only fills the mercy meter to 60 (you
  still need one right act).
- Boss rush: the four problems back to back, half a coffee between fights, clock in the battle HUD,
  best time saved.
- 14 achievements (achievements.ts). NPC memory: on a return visit the first NPC comments on your
  last run (lost / pacifist / bugfix / neutral); from the third visit the last NPC drops a hint
  (secrets, other endings).

## Balance (autopilot, tools/botbatch.py, speed 6; game_s = in-game seconds)
Measured mid-night, before the heat-0 puzzle change; final numbers are in OVERNIGHT-REPORT.md.
| Setting | Win rate | Avg game_s | Notes |
| --- | --- | --- | --- |
| Pacifist, easy / normal / hard, heat 0 | 3/3 each | 164-175 | before: 117 s (fewer turns per battle) |
| Bugfix route, easy | 3/3 | 150 | ends with 14-26 HP |
| Bugfix route, normal | 1/3 | 170-346 | the bullet-hell boss (then 90 HP) beat it twice, even with retries |
| Bugfix route, hard | 0/3 | ~320 | lowered hell boss HP 90 -> 80 after this |
| Heat 5, easy | 2/2 | 223 | ends with 12-20 of 20 HP |
| Heat 5, hard | 0/2 | 213-380 | 10 max HP: two hits and you're out |
| Boss rush, easy / hard | 2/2 each | 114 | |
The bot is a strong dodger and never hesitates in menus. First-run length for a human is an
estimate, not a measurement: the bot's pacifist run grew from 117 to ~170 game-seconds (+45%), so
a first run that took 4 minutes before should now take roughly 5-6. Nobody has timed a human run.

### First-run length (humanized autopilot, speed 1, so wall time = player time)
`debug.humanize()` makes the autopilot read at ~25 characters a second, think 1.2 s per menu and
CHECK every enemy once, like a curious first-timer. Same patch applied to the pre-overnight kit
(13b37b4) for a baseline:
| Build | First run (easy, pacifist) |
| --- | --- |
| Before tonight (TALK/product, no CHECK) | 186 s (3.1 min) |
| First version tonight (2-act puzzles, boss 3) | ~306 game-s at speed 6 (too long) |
| Now (heat 0: 1 act per enemy, boss 2) | 250 s (4.2 min) |
The remaining +64 s is reading CHECK (free, once per battle) and the bot's vending machine detours:
both optional. Depth (2-3 act sequences) now starts at heat 1.
