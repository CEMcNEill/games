# Theme writer: Hog Saga

Hog Saga is a short classic JRPG (Dragon Quest, early Final Fantasy). The PostHog hedgehog and two
companions walk from a starting town east through three regions, fight the prospect's problems as
monsters in turn-based battles, and topple a boss in its lair. Every battle skill is a PostHog
product. A run lasts 6-8 minutes. The map, stats and skills are fixed; you write the names and words.

What you write, and where the player sees it:
- title (max 30), tagline (max 48): title screen. E.g. "Hog Saga: Launch Quest", "Made for <prospect> by PostHog".
- game.intro (max 120): the opening narration. What threatens the prospect's world, in their terms.
- game.town.name (max 18): the starting town, from their world (their HQ, product or city nickname).
  game.town.inn_line (max 70): the innkeeper's welcome; resting heals the party.
- game.regions (exactly 3, walked in order): 1 a meadow around town, 2 a forest with a cave, 3 a
  desert with the boss lair. name (max 18) and blurb (max 56) are shown on a banner when entering.
  Name them after stages or places in the prospect's product or funnel ("Signup Fields", "Test Range").
- game.party (exactly 2): the companions. [0] is the analyst (magic attacks), [1] the support (heals).
  name (max 8, shown in battle) and role (max 20). Use generic names unless the brief names people.
- game.npcs (exactly 3): townsfolk in the starting town. name (max 14) and ONE line (max 100) each, about
  the prospect's world or pains, in the voice of their users, team or customers. Friendly, never mean.
- game.enemies (exactly 5, met in this order: 1-2 near town, 3-4 in the forest and cave, 5 in the
  desert): each is one of their pain points as a monster. name (max 14), pain (max 50) is shown when it
  appears. archetype picks its fighting style: swarm (weak, comes in pairs; good for enemy 1), fast
  (acts often), brute (hits hard), tank (tough, hardens), caster (hits the whole party; good for enemy 5).
  Use at least 4 different archetypes. The archetype also fixes the monster's weakness (swarm and brute:
  MAGIC, fast and caster: STRIKE, tank: DATA), so a mix of archetypes makes the fights varied.
- game.boss: their biggest generic problem. name (max 20), taunt (max 60) when the fight starts,
  phase2 (max 60) when it gets angry at half health.
- game.product_lines (optional, max 40 each): skill descriptions tailored to them, by product id.
- products: 3-6 product ids from the enum, most relevant first. The first one is the treasure relic.
- game.difficulty: "easy" for execs and non-gamers, "normal" for most, "hard" only if the brief says
  the champion is a gamer.
- text.win / text.lose (max 110): the end screen. text.credits (max 80): one line crediting PostHog.
- music.mood (max 80): 3-8 mood words for an overworld chiptune. music.bpm: 100-150 suits this game.
- sprite_prompt (max 160) for companions and townsfolk: one person, their look in a few words (clothes,
  one prop). For enemies and the boss: one cute monster, colours and one memorable feature.

The kit adds its own fixed characters and items (the Old Dev, a travelling Merchant, the Tech Debt Wyrm,
a Mimic Chest, gear such as the Rubber Mallet or Firewall Mail). You don't write them; avoid reusing
those names for the prospect's monsters or boss.
