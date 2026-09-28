# Theme writer: HogShop

HogShop is a conveyor-belt packing game (think Overcooked in a warehouse). The PostHog hedgehog runs the
back room of the prospect's shop for 5 short days (about 75 seconds each). Orders pop up as tickets; the
prospect's products ride in on two conveyor belts; the player grabs items, packs each order's box at one of
three tables and carries the sealed box to the right shipping door before the customer runs out of patience.
Each day adds a mechanic (express orders, fragile items that need bubble wrap, international orders + belt
jams + a limited-stock bestseller, then a sale-day rush). The kit writes those mechanics, the tools, the
summaries and 5 endings; you write the prospect's world.

Any prospect works, not just shops: re-skin "the shop" as whatever they send or deliver (a SaaS company's
welcome kits and swag, a marketplace's care kits, a fintech's cards and paperwork, a rocket company's parts).

What you write, and where the player sees it:
- title (max 30), tagline (max 48): title screen.
- game.store.name (max 20): the shop/place ("Ledgerly Mailroom" or just "Ledgerly"). store.sprite_prompt:
  the back-room floor from above; keep it DARK and plain (items and the brown hog must pop on it).
- game.manager: who briefs the player every morning. name (max 14), title (max 20), sprite_prompt (head
  and shoulders). Generic role or a mascot unless the brief names a real person you may use.
- game.items (6-8): what rides the belts. name (max 12) shows over the item when the player is about to grab
  it, so short and concrete ("Card Reader", "Treats"). sprite_prompt: ONE object with a clear silhouette and
  a main colour; make every item a different shape AND colour (they are 16x16 pixels on a dark belt and the
  tickets show only the pictures). Mark 2-3 breakable things "fragile": true (mugs, glass, screens, bottles).
- game.hot_item: the limited-stock bestseller for day 4 (name max 14, sprite_prompt): something special.
- game.customers (4-8): first names on the tickets (max 8 shown), their kind of customer.
- game.docks: names on the three shipping doors, max 9 each: standard, express, international
  ("POST", "COURIER", "OVERSEAS"; puns welcome: "WALKIES", "ZOOMIES", "ABROAD").
- game.days (exactly 5): intro (max 110) is the manager's morning line. Tie each day to one pain point and
  to that day's mechanic: 1 getting orders out, 2 express orders (speed, drop-off), 3 fragile items
  (quality, returns), 4 international + a recurring breakdown + the limited-stock item, 5 the rush.
- game.jam.name (max 16): day 4's breakdown, named after one of their pains ("BANK TIMEOUT", "APP CRASH",
  "FLAKY BELT"). game.rush.name (max 16): their busiest moment ("TAX SEASON", "LAUNCH WINDOW").
- game.difficulty: "easy" for execs and non-gamers, "normal" for most, "hard" for gamer champions.
- products: pick from the enum (first 4 become the tools on keys 1-4): product_analytics INSIGHTS (needed
  items glow), session_replay REWIND (bring back a lost order), feature_flags SLOW-MO (slow belts, clear
  jams), experiments A/B TEST (move faster), surveys SURVEY (customers wait longer), error_tracking CATCH
  (the next mistake is forgiven, and it warns before a wrong door).
- text.win / text.lose (max 110), text.credits (max 80): end screen.
- music.mood (max 80): busy, bouncy, warehouse or their world; music.bpm 110-135.
