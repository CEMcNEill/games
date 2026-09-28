# Bug Survivors: the Wave Ladder (plan, 2026-09-28, rev 2)

Ask: more than 2 waves, enemies keep scaling, bosses become markers between waves (not the end), player power keeps
scaling so it stays hard but possible (difficulty and heat still apply). More PostHog abilities, powerups and lore.
Rev 2 adds data pipelines, a simple leaderboard, something unhinged, **hoggies as the player characters** (unlocked
as you play) and **crests as the achievements**, all from brand.posthog.com.

Research inputs: the current code (`content.ts`, `game.ts`, `cards.ts`, DESIGN-NOTES balance log), a sweep of
posthog.com (products, pricing, handbook values, blog, DeskHog, merch, hedgehog-mode repo) as of 2026-09-28, and the
`@posthog/brand` package (v0.12.3: 171 hoggies as 1000 px PNGs, 55 crests as 600 px full art plus 115 px minis).
Brand art: the package is PolyForm Strict, but the project owner (at PostHog) confirmed it's fine to use here.

## What's in the way today
1. **Player power flattens out.** Weapons cap at LV 5, evolutions have fixed numbers, passives cap, and a finished build
   draws heal/gold filler cards. Past ~level 45 you stop getting stronger. Unlimited waves need open-ended power.
2. **Enemy count is capped (320).** Past the cap, spawn rate does nothing, so later waves have to get harder through
   HP, damage, behaviour and elite density, not more bugs.
3. **The theme has one boss** (name, taunt, sprite), and the contract has no room for more. Boss variety has to be
   kit-fixed affixes on the theme boss: "<boss> 3.0", "<boss> 4.0"...
4. **Act 1 and Act 2 are hard-coded** (`act === 2`, `ACT2_*` tables, `actBreak`, `finalBoss`). They need to become
   "wave N" data.
5. **Endless already scales, but badly**: time² HP after 5:00 with no new content. The ladder replaces it.

## 1. Structure: the Wave Ladder
- **Wave = ~3:00 of traffic, then a boss marker.** Wave 1 is today's Act 1, untouched (3:30 boss, first run is still a
  ~4-minute novice win). Wave 2 is today's Act 2 content, but its boss becomes a marker too (HP x7 goes down to about x2.5).
- **Each boss is a release**: "<boss> 2.0", "3.0" and so on. Every version adds one kit affix plus one attack from the
  library (§5). **Target fight length 20-35 s**, with crumbling from 25 s instead of 50 s: a checkpoint, not a wall.
