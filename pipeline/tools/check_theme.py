#!/usr/bin/env python3
"""Validate a hand-written theme.json with the same checks every theme must pass (theme_rules.py).

    uv run -q --with jsonschema --with pyyaml python check_theme.py <kit_dir> <brief.yaml> <theme.json> [--fix]

Checks the kit JSON Schema, the content filter (competitors, blocklist, emoji) and kit cross-field rules.
--fix rewrites the file with the brief's fixed fields (name, domain, brand colours) applied first.
"""
import json
import os
import sys

import jsonschema
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from theme_rules import apply_brief, content_problems, kit_problems, load_kit  # noqa: E402

kit_dir, brief_path, theme_path = sys.argv[1:4]
kit, schema, _, _ = load_kit(kit_dir)
brief = yaml.safe_load(open(brief_path))
theme = apply_brief(json.load(open(theme_path)), brief, kit, schema)
if "--fix" in sys.argv:
    json.dump(theme, open(theme_path, "w"), indent=2, ensure_ascii=False)
probs = [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
         for e in jsonschema.Draft202012Validator(schema).iter_errors(theme)]
probs += content_problems(theme, brief) + kit_problems(theme, kit)
for p in probs:
    print("PROBLEM", p)
print("OK" if not probs else f"{len(probs)} problems")
sys.exit(1 if probs else 0)
