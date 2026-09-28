#!/usr/bin/env python3
"""Rebuild bug-survivors default art from CC0 bases (see ~/games/assets/CATALOG.md) + hand edits.

    cd ~/games/kits && uv run -q --with pillow python bug-survivors/tools/make_sprites.py

Writes bug-survivors/sprites/<slot>.sprite (the source of truth; hand-edit those afterwards, and don't
re-run this over edits you want to keep). Enemy, boss and tile art use brand tokens (@1..@5) so each
prospect's colours come through; everything else is fixed art, like the art.py it replaces.
Slots without a .sprite (player, hats, icons, projectiles, gem, crate, vacuum, flag) still come from art.py.
"""
import os
import subprocess
import tempfile
import sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED = os.path.join(os.path.dirname(KIT), "shared")
sys.path.insert(0, SHARED)
import pixel  # noqa: E402

ASSETS = os.path.expanduser("~/games/assets")
NINJA = f"{ASSETS}/ninja-adventure/Ninja Adventure - Asset Pack"
X72 = f"{ASSETS}/0x72-dungeontilesetii-v1.7/0x72_DungeonTilesetII_v1.7/frames"
OUT = os.path.join(KIT, "sprites")
TMP = tempfile.mkdtemp(prefix="bs-base-")
os.makedirs(TMP, exist_ok=True)


def grab(src, name, *args):
    path = f"{TMP}/{name}.sprite"
    subprocess.run([sys.executable, f"{SHARED}/pixel.py", "grab", src, path, *args], check=True, stdout=subprocess.DEVNULL)
    return pixel.load(path)


def keep_frames(spr, idx):
    spr["frames"] = [spr["frames"][i] for i in idx]
    return spr


def remap(spr, mapping, notes=None, where=None):
    """mapping: {old_char: new_char}; where(fi, x, y) limits it to a region."""
    for fi, fr in enumerate(spr["frames"]):
        for y, row in enumerate(fr):
            fr[y] = "".join(mapping.get(c, c) if c in mapping and (where is None or where(fi, x, y)) else c
                            for x, c in enumerate(row))


def legend(spr, entries):
    for ch, (col, note) in entries.items():
        spr["legend"][ch] = (col, note)


def tidy(spr):
    used = {c for f in spr["frames"] for r in f for c in r}
    spr["legend"] = {k: v for k, v in spr["legend"].items() if k in used}


def put(spr, fi, x, y, ch):
    row = spr["frames"][fi][y]
    spr["frames"][fi][y] = row[:x] + ch + row[x + 1:]


