"""hog-saga map tiles (23 frames, index order fixed by the kit engine; see art.py _tiles)."""
from PIL import Image, ImageDraw

from make_sprites import OUTLINE, builder, cell, over, px, recolour, write
import pixel

GRASS_HI, GRASS_LO = "#adbc3a", "#74a334"
WATER, WATER_HI = "#71ddee", "#c7f5f9"
SAND, SAND_LO, SAND_HI = "#eecf9b", "#d2b37d", "#fff1c9"
WOOD = {"#e66a3a": "#bd7959", "#ffad5d": "#d2b37d"}  # house walls stay wooden; roofs carry the brand
ROOF_TOKENS = {"#e66a3a": "@1", "#ffad5d": "@1l", "#965340": "@1d"}


def flat(col):
    return Image.new("RGBA", (16, 16), pixel.rgb(col) + (255,))


def grass():
    g = cell("TilesetFloor", 264)
    px(g, [(3, 5), (4, 4), (5, 5), (11, 12), (12, 11), (13, 12)], GRASS_LO)
    return g


def flowers():
    g = grass()
    for (x, y), petal in (((4, 3), "#ff5a8a"), ((11, 6), "#fbf5ef"), ((7, 12), "#ff5a8a"), ((13, 13), "#fbf5ef")):
        px(g, [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], petal)
        px(g, [(x, y)], "#ffd35b")
        px(g, [(x, y + 2)], GRASS_LO)
    return g


def path():
    p = cell("TilesetFloor", 121)
    px(p, [(3, 3), (4, 3), (10, 8), (11, 9), (5, 12), (13, 13), (14, 13)], "#e9ab8c")
    px(p, [(8, 2), (2, 9), (12, 3)], "#fff0e2")
    return p


def tree():
    t = grass()
    d = ImageDraw.Draw(t)
    d.rectangle([6, 10, 9, 15], fill=pixel.rgb(OUTLINE))
    d.rectangle([7, 10, 8, 15], fill=pixel.rgb("#965340"))
    px(t, [(7, 11), (7, 12)], "#bd7959")
    bush = cell("TilesetNature", 241)
    return over(t, bush, (0, -3))


def water():
    w = cell("TilesetWater", 29)
    for x0, y in ((2, 4), (9, 9), (4, 13)):
        px(w, [(x0, y), (x0 + 1, y), (x0 + 2, y)], WATER_HI)
    return w


def bridge():
    b = cell("TilesetHouse", 506)
    d = ImageDraw.Draw(b)
    d.line([(0, 0), (15, 0)], fill=pixel.rgb(WATER))
    d.line([(0, 15), (15, 15)], fill=pixel.rgb(WATER))
    d.line([(0, 1), (15, 1)], fill=pixel.rgb("#965340"))
    d.line([(0, 14), (15, 14)], fill=pixel.rgb("#965340"))
    return b


def sand():
    s = flat(SAND)
    px(s, [(2, 3), (3, 3), (9, 6), (12, 11), (13, 11), (5, 13)], SAND_LO)
    px(s, [(6, 2), (14, 4), (2, 10), (10, 14)], SAND_HI)
    return s


def rock():
    return over(sand(), cell("TilesetNature", 323))


def roof(right, inn=False):
    r = cell("TilesetHouse", 36 if right else 33)
    if inn:
        d = ImageDraw.Draw(r)
        d.line([(0, 11), (15, 11)], fill=pixel.rgb(OUTLINE))
        d.rectangle([0, 12, 15, 15], fill=pixel.rgb("#ffd35b"))
        d.line([(0, 15), (15, 15)], fill=pixel.rgb("#e0a23a"))
        edge = 15 if right else 0
        d.line([(edge, 11), (edge, 15)], fill=pixel.rgb(OUTLINE))
    return r


def wall_window():
    w = recolour(cell("TilesetHouse", 66), WOOD)
    d = ImageDraw.Draw(w)
    d.rectangle([5, 4, 11, 10], fill=pixel.rgb(OUTLINE))
    d.rectangle([6, 5, 10, 9], fill=pixel.rgb("#a4e4fc"))
    d.line([(8, 5), (8, 9)], fill=pixel.rgb(OUTLINE))
    d.line([(6, 7), (10, 7)], fill=pixel.rgb(OUTLINE))
    px(w, [(6, 5), (9, 5)], "#fbf5ef")
    return w


def wall_door():
    w = recolour(cell("TilesetHouse", 69), WOOD)
    d = ImageDraw.Draw(w)
    d.rectangle([4, 4, 10, 13], fill=pixel.rgb(OUTLINE))
    d.rectangle([5, 5, 9, 13], fill=pixel.rgb("#965340"))
    d.line([(7, 5), (7, 13)], fill=pixel.rgb("#7a3f33"))
    px(w, [(8, 9)], "#ffd35b")
    return w