- **After every boss: "v3.0 SHIPPED!"** → CONTINUE / CASH OUT (today's screen, reused) → a **Release pick** (§3).
  Full HP, field cleared, gems vacuumed.
- **A run ends by death or cash-out.** Score = time + kills + wave bonus (grows with the wave). Best wave per
  difficulty/heat goes on the title; the end screen says "Reached wave 6". Scores go to the leaderboard (§10).
- **Push your luck (proposed):** gold from the current wave is "unmerged". Cash out and you bank all of it plus
  x(1 + 0.15·wave); die and you keep 50% of the unmerged gold. Gold from earlier waves is always safe.
- **Wave identities** (kit-fixed, loosely tracing PostHog's own story). Each gets a modifier and introduces one
  new archetype:

| wave | name | modifier | new archetype |
|---|---|---|---|
| 1 | MVP ("4 weeks to build it") | today's Act 1 | today's six |
| 2 | Hacker News Launch | today's Act 2 (spike, incident) | none |
| 3 | Product-Market Fit | traffic spikes twice as often | **Regression**: 30% come back once after dying ("IT'S BACK") |
| 4 | The Big Migration (ClickHouse, Oct 2020) | twice the tech-debt puddles | **Legacy Nest**: stationary spawner, drops a mini-chest |
| 5 | Hypergrowth | +30% spawns, +30% XP | **Flaky**: blinks short distances, half visible |
| 6 | Enterprise Deal | bugs take 35% less damage (Make It Public counters it) | **Scope Creep**: grows bigger and tougher over time |
| 7 | Outage | vision shrinks to a vignette | **Heisenbug**: invisible unless close or inside an aura (Replay Vision reveals) |
| 8 | Code Freeze | icy floor: the hog keeps momentum | **Race Condition**: linked pair, enrages unless both die within 2 s |
| 9-12 | Scale N | two random modifiers stacked (pool adds *Ingestion Lag*: gems take 2 s to appear); soft wall | mixes all |
| 13 | Deprecation | **the Reaper arrives** (§11) | the Reaper |

  Elite modifiers added: *Memory Leak* (leaves puddles), *Flaky* (teleports), *Swarm* (drops minis), *Dead Letter
  Queue* (on death, the 5 bugs it "queued" burst back out). From wave 4, elites roll 2 modifiers.

## 2. Enemy scaling (one formula instead of the act branches)
- `hp = base · diff · heat · time(t) · waveMult(W, f)`, where f is progress through the wave (0-1).
  - W1 and W2 stay as today (W2 ramps x1.3 → x2.6).
  - W≥3: `waveMult = 2.6 · g^(W-3+f)`, **g = 1.6** (tunable). From W9, g = 1.9: a soft wall so strong runs end around W10-12.
- Damage: x1.15 per wave, but **one hit can take at most 35% of max HP** after armour. Hard, never a one-shot.
- Spawns: +10% per wave until the 320 cap is saturated. Whatever the cap cuts off comes back as HP and elite frequency.
- Elites: 4 per wave, rising to 6. The elite pack stays on every wave.
- Gem XP x(1 + 0.25·(W-1)) so level-ups keep coming. The cards are what carry the power (§3).
- Difficulty (easy/normal/hard) and heat multiply on top, unchanged. Heat 5 overtime moves to "after every 3rd boss".

**Targets** (sim, n ≥ 8, measured per wave):

| config | goal |
|---|---|
| easy h0 novice | ~90% reach W3, median death W4-5 |
| normal h0 novice | ~75% clear W2, median death W3-4 |
| normal h0 smart | median death W6-7, best ~W9 (~20 min) |
| hard or h5 smart | median death W3-4 |

## 3. Player power scaling (the new open-ended layer)
Budget: the build's effective DPS has to grow about g (1.6x) per wave through W7. Four sources:

**a) Semver weapon levels (open-ended).** LV 1-5 shows as v0.1-v0.5. Evolved = **v1.0**. After that, the weapon's card
keeps coming back as a **patch**: v1.1, v1.2... each +10% damage and +3% area (additive, uncapped). Maxed passives
get "+patch" cards at half the value. No more dead filler cards, and every card reads like a changelog entry.

**b) Releases: 1 of 3 after every boss** (the run-defining picks, like arcanas in Vampire Survivors):

| release | effect | lore hook |
|---|---|---|
| Self-Driving Product | every 20 s a scout opens a PR: a hotfix blast on the densest cluster | "We make your product self-driving." |
| Hedgehog Mode | 2 hog pals fight alongside you (random unlocked hoggies: webs, lasers, fire, chill); pick again for more | hedgehog-mode repo |
| Generous Free Tier | a free chest at the start of every wave; every 1,000th kill drops a chest | "free allowance renews every month" |
| 97% Pay $0 | +1% might per 10 gold picked up this run (cap +60%) | pricing page |
| Burning Money | every coin you touch is set on fire and thrown at a bug; you earn no gold this run (unhinged, §11) | Burning Money hoggie |
| Dangerously Skip Permissions | +50% damage, -30% max HP (a curse) | dangerously_skip.pad merch |
| Token Burning Cap | damage ramps +2%/s up to +60%, resets when you're hit | token.burning_cap merch |
| Rollout 100% | +1 projectile/orb/flag on every weapon | feature flag rollouts |
| Source Maps | crits deal x3 (not x2), +10% crit | error tracking |
| Default to Transparency | bugs under 12% HP are executed on hit | "Make it public" |
| Small Teams | +15% damage per weapon slot below 6 you leave empty | small-teams culture |
| Maker Days (no meetings Tue/Thu) | weapons fire 40% faster every other 30 s | handbook |
| ClickHouse | gems merge into big gems, +30% XP, every level-up heals 5 | Oct 2020 move |
| Ingestion Pipeline | every gem on the map is ingested (auto-collected) 3 s after it drops, wherever you are | Ingestion crest |
| Dopamine Mode | each level-up adds a temporary agent orb for 20 s (max 9) | PostHog Desktop's 9 parallel agents |
| Offsite Hackathon | mid-wave, a free 1-of-3 level-up | 24-hour offsite hackathons |
| DeskHog | a desk-console turret that follows you and shoots ("It's a friend.") | DeskHog |
| Kill Switch Protocol | once per wave, dropping under 25% HP kills every bug on screen | feature flags |

