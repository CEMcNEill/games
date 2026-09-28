# Theme writer: Hogtopia

Hogtopia is a 24-turn strategy game in the style of The Battle of Polytopia. The player leads the
prospect's company from its HQ, captures villages to grow, harvests resources, and researches
PostHog products as its tech tree. An AI rival, the prospect's biggest generic problem, grows on
the other side of the map. The player wins by taking the rival's capital or by out-scoring it.
The PostHog hedgehog is the player's advisor and speaks the tips. A game lasts about 6-10 minutes.
The map, rules and AI are fixed code; you only write names and lines.
Each game the rival also plays one of four fixed personalities (Aggressor, Expander, Turtle,
Opportunist) with a few fixed kit lines of its own, so write taunts that fit any temperament. Cities
earn a reward each time they level up, and each product also unlocks a second-tier feature in the
research menu; tips may mention either, but never promise a specific map or rival.

What you write, and where the player sees it:
- title (max 30): e.g. "Acme: Rise of the Rockets", "Ledgerly Empire". tagline (max 48): usually
  "Made for <prospect> by PostHog".
- products: 4-6 PostHog product ids; they are the whole tech tree, so pick the ones they use or need.
- game.faction.name (max 20): the player's side, e.g. "Acme Rockets". game.faction.capital (max 14):
  their HQ city, e.g. "Mission HQ".
- game.cities (4-6, max 14 each): names for villages the player captures, from their world: sites,
  teams, product areas, in-jokes ("Pad 39A", "Invoice Bay", "Dog Park").
- game.rival: name (max 22) is their biggest generic problem ("Legacy Monolith", "The Churn Beast");
  never a competitor. capital (max 14) is its base ("Tech Debt Den"). taunts: 3-4 lines (max 54)
  it says at the start, when it takes a city, when it loses a unit and near the end. defeat (max 70):
  its last line when its capital falls. sprite_prompt: what the rival leader looks like, one creature
  or character, head and shoulders.
- game.tips (3-5, max 90): advice from the hedgehog that mixes strategy with their world, e.g.
  "Take Pad 39A early: launch sites pay out every turn." Keep them useful and kind.
- game.tech_lines (optional, max 48 each): a line per product id tailored to them, shown in the
  research menu under the fixed effect, e.g. data_warehouse: "Join telemetry with billing in SQL".
- game.units (optional, max 12 each): names for the player's units from their world. scout (fast),
  warrior (basic fighter), archer (ranged), defender (shield), catcher (strong, hits nearby).
  e.g. "Intern", "Engineer", "Analyst", "Flight Guard", "Bug Hunter".
- game.biome: meadow, desert, tundra or circuit (techy/datacenter look). Pick one that suits them.
- game.difficulty: "easy" for execs and non-gamers, "normal" for most, "hard" for strategy fans.
- game.hq_prompt: their HQ building as one object ("a tall glass office tower with a rocket on top").
- text.win / text.lose (max 110), text.credits (max 80); music.mood: calm, thoughtful strategy words;
  music.bpm: 90-120 suits this game.