def wall_sign():
    w = recolour(cell("TilesetHouse", 66), WOOD)
    d = ImageDraw.Draw(w)
    d.rectangle([2, 3, 13, 10], fill=pixel.rgb(OUTLINE))
    d.rectangle([3, 4, 12, 9], fill=pixel.rgb("#ffd35b"))
    k = pixel.rgb(OUTLINE)
    for x in (4, 7, 11):  # I N N
        d.line([(x, 5), (x, 8)], fill=k)
    d.line([(8, 5), (9, 8)], fill=k)
    d.line([(9, 5), (9, 8)], fill=k)
    d.line([(12, 5), (12, 8)], fill=k)
    d.line([(11, 5), (12, 8)], fill=k)
    return w


def cave_floor():
    c = cell("TilesetFloor", 429)
    px(c, [(3, 4), (4, 4), (11, 9), (6, 13), (7, 13)], "#8e7c73")
    px(c, [(9, 3), (2, 11), (13, 14)], "#c9ab96")
    return c


def lair_floor():
    return cell("TilesetFloor", 386)


def lair_wall():
    return cell("TilesetDungeon", 15)


def firewall():
    g = cell("TilesetHouse", 46)
    d = ImageDraw.Draw(g)
    d.rectangle([0, 0, 15, 15], outline=pixel.rgb("#ffd35b"))
    return g


COFFEE = ["................",
          "....y..y........",
          ".....y..y.......",
          "...kkkkkkkk.....",
          "...kggggggkk....",
          "...k11111gkk....",
          "...kggggggk.....",
          "...kgkkkkgk.....",
          "...kgkwwkgk.....",
          "...kgkwwkgk.....",
          "...kggggggk.....",
          "..kkkkkkkkkk....",
          "..kddddddddk....",
          "...kkkkkkkk.....",
          "................",
          "................"]


def coffee():
    c = grass()
    cols = {"k": OUTLINE, "g": "#8e7c73", "1": "#e0394c", "w": "#fbf5ef", "y": "#fbf5ef", "d": "#5b4a45"}
    for y, row in enumerate(COFFEE):
        for x, ch in enumerate(row):
            if ch != ".":
                px(c, [(x + 1, y)], cols[ch])
    return c


LAIR_TOKENS = {"#816855": "@4", "#90775e": "@4", "#8e7c73": "@4", "#b3957f": "@1d",   # lair floor stones
               "#bd7959": "@1", "#965340": "@1d", "#d2b37d": "@1l"}                       # lair wall panel
COFFEE_TOKENS = {"#e0394c": "@1"}


@builder
def tiles():
    frames = [grass(), flowers(), path(), tree(), water(), bridge(), cell("TilesetRelief", 25), sand(), rock(),
              cave_floor(), cell("TilesetRelief", 125),
              roof(False), roof(True), wall_window(), wall_door(),
              roof(False, True), roof(True, True), wall_sign(), wall_door(),
              lair_floor(), lair_wall(), firewall(), coffee()]
    # brand tokens only where the kit used brand colours: roofs, lair, inn band/sign (accent), coffee panel
    spr = pixel.from_images(frames, {"concept": "map tiles: CC0 Ninja Adventure tiles + edits; roofs/lair take brand"})
    # brand colours are per-frame, so give branded frames their own legend letters
    branded = {11: ROOF_TOKENS, 12: ROOF_TOKENS, 15: ROOF_TOKENS, 16: ROOF_TOKENS, 19: LAIR_TOKENS, 20: LAIR_TOKENS,
               22: COFFEE_TOKENS}
    accent = {15: {"#ffd35b": "@3", "#e0a23a": "@3d"}, 16: {"#ffd35b": "@3", "#e0a23a": "@3d"}, 17: {"#ffd35b": "@3"}}
    legend = spr["legend"]
    free = [c for c in pixel.CHARS if c not in legend]
    tokchar = {}
    for fi in range(len(frames)):
        m = {**branded.get(fi, {}), **accent.get(fi, {})}
        if not m:
            continue
        rows = spr["frames"][fi]
        new = []
        for row in rows:
            out = []
            for ch in row:
                col = legend[ch][0] if ch != "." else None
                if col in m:
                    tok = m[col]
                    if tok not in tokchar:
                        tokchar[tok] = free.pop(0)
                        legend[tokchar[tok]] = (tok, "brand")
                    out.append(tokchar[tok])
                else:
                    out.append(ch)
            new.append("".join(out))
        spr["frames"][fi] = new
    import os
    from make_sprites import HERE
    pixel.save(os.path.join(HERE, "tiles.sprite"), spr)
