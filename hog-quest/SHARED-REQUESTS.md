# Shared requests from hog-quest (overnight 2026-09-27)

Things hog-quest needed from `shared/` but implemented locally (kit agents may not edit shared/):

1. **`debug.goto('Title')` from the Title scene shows a black screen.** Stopping and starting the
   same scene key in one call leaves it stopped. hog-quest's tools reload the page instead after
   `debug.meta(...)`. Suggested fix: in `goto`, use `scene.start(key)` on the active scene (Phaser
   restarts it) instead of stop-all-then-start.
2. **Optional theme fields borrow the default theme's text.** `sanitize()` fills a missing optional
   object field with default.json's value (and logs "missing"). For optional prospect text like
   `ending_pacifist` that leaks the default company's words into a prospect's game. hog-quest undoes
   it in `postSanitize` (drops the field and the issue). Suggested: a schema flag (e.g.
   `"x-optional": true`) that makes the sanitiser leave missing fields missing.
3. **Kit music tracks.** `BootScene` only loads `music`. hog-quest loads `assets/default/battle.ogg`
   and `boss.ogg` in its own `preload` (src/music.ts) and pauses/resumes `music` around battles. A
   shared `extraAudio` list on KitDef plus `playTrack(key)` / `resumeMusic()` would let other kits
   do the same.
4. **Title extras.** hog-quest draws its "ENDINGS 1/3" line through `titleArt`. A KitDef
   `titleLines()` hook, placed by the shared layout, would avoid kits guessing free space.
5. **`cleanText` collapses runs of spaces**, so padded columns don't line up; the shop uses one
   text per column. Worth a note in ui.ts, or a `preserveSpaces` option.
