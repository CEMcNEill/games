#!/usr/bin/env python3
"""Act 2 art for bug-survivors: PostHog tool icons, the Max AI drone and its bolts, Warehouse Vault blocks and
the four powerup pickups. Written as bug-survivors/sprites/<slot>.sprite (fixed colours, no brand tokens).

    cd ~/games/kits && uv run -q --with pillow python bug-survivors/tools/make_act2_sprites.py

Bases: Kenney 1-Bit Pack glyphs (CC0) for the flame, snowflake, rocket and steering wheel silhouettes, filled
with a 3-tone ramp (light top-left, shadow bottom-right) and a dark outline; hand grids for the rest (no pack
has a database, a flowchart or a friendly AI drone). Kept separate from make_sprites.py so neither clobbers
the other's slots.
"""
import math
import os
import sys

from PIL import Image

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "shared"))
import pixel  # noqa: E402

OUT = os.path.join(KIT, "sprites")
ONEBIT = os.path.expanduser("~/games/assets/1-bit-pack/Tilesheet/colored-transparent_packed.png")
K = "#141b1b"  # outline, as in the Ninja Adventure art


def glyph(idx):
    """16x16 mask of a Kenney 1-bit glyph (49 columns in the packed sheet)."""
    im = Image.open(ONEBIT).convert("RGBA")
    x, y = (idx % 49) * 16, (idx // 49) * 16
    t = im.crop((x, y, x + 16, y + 16))
    return [[t.getpixel((i, j))[3] > 128 for i in range(16)] for j in range(16)]


def fill_holes(mask):
    """Fill enclosed transparent pixels (1-bit line art -> solid silhouette)."""
    h, w = len(mask), len(mask[0])
    seen = set()
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or mask[y][x]:
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return [[mask[y][x] or (x, y) not in seen for x in range(w)] for y in range(h)]


def mask_from(fn, w=16, h=16):
    return [[bool(fn(x, y)) for x in range(w)] for y in range(h)]


def shade(mask, ramp, outline=True, colour_at=None):
    """Mask -> rows. ramp = (highlight, base, shadow). Pixels open to the top/left get the highlight, open to the
    bottom/right the shadow; colour_at(x, y) may return a ramp override per pixel. A 1px outline goes outside."""
    h, w = len(mask), len(mask[0])
    at = lambda x, y: 0 <= x < w and 0 <= y < h and mask[y][x]
    legend, rows = {"k": K}, []
    letters = {}

    def letter(col):
        if col not in letters:
            letters[col] = "abcdefghijmnpqrstuvwxyzABCDEFGHIJ"[len(letters)]
            legend[letters[col]] = col
        return letters[col]
    for y in range(h):
        r = ""
        for x in range(w):
            if at(x, y):
                hi, base, lo = colour_at(x, y) if colour_at else ramp
                if not at(x - 1, y) or not at(x, y - 1):
                    c = hi if (at(x + 1, y) and at(x, y + 1)) else base
                elif not at(x + 1, y) or not at(x, y + 1):
                    c = lo
                else:
                    c = base
                r += letter(c)
            elif outline and any(at(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                r += "k"
            else:
                r += "."
        rows.append(r)
    return rows, legend


def write(slot, frames, legend, note):
    spr = {"w": len(frames[0][0]), "h": len(frames[0]), "legend": {k: (v, "") for k, v in legend.items()},
           "frames": frames, "meta": {"concept": note}}
    pixel.save(os.path.join(OUT, f"{slot}.sprite"), spr)


def grid(slot, rows_list, legend, note):
    write(slot, rows_list, legend, note)


# ---------------------------------------------------------------- tool icons (16x16)

# Heatmaps: the 1-bit flame, hot at the core (yellow), orange body, red tips.
m = fill_holes(glyph(505))
core = lambda x, y: all(0 <= x + dx < 16 and 0 <= y + dy < 16 and m[y + dy][x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1))
fire = lambda x, y: (("#fcfcfc", "#f8d878", "#f8b800") if core(x, y) and y >= 9 else
                     ("#f8d878", "#fca044", "#e45c10") if y >= 6 else ("#fca044", "#f83800", "#a81000"))
rows, leg = shade(m, None, colour_at=fire)
write("icon_heatmaps", [rows], leg, "Heatmaps: a flame, white-hot core (1-bit #505)")

# Data Warehouse: a database cylinder (three stacked discs), sky-blue.
grid("icon_data_warehouse", [[
    "................",
    "....kkkkkkkk....",
    "..kkCCCCCCCCkk..",
    ".kCCwwCCCCCCCCk.",
    ".kCCCCCCCCCCCCk.",
    ".knCCCCCCCCCCnk.",
    ".kBnnCCCCCCnnBk.",
    ".kwBBnnnnnnBBBk.",
    ".knBBBBBBBBBBnk.",
    ".kBnnBBBBBBnnBk.",
    ".kwBBnnnnnnBBBk.",
    ".knBBBBBBBBBBnk.",
    ".kBnnBBBBBBnnBk.",
    ".kkBBnnnnnnBBkk.",
    "...kkkkkkkkkk...",
    "................"]], {"k": K, "C": "#a4e4fc", "w": "#fcfcfc", "B": "#3cbcfc", "n": "#0058f8"},
    "Data Warehouse: a database cylinder")

# Web Analytics: a green "www" globe: white meridians and latitude lines.
def globe(x, y):
    return (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 6.4 ** 2


def globe_col(x, y):
    dy = (y - 7.5) / 6.4
    half = 3.2 * math.sqrt(max(0, 1 - dy * dy))
    line = abs(abs(x - 7.5) - half) < 0.6 or y in (4, 7, 11)
    return ("#fcfcfc", "#fcfcfc", "#a4e4fc") if line else ("#58d854", "#00b800", "#007800")


rows, leg = shade(mask_from(globe), None, colour_at=globe_col)
write("icon_web_analytics", [rows], leg, "Web Analytics: a globe with meridians")

# PostHog AI: a big four-point sparkle and a small one (Max AI's spark), magenta with a light core.
grid("icon_posthog_ai", [[
    "...........k....",
    "..........kIk...",
    ".........kIwIk..",
    "..........kIk...",
    ".....k.....k....",
    "....kIk.........",
    "....kIk.........",
    "...kIwIk........",
    ".kkIwwwIkk......",
    "kIIwwwwwIIk.....",
    ".kkIwwwpkk......",
    "...kpwpk........",
    "....kpk.........",
    "....kpk.........",
    ".....k..........",
    "................"]], {"k": K, "I": "#d800cc", "w": "#f8b8f8", "p": "#940084"}, "PostHog AI: sparkles")

# Workflows: a small flowchart, two orange steps feeding a third along white arrows.
grid("icon_workflows", [[
    "................",
    ".kkkkk....kkkkk.",
    ".kaaOk....kaaOk.",
    ".kaOOk....kaOOk.",
    ".kOOrk....kOOrk.",
    ".kkkkk....kkkkk.",
    "..kwk......kwk..",
    "..kwkkkkkkkkwk..",
    "..kwwwwwwwwwwk..",
    "..kkkkkwwkkkkk..",
    "......kwwk......",
    "....kkkwwkkk....",
    "....kaaaaOOk....",
    "....kaaOOOrk....",
    "....kaOOOrrk....",
    "....kkkkkkkk...."]], {"k": K, "a": "#fca044", "O": "#e45c10", "r": "#a81000", "w": "#fcfcfc"},
    "Workflows: a flowchart of three steps")

# ---------------------------------------------------------------- Max AI drone (12x12, 2 frames) and bolt
body = [
    "...kkkkkk...",
    "..kPPPPPPk..",
    ".kPPwwPPPPk.",
    ".kPkkkkkkPk.",
    ".kPkckkckPk.",
    ".kPkkkkkkPk.",
    ".kpPPPPPPpk.",
    "..kppppppk..",
    "...kkkkkk...",
    "............"]
grid("drone", [["..kkkkkkkk..", ".....kk....."] + body, ["....kkkk....", ".....kk....."] + body],
     {"k": K, "P": "#9878f8", "p": "#6844fc", "w": "#d8b8f8", "c": "#3cbcfc"},
     "Max AI drone: purple robot orb with a cyan-eyed visor and a spinning rotor")
grid("ai_bolt", [[
    "........",
    "...kk...",
    "..kIIk..",
    ".kIwwIk.",
    ".kIwwIk.",
    "..kIIk..",
    "...kk...",
    "........"]], {"k": K, "I": "#f878f8", "w": "#fcfcfc"}, "Max AI bolt: a magenta spark")

# Warehouse Vault block (12x12): a mini database drum.
grid("vault", [[
    "..kkkkkkkk..",
    ".kCCwCCCCCk.",
    ".kCCCCCCCCk.",
    ".knCCCCCCnk.",
    ".kBnnnnnnBk.",
    ".knBBBBBBnk.",
    ".kBnnnnnnBk.",
    ".knBBBBBBnk.",
    ".kBnnnnnnBk.",
    ".kkBBBBBBkk.",
    "..kkkkkkkk..",
    "............"]], {"k": K, "C": "#a4e4fc", "w": "#fcfcfc", "B": "#3cbcfc", "n": "#0058f8"},
    "Warehouse Vault: a heavy data drum")

# ---------------------------------------------------------------- powerups (16x16)
# Self-Driving Mode: a steering wheel, cyan rim, white hub.
def wheel(x, y):
    r = math.hypot(x - 7.5, y - 7.5)
    spoke = (abs(y - 7.5) <= 1 and r < 6) or (abs(x - 7.5) <= 1 and y > 7.5 and r < 6)
    return 4.6 <= r <= 6.9 or r <= 2.2 or spoke


def wheel_col(x, y):
    r = math.hypot(x - 7.5, y - 7.5)
    return ("#fcfcfc", "#bcbcbc", "#7c7c7c") if r <= 2.2 else ("#a4e4fc", "#3cbcfc", "#0058f8")


rows, leg = shade(mask_from(wheel), None, colour_at=wheel_col)
write("autopilot", [rows], leg, "Self-Driving Mode: a steering wheel")

# Feature Freeze: the 1-bit snowflake, icy white-blue.
rows, leg = shade(glyph(616), ("#fcfcfc", "#a4e4fc", "#3cbcfc"))
write("freeze", [rows], leg, "Feature Freeze: a snowflake (1-bit #616)")

# Ship It: the 1-bit rocket, white hull, red nose and fins, a flame out the back.
m = glyph(1062)
for (x, y) in ((1, 13), (2, 12), (1, 12), (2, 13), (2, 14), (3, 13)):
    m[y][x] = True


def rocket_col(x, y):
    if x <= 3 and y >= 11:
        return ("#fcfcfc", "#f8d878", "#fca044")      # flame
    if (x >= 11 and y <= 4) or x <= 4 and y <= 9 or y >= 10:
        return ("#f87858", "#f83800", "#a81000")      # nose and fins
    return ("#fcfcfc", "#fcfcfc", "#bcbcbc")          # hull


rows, leg = shade(m, None, colour_at=rocket_col)
write("shipit", [rows], leg, "Ship It: a rocket (1-bit #1062) with an exhaust flame")

# Rewind: Session Replay's yellow frame with a double left triangle.
inner = ["kkkwkkkw", "kkwwkkww", "kwwwkwww", "wwwwwwww", "wwwwwwww", "kwwwkwww", "kkwwkkww", "kkkwkkkw"]
rows = ["................", ".kkkkkkkkkkkkkk.", ".kyyyyyyyyyyyyk.", ".kYkkkkkkkkkkYk."]
rows += [".kYk" + r + "kYk." for r in inner]
rows += [".kYkkkkkkkkkkYk.", ".kooooooooooook.", ".kkkkkkkkkkkkkk.", "................"]
grid("rewind", [rows], {"k": K, "y": "#f8d878", "Y": "#f8b800", "o": "#ac7c00", "w": "#fcfcfc"},
     "Rewind: Session Replay's frame with a rewind symbol")
print("wrote act 2 sprites")
