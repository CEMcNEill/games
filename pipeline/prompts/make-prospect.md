# Make a prospect game, unattended

This file is the prompt `pipeline/bin/make-prospect` gives Claude. `{{...}}` are filled in by the script.

You are running unattended: nobody will see questions or answer them. Make every decision yourself, write down the
ones the rep should know about in the result file, and finish.

Make a prospect game in this repo. First read README.md and pipeline/README.md, and follow the loop in
pipeline/README.md, steps 1-6. Skip step 7 (hosting): don't deploy, upload, commit or push anything.

## What the rep gave you

- Company: {{name}} ({{domain}})
- What they do: {{about}}
- Their pains: {{pains}}
- PostHog products to feature: {{products}}
- Who will play it: {{audience}}
- Tone and things to avoid: {{tone}}
- Template: {{template}}
- Notes: {{notes}}
{{brief_line}}

## Fill the gaps yourself

For anything above marked "not given", read the company's own website with WebFetch (home, product, pricing,
about, docs or blog) and use WebSearch if the site is thin. Then decide:

- **What they do:** one line, plus the industry.
- **Brand colours:** 3 hex colours from their site (CSS, logo, buttons). Put the main brand colour first.
- **Pains:** 2-3 problems that a team building a product like theirs plausibly has and PostHog helps with. Write them
  as a team's everyday problems, not as facts about this company: no invented numbers, quotes, incidents or people.
- **Products:** 3-5 PostHog products that answer those pains.
- **Who will play it:** if not given, an engineering lead who is fairly technical.
- **Tone:** if not given, friendly and light. Avoid anything violent, political, or about their customers' private data.
- **Template:** if it says "auto", pick from the README's template table by who will play it. If you're unsure,
  pick bug-survivors.

The brief goes in `prospects/{{slug}}.yaml`, and its `name` is exactly `{{name}}`. If the rep gave a brief file,
copy it there and fill in only what's missing.

## Art

{{art}}

## Splash logo

{{logo}}

## Build and check

1. Write the theme to `prospects/{{slug}}-themes/<kit>.json`. Run check_theme until it prints OK.
2. Build:
   `pipeline/bin/build-game <kit> prospects/{{slug}}-themes/<kit>.json --brief prospects/{{slug}}.yaml --art prospects/{{slug}}-art/<kit>`
   (leave out `--art` if you drew nothing and copied no logo).
3. Look at the check's `contact.png` and at least the title and play screenshots. Fix anything that looks off
   (unreadable text, a sprite that doesn't read, a wrong or illegible logo), then rebuild. Stop after 3 rebuilds.
   If something is still off, record it in `problems`.

Only write inside `prospects/` and `out/`. Don't edit the kits, `shared/` or `pipeline/`.

## Finish: write the result file

Write `prospects/{{slug}}-result.json`. It's how the script knows what you made:

```json
{
  "name": "{{name}}",
  "kit": "<kit id>",
  "out": "out/<folder build-game wrote>",
  "check": "out/<that folder>-check",
  "logo": "a | b | c | d | posthog",
  "logo_options": "prospects/{{slug}}-logo-options/logo-options.png, or null",
  "rebuild": "<the exact build-game command you ran last>",
  "decisions": ["short lines the rep should check: guessed pains, chosen template, logo pick and why..."],
  "problems": ["anything still off; empty if none"]
}
```

Then reply with 3-5 lines: the game, the template, and anything the rep should look at before sharing it.
