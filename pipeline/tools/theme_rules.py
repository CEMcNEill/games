#!/usr/bin/env python3
"""Theme rules shared by every theme author (a person, Claude, or the local-LLM writer):
kit loading, the content filter (competitors, blocklist, emoji), fields fixed by the brief, kit
cross-field rules, and the safe fallback theme. Used by check_theme.py.
"""
import copy
import json
import os
import re

# the kits repo root (this file lives in <repo>/pipeline/tools; symlinks elsewhere resolve here)
KITS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

COMPETITORS = ["amplitude", "mixpanel", "heap analytics", "fullstory", "logrocket", "hotjar", "pendo", "optimizely",
               "launchdarkly", "statsig", "split.io", "sentry", "datadog", "new relic", "segment", "google analytics",
               "adobe analytics", "growthbook", "rollbar", "bugsnag", "smartlook", "clarity", "kissmetrics",
               "quantum metric", "contentsquare", "glassbox", "userpilot", "appcues", "chameleon", "qualtrics",
               "typeform", "surveymonkey", "snowflake", "bigquery", "databricks", "fivetran", "rudderstack"]
BLOCKLIST = ["fuck", "shit", "bitch", "cunt", "dick", "piss", "bastard", "damn", "hell ", "sexy", "nazi", "kill yourself",
             "drunk", "beer", "vodka", "weed", "cocaine", "stupid", "idiot", "dumb", "moron", "suck"]
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load_kit(kit_dir):
    kit = json.load(open(os.path.join(kit_dir, "kit.json")))
    schema = json.load(open(os.path.join(kit_dir, "theme.schema.json")))
    default = json.load(open(os.path.join(kit_dir, "themes/default.json")))
    prompt = open(os.path.join(KITS, "shared/prompts/rules.md")).read() + "\n\n" + \
        open(os.path.join(kit_dir, "prompts/theme.md")).read()
    return kit, schema, default, prompt


def strings(v, path=""):
    if isinstance(v, str):
        yield path, v
    elif isinstance(v, dict):
        for k, x in v.items():
            yield from strings(x, f"{path}.{k}" if path else k)
    elif isinstance(v, list):
        for i, x in enumerate(v):
            yield from strings(x, f"{path}[{i}]")


def content_problems(theme, brief):
    allowed = {brief.get("name", "").lower(), "posthog"}
    probs = []
    for path, s in strings(theme):
        low = s.lower()
        for c in COMPETITORS:
            if re.search(r"\b" + re.escape(c) + r"\b", low) and c not in allowed:
                probs.append(f"{path}: names a competitor or other company ('{c}'); use a generic problem instead")
        for w in BLOCKLIST:
            if w in low:
                probs.append(f"{path}: contains '{w.strip()}', which isn't allowed")
        if EMOJI.search(s):
            probs.append(f"{path}: contains emoji; the pixel font can't draw them")
    return probs


def apply_brief(theme, brief, kit, schema):
    """Deterministic fields come from the brief, not the model."""
    theme.setdefault("prospect", {})
    theme["prospect"]["name"] = brief["name"][:40]
    if brief.get("domain"):
        theme["prospect"]["domain"] = brief["domain"][:60]
    short = theme["prospect"].get("short") or brief["name"]
    theme["prospect"]["short"] = short[:14]
    cols = [c for c in brief.get("brand_colors") or [] if isinstance(c, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", c)]
    if cols:
        pal = theme.setdefault("palette", {})
        pal["primary"] = cols[0]
        if len(cols) > 1:
            pal["secondary"] = cols[1]
        if len(cols) > 2:
            pal["accent"] = cols[2]
    return theme


def kit_problems(theme, kit):
    probs = []
    g = theme.get("game", {})
    if "starting_product" in g and g["starting_product"] not in theme.get("products", []):
        probs.append("game.starting_product must also be listed in products")
    return probs


def safe_theme(default, brief, kit):
    t = copy.deepcopy(default)
    short = (brief.get("short") or brief["name"])[:14]
    t["title"] = f"{short} vs The Bugs"[:30] if kit["id"] == "bug-survivors" else t["title"]
    t["tagline"] = f"Made for {brief['name']} by PostHog"[:48]
    t["text"]["credits"] = f"Made for {brief['name']} by PostHog"[:80]
    wanted = [p for p in brief.get("posthog_products") or [] if p in kit["products"]]
    if len(wanted) >= 3:
        rest = [p for p in t["products"] if p not in wanted]
        t["products"] = (wanted + rest)[:len(t["products"])]
        if "starting_product" in t.get("game", {}):
            t["game"]["starting_product"] = t["products"][0]
    return t
