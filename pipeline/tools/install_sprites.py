#!/usr/bin/env python3
"""Render a prospect's hand-made .sprite files into a built game, checked against the kit's slots.

    uv run -q --with pillow python install_sprites.py <kit_dir> <sprite_dir> <game_dir>

Each <sprite_dir>/<slot>.sprite becomes <game_dir>/theme/sprites/<slot>.png (frames side by side) and is
registered in theme/manifest.json. Size and frame count must match the kit's slots.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixel import brand_palette, load, to_images  # noqa: E402
from PIL import Image  # noqa: E402

kit_dir, sdir, game = sys.argv[1:4]
theme = json.load(open(os.path.join(game, "theme", "theme.json")))
slots = {s["id"]: s for s in json.load(open(os.path.join(kit_dir, "slots.json")))}
out = os.path.join(game, "theme", "sprites")
man_path = os.path.join(game, "theme", "manifest.json")
man = json.load(open(man_path))
done = []
for fn in sorted(os.listdir(sdir)):
    if not fn.endswith(".sprite"):
        continue
    sid = fn[:-7]
    if sid not in slots:
        raise SystemExit(f"{fn}: kit has no slot {sid!r} (have {', '.join(slots)})")
    spr = load(os.path.join(sdir, fn))
    sl = slots[sid]
    if (spr["w"], spr["h"], len(spr["frames"])) != (sl["w"], sl["h"], sl["frames"]):
        raise SystemExit(f"{fn}: {spr['w']}x{spr['h']} x{len(spr['frames'])} frames, slot wants "
                         f"{sl['w']}x{sl['h']} x{sl['frames']}")
    ims = to_images(spr, brand_palette(theme))
    sheet = Image.new("RGBA", (sl["w"] * len(ims), sl["h"]), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, (i * sl["w"], 0))
    sheet.save(os.path.join(out, f"{sid}.png"))
    man.setdefault("sprites", {})[sid] = f"theme/sprites/{sid}.png"
    done.append(sid)
json.dump(man, open(man_path, "w"), indent=1)
print("installed", ", ".join(done))
