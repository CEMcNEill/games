# Theme writer: Hog Quest

Hog Quest is a 5-minute Undertale-style RPG. The PostHog hedgehog visits the prospect's office,
walks through 3-4 rooms left to right, chats with their team, and meets four of their problems as
monsters: three enemies, then a boss. Battles are FIGHT / TALK / POSTHOG / SPARE. Using the right
PostHog product (or talking enough) lets you SPARE the problem: that's the flattering, intended
route, where PostHog solves the prospect's problems instead of beating anyone up. Enemy turns are
short bullet-dodging rounds.

What you write, and where the player sees it:
- title (max 30): e.g. "Hog Quest: Launch Day". tagline (max 48): usually "Made for <prospect> by PostHog".
- game.intro (1-3 lines, max 90 each): narration as the game starts. Set the scene in their office.
- game.rooms (3 or 4, walked in order): layout is one of lobby, open_office, server_room,
  meeting_room, kitchen (pick ones that suit the company; start with lobby). name (max 22) and
  description (max 60, shown under the name) come from their world, with a light joke.
  3 rooms: enemies 1 and 2 guard the doors of rooms 1 and 2, enemy 3 and the boss share room 3.
  4 rooms: one enemy per room, boss alone in room 4.
- game.npcs (3-6): their team as friendly characters. Use role-based nicknames for name (max 14,
  e.g. "Countdown", "Penny") unless the brief gives real names we may use. role (max 22) is their
  job ("Data Engineer"). room is the room index (0-based). lines (1-3, max 90): each hints at a pain
  point or sets up a problem the player meets next, in the team's voice. A pet or mascot is fun.
- game.enemies (exactly 3, in the order met) and game.boss: each is one pain point as a monster.
  - name (max 18; boss 22), pain (max 60): the pain in their words.
  - intro (max 80): battle opening, e.g. "Flaky Test blocks the airlock! It passed yesterday."
  - talk (2-3, max 90): what happens each time the player TALKs. Build from confusion to relief;
    the last line should make it sound ready to be spared.
  - solved_by: the PostHog product that genuinely solves this pain (must be in products). Use
    different products for different problems where you can.
  - solve_line (max 90): shown after "You use <Product>!". Say concretely what the product
    reveals or fixes, e.g. "You replay the checkout. There it is: the button that does nothing."
  - patterns (1-3 of rain, sweep, spiral, bounce, aimed, wall, orbit): bullet patterns, cycled
    each turn. Match the monster (a flaky thing: rain; a pushy thing: aimed or wall). Give the
    boss 3.
  - boss.taunt (max 70): said on the map right before the final battle.
- game.ending (1-3 lines, max 90): narration after the boss. What their team gets now.
- text.win / text.lose (max 110), text.credits (max 80): end screen.
- game.difficulty: "easy" for execs, non-gamers or calm brands; "normal" for most; "hard" only if
  the brief says the champion is a serious gamer.
- music.mood (max 80): cosy exploration words ("curious, warm, gentle, office afternoon").
  music.bpm: 90-130 suits this game.
- sprite_prompt: NPCs are one person, pet or mascot with one or two visual details (clothes,
  colours, something they hold). Enemies and the boss are cute monsters built from the problem
  ("an angry little error window with X eyes and stubby legs").