**c) Major versions.** A Release card can also be "**<weapon> v2.0**" for an evolved weapon: +50% damage, +1 amount,
a tint, and one signature tweak from a small table (Kill Switch Grid chains 5, Funnel Quake triple wave, and so on).
v2.0 only, no v3, to keep the content cost bounded.

**d) New tools every boss.** The Toolbox cards join the Release pick (at least one tool card per Release screen through W5).

Defence keeps pace through the 35% hit cap, Snack Break patches, full HP at every wave, and the Releases.

## 4. New PostHog abilities
**Evolutions for the three tools that lack one:** Web Analytics + Autocapture = *Realtime Dashboard* (beams become a
spinning star). Data Warehouse + Snack Break = *Managed Warehouse* (drums shatter into shards). Workflows + Lucky Commit
= *Multi-Channel Blast* (zaps fork at every hop). Workflows' weapon is renamed from "Pipeline" to "Automation" so
Data Pipelines can have the name.

**10 new tools** (kit-fixed, each with an evolution; two batches):

| tool | weapon | behaviour | evolution (partner) | why it matters late |
|---|---|---|---|---|
| **Data Pipelines** | Pipeline | lays a pipe from you toward the densest cluster for 4 s; bugs that touch it get sucked along and shot out of the destination end, taking damage | *Hog Transformations*: bugs that die in a pipe are transformed into events that fire back out as homing shots, so the enemies become ammo (Pair Programming) | crowd control + converts density to damage |
| **Batch Exports** | Batch Export | tags every bug you hit; every 10 s the batch "exports": each tagged bug takes 30% of the damage it took this batch, all at once ("EXPORTED 214 ROWS") | *Backfill*: each export also replays the previous batch (Docs Day) | multiplies the whole build |
| Scouts (Self-driving) | Scout Troop | wandering drones that *flag* bugs; flagged bugs take +40% damage from everything | *Troop of 90*: signals merge into a report that fires a PR laser (Lucky Commit) | multiplies the whole build |
| HogQL / SQL editor | `DELETE FROM bugs` | every 6 s, executes each bug on screen under X% HP (a boss takes a chip) | *Materialized View*: threshold up, every 3 s (Docs Day) | %-based, so it scales to any wave |
| Logs | `tail -f` | lines of log text scroll across the screen and cut through bugs | *Firehose*: dense walls in 2 directions (Hot Reload) | screen-wide |
| Replay Vision | Vision Scanner | places scanner eyes that sweep a cone and zap; reveals Heisenbugs | *Sees Everything*: 4 scanner types (Monitor, Scorer, Classifier, Summarizer) (Big Monitor) | counters W7 |
| AI Observability | Trace | hits a bug, then spreads along a span tree to linked bugs | *Evaluations*: spans crit on bugs already hit (Rubber Duck) | crowd chains |
| Revenue Analytics | MRR Cannon | a gold cannon whose damage scales with gold picked up this run | *Net Revenue Retention*: damage compounds each wave (Lucky Commit) | self-scaling |
| Endpoints | Endpoint Turret | drop a turret that repeats your strongest weapon's shot | *Materialized*: turrets persist, 3 at a time (Hot Reload) | copies the build |
| PostHog Desktop | Command Center | a ring of agent orbs that fire; up to 9 | *Dopamine Mode*: all 9 fire at once every 5 s (Pair Programming) | burst |

