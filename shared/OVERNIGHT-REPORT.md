# Shared foundations: overnight report (phase 0)

Branch `overnight/20260927-2143/shared`. Only `shared/` and the README Layout section changed (the brief asked
for that README change). No kit, `tests/` or `build-kits.mjs` changes. No theme fields added.

## API summary (details at the top of each file)
- **`shared/src/meta.ts`**: one versioned blob per `phkit:<manifest slug>:<kit id>` in localStorage. Every
  access is try/catch; blocked storage falls back to an in-memory copy (tested with a `localStorage` getter
  that throws: every kit starts, plays and restarts).
  - `meta.data` (runs, wins, bestScore, fastestWinS, longestRunS, maxHeatCleared, streak, bestStreak, coins,
    unlocks, achievements, settings.reducedMotion, history[10], kit{}), `meta.load/save/reset`.
  - `meta.recordRun({won, score, durationS, heat?, mode?, stats?})` returns `RunResult`
    `{newBest, prevBest, firstWin, fastestWin, heatUnlocked, runNumber, streak}`.
  - `meta.bank(n)`, `meta.spend(n)` (bool), `meta.unlock(id)`, `meta.has(id)`, `meta.heatUnlocked()` (0-5),
    `meta.kitData(defaults)` (free-form per-kit save space), `meta.achievements()`, `meta.achievementCount()`.
  - `achieve(id)`: idempotent; the first time it toasts `ACHIEVEMENT: <name>` and logs an `achievement` event.
  - `dailySeed()`, `hash32(s)`, `randomSeed()`, `rng(seed)` → `{next,int,float,chance,pick,shuffle}`.
- **`shared/src/juice.ts`**: `shake(scene, px, ms)`, `hitstop(scene, ms)` + `hitstopped(scene)` /
  `juiceScale(scene)` + `setJuiceSpeed(n)`, `flash(target)`, `punch(target)`, `burst(scene, x, y, colour, n, opts)`
  (one Graphics per scene, ≤400 pooled particles), `floatText(scene, x, y, text, colour)` (≤24 pooled
  PixelTexts), `toast(scene, text)` (queued, drawn by a new always-on `Overlay` scene so it survives scene
  changes). Reduced motion (meta setting; defaults to the OS `prefers-reduced-motion`) disables shake/punch
  and halves particles.
- **`KitDef` (all optional)**: `titleMenu()` returns a flat choice list (one `mode` row) or up to 2 rows
  `{key, label?, choices:[{label, value, locked?}]}`; `heatRow(max)` builds a HEAT row locked above
  `meta.heatUnlocked()`. LEFT/RIGHT change, UP/DOWN switch rows, locked choices are skipped and drawn faded.
  **Enter starts at once with the first unlocked choices.** Picks are remembered for the session only.
  `endSummary(data, result)` gives extra End lines; `achievements: {id, name, desc, hidden?}[]`.
- **`K.run`** `{mode, heat, seed, daily, number, choices, startedAt}` is always set (defaults: standard, 0,
  random seed) and renewed by `beginRun()` at Title start and End replay. `finishRun({won, score})` records
  once per run (EndScene calls it automatically; kits may call it earlier to get the `RunResult`).
- **Title**: a returning player sees `BEST n   RUNS n   WINS n   ACHIEVEMENTS a/b` at the top; a first visit
  shows nothing extra. With a menu, PRESS ENTER moves up 10 px and the rows sit at y 229-245.
- **End**: `NEW BEST!` (blinking, only if there was a previous best) or `BEST n` next to the score, kit summary
  lines, `HEAT n UNLOCKED` (only if the title had a heat row), `NEW: <achievements this run>`. Prompt is
  `ENTER: ONE MORE RUN   ESC: TITLE`; R also replays.
- **Analytics**: `game_started` and `game_finished` now carry `run_number`, `heat`, `mode` (+ `new_best` on finish).
- **Hooks**: `__game.meta`, `__game.run`; shared debug entries survive a kit's `hooks.debug = {...}` (the
  setter merges them in): `resetMeta()`, `unlockAll()` (all achievements, heat 5, 12 runs, best 12345,
  999 coins), `meta(patch?)`, `reducedMotion(on)`, `kitDef()` (live KitDef, e.g. inject a titleMenu),
  `goto(sceneKey)`, `juiceTest()`.
- **`shared/tools/meta_shots.py <out> <kit...>`**: screenshots of the first-visit title, juice test, End,
  title with fake meta + test menu, End with meta, and the blocked-storage run.

## Notes for kit agents
- Kits that integrate their own dt (all five do) must skip their step while `hitstopped(this)` is true, or
  hitstop only freezes tweens/timers. Call `setJuiceSpeed(n)` from `debug.speed(n)` so hitstops shrink at bot speed.
- If a kit defines its own `debug.unlockAll`, it replaces the shared one; call `sharedDebug.unlockAll()` from it.
- The Overlay scene is last in the scene list, so toasts draw above launched scenes (Battle etc.).
- Kits still use `Math.random`; switch to `rng(K.run.seed)` where a daily run must be reproducible.

## Cut / not done
- No persistent "last picked" title choice (session memory only), so a fresh visit always gets the default.
- No settings UI for reduced motion (meta setting + `debug.reducedMotion`, defaults from the OS).
- hitstop does not pause Arcade physics or sprite animations (none of the kits rely on Arcade bodies for motion).

## Verification
- `npx tsc --noEmit -p .` clean; all five kits build.
- Gate 1 `tests/accept.py` PASS for all five kits (run in parallel), before and after the final tweaks.
- `meta_shots.py` on all five kits: no page errors; `K.run` from the menu = `{mode: daily, heat: 5, seed: dailySeed}`;
  events carry run_number/heat/mode; blocked storage starts and restarts fine.
- Screenshots: `shared/overnight-shots/sheet-bug-survivors.png` (first title, juice, first End, title with meta
  + menu, End with BEST), `sheet2.png` (other kits), `seq.png` (burst + float text frames).
- Gate 2 does not apply to shared on its own (kit agents re-check the prospect games on their branches).
