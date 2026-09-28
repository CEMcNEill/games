# Prospect game kits

Tested, data-driven 8-bit browser games. Each kit is built once; a prospect game is the prebuilt kit
plus a `theme/` folder (theme.json, sprites, music). Nothing per prospect compiles or edits code.
Spec: "Prospect Games: Plan & Spec" (Claude Doc).

| Kit | Inspired by | Buyer |
|---|---|---|
| `bug-survivors` | Vampire Survivors | engineering, developers, cto |
| `data-inspector` | Papers, Please | data, analytics, product |
| `hog-quest` | Undertale | champion, top accounts |
| `hog-saga` | Dragon Quest (JRPG) | founder, growth, marketing, sales |
| `hogtopia` | The Battle of Polytopia (4X) | ceo, coo, vp, executive, leadership, strategy |

make-game picks by whole-word match on the brief's `buyer:`; the earliest matching word wins
("vp product" -> hogtopia, "head of product" -> data-inspector). `--kit` or `kit:` in the brief overrides.

## Make a game for a prospect
```
cp prospects/examples/acme-rockets.yaml prospects/<slug>.yaml   # edit: name, colours, pains, products, buyer
make-game prospects/<slug>.yaml [--kit bug-survivors]          # detached; ~10-15 min
journalctl --user -fu game-<slug>-<kit>                        # follow it
approve-game <slug>-<kit>                                      # after a person plays the draft
```
Output: `~/games/builds/<slug>-<kit>/` holds run.json (steps, fallbacks, check result), theme.json and
its LLM log, sprites-preview.png, check/ (report, contact sheet, gameplay.gif) and game/ (the site).
Drafts appear on the games page  marked DRAFT.

Optional PostHog capture in the games: put `{"posthog": {"key": "phc_...", "host": "https://us.i.posthog.com"}}`
in `~/games/config.json`. Events: game_opened, game_started, game_finished, product_picked (kit-specific
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
  src/hooks.ts     window.__game: state, score, stats, fallbacks, themeIssues, textWarnings, debug
  sprites.py       renders default art from text grids; digits 1-5 = brand colours
  theme.base.schema.json, products.json, prompts/rules.md
<kit>/             kit.json, game.schema.json (+ generated theme.schema.json), themes/default.json,
                   themes/examples/*.json (few-shot), slots.json, art.py, audio/sfx.json,
                   prompts/theme.md, KIT.md, src/, public/assets/default/music.ogg, dist/ (built)
tests/accept.py    Gate 1 for a kit: default + examples, bot run, 20 fuzzed themes, load test
build-kits.mjs     node build-kits.mjs [kit...]
```
Pipeline tools live in `~/games/tools`: theme_writer.py (LLM), gen_sprites.py (Flux), music.py
(ACE-Step), game_check.py (Gate 2). Commands in `~/games/bin`: make-game, approve-game, publish-game.

## Change a kit
Edit, then `node build-kits.mjs <kit>`, `npx tsc --noEmit -p .`, and
`uv run -q --with playwright --with pillow python tests/accept.py <kit>` must PASS before any prospect
run uses it. Look at `<kit>/test-results/contact.png`.

## Add a kit
Copy the layout of bug-survivors. Contract: `startKit(kitDef)` in src/main.ts; every prospect-facing
string comes from the theme; every sprite is a slot in slots.json with default art in art.py; the
`__game.debug` hooks autopilot/speed/god/lose/win exist (plus optional showcase(): jump to an
action-packed moment for the gameplay GIF); `kit.json` has products, buyer and tests.