**Data pipelines, the full set:** Pipeline and Batch Export (tools), Hog Transformations and Backfill (evolutions),
the Ingestion Pipeline release, the Dead Letter Queue elite, the Ingestion Lag wave modifier, the Webhook powerup (§6),
and a "Data Tools" crest for holding Warehouse + Pipeline + Batch Export at once (§9).

**5 new passives, named for the handbook values** (the passive cap goes 6 → 8 from W3, "headcount approved"):
*You're the Driver* (+damage while moving), *Make It Public* (bugs take +8% damage per level, ignoring armour),
*Do More Weird* (random weapon procs), *Why Not Now?* (powerups last longer and trigger instantly),
*Optimistic by Default* (+damage above 50% HP, small regen).

## 5. Bosses as markers
Theme boss + version number + one kit affix. Every earlier attack stays in the library, so later versions mix them.

| version | affix | new attack |
|---|---|---|
| 1.0 | none | ring, charge, spiral, summon (today) |
| 2.0 | Rollout (today) | telegraphed rollout lines |
| 3.0 | Race Condition | splits into two at 50%; both must die |
| 4.0 | Memory Leak | grows over the fight, leaves puddles |
| 5.0 | Heisenbug | phases out and reappears while not being hit |
| 6.0 | Monolith | armour plates that break one by one |
| 7.0 | Infinite Loop | circles you while firing spirals |
| 8.0-12.0 | Zero-Day | two random affixes (pool adds *Backpressure*: you slow down the more bugs are alive) |

Boss HP is set against *expected* DPS at that wave (reusing the pressure probe, §12), so the fight stays at 20-35 s.

## 6. New powerups (joining Self-Driving, Freeze, Ship It, Rewind)
| powerup | effect |
|---|---|
| Kill Switch | every bug of the most common kind on screen dies |
| Webhook | 6 s: every kill fires a bolt at the nearest bug (chain reactions) |
| Party Mode | hedgehog-mode 2.0: rainbow hoggie, damage aura, all pickups fly in, 6 s |
| Hogzilla | you become Driving Hogzilla: bigger, run bugs over, fire breath forward, 6 s |
| Scout Troop | 8 scout drones for 10 s |
| Sampling | 90% of bugs on screen go ghostly for 5 s: harmless, double damage taken |
| Cmd+K | the command palette: pick 1 of 3 powerups |

Drop rates rise with the wave; still at most 2 on the floor.

## 7. Lore: merch relics and handbook pages
- **Merch relics** (in-run pickups from bosses and ~3% of elites, one per run each): small passive buffs that are also
  permanent collectibles. token.burning_cap (+5% damage), dangerously_skip.pad (+crit), posthog_playing.cards
  (+1 reroll), Owala bottle (+regen), tech anorak (+armour), summer socks (+speed), retired-billboard duffel (+magnet),
  home/away jersey (+XP), top hat (+luck).
- **Handbook pages** (the first time you beat each boss version, plus rare crates late): pure lore, kept in the codex.
  Values, history and facts: idea #6 after five pivots, YC W20, the 4-week MVP, "300 deployments in a couple of days",
  ClickHouse, PostHog 3000 ("going from 1 to 3000"), Max never drawn in side profile, "The hedgehog is still called Max",
  the offsite hackathons, DeskHog, "Write everything down", "If given a choice, go live", "Your free allowance renews
  every month".
- **Codex:** SHOP > RECORDS gets three tabs: HOGGIES (§8), CRESTS (§9), LORE. Unfound entries show "???".

## 8. Hoggies are the player characters
All 171 hoggies from `@posthog/brand` replace today's tinted hog + hat heroes (Max, Sprinter, Wizard, Hacker migrate
into the roster). Art is kit-fixed, not themed, so every prospect build gets the same cast.

