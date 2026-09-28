# Requests for shared/ (from the hogtopia overnight run)

Nothing in hogtopia depends on these; each is worked around locally.

1. **`debug.goto(key)` when `key` is the scene already running** (e.g. `goto('Title')` from the Title)
   stops and starts the same scene in one frame and leaves it unresponsive to Enter. Suggest
   `scene.restart()` when the target is active, or defer the start by a frame. Workaround in hogtopia's
   tools: reload the page instead.
2. **PixelText collapses runs of spaces when `maxWidth` is set** (`wrap()` splits on `\s+`), so strings
   like `'TAB next unit   T tech'` render as single spaces. Either keep runs of spaces inside a line or
   document it. Hogtopia now uses ` - ` separators.
3. **Toasts sit on top of a kit's top HUD bar** (Hogtopia's `YOU 705 : 335 RIVAL`). An optional
   `toast(scene, msg, sound, y)` or a KitDef `toastY` would let kits move them below their HUD.
4. **End screen room**: with a 4-row stats table and a 2-line `endSummary`, the `NEW: <achievements>` line
   is the last that fits; a run that unlocks 5+ achievements gets it cut (and a text warning). Consider
   wrapping achievements over 2 lines or dropping the credits line when space is short.
5. **`meta.kitData` typing**: it returns `T` but stored values may have any shape from older saves;
   kits must re-validate arrays/strings themselves (hogtopia does). A `kitData(defaults, validate)` helper
   would make that harder to forget.
