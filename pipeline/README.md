# Pipeline: brief -> theme -> sprites -> game

Everything outside the kits that turns a prospect brief into a playable static game, with Claude doing
the writing and drawing. No local models, no servers.

| Path | What |
|---|---|
| `bin/build-game` | kit + theme (+ brief, + your sprites) -> checked static site in `out/` |
| `tools/check_theme.py` | validate a theme: kit schema, content filter (competitors, blocklist, emoji), brief-fixed fields |
| `tools/theme_rules.py` | the rules behind check_theme (shared by any theme author) |
| `tools/pixel.py` (-> `shared/pixel.py`) | sprite workbench: browse a pack, grab a base, render a review sheet, lint; `logo` turns the prospect's logo into 4 splash-screen options |
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
5. **Splash logo**: every game opens on a splash screen. By default it shows the 8-bit PostHog logo. To use the
   prospect's own logo with "powered by PostHog" under it, follow `shared/prompts/logo.md`. In short: download their
   real logo and run `pixel.py logo` to get 4 pixel options (`logo-options.png`). Show the person 2-4 good ones and copy
   the chosen `logo-X.sprite` to `<sprite dir>/logo.sprite`.
6. **Build**: `bin/build-game <kit> <theme> --brief <brief> --art <sprite dir>`; read the check's
   `contact.png` (it includes the splash screen); play it locally.
7. **Host**: the `out/<company>-<kit>/` folder is a static site. On play.funglass.es each game is a folder at the site
   root (e.g. `/nerdy/`), deployed with the rest of the site as one archive (Hostinger static deploy). Public: add it
   and link it from the site's index if wanted. Private: don't link it; put an `.htaccess` (HTTP Basic Auth pointing at
   the folder's `.htpasswd`, plus `Header always set Cache-Control "private, no-store"` and
   `Header always set CDN-Cache-Control "no-store"`, or Cloudflare caches the files for everyone) and an `.htpasswd`
   in the folder, and give the person the URL, user and passphrase. Bug Survivors' co-op and leaderboards need nothing
   extra: they use play.funglass.es/mp (`mp-server/`) from any host, and each game gets its own boards.