**In-game look.** A downscale test is in `overnight-shots/hoggie-scale-test.png` (32 px and 24 px next to a 16 px bug on the 480x270 canvas).
The illustrations read well at **32 px**, and that's the in-world size. The hitbox stays the current small circle.
Animation is procedural because the art is a single pose: walk bob, squash on turns, horizontal flip, hurt flash,
tilt on dash, a little hop on level-up. The select screen and unlock toasts use a 96 px portrait.
`tools/import_brand.py` bakes both sizes from the npm package: crop, Lanczos resize, hard alpha, 1 px outline. It also
builds atlases, so the load stays small (171 × 32 px is tiny; portraits lazy-load per page).

**Two tiers:**
- **~26 signature hoggies** with a start weapon and a real trait. For example:
  | hoggie | start | trait |
  |---|---|---|
  | I'm The Driver (default) | theme start weapon | none; "You're the driver" |
  | Wizard (5 variants = alt skins) | Product Analytics | +area; the old Wizard hero |
  | Self-driving | theme start | Self-Driving Mode for 5 s at every wave start; powerups last 2x |
  | Driving Hogzilla | Heatmaps | runs bugs over (contact damage while moving), bigger body |
  | Terminator | Experiments as a forward minigun | "I'll be back": one free revive |
  | Reaper | Error Tracking | 1% of kills reap every bug under 20% HP; -30% max HP |
  | Burning Money | Revenue Analytics | coins become fireballs, no gold (§11) |
  | Dadd AI | PostHog AI | the drone starts at v0.3 |
  | Noir (5 variants) | Replay Vision | sees Heisenbugs, +crit |
  | X-ray | Session Replay | sees Heisenbugs, +magnet |
  | Data Thief | Data Pipelines | gems fly to you from twice as far |
  | Desk Wizard | theme start | a DeskHog turret companion |
  | Doc Brown / Back To The Future | Session Replay | a free Rewind at every wave start |
  | Caveman → Business Evolution → Final Evolution | theme start | one hero that *evolves* at W3 and W6 with a stat jump |
  | Error, Experiment, Survey, Chart, Workflows | their product | the product's crest-matching start |
  | Robot | theme start | +1 amount, -15% speed |
  | Superhero | theme start | ignores puddles, +speed |
  | Stamp Approved / Denied | theme start | armour / thorns |
  | 996 | theme start | +40% XP, takes a little damage over time (grindy) |
  | Panic | theme start | faster the lower your HP |
  | Asleep / Sleepy | theme start | slow, big regen |
  | Dynamite | theme start | a hotfix bomb every 60 s |
  | Angel | secret: kill the Reaper | revives at full HP once per wave |
  A hero's start weapon is only used if the theme features that product; otherwise it falls back to the theme's
  starting product, as today. Tools (Pipelines, Replay Vision...) are kit-fixed, so they always work.
- **~145 cast hoggies**: the default stats plus one small perk that matches the art (Coffee Cup +cooldown,
  Rocket +speed, Money +gold, Reading +XP, Lifeguard +regen, Magnifying Glass +magnet, Gladiator +might...). These are
  the collect-them-all layer. The table is auto-drafted by tag, then hand-tuned.

**Unlocking (more and more as you play):**
- Start with 3: I'm The Driver, Wizard 1, and one random cast hoggie.
- **Every crest earned unlocks its linked hoggie** (55, §9).
- **Hoggie capsules** at the end of a run: one per wave cleared after wave 1, capped at 5 per run. Each capsule reveals
  a random locked hoggie with a slot-machine reveal. Gold can also buy capsules in the shop (price rises with the
  number owned), which gives gold a long-term sink.
- **Pace:** a typical run to W4 gives ~3 hoggies, so ~25 unlocked after 5 runs and all 171 after roughly 50-70 runs.
  Signature hoggies come mostly from crests, so the interesting ones arrive through play, not luck.
- The title shows your hoggie count ("47/171 HOGGIES"), and a new hoggie goes on the end screen with its portrait.

## 9. Crests are the achievements
All 55 team crests become the achievements (the 17 existing achievements map onto them, keeping their ids so saves
carry over). Each crest shows as a 24 px mini badge in toasts and the full 96 px art in the CRESTS tab, and each one
unlocks a hoggie.

