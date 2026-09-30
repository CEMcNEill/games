# Bug Survivors co-op

2 to 4 hogs in one arena, on the web and in the Android app, over the internet. There are no accounts. Everyone picks
**CO-OP** on the title, types the same 4-letter code, and taps **READY**. When everyone in the room is ready, a 3 second
countdown runs and the game starts on every device at once.

## Playing

- Same arena and the same bugs for everyone. Bugs chase the nearest hog. Your hog is solid; the others are
  see-through, with their name tags.
- **XP is shared**, so everyone levels together. **Level-ups never stop the game.** Your hand of 3 cards slides into
  a tray along the bottom of your screen and you keep playing. Pick with 1/2/3 (or tap a card, then tap it again).
  R/X/B reroll, skip and banish. TAB (LATER) banks the hand for a quieter moment, and levels queue up ("LEVEL UP x3").
  While the tray is open your hog is in code review: a shield bubble means no damage, you walk at 70% speed, and it
  lasts 8 s per hand. The camera shifts so your hog stays above the tray. A hand left for 20 s is picked for you.
  Only the between-wave choices (the SHIPPED call and releases) hold the world.
- **Nobody plays alone.** Out of HP (with no revives left), your hog goes down. "IT'S NOT OK TO LET YOUR TEAMMATE FAIL"
  flashes, and a teammate standing on you for 3 s reviews you back in. Downed hogs also come back at the next wave. The
  run ends when every hog is down at once.
- After each boss, P1 (the lowest seat still playing) makes the SHIPPED call: continue or cash out, for everyone.
  On CONTINUE, everyone picks their own release.
- Chests and powerups go to whoever grabs them. Gold is team gold, and everyone banks it.
- The || menu (ESC) doesn't stop the game. LEAVE drops you out, and the others play on.
- More hogs means more bugs: spawns go up x1.55 per extra hog, bug HP +15%, and the boss is sized for the team.
- Heat is the room creator's (P1's) pick on their title screen.

## How it works

Deterministic lockstep. The server (`mp-server/`, a Cloudflare Worker + Durable Object at
`play.funglass.es/mp`) never runs the game. It holds the lobby and relays inputs. About 20 times a second it
broadcasts a *turn*: each player's stick and any actions (card picks, the SHIPPED call, screen size). Every client runs
the same simulation (`src/coop/game.ts`, 3 fixed 1/60 s ticks per turn) from the same seed on the same turns, so the
worlds stay identical without sending the world.

For that to hold, the co-op sim must not depend on anything outside the turns:

- **Randomness:** only seeded Rngs (`R`, `RD`, `RX`, each hog's `RC`). `Math.random` is for looks only (particles,
  zap jitter).
- **Math:** `dmath.ts` swaps pure-JS fdlibm versions of sin/cos/atan2/exp/log/pow/hypot into `Math` for the run, so
  V8 (Chrome, Android), JSC (Safari) and SpiderMonkey (Firefox) produce the same bits. Co-op code has no `**`, which
  can't be patched; it uses `Math.pow` and `sq()`.
- **Time:** sim timers count ticks (`later()`), never milliseconds. Tweens only move looks. Pickups keep their own
  x/y, and their bob is drawn.
- **This device:** views (for "on screen" rules like spawns and hotfix) come from each player's `view` event.
  Loadouts (hoggie, shop levels, pals) and heat come from lobby info, never from the local save. Saves, crests, banners
  and sounds that belong to one player only happen on that player's device (`mine()`).

Every 40 turns each client sends a hash of the world. If two clients differ, the server flags the room and the HUD shows
OUT OF SYNC. A dropped connection reconnects on its own (same device token = same seat), and the server replays the
turns so far so the client fast-forwards. A player gone for 20 s leaves the game.

`src/coop/game.ts` (with `weapons.ts`, `tools.ts` and `systems.ts`) is a **fork** of the single-player files, which are
left alone. The fork keeps each hog's state on a `Hog`. The scene's fields of the same name (`this.hp`, `this.st`,
`this.weapons`...) are accessors onto the current hog, `cur`, so the single-player code runs per hog after `as(hog, fn)`.
The only single-player change is the CO-OP title choice and scene registration in `src/main.ts`.

**Bump `SIM_VERSION` in `src/coop/net.ts` whenever the co-op sim changes.** Players on different builds can't share
a room.

## Testing

Run `wrangler dev` in `mp-server/`, build the kit, and open the page with `?mp=ws://127.0.0.1:8787/mp`. Debug hooks:
`__game.debug.autopilot()` lets your hog play itself. `__game.debug.cmd('xp', 200)`, `cmd('down')`, `cmd('killBoss')`
and `cmd('wave', 3)` are cheats sent as events, so every client applies them on the same tick. `__coopNet` is the
connection.
