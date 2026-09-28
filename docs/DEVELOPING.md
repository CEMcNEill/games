# Developing the kits

Tested, data-driven 8-bit browser games. Each kit is built once; a prospect game is the prebuilt kit
plus a `theme/` folder (theme.json, sprites, music). Nothing per prospect compiles or edits code.
The brief-to-game tools are in `pipeline/` (see pipeline/README.md); default art follows
`shared/prompts/sprite-style.md` on CC0 packs (`pipeline/assets/`).

| Kit | Inspired by | Buyer |
|---|---|---|
| `bug-survivors` | Vampire Survivors | engineering, developers, cto |
| `data-inspector` | Papers, Please | data, analytics, product |
| `hog-quest` | Undertale | champion, top accounts |
| `hog-saga` | Dragon Quest (JRPG) | founder, growth, marketing, sales |
| `hogtopia` | The Battle of Polytopia (4X) | ceo, coo, vp, executive, leadership, strategy |
| `hogshop` | Overcooked (packing rush) | ecommerce, retail, operations, fulfilment, marketplace, shop |

The Buyer column says which kit suits which audience; pick the kit yourself when you make a game.

Optional PostHog capture in the games: set `"posthog": {"key": "phc_...", "host": "https://us.i.posthog.com"}`
in the built game's `theme/manifest.json`. Events: game_opened, game_started, game_finished, product_picked (kit-specific
events too); nothing loads until the player presses a key.

## Layout
```
shared/            engine every kit uses (never edited per prospect)
  src/kit.ts       startKit(): loads + sanitises theme/theme.json, boots Title -> HowTo -> game -> End
  src/schema.ts    runtime sanitiser: any invalid field falls back to the kit default
  src/font.ts      hand-drawn 5x7 pixel font (RetroFont); cleanText() drops what it can't draw
  src/palette.ts   36-colour master palette, brand snapping, deriveUi() screen colours
  src/zzfx.ts      in-browser sound effects (ZzFX parameters)
  src/ui.ts        PixelText (wrap/cut + warnings), box, bar, fitScale
  src/scenes.ts    Boot (sprite slots with fallback), Title, HowTo, End
  src/hooks.ts     window.__game: state, score, stats, fallbacks, themeIssues, textWarnings, debug, meta, run
  src/meta.ts      between-runs save per slug+kit (localStorage, never throws): meta.recordRun/bank/spend/unlock/
                   has/heatUnlocked/kitData, achieve(id) + toast, dailySeed(), rng(seed) (mulberry32)
  src/juice.ts     feel: shake, hitstop (+hitstopped/setJuiceSpeed), flash, punch, burst, floatText, toast
  KitDef extras    optional titleMenu (mode/HEAT rows -> K.run {mode, heat, seed, daily, number, choices}; Enter
                   still starts with the defaults; heatRow() helper), endSummary(data, result) lines, achievements
                   table. EndScene records the run (finishRun), shows NEW BEST / BEST, R or Enter = one more run.
                   Shared debug hooks: resetMeta, unlockAll, meta(patch), reducedMotion, kitDef, goto, juiceTest
  tools/meta_shots.py  screenshots of title/menu/juice/end with fake meta and blocked storage
  sprites.py       renders default art: <kit>/sprites/*.sprite (pixel.py, @1-@5 brand tokens) or art.py grids
  pixel.py         sprite workbench (browse, grab, render, lint); prompts/sprite-style.md = how to draw
  theme.base.schema.json, products.json, prompts/rules.md
<kit>/             kit.json, game.schema.json (+ generated theme.schema.json), themes/default.json,
                   themes/examples/*.json (few-shot), slots.json, sprites/*.sprite (+ older art.py), audio/sfx.json,
                   prompts/theme.md, KIT.md, src/, public/assets/default/music.ogg, dist/ (built)
tests/accept.py    Gate 1 for a kit: default + examples, bot run, 20 fuzzed themes, load test
build-kits.mjs     node build-kits.mjs [kit...]
```
The brief-to-game tools (build-game, check_theme, pixel.py, game_check) are in `pipeline/`; see
pipeline/README.md.

## Change a kit
Edit, then `node build-kits.mjs <kit>`, `npx tsc --noEmit -p .`, and
`uv run -q --with playwright --with pillow python tests/accept.py <kit>` must PASS before any prospect
run uses it. Look at `<kit>/test-results/contact.png`.

## Add a kit
Copy the layout of bug-survivors. Contract: `startKit(kitDef)` in src/main.ts; every prospect-facing
string comes from the theme; every sprite is a slot in slots.json with default art in `sprites/<slot>.sprite` (or art.py); the
`__game.debug` hooks autopilot/speed/god/lose/win exist (plus optional showcase(): jump to an
action-packed moment for the gameplay GIF); `kit.json` has products, buyer and tests.