| crest | achievement | | crest | achievement |
|---|---|---|---|---|
| A Default Crest | win a run (first_win) | | Graphics | unlock 25 hoggies |
| AI Gateway | squash 1,000 bugs with AI tools | | Growth | reach level 100 in one run |
| AI Observability | evolve Trace | | GTM Engineering | cash out at W3+ with 500+ gold |
| AI Research | evolve Deep Research | | Ingestion | collect 10,000 gems in one run |
| Analytics Platform | hold Product Analytics, Web Analytics and Heatmaps | | Managed Warehouse | hold 5 evolved weapons |
| APM | beat a boss in under 15 s | | Marketing | reach the global top 10 |
| Batch Exports | one export hits 200 bugs | | MCP Analytics | hold 3 AI tools in one run (tools3) |
| Billing | earn 1,000 gold in total (rich) | | New Business Sales | cash out for the first time |
| Blitzscale | reach W5 before 15:00 | | Onboarding | finish your first run |
| Builder Relations | play 10 runs | | People & Ops | unlock 50 hoggies |
| ClickHouse | squash 100,000 bugs in total | | Platform Features | a weapon at v1.10 |
| Client Libraries | win with 10 different hoggies | | Platform UX | take a v2.0 major release |
| Cloud Foundations | reach W8 | | PostHog Desktop | 9 Command Center agents at once |
| Cloud Platform | reach W10 | | Product Analytics | evolve Funnel Quake |
| Conversations | read 10 handbook pages | | Product Lead Sales East | win heat 3 |
| Customer Analytics | squash 50 elites in total | | Product Led Sales West | win heat 5 (heat5) |
| Customer Success EU | finish a daily run (daily) | | Replay | evolve Rage Click Vortex |
| Customer Success NA | finish 7 daily runs | | Security | clear W6 (Enterprise Deal) without dropping under 50% HP |
| Data Modeling | evolve Managed Warehouse | | Self-driving | ride out Self-Driving Mode (hands_off) |
| Data Tools | hold Warehouse + Pipeline + Batch Export | | Support | be revived 10 times in total |
| Demand Gen | pick up 30 powerups in one run | | Surveys | evolve NPS Blizzard |
| Dev Experience | clear W1 without being hit | | Talent | unlock every signature hoggie |
| Editorial | find every handbook page | | Warehouse Sources | collect every merch relic |
| Error Tracking | evolve Stack Trace Storm | | Web Analytics | evolve Realtime Dashboard |
| Experiments | evolve Multivariate Barrage | | Website | fuse Full Stack Nova (super, hidden) |
| Feature Flags | evolve Kill Switch Grid | | Wizard & Docs | win with a Wizard |
| Forward Deployed Engineering | win on hard | | Workflows | evolve Multi-Channel Blast |
| | | | YouTube | get run over by Hogzilla (§11) |

The existing ids that don't have a crest yet (kills_2000, evolve, heat2, level20, elites5, hotfix, full_stack, endless10,
act2, full_clear) fold into the nearest crest or stay as crest-less milestones. The mapping is settled in phase 2.

## 10. Leaderboard (simple)
- **Local, always on:** top 10 per mode (RUN, DAILY, YOLO), arcade-style 3-letter initials on a new best, each row
  showing the hoggie portrait, wave reached and score. Stored in the kit save; shown on the title (cycling) and the end
  screen.
- **Global (optional, recommended):** a tiny Cloudflare Worker + D1 with two routes: `POST /score` and
  `GET /top?slug&mode`. The row is {slug, mode, initials, score, wave, time, hoggie, heat, diff, date}. **Boards are
  per prospect theme** ("ACME's top 10") plus one all-themes board and today's daily. Guardrails: score must be ≤ f(time,
  wave), a per-IP rate limit, a 3-letter blocklist, and failures stay silent (offline shows local only). Each submit
  is also captured to PostHog as `leaderboard_submit`.

## 11. The unhinged part
- **`--dangerously-skip-permissions` (YOLO mode).** A title mode, unlocked after you clear W5. Everything x3 (spawns, XP,
  gold), and damage both ways x2. There are no level-up pauses: PostHog AI picks your cards instantly, with a
  snarky one-liner ("Max chose Snack Break. Again."). Powerups rain from the sky, a boss arrives every 90 s,
  and at every boss **ALL HANDS**: every hoggie you've unlocked charges across the screen as allies. It has its own
  leaderboard.
