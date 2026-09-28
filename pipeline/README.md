# Pipeline: brief -> theme -> sprites -> game

Everything outside the kits that turns a prospect brief into a playable static game, with Claude doing
the writing and drawing. No local models, no servers.

| Path | What |
|---|---|
| `bin/build-game` | kit + theme (+ brief, + your sprites) -> checked static site in `out/` |
| `tools/check_theme.py` | validate a theme: kit schema, content filter (competitors, blocklist, emoji), brief-fixed fields |
| `tools/theme_rules.py` | the rules behind check_theme (shared by any theme author) |
| `tools/pixel.py` (-> `shared/pixel.py`) | sprite workbench: browse a pack, grab a base, render a review sheet, lint |
| `tools/install_sprites.py` | put `<slot>.sprite` files into a built game (build-game calls it for `--art`) |
| `tools/game_check.py` | headless check: title, how-to, real keys, bot run to the end screen, screenshots, GIF |
| `assets/` | CC0 pack catalog + licences; `fetch-assets.sh` downloads the packs (~120 MB, not committed) |
| `prospect-examples/` | example briefs, paired with each kit's `themes/examples/` |

## The loop Claude runs for a prospect
1. **Brief**: copy a file from `prospect-examples/`; fill in name, domain, brand colours, 2-3 pains,
   PostHog products, buyer, notes (tone, things to avoid).
2. **Pick a kit** from the table in the top-level README.
3. **Theme**: read `<kit>/prompts/theme.md`, `shared/prompts/rules.md`, the kit's `theme.schema.json` and
   `themes/examples/*.json` (with their briefs), then write the theme JSON. Run
   `uv run --with jsonschema --with pyyaml python tools/check_theme.py <kit> <brief> <theme> --fix` until it prints OK.
4. **Art** (optional but worth it): for each slot in `<kit>/slots.json` that has a `prompt`, draw a
   `<slot>.sprite` following `shared/prompts/sprite-style.md`: pick a CC0 base (`assets/CATALOG.md`),
   `pixel.py grab`, edit the grid, `pixel.py render --theme <theme>`, look at the review image, fix
   (max 3 passes), `pixel.py lint`. Slots you skip use the kit default in the theme's colours.
5. **Build**: `bin/build-game <kit> <theme> --brief <brief> --art <sprite dir>`; read the check's
   `contact.png`; play it locally; host the `out/` folder.
