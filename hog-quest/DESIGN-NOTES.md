# Hog Quest: design notes (overnight 2026-09-27)

North star: a charming 5-minute first run, then "wait, what happens if I...?" drives runs 2 and 3.
First run on easy/heat 0 stays 4-6 minutes: every new system is either optional (secrets, shop,
TP) or teaches itself in one line (CHECK says what the enemy wants).

## M1: battles as puzzles (ACT, mercy meter, mood, FIGHT crit)
- Menu becomes FIGHT / ACT / POSTHOG / SPARE (ITEM joins in M5). TALK is gone: ACT opens a 2x2
  submenu of CHECK + 3 verbs, picked per enemy from a fixed verb table (LISTEN, ASK, JOKE, DEMO,
  PRAISE, COFFEE, WHITEBOARD, WAIT...). Seeded by a hash of the enemy's name, so a given prospect
  game always has the same puzzle (knowledge carries between runs, like Undertale).
- Each enemy has a hidden right sequence of 2 acts (boss 3). CHECK prints `pain` plus a hint
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

## M4+: routes, items, secrets, heat, boss rush, achievements (see below as they land)