- **Hogzilla drive-by** (event in normal runs from W3): a horn, a warning lane, then the Driving Hogzilla car barrels
  across the arena flattening every bug in the lane, and you too if you're standing in it (-30% HP). Getting hit earns
  the YouTube crest.
- **Burning Money** (hoggie and release): set your gold on fire. Every coin becomes a fireball, and you bank nothing.
- **The Reaper at wave 13** (the Vampire Survivors 30:00 Death, as a nod to the genre): "DEPRECATED." The Reaper
  hoggie arrives with absurd HP and keeps speeding up. It ends almost every run. Killing it (only a broken build can)
  unlocks the secret Angel hoggie.
- **New personal best wave:** a stampede of your whole hoggie collection crosses the screen.
- **Details:** the reroll button is Drake Nah, the banish button Drake Yah, and a new crest is stamped with the Stamp Approved hoggie.

## 12. Balance method and tooling
- **sim.py per-wave telemetry:** death wave, time, level, player DPS, incoming bug HP/s, damage taken/s by source,
  releases and patches picked, powerups. The **pressure ratio** (incoming HP/s ÷ DPS) per wave is the tuning chart.
- The autopilot learns Release picks, patch cards and nest priority. The novice stays "first card". Signature
  hoggies each get a quick smoke run so no trait is broken or dead.
- Matrix per phase: easy/normal novice + normal smart at h0, plus h3 and h5 smart, n ≥ 8, 0 page errors.
- Perf gate: W10 flood with every tool, pals, turrets and an ALL HANDS stampede, at 60 fps. Caps on projectiles,
  turrets and pals.
- Theme contract unchanged. Kit sprites for new tools use master-palette letters (`tools/make_wave_sprites.py`).
  The hoggie and crest art stays full-colour and kit-fixed.

## 13. Phases (each shippable, balanced and documented)
1. **Ladder core:** generalise act → wave N, boss markers (versions, HP retarget, crumble at 25 s), a shipped screen
   after every boss, the scaling formula, semver patches, XP scaling, HUD (wave bar, "next release in"), best wave on
   the title, the **local leaderboard**, sim telemetry. Playable and balanced to W8 with existing content.
2. **Hoggies + crests:** `import_brand.py`, hoggies as the player (procedural animation), the signature/cast roster,
   capsules, crests as achievements (the 55-row mapping, save migration), the RECORDS tabs.
3. **Releases + passives:** the Release screen, 18 releases, v2.0 majors, 3 tool evolutions, 5 value passives, passive cap 8.
4. **New tools:** batch A (Data Pipelines, Batch Exports, Scouts, HogQL, Logs), then batch B (Replay Vision,
   AI Observability, Revenue, Endpoints, Desktop), with sprites.
5. **Enemies, bosses, unhinged:** 6 archetypes, 4 elite mods, wave modifiers W3-W13, boss affixes 3.0-12.0, the Reaper,
   the Hogzilla drive-by, YOLO mode.
6. **Powerups, lore, global board:** 7 powerups, merch relics, handbook pages, the Worker + D1 leaderboard.
7. **Full balance and review pass:** matrix sims, a read-only code review agent, KIT.md, DESIGN-NOTES and README.

## Open questions
1. **ENDLESS mode:** fold it into RUN (the ladder *is* endless) and give its title slot to YOLO? Recommended.
2. **Push-your-luck gold** (lose 50% of unmerged gold on death): yes or no?
3. **Wave 2's boss:** OK to drop "<boss> 2.0" from x7 HP to a ~30 s marker?
4. **Global leaderboard:** OK to add a Cloudflare Worker + D1? It needs a Cloudflare account to deploy to, and a route
   next to play.funglass.es. The alternative is local-only.
5. **Scope:** all seven phases in order, or stop after phase 2 (ladder + hoggies + crests) so you can play it first?
