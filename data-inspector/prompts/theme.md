# Theme writer: Data Inspector

Data Inspector is a Papers, Please-style desk game. The PostHog hedgehog works the prospect's data
desk for 5 short days (about 50 seconds each). Records of the prospect's own analytics events land on
the desk one at a time; the player APPROVES good data or FLAGS bad data against a rulebook that grows
every day. Almost everything on screen is your text, so this kit is the most personal one: use the
prospect's real product, users and problems.

The kit adds its own generic content around your text: reference documents built from your events,
sources and personas (tracking plan, user directory, source health, release log), manager requests
between days, bills, grades and 5 endings. You don't write those; they use game.manager.name,
prospect.name and desk.name, so keep those short and friendly.

What you write, and where the player sees it:
- title (max 30), tagline (max 48): title screen, e.g. "Acme Telemetry Inspector".
- game.desk.name (max 28): the player's workplace in their world ("Mission Control Data Desk").
- game.manager: the boss who briefs the player every morning. name (max 14), title (max 20). Use a
  generic role name or a fun mascot unless the brief names a real person you may use.
- game.events (3-6): a believable tracking plan for their product. name: snake_case event names
  (max 24, no spaces). props (1-4 each): property names (max 16, snake_case) with 2-6 example values
  (max 16 chars). Use all-number values for amounts, counts, steps and ratings.
- game.sources (2-5): where good events come from (web, ios, android, server, api...).
- game.personas (exactly 4): their customers, first name (max 12) and role (max 18).
- game.days (exactly 5): intro (max 110) is the manager's morning line, tying the new rule(s) to one
  of their pain points. rules (1-2 per day, 7-9 in total, easy ones first). Each rule has a type,
  a text (max 56, what the player reads in the rulebook) and the parameters its type needs:
    unknown_event      flag events whose name isn't in game.events (typos). No params.
    blocked_source     flag events from test sources. values: the forbidden sources (NOT in sources).
    internal_user      flag events from the prospect's own email domain. No params.
    required_property  flag events missing a property. property: a prop name used in game.events.
    property_in_set    flag values outside a list. property + values (the allowed values).
    value_in_range     flag numbers outside a range. property (a numeric prop) + min + max.
    property_equals    flag one forbidden value. property + value.
    future_timestamp   flag events stamped in the future. No params.
    duplicate_id       flag an event ID the player already saw today. No params.
  Optional (the kit already adds one of these per day from day 2, with a document; use one only if it
  fits a real pain point): email_mismatch (no params), source_outage (no params), flag_before_release
  (no params), pii_in_text (property: a free-text prop, optional), currency_mismatch (property: a numeric
  money prop + value: a 3-letter currency code, both optional).
  Each type at most once, except property rules on different properties. Use at most one of
  property_in_set / value_in_range / property_equals per property. The rule text must say exactly
  what the code checks, with the real names and numbers ("amount_usd must be between 1 and 5000").
- game.final_record.intro (max 90): the manager's line before the last, trickiest record of the week.
- game.difficulty: "easy" for execs and non-gamers, "normal" for most, "hard" for gamer champions.
- text.win / text.lose (max 110), text.credits (max 80): end screen.
- music.mood (max 80): calm, focused office or themed moods; music.bpm 95-130.
- sprite_prompts: persona and manager prompts describe one person (or mascot animal) head and
  shoulders: hair, clothing colour, one accessory. desk.sprite_prompt: a desk surface from above.