def add_outline(spr, ch="k"):
    """Dark 1px outline in every transparent pixel that touches the sprite (4-neighbour)."""
    for fi, fr in enumerate(spr["frames"]):
        h, w = len(fr), len(fr[0])
        pts = [(x, y) for y in range(h) for x in range(w) if fr[y][x] == "." and any(
            0 <= x + dx < w and 0 <= y + dy < h and fr[y + dy][x + dx] not in ".k"
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in pts:
            put(spr, fi, x, y, ch)
    spr["legend"][ch] = ("#141b1b", "outline")


def save(slot, spr, concept):
    spr["meta"]["concept"] = concept
    tidy(spr)
    pixel.save(f"{OUT}/{slot}.sprite", spr)


M = f"{NINJA}/Actor/Monster"

# enemy_1 (swarmer / exploder): a small fly. Ninja ButterflyBlue, glassy wings, brand-coloured body.
s = keep_frames(grab(f"{M}/ButterflyBlue/SpriteSheet.png", "fly", "--index", "0,4"), [0, 1])
legend(s, {"c": ("#a8e4f4", "glassy wing"), "b": ("#4f8fa8", "wing shade"), "d": ("@3", "body (accent)"),
           "p": ("@1l", "abdomen (primary)"), "q": ("@1", "abdomen shade")})
remap(s, {"b": "p", "c": "p"}, where=lambda fi, x, y: y >= 9 + fi and 4 <= x <= 11)
remap(s, {"p": "q"}, where=lambda fi, x, y: y >= 12 + fi and 4 <= x <= 11 and x >= 8)
for fi, y in ((0, 1), (1, 2)):  # antenna tips only touched diagonally; drop them
    put(s, fi, 5, y, "."); put(s, fi, 10, y, ".")
save("enemy_1", s, "fly: glassy wings, accent body, primary abdomen (Ninja Adventure ButterflyBlue)")

# enemy_2 (splitter / charger): a round beetle. Ninja Mollusc, dome shell in the primary ramp.
s = keep_frames(grab(f"{M}/Mollusc/Mollusc.png", "beetle", "--index", "0,4"), [0, 1])
legend(s, {"b": ("@1l", "shell (primary)"), "c": ("@5", "shell band highlight"), "h": ("@5l", "shine"),
           "u": ("@1", "shell shade"), "d": ("#5b4a55", "legs"), "e": ("#8b7a86", "leg highlight"),
           "f": ("#ffffff", "face")})
for fi in (0, 1):
    put(s, fi, 6, 2, "h"); put(s, fi, 7, 2, "h"); put(s, fi, 4, 3, "h")
remap(s, {"b": "u"}, where=lambda fi, x, y: y >= 8 and (x <= 3 or x >= 12))
save("enemy_2", s, "round beetle with a primary-coloured dome shell (Ninja Adventure Mollusc)")

# enemy_3 (tank / spitter): a chunky spider. Ninja SpiderYellow, accent body, primary legs.
s = keep_frames(grab(f"{M}/SpiderYellow/SpriteSheet.png", "spider", "--index", "0,4"), [0, 1])
legend(s, {"d": ("@3", "body (accent)"), "e": ("@3l", "body highlight"), "c": ("@1l", "legs (primary)"),
           "b": ("@1", "fangs / leg shade")})
save("enemy_3", s, "chunky spider: accent body, primary legs (Ninja Adventure SpiderYellow)")

# boss: the monolith bug. Ninja DemonCyclop, primary ramp, with server-rack plates and status LEDs.
s = keep_frames(grab(f"{NINJA}/Actor/Boss/DemonCyclop/Idle.png", "boss", "--box",
                     "0,0,50,50;50,0,50,50;100,0,50,50;150,0,50,50", "--pad", "64x64"), [0, 2])
legend(s, {"c": ("@1l", "body (primary)"), "b": ("@1", "body shade / legs"), "d": ("@5", "horn highlight"),
           "e": ("#c8966b", "eye ring"), "f": ("#fce2ca", "eye white"),
           "r": ("#2c2a35", "rack plate"), "s": ("#4a4758", "rack plate edge"),
           "g": ("#58d854", "status LED green"), "y": ("#f8b800", "status LED amber")})
PANEL = [["sssssss", "srgrrys", "sssssss", "srrgrrs", "sssssss"],
         ["sssssss", "srrgrgs", "sssssss", "syrrrgs", "sssssss"]]  # LEDs blink between frames
for fi, fr in enumerate(s["frames"]):
    eye = next(y for y, r in enumerate(fr) if "f" in r)
    for x0 in (18, 39):
        for dy, prow in enumerate(PANEL[fi]):
            for dx, ch in enumerate(prow):
                if fr[eye - 4 + dy][x0 + dx] != ".":
                    put(s, fi, x0 + dx, eye - 4 + dy, ch)
save("boss", s, "monolith bug (Ninja Adventure DemonCyclop), primary ramp, server-rack plates with blinking LEDs")

# tile: dark floor plates, faint brand-tinted bevel, so the swarm pops.
T = []
for y in range(32):
    row = ""
    for x in range(32):
        px, py = x % 16, y % 16
        if px == 0 or py == 0:
            ch = "k"
        elif (py == 1 and px < 15 and px % 2) or (px == 1 and py < 15 and py % 2):
            ch = "v"
        else:
            ch = "f"
        row += ch
    T.append(row)
for (x, y) in ((6, 7), (7, 7), (21, 25), (26, 10), (11, 22), (12, 22)):
    T[y] = T[y][:x] + "s" + T[y][x + 1:]
tile = {"w": 32, "h": 32, "frames": [T], "meta": {},
        "legend": {"k": ("#0b0a0f", "plate seam"), "f": ("#16141d", "floor"), "v": ("@4", "bevel (dark primary)"),
                   "s": ("#1f1c29", "scuff")}}
save("tile", tile, "dark floor plates, dashed brand-tinted bevel (hand-drawn)")

# chest: Ninja LittleTreasureChest (closed), wood + gold, frame 2 glints.
s = grab(f"{NINJA}/Items/Treasure/LittleTreasureChest.png", "chest", "--box", "0,0,16,16;0,0,16,16")
legend(s, {"b": ("#4a2e24", "dark wood"), "c": ("#9a5c34", "wood"), "e": ("#c9844c", "wood light"),
           "d": ("#e8a02a", "gold trim"), "f": ("#ffe18d", "gold light"), "F": ("#fffbe0", "glint"),
           "D": ("#ffd24a", "gold trim lit")})
remap(s, {"f": "F", "d": "D"}, where=lambda fi, x, y: fi == 1)
save("chest", s, "gold-trimmed wooden chest, frame 2 glints (Ninja Adventure LittleTreasureChest)")

# coin: 0x72 coin (round reads better as "money" than Ninja's square GoldCoin at 8px).
s = grab(f"{X72}/coin_anim_f0.png", "coin", "--box", "0,0,6,7", "--pad", "8x8")
add_outline(s)
save("coin", s, "gold coin (0x72 coin_anim_f0)")

# hotfix: Ninja Bomb, fuse lit.
s = grab(f"{NINJA}/Items/Projectile/Bomb.png", "bomb", "--box", "0,0,12,13", "--pad", "16x16")
legend(s, {"b": ("#6d6878", "bomb shade"), "c": ("#9a9aac", "bomb"), "e": ("#e6ecf2", "shine")})  # lifted: must pop on dark floors
save("hotfix", s, "hotfix bomb (Ninja Adventure Bomb)")

# passive icons with a clear CC0 match
s = grab(f"{NINJA}/Items/Object/Hourglass.png", "hourglass", "--box", "0,0,16,16")
save("icon_cooldown", s, "Hot Reload: hourglass (Ninja Adventure Hourglass)")
s = grab(f"{NINJA}/Items/Object/Book.png", "book", "--box", "0,0,16,16")
save("icon_growth", s, "Docs Day: book (Ninja Adventure Book)")
s = grab(f"{X72}/ui_heart_full.png", "heart", "--box", "0,0,13,12", "--pad", "16x16")
add_outline(s)
legend(s, {"k": ("#141b1b", "outline")})
save("icon_maxhp", s, "Snack Break: heart (0x72 ui_heart_full)")
print("wrote", sorted(f for f in os.listdir(OUT) if f.endswith(".sprite")))
