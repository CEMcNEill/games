#!/usr/bin/env python3
"""How data-inspector's default .sprite files were made (CC0 bases + hand edits). Re-run only to regenerate;
the .sprite files are the source of truth and may be hand-edited afterwards.

Portraits: Ninja Adventure (CC0) Actor/Character/<Name>/Faceset.png, background keyed out, cropped 32x32,
re-outlined; clothes recoloured to brand tokens. Hedgehog and stamps: kit art.py art repainted with the
Ninja Adventure palette and 3-step shading. Desk: drawn from scratch in Ninja Adventure wood tones.
"""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "shared"))
from PIL import Image  # noqa: E402
from pixel import from_images, save  # noqa: E402

CH = os.path.expanduser("~/games/assets/ninja-adventure/Ninja Adventure - Asset Pack/Actor/Character")
BG = (20, 27, 27)


def faceset(name, ox=3, oy=5):
    """Faceset (38x38, background = outline colour) -> transparent 32x32 with a clean 1px outline."""
    im = Image.open(f"{CH}/{name}/Faceset.png").convert("RGBA")
    W, H = im.size
    px = im.load()
    seen = set()
    stack = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H) or px[x, y][:3] != BG:
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for x, y in seen:
        px[x, y] = (0, 0, 0, 0)
    im = im.crop((ox, oy, ox + 32, oy + 32))
    p = im.load()
    filled = [[p[x, y][3] > 0 for x in range(32)] for y in range(32)]
    for y in range(32):
        for x in range(32):
            if not filled[y][x] and any(0 <= x + dx < 32 and 0 <= y + dy < 32 and filled[y + dy][x + dx]
                                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                p[x, y] = BG + (255,)
    spr = from_images([im], {"base": f"ninja-adventure Actor/Character/{name}/Faceset.png crop {ox},{oy},32,32"})
    return spr


def legend_by_hex(spr):
    return {col: ch for ch, (col, _) in spr["legend"].items()}


def recolor(spr, old_hex, new, note=""):
    ch = legend_by_hex(spr)[old_hex]
    spr["legend"][ch] = (new, note)
    return ch


def add(spr, ch, col, note=""):
    spr["legend"][ch] = (col, note)


def paint(spr, fi, y, x, ch):
    r = list(spr["frames"][fi][y])
    r[x] = ch
    spr["frames"][fi][y] = "".join(r)


def row(spr, fi, y, s):
    assert len(s) == spr["w"], (y, len(s))
    spr["frames"][fi][y] = s


def glasses(spr, fi, lenses, top, bottom, bridge_y, ch):
    for x0, x1 in lenses:
        for x in range(x0, x1 + 1):
            paint(spr, fi, top, x, ch)
            paint(spr, fi, bottom, x, ch)
        for y in range(top, bottom + 1):
            paint(spr, fi, y, x0, ch)
            paint(spr, fi, y, x1, ch)
    for x in range(lenses[0][1] + 1, lenses[1][0]):
        paint(spr, fi, bridge_y, x, ch)


def close_border(spr):
    """Cropped busts run off the canvas; close those edges with the outline colour so they read on any floor."""
    k = legend_by_hex(spr).get("#141b1b")
    for fi, fr in enumerate(spr["frames"]):
        for y in range(spr["h"]):
            for x in range(spr["w"]):
                if (x in (0, spr["w"] - 1) or y in (0, spr["h"] - 1)) and fr[y][x] != ".":
                    paint(spr, fi, y, x, k)
                    fr = spr["frames"][fi]


def out(spr, name, concept):
    if spr["w"] == 32 and name.startswith(("manager", "persona")):
        close_border(spr)
    spr["meta"]["concept"] = concept
    save(os.path.join(HERE, f"{name}.sprite"), spr)


def generic():
    # manager: Head of Data. OldMan (friendly, dark hair) in a brand jacket with an accent tie; frame 2 talks.
    m = faceset("OldMan")
    recolor(m, "#2c3126", "#2a1d1a", "hair shadow")
    recolor(m, "#48543d", "#4a3226", "hair")
    recolor(m, "#6f805b", "#6e4a34", "hair highlight")
    e = legend_by_hex(m)["#548789"]
    h = legend_by_hex(m)["#f2eaf1"]
    f = legend_by_hex(m)["#ef914f"]
    m["legend"][e] = ("@1", "jacket (brand primary)")
    add(m, "T", "@3", "tie (brand accent)")
    add(m, "t", "@3d", "tie shade")
    add(m, "m", "#8f3e56", "open mouth")
    rows = {27: ".........ahhaffffffffahha.......",
            28: ".......aeeehhhhaTTahhhheeea.....",
            29: ".....aeeeeehhhaTTTTahhheeeeea...",
            30: "....aeeeeeeehhaTTTtahheeeeeeea..",
            31: "...aeeeeeeeeehaTTTtaheeeeeeeeea."}
    for y, s in rows.items():
        row(m, 0, y, s.replace("e", e).replace("h", h).replace("f", f))
    m["frames"].append(list(m["frames"][0]))
    for x in range(15, 19):
        paint(m, 1, 22, x, "m")
        paint(m, 1, 23, x, "a")
    out(m, "manager", "Head of Data: friendly manager, brand jacket, accent tie; frame 2 talking")

    # persona_1: busy founder. Villager (waving, big smile), brand shirt.
    p = faceset("Villager")
    recolor(p, "#79b8ce", "@2l", "shirt (brand secondary, lifted so dark brands still read)")
    recolor(p, "#548789", "@2", "shirt shade")
    out(p, "persona_1", "Founder: waving, big smile, secondary-colour shirt")

    # persona_2: power user. Princess (long dark hair, flower), accent top.
    p = faceset("Princess")
    recolor(p, "#f1c471", "@3", "top (brand accent)")
    recolor(p, "#d78b4a", "@3d", "top shade")
    out(p, "persona_2", "Power user: long dark hair with a flower, accent-coloured top")

    # persona_3: developer. Villager3 (curly dark hair), glasses added, secondary shirt, accent scarf.
    p = faceset("Villager3")
    recolor(p, "#56864c", "@2l", "shirt (brand secondary, lifted)")
    recolor(p, "#4e484a", "#6a5f6e", "hair")
    recolor(p, "#3b3643", "#4d4456", "hair shade")
    recolor(p, "#a8a129", "@3", "scarf (brand accent)")
    add(p, "G", "#2d2433", "glasses frame")
    glasses(p, 0, [(6, 11), (14, 19)], 10, 15, 12, "G")
    out(p, "persona_3", "Developer: curly dark hair, glasses, secondary shirt, accent scarf")

    # persona_4: finance lead. OldWoman, hair turned silver, brand cardigan.
    p = faceset("OldWoman")
    recolor(p, "#d3a2c0", "#cfcbe0", "silver hair")
    recolor(p, "#a5608b", "#8f8aa6", "silver hair shade")
    recolor(p, "#548789", "@1d", "cardigan (brand primary, deepened to part from the warm skin)")
    recolor(p, "#2d697b", "@4", "cardigan shade")
    a, fs = legend_by_hex(p)["#141b1b"], legend_by_hex(p)["#ef914f"]
    for x in range(10, 14):  # turn the frown into a smile
        paint(p, 0, 19, x, fs)
        paint(p, 0, 20, x, a)
    for x in (9, 14):
        paint(p, 0, 19, x, a)
        paint(p, 0, 20, x, fs)
    out(p, "persona_4", "Finance lead: older woman, silver hair, smiling, brand cardigan")


def art_sprite(sid):
    """Render a slot from art.py (default brand colours) into a .sprite to repaint."""
    import importlib.util
    from sprites import brand, render
    spec = importlib.util.spec_from_file_location("art", os.path.join(KIT, "art.py"))
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    return from_images([render(f, brand(None)) for f in art.SPRITES[sid]], {"base": f"data-inspector/art.py {sid}"})


def inspector():
    """The PostHog hedgehog, repainted: Ninja Adventure outline, 3-step spines lit from the top-left,
    shaded face, pink nose, eye highlight."""
    h = art_sprite("inspector")
    by = legend_by_hex(h)
    k, sp, tip, nose, face, hi = (by[c] for c in ("#000000", "#503000", "#ac7c00", "#f85898", "#f0d0b0", "#fcfcfc"))
    new = {}
    for fi, fr in enumerate(h["frames"]):
        g = [list(r) for r in fr]
        H, W = len(g), len(g[0])
        for y in range(H):
            for x in range(W):
                c = fr[y][x]
                up = fr[y - 1][x] if y else "."
                if c == sp:
                    if up in (k, ".") and y < 9:
                        g[y][x] = "c"          # lit rim of the spines
                    elif y >= 12 and x < 12 or y >= 16:
                        g[y][x] = "s"          # shadow side
                    else:
                        g[y][x] = "b"
                elif c == tip:
                    g[y][x] = "c" if y < 11 else "b"
                elif c == face:
                    g[y][x] = "E" if (y >= 15 or y >= 20) else "e"
                    if y >= 20:
                        g[y][x] = "E"          # feet
                elif c == nose:
                    g[y][x] = "d"
                elif c == hi:
                    g[y][x] = "w"
                elif c == k:
                    g[y][x] = "k"
        new[fi] = ["".join(r) for r in g]
    h["frames"] = [new[i] for i in sorted(new)]
    h["legend"] = {"k": ("#141b1b", "outline"), "s": ("#3e2620", "spines shadow"), "b": ("#6e4432", "spines"),
                   "c": ("#a8704c", "spines lit"), "e": ("#f4dab4", "face"), "E": ("#d9a57a", "face shade"),
                   "d": ("#e0697a", "nose"), "w": ("#ffffff", "eye highlight")}
    out(h, "inspector", "PostHog hedgehog inspector, Ninja Adventure palette, lit from the top-left; frame 2 bobs and blinks")


def stamp(sid, base, dark, light):
    """Round ink stamp: 3-step ring lit from the top-left, embossed symbol with a drop shadow."""
    st = art_sprite(sid)
    by = legend_by_hex(st)
    k, d, c, w = by["#000000"], [v for v in by if v not in ("#000000", "#fcfcfc")], None, by["#fcfcfc"]
    darkc = min(d, key=lambda v: sum(int(v[i:i + 2], 16) for i in (1, 3, 5)))
    basec = max(d, key=lambda v: sum(int(v[i:i + 2], 16) for i in (1, 3, 5)))
    D, B = by[darkc], by[basec]
    fr = st["frames"][0]
    g = [list(r) for r in fr]
    for y in range(16):
        for x in range(16):
            ch = fr[y][x]
            if ch == B:
                rim = fr[y - 1][x] == k or fr[y][x - 1] == k
                g[y][x] = "L" if rim and (x + y) <= 14 else "B"
            elif ch == D:
                g[y][x] = "D"
            elif ch == w:
                g[y][x] = "W"
                if 0 < x < 15 and 0 < y < 15 and fr[y + 1][x + 1] == B and fr[y + 1][x] != w:
                    g[y + 1][x + 1] = "D"  # drop shadow
            elif ch == k:
                g[y][x] = "k"
    st["frames"][0] = ["".join(r) for r in g]
    st["legend"] = {"k": ("#141b1b", "outline"), "D": (dark, "ink shade"), "B": (base, "ink"),
                    "L": (light, "ink highlight"), "W": ("#f7f3fb", "symbol")}
    return st


def stamps():
    out(stamp("stamp_ok", "#3fa34d", "#1f6a3a", "#8ad86b"), "stamp_ok", "APPROVED ink stamp: green, check mark, lit from the top-left")
    out(stamp("stamp_flag", "#d6453d", "#8a2432", "#ff8f7c"), "stamp_flag", "FLAG ink stamp: red, cross, lit from the top-left")


def desk(name="desk", seam="#4a2a22", grain="#7a4232", base="#965340", light="#b06848", hi="#c98a5c",
         concept="Warm wooden desk top seen from above: 4 planks, staggered joints, grain and a knot; tiles seamlessly"):
    """32x32 tileable plank desk. Colours default to Ninja Adventure warm wood."""
    rnd = random.Random(11)
    rows = []
    joints = {0: 20, 1: 6, 2: 27, 3: 13}
    for y in range(32):
        plank, py = divmod(y, 8)
        if py == 7:
            rows.append("s" * 32)
            continue
        r = ["m"] * 32
        if py == 0:
            r = ["l" if rnd.random() < 0.12 else "h" for _ in range(32)]
        elif py in (2, 4, 5):
            start = rnd.randrange(0, 32)
            for x in range(start, start + rnd.randrange(6, 14)):
                r[x % 32] = "g"
            if py == 4:
                s2 = (start + 16) % 32
                for x in range(s2, s2 + rnd.randrange(3, 7)):
                    r[x % 32] = "l"
        jx = joints[plank]
        r[jx] = "s"
        if py == 0:
            r[(jx + 1) % 32] = "h"
        rows.append("".join(r))
    # a knot on plank 2
    for (x, y, ch) in ((9, 19, "g"), (10, 19, "g"), (8, 20, "g"), (11, 20, "g"), (9, 20, "s"), (10, 20, "s"),
                       (9, 21, "g"), (10, 21, "g")):
        rows[y] = rows[y][:x] + ch + rows[y][x + 1:]
    spr = {"w": 32, "h": 32, "frames": [rows], "meta": {"base": "drawn from scratch (Ninja Adventure wood tones)"},
           "legend": {"s": (seam, "plank seam"), "g": (grain, "grain"), "m": (base, "wood"), "l": (light, "wood light"),
                      "h": (hi, "plank top edge")}}
    out(spr, name, concept)


if __name__ == "__main__":
    generic()
    inspector()
    stamps()
    desk()
    print("ok")
