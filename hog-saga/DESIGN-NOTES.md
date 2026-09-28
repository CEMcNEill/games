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

## Numbers (bot runs, see tools/bot.py)
- Before tonight: normal 5/5, boss 11-13 rounds, party ~50% HP; hard ~2/3.
- First P0 build: normal 3/3 but boss 7-9 rounds and 7 combos a run: meter gains cut (hit 3->2, weak
  6->3, break 12->6, damage taken 30->18) and boss HP 1250->1450. Then normal 6/6 (boss 9-11 rounds,
  34-56% HP left), hard 5/6, easy 6/6.
- With gear, shop and back row the smart bot won hard 10/10, and a newcomer bot (old AI: no scan, no
  weakness, no DEFEND) only won normal 6/8, dying to MASS OUTAGE. Fixes: outage x2.0 -> x1.7, boss
  1450 -> 1400 HP, the newcomer bot presses the flashing SHIP IT! (as people do); hard HP x1.2 -> 1.25,
  damage x0.98 -> 1.06. Now newcomer normal 9/10, newcomer hard 7/8 (close calls), smart 10/10 on all.
- SOLO HOG was 0/4 (dead in fight 1): the hedgehog gets x2.2 HP, x2 MP, +4 ATK, +3 DEF, Session
  Replay and double HP/MP growth, and solo monsters have HP x0.55 and damage x0.65: now 7/8.
- NG+ from a real win: LV 6 -> 8, boss 11 rounds, 52% HP left (monsters +5 tiers, boss +60% HP and
  +25% power per cycle).
- Final table: KIT.md "Balance".

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

## M3 (P2): events and formation
- **Overworld events** (`world.ts rollEvents`, seeded by `K.run.seed`): six fixed spots off the route;
  each run a travelling Merchant stands on one (3 random rare pieces at 80% plus Potion/Ether) and two
  stray chests on two others. Each stray chest is 50/50 supplies (gold + Potion) or a Mimic Chest (a
  fast foe drawn with the chest sprite at 4x, chomping; loot + 40 gold). Not counted in the HUD chests.
  `tools/reach.mjs` checks that every goal stays reachable with all six spots occupied (it caught one
  real bug: the grove wall had closed the north woods' east exit, so a merchant on the other gap cut
  off the Lucky Keyboard; one tree at (29,8) was removed to reopen it).
- **Formation**: ESC party screen, LEFT/RIGHT sets FRONT/BACK. Back row takes and deals x0.7 physical
  damage; spells and heals are unaffected, so it suits the analyst and support. Default is everyone
  front (first run unchanged); the autopilot moves the casters back.
