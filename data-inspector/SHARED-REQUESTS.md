# Requests for shared/ (from the data-inspector overnight run)

Nothing here blocks the kit; each item was worked around locally.

1. **`debug.goto(key)` to the scene that is already running leaves a black screen.** `goto('Title')` from
   the Title stops and starts the same scene in one tick. Workaround in tools: `location.reload()`.
   Suggest: if the target is active, `scene.restart()` instead.
2. **PixelText collapses runs of spaces** (both the wrapped and the plain path go through `cleanText`/`wrap`).
   Column layouts like `web       OK` and `A   B` separators in endSummary lines lose their spacing.
   Worked around with `: ` and ` - ` separators. Suggest a `preserveSpaces` option or not collapsing
   inside `cleanText` when `maxWidth` is unset.
3. **One `bestScore` for every mode.** Endless (score = records, ~30-80) and the week (score ~5,000-35,000)
   share `meta.data.bestScore`, so the End screen shows "BEST 12345" under an endless run. The kit keeps
   its own `endlessBest` in `kitData` and shows it in `endSummary`. Suggest `recordRun` keeping a best per
   `mode` (and per heat), and EndScene showing the one for the current mode.
4. **Export `reducedMotion()` from juice.ts** so kit-owned tweens (card slide, manager jolt, stamp slam)
   can respect the setting too. The kit currently only gets it for free through shake/punch/burst.
5. **`meta.kitData()` doesn't validate types.** A corrupted blob like `{kit: {endings: 5}}` passes
   through; the kit repairs its own fields in `kitSave()`. A tiny schema-ish helper (defaults + type
   check per key) in meta.ts would save every kit the same code.
6. **endSummary lines are single-line and cut at W-60.** Longer story text (endings) has to be pre-wrapped
   by the kit (`wrap(text, 68, 2)`). Suggest EndScene wrapping each line to 2 lines itself, and reserving
   space so `NEW: <achievements>` isn't the line that falls off the bottom.
7. **Toasts cover the top HUD row** for 2 s. Fine for achievements, but a kit that toasts gameplay info
   (NEW RULE in endless, request effects) would like a `toast(scene, msg, {y})` or a bottom variant.
