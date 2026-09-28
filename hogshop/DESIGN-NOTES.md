# HogShop design notes

- Why this loop: every PostHog-prospect kit so far is about bugs or data. Shops, marketplaces and ops teams feel
  "orders out the door" in their gut; the pains map cleanly onto mechanics (drop-off = patience, rollouts = express,
  quality/returns = fragile + wrong door, outages = jams, peak season = the rush).
- One button: SPACE does the context action, and the ▼/▲ hint shows which. Movement + one key is learnable in 20 s;
  the depth is in routing (which item for which table, which door) not in controls.
- Tickets show pictures, not names: items must be distinct in shape and colour at 16x16 (the theme prompt says so).
  Names appear in the grab hint, so players learn the prospect's product names while playing.
- Wrong items are refused at the table (no silent failure), so mistakes are about time and doors, not gotchas.
  Error Tracking's CATCH turns the ship hint red over the wrong door: the tool teaches the product.
- The belts bias towards needed items (~72%) so nobody waits long for the one thing they need; the hot item is
  capped at two spawns per order to make "limited stock" real.
- Art: Claude-drawn in the Ninja Adventure style (hogshop/sprites/make_sprites.py). The floor is cool dark
  concrete because the brown hog vanished (lint + screenshot) on the first, wooden floor. The hog is hog-quest's,
  quills one step lighter. Max the manager is data-inspector's hog in a brand-coloured apron.
- Music: kit default is data-inspector's default track (public/assets/default/music.ogg), because
  tools/kit-music.sh needs the local ACE-Step model; regenerate with it when convenient.
- Balance (bot, normal): wins every week, ~400 in-game s, 0 lost orders; the bot is near-perfect (plans intercepts),
  so the day targets (4-7) are tuned for people, not the bot. Worth a human playtest on easy and normal.
