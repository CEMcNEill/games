# Requests for shared/ (from bug-survivors, overnight 2026-09-27)

Everything below is worked around locally in the kit; none of it blocks the kit.

1. **`debug.goto(key)` when `key` is the active scene** leaves a black screen: it stops every active scene and
   starts `key` in the same frame, and the stop wins. Repro: on the title, `__game.debug.goto('Title')`.
   Fix idea: `game.scene.getScene(key).scene.restart()` when the target is already active, or start on the next
   tick. Workaround in `bug-survivors/tools/sim.py`: `debug.meta({})` (saves) then `page.reload()`.
2. **Juice layer depth (1000/1001) draws over kit HUDs and modals.** Float text and particles sit above any UI
   drawn at "normal" depths (banners, level-up cards). Bug Survivors moved its whole UI to depth 1100+. A shared
   `UI_DEPTH` constant (or an option to put juice under a given depth) would stop every kit rediscovering this.
3. **A way for a title choice to open a kit scene instead of HowTo** (e.g. `TitleChoice.scene = 'Shop'`).
   Bug Survivors' SHOP choice listens for HowTo's `create` event and immediately starts its Shop scene, which
   works but is indirect.
4. **`floatText` colour per call is fine, but a `scale` option** would let crits and "LEVEL UP!" pop bigger.
5. **EndScene extra-line budget:** kit summary + HEAT UNLOCKED + NEW achievements can exceed the ~3 lines that
   fit above the prompt, and later lines are silently dropped. Bug Survivors caps its summary at 2 lines. A
   smaller font row or a second column for the kit lines would help.
6. **Sfx pitch variation:** `K.play(name, vol, gap)` has no pitch argument, so rising "combo" pickup sounds need
   several presets (Bug Survivors uses `pickup`, `gem2`, `gem3`). An optional pitch multiplier would be enough.
7. **Debug hooks that return game objects make Playwright serialize the whole scene graph** (one call hit
   17 GB of RAM in the test runner). A note in hooks.ts ("return plain data or nothing") would save the next kit
   some confusion.
8. **`starfield()` leaks an `update` listener per visit** (scenes.ts): `scene.events.on('update', ...)` is never
   removed, and scene events survive shutdown, so every Title/HowTo/End visit adds a listener that keeps moving
   destroyed rectangles. Fix: `scene.events.once('shutdown', () => scene.events.off('update', fn))`.
