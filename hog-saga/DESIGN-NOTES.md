# Hog Saga: overnight design notes

Goal: battles where reading the enemy and combining the party matter, a few things off the main
road, and a reason to play again (NG+, heat, challenges, achievements). The first run stays a
6-8 minute, forgiving walk east. No theme fields are added: every new word is generic kit text.

## M1 (P0): battle depth
**Damage kinds.** Every attack has a kind: STRIKE (FIGHT, Experiments, Hotfix Rush), MAGIC (Web
Analytics, Product Analytics) or DATA (Error Tracking, Data Warehouse). Each archetype is weak to
one kind and resists another (fixed table in `rules.ts`, so any theme's monsters get them through
their archetype):

| Archetype | Weak | Resists | Shield |
|---|---|---|---|
| swarm | MAGIC | DATA | 1 |
| fast | STRIKE | MAGIC | 2 |
| brute | MAGIC | STRIKE | 2 |
| tank | DATA | STRIKE | 3 |
| caster | STRIKE | MAGIC | 2 |
| boss p1 / p2 / p3 | DATA / MAGIC / STRIKE | STRIKE / DATA / MAGIC | 4 / 5 / 5 |

Weak hits do x1.5 and knock a shield point off; resisted hits do x0.5. At 0 shield the foe
**BREAKs** (Octopath): it loses its next turn and takes x1.5 damage until then, then its shield
refills. Weak/resist icons under each foe start as "?"; **SCAN** (new command, free, costs the turn)
reveals the whole foe, Web Analytics reveals its target, and any hit reveals the kind it used.
Knowledge is kept for the run per archetype, so scanning once pays off all run.
Why fun: the first question in every fight becomes "what is it weak to, and who has that?", and
Break turns a scary brute into a free round.

**Statuses** (fixed names + 8x8 icons): LEAK (memory leak, lose 6% max HP per turn), FROZEN
(lose a turn), THROTTLED (acts last), FOCUSED (crit chance 50%). Swarms leak, fast foes throttle,
brutes freeze, casters focus their friends and cure them; DEFEND grants FOCUSED next round;
Session Replay/Coffee Run/Potion cure; Surveys now throttle foes.

**Ship It meter** (0-100, kept between fights): fills on hits (more on weak hits and breaks) and on
damage taken. When full, SHIP IT! appears at the top of the command list; the acting member picks a
partner and they do a pair combo with a short cut-in:
hedgehog+analyst LAUNCH DAY (strike+magic+data on every foe, so it always finds the weak spot),
hedgehog+support HOTFIX RUSH (heavy strike, party heal + cure), analyst+support INSIGHT LOOP (magic
on all, party FOCUSED + MP). Solo hedgehog gets SOLO SHIP.

**Enemy AI scripts** (`ai.ts`): swarm focuses the lowest-HP member; tank guards the weakest ally
(takes single-target hits for it) or hardens; caster cures/focuses allies, else storms; brute winds
up (telegraphed) then lands a freezing heavy blow; fast may act twice and throttles. The boss
telegraphs MASS OUTAGE one turn ahead (an "!" over it and a warning line) so DEFEND and Feature
Flags matter; phase 2 at 50%; phase 3 (ROLLBACK, heals once, acts twice) only at heat 3+.

**Juice**: lunges both ways, slash marks, hit flashes, crit hitstop + shake, bouncing number pops,
WEAK!/RESIST/BREAK! pops, a battle swirl transition, a victory jingle and level-up fanfare (ZzFX
note sequences), battle + boss music (ACE-Step via music.py, fixed kit audio in public/assets/kit).

## Numbers
(filled in as the bot runs come in)

## M2 (P1): world, loot, replay
**Gold and gear.** Every fight drops gold (by archetype and tier). Each member has weapon, armour
and charm slots (`gear.ts`, 15 fixed pieces: Rubber Mallet, Query Wand, Firewall Mail, Coffee Mug...),
each with 1-3 small stat changes and at most one effect (+2 MP a round, heals 30% more, crits more,
-10% damage taken, spells +10%, LEAK-proof). New gear equips itself on whoever gains the most and
the old piece moves to someone else or is sold: no inventory screen, the ESC party screen lists it.
The south-west house in town is a **shop** (a coin sign on the wall) with items and starter gear.
Road chests now hold an item plus a piece of gear.

**Off the main road** (map additions only; gates, encounters and the route are unchanged):
- a **secret grove** in the north woods behind a fake tree (a sparkle twinkles on it every few
  seconds), with a rare chest;
- a **cracked wall** in the cave hiding an old server room with the best armour;
- the **Old Dev** in town (fixed kit NPC) lost a Lucky Keyboard in the north woods: bring it back
  for a Coffee Mug and gold;
- the **Tech Debt Wyrm** by the desert lake, an optional superboss (1500 HP, weak DATA, resists
  MAGIC, 6 shield). First touch warns; walk into it again to fight. Reward: Big Data Staff + gold.
The footer shows gold, chests (x/7) and secrets (x/4); finding one toasts "SECRET n/4".

**Replay.** The title gets a MODE row (NEW GAME, NEW GAME+, SOLO HOG, NO ITEMS, SPEEDRUN; all but
NEW GAME locked until the first win) and a HEAT 0-5 row (shared `heatRow`, after the first win).
Enter still starts NEW GAME at heat 0 at once.
- **Heat** (`rules.ts HEAT`): enemy HP x1.12-1.6, damage x1.06-1.26, heat 2+ adds a third monster
  to smaller formations, fewer starting potions (3,3,2,2,1,0), heat 3+ gives the boss a phase 3
  (weak spot moves again, one ROLLBACK heal).
- **New Game+**: a win saves the party (levels, stats, skills, gear) in the meta blob. NG+ starts
  with it; monsters count 3 tiers higher and the boss/Wyrm get +35% HP and +15% power per cycle
  (max 3); chest gear is remixed from a rare pool with the run seed.
- **Challenges**: SOLO HOG (just the hedgehog; SOLO SHIP combo), NO ITEMS (item chests sell for gold),
  SPEEDRUN (a clock in the footer, best time on the End screen).
- **Achievements** (14, `progress.ts`): Shipped It, Know Thy Bug, Breaking Change, Break Point (10
  breaks across runs), Pair Programming, Treasure Hunter, Off The Roadmap, Lost And Found, Debt Paid
  (hidden), Lean Team (win at LV 4 or lower), No Crutches, Solo Founder, Under Pressure (heat 3+),
  Sequel (NG+ win).
