#!/usr/bin/env python3
"""Regenerates hogtopia's default .sprite files from CC0 bases (Ninja Adventure, Kenney) plus Claude's edits.

    cd ~/games/kits && uv run -q --with pillow python hogtopia/sprites/make.py

The .sprite files it writes are the source of truth the kit build reads (shared/sprites.py); rerun this only
to regenerate them, and prefer hand-editing a .sprite for small fixes. '@' legend entries are brand tokens
(@1 primary, @1d shadow, @1l highlight...), so player-side art takes each prospect's colours. The rival side
uses a fixed steel-and-red palette (rival_colour() in art.py can't be expressed as a token).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "shared"))
import pixel  # noqa: E402
from PIL import Image  # noqa: E402

A = os.path.expanduser("~/games/assets")
NINJA = f"{A}/ninja-adventure/Ninja Adventure - Asset Pack"
CHAR = f"{NINJA}/Actor/Character"
K = "#141b1b"
STEEL = {"hi": "#8d977f", "mid": "#5f7160", "dk": "#4e484a", "dk2": "#3b3643", "red": "#e0394c", "wht": "#f2eaf1"}


def grab(png, x, y, w=16, h=16):
    """Crop a cell into (rows, legend{char: colour}) using pixel.from_images."""
    im = Image.open(png).convert("RGBA").crop((x, y, x + w, y + h))
    spr = pixel.from_images([im], {})
    return spr["frames"][0], {c: v[0] for c, v in spr["legend"].items()}


def char_of(leg, colour):
    return next(c for c, v in leg.items() if v == colour)


def recolour(rows, leg, mapping, rows_from=0, rows_to=99):
    """mapping {old colour: new colour/token}; only in rows [rows_from, rows_to). Returns (rows, leg)."""
    leg = dict(leg)
    out = []
    for y, r in enumerate(rows):
        if rows_from <= y < rows_to:
            nr = ""
            for ch in r:
                if ch != "." and leg[ch] in mapping:
                    new = mapping[leg[ch]]
                    key = next((c for c, v in leg.items() if v == new), None)
                    if key is None:
                        key = next(c for c in pixel.CHARS if c not in leg)
                        leg[key] = new
                    nr += key
                else:
                    nr += ch
            out.append(nr)
        else:
            out.append(r)
    return out, leg


def setpx(rows, leg, pts, colour):
    key = next((c for c, v in leg.items() if v == colour), None)
    if key is None:
        key = next(c for c in pixel.CHARS if c not in leg)
        leg = dict(leg, **{key: colour})
    rows = [list(r) for r in rows]
    for x, y in pts:
        rows[y][x] = key
    return ["".join(r) for r in rows], leg


def grid(rows, colours):
    """Hand-drawn grid with its own legend {char: colour}."""
    return list(rows), dict(colours)


def write(slot, frames, concept, w=16, h=16):
    """frames: list of (rows, legend). Merges legends into one and saves <slot>.sprite."""
    glob, frames_out = {}, []
    for rows, leg in frames:
        assert len(rows) == h and all(len(r) == w for r in rows), (slot, [len(r) for r in rows])
        m = {}
        for c, col in leg.items():
            if col not in glob:
                glob[col] = pixel.CHARS[len(glob)]
            m[c] = glob[col]
        frames_out.append(["".join(m.get(ch, ".") if ch != "." else "." for ch in r) for r in rows])
    spr = {"w": w, "h": h, "legend": {c: (col, "") for col, c in glob.items()}, "frames": frames_out,
           "meta": {"concept": concept}}
    pixel.save(os.path.join(HERE, f"{slot}.sprite"), spr)
    return spr


def steel(rows, leg, keep=("#141b1b", "#e0394c", "#f2eaf1", "#fce2ca")):
    """Rival palette: every non-kept colour -> nearest steel step by luminance."""
    ramp = [STEEL["dk2"], STEEL["dk"], STEEL["mid"], STEEL["hi"]]
    mp = {}
    for col in set(leg.values()):
        if col in keep or col.startswith("@"):
            continue
        l = pixel.lum(pixel.rgb(col))
        mp[col] = ramp[0 if l < 60 else 1 if l < 95 else 2 if l < 135 else 3]
    return recolour(rows, leg, mp)


# ---------------- units: 0-4 yours (scout, warrior, archer, defender, catcher), 5-9 rival ----------------
def units():
    fr = []
    r, l = grab(f"{CHAR}/Boy/SpriteSheet.png", 0, 0)  # scout: brand cap, dark trousers
    r, l = recolour(r, l, {"#d14b34": "@1", "#965340": "@1d", "#548789": "#3b3643"})
    fr.append((r, l))
    r, l = grab(f"{CHAR}/Villager4/SpriteSheet.png", 0, 0)  # warrior = builder: yellow hard hat, brand overalls
    r, l = recolour(r, l, {"#e0394c": "@1", "#8f3e56": "@1d", "#d14b34": "@1l"}, 12)
    r, l = setpx(r, l, [(x, 6) for x in range(2, 14)], "#d78b4a")  # hat brim
    fr.append((r, l))
    r, l = grab(f"{CHAR}/Inspector/SpriteSheet.png", 0, 0)  # archer = analyst: hat band + coat in brand
    r, l = recolour(r, l, {"#a3754e": "@1"}, 0, 6)
    r, l = recolour(r, l, {"#d14b34": "@1", "#91522c": "@1d", "#a3754e": "@1l"}, 12)
    fr.append((r, l))
    r, l = grab(f"{CHAR}/Knight/SpriteSheet.png", 0, 0)  # defender: bright silver armour, brand plume + tabard
    r, l = recolour(r, l, {"#3b3643": "@1"}, 12, 14)
    r, l = recolour(r, l, {"#3b3643": "@1d"}, 14)
    r, l = setpx(r, l, [(7, 2), (8, 2), (7, 3), (8, 3), (7, 4), (8, 4)], "@1")
    r, l = setpx(r, l, [(7, 1), (8, 1)], "@1l")
    r, l = recolour(r, l, {"#8d977f": "#c7d0d8", "#5f7160": "#8a96a3", "#e3f1f5": "#f2f6fa"})
    fr.append((r, l))
    r, l = grab(f"{CHAR}/MaskFrog/SpriteSheet.png", 0, 0)  # catcher: frog mask (frogs catch bugs), brand coat
    r, l = recolour(r, l, {"#8f3e56": "@1", "#548789": "@1d", "#79b8ce": "@1l", "#e0394c": "@1l", "#d14b34": "#ef914f"}, 12)
    fr.append((r, l))
    # rival: steel bots with red eyes
    r, l = grab(f"{CHAR}/RobotGreen/SpriteSheet.png", 0, 0)
    fr.append(steel(r, l))
    r, l = grab(f"{CHAR}/RobotGrey/SpriteSheet.png", 0, 0)
    fr.append(steel(r, l))
    r, l = grab(f"{CHAR}/RobotCamouflage/SpriteSheet.png", 0, 0)
    r, l = steel(r, l)
    fr.append(recolour(r, l, {STEEL["dk2"]: STEEL["dk"], STEEL["dk"]: STEEL["mid"]}))
    r, l = grab(f"{CHAR}/Statue/SpriteSheet.png", 0, 0)
    r, l = recolour(r, l, {"#fce2ca": STEEL["red"]})
    fr.append(steel(r, l))
    r, l = grab(f"{CHAR}/NinjaGray/SpriteSheet.png", 0, 0)
    r, l = recolour(r, l, {"#ef914f": STEEL["hi"], "#f2eaf1": "#abc2bc"})
    r, l = setpx(r, l, [(6, 9), (9, 9)], STEEL["red"])
    fr.append(steel(r, l, keep=("#141b1b", "#e0394c", "#d14b34", "#abc2bc")))
    write("units", fr, "Units: yours = Ninja Adventure people in brand colours (scout cap, builder, analyst, "
                       "knight, frog-mask catcher); rival = steel bots with red eyes")


HOUSE = ["....a....",
         "...aLa...",
         "..aLRra..",
         ".aLRRrra.",
         "aLRRRrrra",
         "aaaaaaaaa",
         ".awwwwsa.",
         ".awDwWsa.",
         ".awDwwsa.",
         ".aaaaaaa."]
TOWER = ["..a....",
         "..aFF..",
         "..aff..",
         "aaaaaaa",
         "aSaSaSa",
         "aSSSSsa",
         "aSSWSsa",
         "aSSSSsa",
         "aSSWSsa",
         "aSSSSsa",
         "aSSWSsa",
         "aSSDSsa",
         "aSSDSsa",
         "aaaaaaa"]
SERVER = ["aaaaaa",
          "ahhhma",
          "arkrda",
          "ammmda",
          "akkkda",
          "ammmda",
          "arkrda",
          "ammmda",
          "aaaaaa"]
WALLS = {"a": K, "w": "#f2eaf1", "s": "#c8b8a8", "D": "#5a3a2a", "W": "#ffd86a", "S": "#d7dde5", "s2": "#8a96a3"}


def stamp(canvas, art, x0, y0, colours):
    for dy, row in enumerate(art):
        for dx, ch in enumerate(row):
            if ch != ".":
                canvas[y0 + dy][x0 + dx] = colours[ch]


def to_frame(canvas):
    cols = sorted({c for r in canvas for c in r if c})
    leg = {pixel.CHARS[i]: c for i, c in enumerate(cols)}
    back = {c: k for k, c in leg.items()}
    return ["".join(back[c] if c else "." for c in r) for r in canvas], leg


def city():
    def roof(base, dark, light):
        return {"a": K, "L": light, "R": base, "r": dark, "w": "#f2eaf1", "s": "#c8b8a8", "D": "#5a3a2a",
                "W": "#ffd86a"}
    tower = {"a": K, "F": "@1", "f": "@1d", "S": "#d7dde5", "s": "#8a96a3", "W": "#ffd86a", "D": "#5a3a2a"}
    server = {"a": K, "h": STEEL["hi"], "m": STEEL["mid"], "d": STEEL["dk"], "k": STEEL["dk2"], "r": STEEL["red"]}
    brown = roof("#a3754e", "#91522c", "#c8966b")
    team = roof("@1", "@1d", "@1l")
    blank = lambda: [[None] * 16 for _ in range(16)]
    frames = []
    c = blank(); stamp(c, HOUSE, 0, 5, brown); stamp(c, HOUSE, 7, 3, brown); frames.append(to_frame(c))  # village
    c = blank(); stamp(c, HOUSE, 3, 4, team); frames.append(to_frame(c))  # lvl 1
    c = blank(); stamp(c, HOUSE, 7, 2, team); stamp(c, HOUSE, 0, 5, team); frames.append(to_frame(c))  # lvl 2
    c = blank(); stamp(c, TOWER, 5, 0, tower); stamp(c, HOUSE, 0, 6, team); stamp(c, HOUSE, 7, 6, team)
    frames.append(to_frame(c))  # lvl 3
    c = blank(); stamp(c, SERVER, 5, 5, server); frames.append(to_frame(c))  # rival 1
    c = blank(); stamp(c, SERVER, 2, 6, server); stamp(c, SERVER, 8, 3, server); frames.append(to_frame(c))
    tall = SERVER[:5] + SERVER[1:]
    c = blank(); stamp(c, tall, 5, 1, server); stamp(c, SERVER, 0, 6, server); stamp(c, SERVER, 10, 6, server)
    frames.append(to_frame(c))
    crown = ["....a...a...a...",
             "...aYa.aYa.aYa..",
             "...aYYaYyYaYYa..",
             "...aYOYYOYYOYa..",
             "...aoooooooooa..",
             "....aaaaaaaaa..."]
    c = blank(); stamp(c, crown, 0, 0, {"a": K, "Y": "#ffdc37", "y": "#fff3a8", "O": "#e0394c", "o": "#d9a520"})
    frames.append(to_frame(c))
    write("city", frames, "Cities: 0 neutral village (brown roofs), 1-3 yours (brand roofs, lvl3 adds a stone tower "
                          "with a brand flag), 4-6 rival steel server blocks with red lights, 7 gold crown overlay")


def extra():
    """0 giant yours, 1 giant rival, 2 boat hull, 3 monument, 4 city wall, 5 park, 6 veteran chevron,
    7 rival-turn marker, 8 catapult yours, 9 catapult rival (frame order fixed by src/scene.ts)."""
    fr = []
    r, l = grab(f"{CHAR}/GoldStatue/SpriteSheet.png", 0, 0)  # your giant: golden statue with a brand sash
    r, l = recolour(r, l, {"#d78b4a": "@1"}, 12, 14)
    fr.append((r, l))
    r, l = grab(f"{NINJA}/Actor/Monster/Beast2/Beast2.png", 0, 0)  # rival giant: steel golem, red eyes
    r, l = recolour(r, l, {"#ffffff": STEEL["red"]})
    fr.append(steel(r, l))
    fr.append(grid(["................"] * 10 + [
        "a..............a",
        "aLLLLLLLLLLLLLla",
        ".aBBBBBBBBBBBBa.",
        "..awwwwwwwwwwa..",
        "...aaaaaaaaaa...",
        "................"], {"a": K, "L": "#91522c", "l": "#5a3a2a", "B": "@1", "w": "#5a3a2a"}))
    fr.append(grid([
        ".......aa.......",
        "......aYYa......",
        "......aYya......",
        ".......aa.......",
        "......aSSa......",
        ".....aSSssa.....",
        ".....aSSssa.....",
        ".....aSSssa.....",
        ".....aSSssa.....",
        "....aSSSsssa....",
        "....aSSSsssa....",
        "...aSSSSssssa...",
        "...aaaaaaaaaa...",
        "..aBBBBBBBBbba..",
        "..abbbbbbbbbba..",
        "..aaaaaaaaaaaa.."], {"a": K, "Y": "#ffdc37", "y": "#d9a520", "S": "#f2f6fa", "s": "#abb6c2",
                              "B": "@1", "b": "@1d"}))
    fr.append(grid([
        "aaa.aaa..aaa.aaa",
        "aSa.aSa..aSa.aSa",
        "aSaaaSaaaaSaaaSa",
        "aSSsSSSsSSSsSSsa",
        "aaaaaaaaaaaaaaaa"] + ["................"] * 11, {"a": K, "S": "#d7dde5", "s": "#8a96a3"}))
    fr.append(grid([  # park: round tree (Ninja greens) with two flowers
        "................",
        ".....aaaaaa.....",
        "...aaLLLLGGaa...",
        "..aLLLGGGGGGga..",
        "..aLLGGGGGGgga..",
        ".aLLGGGGGGGggga.",
        ".aLGGGGGGGgGgga.",
        ".aGGGGGGGgggggа.".replace("а", "a"),
        "..aGGgGGgggggaa.",
        "..aaGGgggggaa...",
        "....aaaTTaaa....",
        "......aTTa......",
        "..w...aTTa...w..",
        ".wyw..aTta..wyw.",
        "..w..aaaaaa..w..",
        "................"], {"a": K, "L": "#a8a129", "G": "#56864c", "g": "#345a52", "T": "#91522c",
                              "t": "#5a3a2a", "w": "#f2eaf1", "y": "#ffdc37"}))
    fr.append(grid([
        "aa...aa.........",
        "aYa.aYa.........",
        ".aYaYa..........",
        "..aya...........",
        "...a............",
        "aa...aa.........",
        "aYa.aYa.........",
        ".aYaYa..........",
        "..aya...........",
        "...a............"] + ["................"] * 6, {"a": K, "Y": "#d9a520", "y": "#ffdc37"}))
    fr.append(grab(f"{NINJA}/Actor/Monster/SpiderRed/SpriteSheet.png", 0, 0))  # rival-turn marker
    CAT = ["................",
           "................",
           "............aa..",
           "...........aYYa.",
           "..........aaYya.",
           ".........aWa....",
           "........aWa.....",
           ".......aWa......",
           "......aWa.......",
           ".aaaaaaWaaaaaaa.",
           ".aBBBBBBBBBBBBa.",
           ".abbbbbbbbbbbba.",
           ".aaaaaaaaaaaaaa.",
           "..agga....agga..",
           "..aGGa....aGGa..",
           "...aa......aa..."]
    fr.append(grid(CAT, {"a": K, "Y": "#ffdc37", "y": "#d9a520", "W": "#c8966b", "B": "@1", "b": "@1d",
                         "g": "#d7dde5", "G": "#8a96a3"}))
    fr.append(grid(CAT, {"a": K, "Y": STEEL["red"], "y": "#8f3e56", "W": STEEL["hi"], "B": STEEL["mid"],
                         "b": STEEL["dk"], "g": STEEL["hi"], "G": STEEL["dk"]}))
    write("extra", fr, "Extras: giants (golden statue with brand sash / steel golem), boat hull with brand stripe, "
                       "obelisk monument, stone city wall, Kenney tree park, gold chevrons, red spider rival marker, "
                       "catapults (brand / steel)")


TILES = f"{NINJA}/Backgrounds/Tilesets"


def cell(png, idx, cols):
    return Image.open(png).convert("RGBA").crop(((idx % cols) * 16, (idx // cols) * 16, (idx % cols) * 16 + 16,
                                                 (idx // cols) * 16 + 16))


def img_frame(im):
    spr = pixel.from_images([im], {})
    return spr["frames"][0], {c: v[0] for c, v in spr["legend"].items()}


def remap(im, mapping):
    """mapping {hex: hex}; exact colour swaps."""
    im = im.copy()
    px = im.load()
    m = {pixel.rgb(a): pixel.rgb(b) for a, b in mapping.items()}
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in m:
                px[x, y] = m[p[:3]] + (255,)
    return im


def paint(im, art, colours, x0=0, y0=0):
    im = im.copy()
    for dy, row in enumerate(art):
        for dx, ch in enumerate(row):
            if ch != "." and 0 <= x0 + dx < 16 and 0 <= y0 + dy < 16:
                im.putpixel((x0 + dx, y0 + dy), pixel.rgb(colours[ch]) + (255,))
    return im


def paint32(im, art, colours):
    """paint() for any canvas size."""
    im = im.copy()
    for dy, row in enumerate(art):
        for dx, ch in enumerate(row):
            if ch != "." and 0 <= dx < im.width and 0 <= dy < im.height:
                im.putpixel((dx, dy), pixel.rgb(colours[ch]) + (255,))
    return im


def trim(im):
    return im.crop(im.getbbox())


MOUNTAIN = ["................",
            "................",
            "......aa........",
            ".....aSSa.......",
            "....aSSsSa......",
            "....aSsRRra.....",
            "...aRRRRRrra....",
            "...aRRRRrrrra.aa",
            "..aRRRRRRrrraaRa",
            "..aRRRRRrrrrraRra",
            ".aRRRRRRRrrrrrRra"[:16],
            ".aRRRRRRrrrrrrrra"[:16],
            "aaaaaaaaaaaaaaaa"[:16],
            "................",
            "................",
            "................"]
MOUNTAIN = ["................",
            "................",
            "......aa........",
            ".....aSSa.......",
            "....aSSsSa......",
            "....aSsRRra.....",
            "...aRRRRRrra....",
            "...aRRRRrrrra.aa",
            "..aRRRRRRrrraaRa",
            "..aRRRRRrrrrraRa",
            ".aRRRRRRRrrrrrra",
            ".aRRRRRRrrrrrrra",
            "aRRRRRRRRrrrrrra",
            "aaaaaaaaaaaaaaaa",
            "................",
            "................"]
RUINS = ["................",
         "................",
         "................",
         "..........aaa...",
         "..........aSa...",
         "..........aSsa..",
         "...aaa....aSsa..",
         "...aSa....aSsa..",
         "...aSsa...aSsa..",
         "...aSsa.aaaSsa..",
         "...aSsaaaDaSsa..",
         "..aaSsaSaDaSsaa.",
         "..aSSSSSSSSSSsa.",
         "..aaaaaaaaaaaaa.",
         "................",
         "................"]
PINE = ["...a...",
        "..aLa..",
        ".aLGga.",
        "..aLa..",
        ".aLGga.",
        "aLGGgga",
        "aaaaaaa",
        "..aTa..",
        "..aaa.."]
RACK = ["aaaaa",
        "aSsSa",
        "aGkRa",
        "aSsSa",
        "akGka",
        "aSsSa",
        "aaaaa"]


def terrain():
    """32 frames = 4 biomes (meadow, desert, tundra, circuit) x 8: plain, plain2, forest, mountain,
    water, water2, ruins, fog. Ninja Adventure floors + water, Kenney trees, hand-drawn relief."""
    fl = f"{TILES}/TilesetFloor.png"
    wt = f"{TILES}/TilesetWater.png"
    woods = {"L": "#56864c", "G": "#345a52", "g": "#23403a"}

    def forest(base, greens):
        c = {"a": K, "T": "#91522c", **greens}
        im = paint(base, PINE, c, 0, 2)
        im = paint(im, PINE, c, 9, 0)
        return paint(im, PINE, c, 4, 7)

    def water(base, shift):
        im = Image.new("RGBA", (16, 16))
        im.paste(base.crop((shift, 0, 16, 16)), (0, 0))
        im.paste(base.crop((0, 0, shift, 16)), (16 - shift, 0))
        return im

    fog = paint(Image.new("RGBA", (16, 16), (0, 0, 0, 255)), ["...a", "", "", "", "", "", "", "", "", "..........a", "",
                                                              "", "", ".......a"], {"a": "#282838"})
    biomes = []
    # meadow
    plain, plain2 = cell(fl, 275, 22), cell(fl, 279, 22)
    rock = {"a": K, "S": "#f2f6fa", "s": "#c7d0d8", "R": "#8a96a3", "r": "#5f7160"}
    stone = {"a": K, "S": "#c7d0d8", "s": "#8a96a3", "D": "#8feff1"}
    w0 = cell(wt, 67, 28)
    biomes.append([plain, plain2, forest(plain, woods), paint(plain, MOUNTAIN, rock), w0, water(w0, 4),
                   paint(plain, RUINS, stone), fog])
    # desert
    sand = lambda im: remap(im, {h: c for h, c in zip(
        sorted({pixel.hexc(p[:3]) for p in im.getdata() if p[3]}, key=lambda h: -pixel.lum(pixel.rgb(h))),
        ["#f1c471", "#d9a45a", "#c8864a"])})
    plain, plain2 = sand(cell(fl, 110, 22)), sand(cell(fl, 113, 22))
    sand_rock = {"a": K, "S": "#fce2ca", "s": "#f1c471", "R": "#c8966b", "r": "#91522c"}
    w1 = remap(cell(wt, 67, 28), {})
    biomes.append([plain, plain2, forest(plain, {"L": "#a8a129", "G": "#56864c", "g": "#345a52"}), paint(plain, MOUNTAIN, sand_rock), w1, water(w1, 4),
                   paint(plain, RUINS, {"a": K, "S": "#fce2ca", "s": "#c8966b", "D": "#8feff1"}), fog])
    # tundra
    plain, plain2 = cell(fl, 418, 22), cell(fl, 421, 22)
    ice = remap(cell(wt, 67, 28), {})
    biomes.append([plain, plain2, forest(plain, {"L": "#f2f6fa", "G": "#345a52", "g": "#23403a"}), paint(plain, MOUNTAIN, rock), ice, water(ice, 4),
                   paint(plain, RUINS, stone), fog])
    # circuit: tech floor recoloured from the meadow tile, server racks, crystal pyramid, dark data water
    base = cell(fl, 275, 22)
    cols = sorted({p[:3] for p in base.getdata() if p[3]}, key=pixel.lum)
    tech = remap(base, {pixel.hexc(c): h for c, h in zip(cols, ["#12303c", "#163844", "#1a4050", "#1e4858"])})
    trace = {"t": "#2f8f8f", "o": "#00e8d8"}
    plain = paint(tech, ["", "", "", "", "", "", "", "", "tttttto", "......t", ".......t", "........tttttttt"], trace)
    plain2 = paint(tech, ["", "", "...o", "...t", "...tttt", "......t", "......to"], trace)
    racks = tech.copy()
    rk = {"a": K, "S": "#8a96a3", "s": "#5f7160", "G": "#00e8d8", "k": "#1b1b2a", "R": "#e0394c"}
    racks = paint(racks, RACK, rk, 1, 8)
    racks = paint(racks, RACK, rk, 9, 3)
    crystal = {"a": K, "S": "#e3d7ff", "s": "#b8a4f0", "R": "#9878f8", "r": "#4428bc"}
    dw = Image.new("RGBA", (16, 16), pixel.rgb("#0b1830") + (255,))
    dw = paint(dw, ["", "", "..cccc", "", "", "", "", ".........cccc", "", "", "", "", "....cc"], {"c": "#1b51dc"})
    biomes.append([plain, plain2, racks, paint(tech, MOUNTAIN, crystal), dw, water(dw, 5),
                   paint(tech, RUINS, {"a": K, "S": "#8a96a3", "s": "#5f7160", "D": "#00e8d8"}), fog])
    write("terrain", [img_frame(im) for b in biomes for im in b],
          "Terrain: 4 biomes x (plain, plain2, forest, mountain, water, water2, ruins, fog). Ninja Adventure "
          "floor + water tiles, Kenney trees, hand-drawn peaks/ruins, circuit biome recoloured with traces and racks")


def res():
    """0 data crystal (plain), 1 berries (forest), 2 fish (water)."""
    I = f"{NINJA}/Items"
    g = paint(Image.new("RGBA", (16, 16)), [
        "", "", "",
        ".......a........",
        "......aCa..a....",
        "......aCca.aCa..",
        ".....aCwcaaCca..",
        ".....aCwccaCwca.",
        ".....aCwccaCwca.",
        "....aaCwccaCcca.",
        "...aDDaaaaaaDDa.",
        "....aaaaaaaaaa.."], {"a": K, "C": "#79b8ce", "c": "#548789", "w": "#e3f1f5", "D": "#8a96a3"})
    berries = paint(Image.new("RGBA", (16, 16)), [
        "", "", "", "", "", "", "", "", "", "",
        "...........aa...",
        "..........aGGa..",
        "......aaa.aaa...",
        ".....aRwRaRwRa..",
        ".....arRRarRRa..",
        "......aaaaaaaa.."], {"a": K, "G": "#56864c", "R": "#e0394c", "r": "#8f3e56", "w": "#fce2ca"})
    fish = remap(Image.open(f"{I}/Food/Fish.png").convert("RGBA"),
                 {"#79b8ce": "#ef914f", "#8feff1": "#fce2ca", "#345a52": "#91522c", "#ffad5d": "#d14b34"})
    write("res", [img_frame(g), img_frame(berries), img_frame(fish)],
          "Resources: cyan data crystal cluster (drawn in the Ninja water palette), red berries (drawn), orange koi (Ninja fish)")


TOKENS = {"#010101": "@1", "#020202": "@1d", "#030303": "@1l", "#040404": "@3", "#050505": "@3d", "#060606": "@2"}


def tok_frame(im):
    rows, leg = img_frame(im)
    return rows, {c: TOKENS.get(v, v) for c, v in leg.items()}


def draw_hq(face, side, edge, flag, flag_d, sign=None, globe=False):
    """32x32 HQ tower: lit window grid, stone plinth, a flag (or a globe) on the roof antenna."""
    from PIL import ImageDraw
    im = Image.new("RGBA", (32, 32))
    d = ImageDraw.Draw(im)
    k, win, dark, stone, stone_d = pixel.rgb(K), pixel.rgb("#ffd86a"), pixel.rgb("#3b3643"), pixel.rgb("#d7dde5"), pixel.rgb("#8a96a3")
    F, S, E = pixel.rgb(face), pixel.rgb(side), pixel.rgb(edge)
    # wings
    d.rectangle([2, 17, 29, 30], fill=k)
    d.rectangle([3, 18, 13, 29], fill=S)
    d.rectangle([18, 18, 28, 29], fill=S)
    # tower
    d.rectangle([8, 5, 23, 30], fill=k)
    d.rectangle([9, 6, 19, 29], fill=F)
    d.rectangle([20, 6, 22, 29], fill=S)
    d.line([(9, 6), (22, 6)], fill=E)
    d.line([(9, 6), (9, 29)], fill=E)
    for y in range(8, 27, 3):
        for x in (11, 14, 17):
            d.rectangle([x, y, x + 1, y + 1], fill=dark if (x, y) in ((17, 11), (11, 20)) else win)
    for y in (20, 24):
        for x in (5, 9, 24):
            d.rectangle([x, y, x + 1, y + 1], fill=win)
    # door + plinth
    d.rectangle([13, 25, 17, 29], fill=dark)
    d.line([(15, 25), (15, 29)], fill=k)
    d.rectangle([1, 30, 30, 31], fill=k)
    d.line([(2, 30), (29, 30)], fill=stone)
    d.point((29, 30), fill=stone_d)
    # antenna + flag / globe
    d.line([(15, 0), (15, 4)], fill=k)
    if globe:
        d.ellipse([12, 0, 18, 5], fill=pixel.rgb(flag), outline=k)
        d.line([(13, 2), (17, 2)], fill=pixel.rgb(flag_d))
        d.line([(15, 1), (15, 4)], fill=pixel.rgb(flag_d))
    else:
        d.rectangle([16, 0, 21, 3], fill=pixel.rgb(flag), outline=k)
        d.line([(17, 2), (20, 2)], fill=pixel.rgb(flag_d))
    if sign:  # benefit-card sign on the facade
        d.rectangle([10, 13, 18, 18], fill=k)
        d.rectangle([11, 14, 17, 17], fill=pixel.rgb(sign[0]))
        d.line([(11, 15), (17, 15)], fill=pixel.rgb(sign[1]))
        d.point((16, 17), fill=pixel.rgb("#ffdc37"))
    return im


def hq():
    im = draw_hq("#010101", "#020202", "#030303", "#040404", "#050505")
    write("hq", [tok_frame(im)], "HQ: brand-coloured office tower with lit windows, stone plinth, accent flag", 32, 32)


def rival():
    """Generic rival portrait: Ninja Adventure RobotGrey faceset (steel bot, red visor), centre 32x32."""
    im = Image.open(f"{CHAR}/RobotGrey/Faceset.png").convert("RGBA").crop((3, 3, 35, 35))
    write("rival", [img_frame(im)], "Rival portrait: steel bot face with a red visor (Ninja Adventure faceset)", 32, 32)


HOG_MAP = {"k": K, "b": "#91522c", "o": "#c8966b", "t": "#fce2ca", "w": "#ffffff", "i": "#d3a2c0"}


def advisor():
    """The PostHog hedgehog (kit art.py HOG grid), recoloured into the Ninja Adventure palette + a cheek."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("art", os.path.join(HERE, "..", "art.py"))
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    rows = [r.replace(".", ".") for r in art.HOG]
    leg = {c: HOG_MAP[c] for c in set("".join(rows)) - {"."}}
    rows, leg = setpx(rows, leg, [(19, 12), (20, 12)], "#ef914f")  # warm cheek
    write("advisor", [(rows, leg)], "Advisor: the PostHog hedgehog, recoloured to the Ninja palette", 24, 24)


if __name__ == "__main__":
    which = sys.argv[1:] or ["units", "city", "extra", "terrain", "res", "hq", "rival", "advisor"]
    for fn in which:
        globals()[fn]()
        print("wrote", fn)
