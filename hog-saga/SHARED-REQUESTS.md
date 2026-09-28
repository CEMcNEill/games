# Requests for shared/ (from the hog-saga overnight run)

Nothing here blocks hog-saga: each item is worked around locally.

1. **End screen: summarise long achievement lists.** `EndScene` prints `NEW: a, b, c...` on one line
   (`maxLines: 1`), so 5+ first-run unlocks get cut with "..." and a `textWarnings` entry (Gate 2 on
   acme-rockets flagged it). Suggest `NEW: 5 ACHIEVEMENTS` (or two lines) when the joined names are
   longer than the line. Workaround here: short achievement names and a lifetime target for Break Point.
2. **Kit debug hooks before the game scene.** `hooks.debug` is usually set by the game scene's
   `create()`, so kit hooks don't exist on the title. hog-saga overrides `sharedDebug.unlockAll` after
   `startKit()` resolves so `debug.unlockAll()` also saves an NG+ party from the title. A documented
   `KitDef.debug` (merged at boot) would make this cleaner for every kit.
3. **Battle/second music tracks.** `BootScene` only loads `music`. hog-saga loads
   `assets/kit/battle.ogg` and `assets/kit/boss.ogg` itself in `Explore.preload()` and swaps them in
   `fx.ts battleMusic()`. A shared `KitDef.tracks: {key: url}` + `playTrack(key)` / `resumeMusic()`
   would let other kits do the same.
4. **`juice.pop` with overshoot.** `floatText` is pooled and linear; hog-saga has a bouncy scale-in
   damage number (`fx.ts pop`, with a big variant for crits). Could be promoted as an option.
5. **Seeded helper for "per run" content.** hog-saga uses `rng(K.run.seed ^ salt)` for events and
   NG+ chest remixes. A `runRng(salt)` helper would stop kits reusing the same stream by accident.
6. **Title menu: >2 rows / toggles.** Challenge toggles had to be exclusive MODE values (SOLO HOG,
   NO ITEMS, SPEEDRUN) because the title supports at most 2 rows of single choices. Multi-select
   toggles would let players stack challenges.
