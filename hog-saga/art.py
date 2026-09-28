"""Default art for Hog Saga. Letters are master-palette colours (shared/sprites.py LEGEND);
digits 1-5 are the prospect's brand colours (1 primary, 2 secondary, 3 accent, 4 dark, 5 light).
The hedgehog, people and product icons follow Hog Quest's style; tiles, chests, items and
monsters are drawn here. Enemies, the boss, companions and NPCs get Flux sprites per prospect."""
import random

from PIL import Image, ImageDraw

from sprites import rgb, render, LEGEND

E = "." * 16


def mirror(rows):
    return [r[::-1] for r in rows]


def bob(rows):
    """Shift everything but the last 3 rows (feet) down one pixel."""
    return [E] + rows[:12] + rows[13:]


# ---------------------------------------------------------------- hedgehog (16x16, 4 directions x 2)
HOG_DOWN = [
    E,
    "......k..k......",
    "....kkbkkbkk....",
    "...kbbbobbbbk...",
    "..kbobbbbbbobk..",
    "..kbbttttttbbk..",
    ".kbttkwttkwttbk.",
    ".kbttkkttkkttbk.",
    ".kbttttttttttbk.",
    ".kbttitkktittbk.",
    "..kbttttttttbk..",
    "...kbttttttbk...",
    "....kkttttkk....",
    "...kttk..kttk...",
    "...kkkk..kkkk...",
    E,
]
HOG_UP = [
    E,
    "......k..k......",
    "....kkbkkbkk....",
    "...kbbbobbbbk...",
    "..kbobbbbbbobk..",
    "..kbbbbobbbbbk..",
    ".kbbobbbbbbobbk.",
    ".kbbbbbobbbbbbk.",
    ".kbobbbbbbbobbk.",
    ".kbbbbobbbbbbbk.",
    "..kbbbbbbobbbk..",
    "...kbbobbbbbk...",
    "....kkbbbbkk....",
    "...kttk..kttk...",
    "...kkkk..kkkk...",
    E,
]
HOG_RIGHT = [
    E,
    ".....k.k.k......",
    "...kkbkbkbk.....",
    "..kbbbobbbbk....",
    ".kbobbbbbbttk...",
    ".kbbbbbbbtttk...",
    "kbbbobbbttkwtk..",
    "kbbbbbbbttkktk..",
    "kbobbbbtttttttk.",
    "kbbbbbbttttttkk.",
    ".kbbbbbttittk...",
    "..kbbbbttttk....",
    "...kkkkkkkk.....",
    "....kttk.kttk...",
    "....kkkk.kkkk...",
    E,
]
HOG_RIGHT2 = HOG_RIGHT[:13] + ["...kttk...kttk..", "...kkkk...kkkk..", E]


def walk2(rows):
    """Second walk frame for front/back: feet apart + body bob."""
    r = bob(rows)
    r[13] = "..kttk....kttk.."
    r[14] = "..kkkk....kkkk.."
    return r


PLAYER = [HOG_DOWN, walk2(HOG_DOWN), HOG_UP, walk2(HOG_UP),
          mirror(HOG_RIGHT), mirror(HOG_RIGHT2), HOG_RIGHT, HOG_RIGHT2]

# ---------------------------------------------------------------- NPCs (16x16 x2, recoloured per index)
PERSON = [
    E,
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HTTTTTTH....",
    "....TTkTTkTT....",
    "....TTTTTTTT....",
    ".....TTkkTT.....",
    "......TTTT......",
    "....SSSSSSSS....",
    "...SSSSSSSSSS...",
    "..TSSSSSSSSSST..",
    "..TSSSSSSSSSST..",
    "....SSSSSSSS....",
    "....PPPPPPPP....",
    "....kk....kk....",
    E,
]
NPC_LOOKS = [  # hair, skin, shirt, pants
    ("b", "t", "1", "n"), ("k", "a", "3", "g"), ("y", "t", "5", "k"),
    ("R", "o", "B", "b"), ("o", "t", "G", "n"), ("g", "b", "2", "k"),
]


def outline(im):
    """1px black outline around opaque pixels."""
    w, h = im.size
    src = im.load()
    out = im.copy()
    o = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] and src[nx, ny][:3] != (0, 0, 0):
                    o[x, y] = (0, 0, 0, 255)
                    break
    return out


def _npc(i):
    hair, skin, shirt, pants = NPC_LOOKS[i]

    def fn(pal):
        rows = [r.replace("H", hair).replace("T", skin).replace("S", shirt).replace("P", pants) for r in PERSON]
        return [outline(render(rows, pal)), outline(render(bob(rows), pal))]
    return fn



ICONS = {
    "icon_session_replay": [
        E, "..kkkkkkkkkkkk..", ".kyyyyyyyyyyyyk.", ".kykkkkkkkkkkyk.", ".kykwwkwwkwwkyk.", ".kykkkkkkkkkkyk.",
        ".kykkkwkkkkkkyk.", ".kykkkwwkkkkkyk.", ".kykkkwwwkkkkyk.", ".kykkkwwkkkkkyk.", ".kykkkwkkkkkkyk.",
        ".kykkkkkkkkkkyk.", ".kyyyyyyyyyyyyk.", "..kkkkkkkkkkkk..", "....kkkkkkkk....", E],
    "icon_feature_flags": [
        E, "...kk...........", "...kGkkkkkkkk...", "...kGeeeeeeeGk..", "...kGeweeeeeeGk.", "...kGeeeeeeeeGk.",
        "...kGeeeeeeeGk..", "...kGkkkkkkkk...", "...kGk..........", "...kGk..........", "...kGk..........",
        "...kGk..........", "...kGk..........", "..kkkkk.........", "..kgggk.........", E],
    "icon_experiments": [
        E, ".kkkkkk..kkkkkk.", ".kvvvvk..kiiiik.", ".kvkkvk..kikkik.", ".kvkkvk..kikkik.", ".kvvvvk..kiiiik.",
        ".kvkkvk..kikkik.", ".kvkkvk..kiiiik.", ".kkkkkk..kkkkkk.", E, "...kkkkkkkkkk...", "...kwwwwwwwwk...",
        "...kwkkwkwwwk...", "...kwwwwwwwwk...", "...kkkkkkkkkk...", E],
    "icon_error_tracking": [
        E, ".......kk.......", "......kRRk......", "......kRRk......", ".....kRRRRk.....", ".....kRwwRk.....",
        "....kRRwwRRk....", "....kRRwwRRk....", "...kRRRwwRRRk...", "...kRRRwwRRRk...", "..kRRRRRRRRRRk..",
        "..kRRRRwwRRRRk..", ".kRRRRRwwRRRRRk.", ".kRRRRRRRRRRRRk.", ".kkkkkkkkkkkkkk.", E],
    "icon_product_analytics": [
        E, ".kk.............", ".kk.........kk..", ".kk........kCCk.", ".kk........kCCk.", ".kk....kk..kCCk.",
        ".kk...kBBk.kCCk.", ".kk...kBBk.kCCk.", ".kk.kkkBBk.kCCk.", ".kk.kckBBk.kCCk.", ".kk.kckBBk.kCCk.",
        ".kk.kckBBk.kCCk.", ".kkkkkkkkkkkkkk.", ".kkkkkkkkkkkkkk.", E, E],
    "icon_surveys": [
        E, "..kkkkkkkkkkkk..", ".kiiiiiiiiiiiik.", ".kiwwwwwwwwwwik.", ".kiwkkkkkkkkwik.", ".kiwwwwwwwwwwik.",
        ".kiwkkkkkwwwwik.", ".kiwwwwwwwwwwik.", ".kiiiiiiiiiiiik.", "..kkkkkiikkkkk..", "......kiik......",
        "......kik.......", "......kk........", E, E, E],
    "icon_web_analytics": [
        E, ".....kkkkkk.....", "...kkBBeeBBkk...", "..kBBBeeeBBBBk..", "..kBeeeeBBBBBk..", ".kBBeeeeeBBBBBk.",
        ".kBBBeeeBBBeeBk.", ".kBBBBeeBBeeeek.", ".kBBBBBBBeeeeek.", ".kBBBBBBBBeeeBk.", "..kBBBBBBBeeBk..",
        "..kBBBBBBBBBBk..", "...kkBBBBBBkk...", ".....kkkkkk.....", E, E],
    "icon_data_warehouse": [
        E, "....kkkkkkkk....", "..kkCCCCCCCCkk..", ".kCCwwwwwwwwCCk.", ".kkCCCCCCCCCCkk.", ".kcckkkkkkkkcck.",
        ".kccccccccccccck"[:16], ".kkccccccccccckk"[:16], ".kcckkkkkkkkcck.", ".kccccccccccccck"[:16],
        ".kkccccccccccckk"[:16], ".kcckkkkkkkkcck.", ".kcccccccccccck.", "..kkcccccccckk..", "....kkkkkkkk....", E],
}
for k in ("icon_data_warehouse",):
    ICONS[k] = [r if len(r) == 16 else (r + "." * 16)[:16] for r in ICONS[k]]
    ICONS[k] = [r[:15] + "." if r[15] == "k" and r[0] == "." and r.count("k") and r[14] == "c" else r for r in ICONS[k]]


# ---------------------------------------------------------------- procedural monsters
def _c(pal, key):
    return rgb(pal[key]) if key in pal else rgb(LEGEND[key])


def _enemy_1(pal):
    """A round one-eyed bug blob with scuttling legs."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, dark, light = _c(pal, "k"), _c(pal, "1"), _c(pal, "4"), _c(pal, "5")
        for i, x in enumerate((7, 11, 20, 24)):
            dy = (1 if (i + f) % 2 else -1)
            d.line([(x, 22), (x - 3 if x < 16 else x + 3, 27 + dy)], fill=k, width=2)
        d.line([(12, 7), (8, 1 + f)], fill=k, width=1)
        d.line([(19, 7), (23, 1 + f)], fill=k, width=1)
        d.ellipse([4, 5, 27, 26], fill=k)
        d.ellipse([5, 6, 26, 25], fill=dark)
        d.ellipse([6, 6, 25, 23], fill=body)
        d.ellipse([8, 8, 13, 12], fill=light)
        d.ellipse([10, 9, 21, 20], fill=k)
        d.ellipse([11, 10, 20, 19], fill=(252, 252, 252))
        px = 15 + (1 if f else -1)
        d.rectangle([px - 1, 13, px + 2, 16], fill=k)
        d.point((px, 13), fill=(252, 252, 252))
        frames.append(im)
    return frames


def _enemy_2(pal):
    """An angry little error-dialog window on legs."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, bar, white, red, grey = _c(pal, "k"), _c(pal, "1"), rgb("#fcfcfc"), rgb("#f83800"), rgb("#bcbcbc")
        y = 3 + f
        d.line([(10, y + 20), (8, 29)], fill=k, width=2)
        d.line([(21, y + 20), (23 - f * 2, 29)], fill=k, width=2)
        d.rectangle([3, y, 28, y + 21], fill=k)
        d.rectangle([4, y + 1, 27, y + 20], fill=white)
        d.rectangle([4, y + 1, 27, y + 5], fill=bar)
        d.rectangle([23, y + 2, 26, y + 4], fill=red)
        d.rectangle([4, y + 18, 27, y + 20], fill=grey)
        for ex in (10, 19):  # X eyes
            d.line([(ex - 2, y + 8), (ex + 2, y + 12)], fill=red, width=1)
            d.line([(ex + 2, y + 8), (ex - 2, y + 12)], fill=red, width=1)
        mouth = [(9, y + 16), (12, y + 14), (15, y + 16), (18, y + 14), (21, y + 16)]
        if f:
            mouth = [(9, y + 15), (12, y + 16), (15, y + 14), (18, y + 16), (21, y + 15)]
        d.line(mouth, fill=k, width=1)
        frames.append(im)
    return frames


def _enemy_3(pal):
    """A sleepy fog cloud surrounded by question marks."""
    frames = []
    q = ["kkk", "..k", ".k.", "...", ".k."]
    for f in range(2):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, fog, shade, acc = _c(pal, "k"), rgb("#fcfcfc"), rgb("#bcbcbc"), _c(pal, "3")
        blobs = [(4, 12, 16, 24), (10, 7, 24, 21), (17, 11, 29, 24), (7, 15, 25, 28)]
        for (a, b, c, e) in blobs:
            d.ellipse([a - 1, b - 1 + f, c + 1, e + 1 + f], fill=k)
        for (a, b, c, e) in blobs:
            d.ellipse([a, b + f, c, e + f], fill=shade)
        for (a, b, c, e) in blobs:
            d.ellipse([a + 1, b + f, c - 1, e - 2 + f], fill=fog)
        d.line([(11, 17 + f), (14, 17 + f)], fill=k)
        d.line([(18, 17 + f), (21, 17 + f)], fill=k)
        d.line([(14, 22 + f), (17, 22 + f)], fill=k)
        for (ox, oy) in ([(1, 2), (26, 4)] if f == 0 else [(2, 4), (27, 1)]):
            for yy, row in enumerate(q):
                for xx, ch in enumerate(row):
                    if ch == "k":
                        d.point((ox + xx, oy + yy), fill=acc)
        frames.append(im)
    return frames


def _boss(pal):
    """The monolith: a hulking server rack with glowing eyes and cable legs (48x48)."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, panel, acc, prim = _c(pal, "k"), rgb("#7c7c7c"), _c(pal, "4"), _c(pal, "3"), _c(pal, "1")
        for i, x in enumerate((12, 19, 28, 35)):
            sw = (2 if (i + f) % 2 else -2)
            d.line([(x, 40), (x + sw, 44), (x - sw, 47)], fill=k, width=2)
        d.rectangle([8, 3, 39, 41], fill=k)
        d.rectangle([10, 5, 37, 39], fill=body)
        d.rectangle([12, 7, 35, 17], fill=panel)
        d.rectangle([15, 10, 20, 14], fill=acc if f == 0 else rgb("#fcfcfc"))
        d.rectangle([27, 10, 32, 14], fill=acc if f == 0 else rgb("#fcfcfc"))
        d.rectangle([17, 12, 18, 13], fill=k)
        d.rectangle([29, 12, 30, 13], fill=k)
        for row, y in enumerate(range(21, 38, 4)):
            d.rectangle([12, y, 35, y + 2], fill=k)
            for j in range(4):
                on = (j + row + f) % 3 == 0
                d.point((14 + j * 3, y + 1), fill=(rgb("#00b800") if on else rgb("#503000")))
            d.rectangle([30, y + 1, 33, y + 1], fill=prim)
        d.polygon([(8, 3), (14, -2 + f), (18, 3)], fill=prim)
        d.polygon([(29, 3), (34, -2 + f), (39, 3)], fill=prim)
        frames.append(im)
    return frames



# ---------------------------------------------------------------- party and townsfolk (16x16 x2)
def _person(hair, skin, shirt, pants, extra=None):
    def fn(pal):
        rows = extra(PERSON) if extra else PERSON
        rows = [r.replace("H", hair).replace("T", skin).replace("S", shirt).replace("P", pants) for r in rows]
        return [outline(render(rows, pal)), outline(render(bob(rows), pal))]
    return fn


def _glasses(rows):
    rows = list(rows)
    rows[4] = "....TkkkTkkkT..."[:16]
    return rows


def _cross(rows):
    rows = list(rows)
    rows[9] = "...SSSSwwSSSS..."
    rows[10] = "..TSSSwwwwSSST.."
    rows[11] = "..TSSSSwwSSSST.."
    return rows


# ---------------------------------------------------------------- overworld tiles (16x16, one sheet)
def _noise(base, dots, seed, n=10):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (16, 16), rgb(base) + (255,))
    for _ in range(n):
        x, y = rnd.randrange(16), rnd.randrange(16)
        im.putpixel((x, y), rgb(rnd.choice(dots)) + (255,))
    return im


def _tiles(pal):
    c = lambda k: pal.get(k) or LEGEND[k]  # noqa: E731
    out = []
    grass = _noise("#00b800", ["#58d854", "#007800"], 1, 14)
    out.append(grass)                                                  # 0 grass
    fl = grass.copy()
    for (x, y, col) in ((3, 4, c("3")), (11, 3, "#fcfcfc"), (7, 10, c("5")), (13, 12, c("3")), (2, 13, "#fcfcfc")):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1)):
            fl.putpixel((x + dx, y + dy), rgb(col if (dx, dy) != (0, 0) else "#f8b800") + (255,))
    out.append(fl)                                                     # 1 flowers
    out.append(_noise("#f0d0b0", ["#fca044", "#fcfcfc"], 3, 12))      # 2 path
    tree = grass.copy()
    d = ImageDraw.Draw(tree)
    d.rectangle([6, 11, 9, 15], fill=rgb("#503000"))
    d.ellipse([1, 0, 14, 12], fill=rgb("#000000"))
    d.ellipse([2, 1, 13, 11], fill=rgb("#007800"))
    d.ellipse([3, 1, 10, 7], fill=rgb("#00b800"))
    d.point([(5, 3), (8, 5), (4, 6)], fill=rgb("#58d854"))
    out.append(tree)                                                   # 3 tree
    water = Image.new("RGBA", (16, 16), rgb("#0058f8") + (255,))
    d = ImageDraw.Draw(water)
    for (x, y) in ((2, 3), (9, 7), (4, 12), (12, 13)):
        d.line([(x, y), (x + 3, y)], fill=rgb("#3cbcfc"))
    out.append(water)                                                  # 4 water
    br = Image.new("RGBA", (16, 16), rgb("#0058f8") + (255,))
    d = ImageDraw.Draw(br)
    d.rectangle([0, 1, 15, 14], fill=rgb("#ac7c00"))
    for y in (1, 5, 9, 13):
        d.line([(0, y), (15, y)], fill=rgb("#503000"))
    out.append(br)                                                     # 5 bridge
    mt = Image.new("RGBA", (16, 16), rgb("#ac7c00") + (255,))
    d = ImageDraw.Draw(mt)
    d.polygon([(0, 15), (8, 1), (15, 15)], fill=rgb("#7c7c7c"), outline=rgb("#000000"))
    d.polygon([(6, 5), (8, 1), (10, 5)], fill=rgb("#fcfcfc"))
    d.line([(8, 6), (5, 13)], fill=rgb("#bcbcbc"))
    out.append(mt)                                                     # 6 mountain
    sand = _noise("#f8d878", ["#fca044", "#f0d0b0"], 5, 12)
    out.append(sand)                                                   # 7 sand
    rock = sand.copy()
    d = ImageDraw.Draw(rock)
    d.ellipse([2, 5, 14, 15], fill=rgb("#000000"))
    d.ellipse([3, 6, 13, 14], fill=rgb("#7c7c7c"))
    d.ellipse([4, 7, 9, 10], fill=rgb("#bcbcbc"))
    out.append(rock)                                                   # 8 rock
    out.append(_noise("#503000", ["#ac7c00", "#000000"], 7, 10))      # 9 cave floor
    wall = Image.new("RGBA", (16, 16), rgb(c("4")) + (255,))
    d = ImageDraw.Draw(wall)
    for y in (0, 5, 10, 15):
        d.line([(0, y), (15, y)], fill=rgb("#000000"))
    for i, y in enumerate((0, 5, 10)):
        for x in ((3, 11) if i % 2 else (7, 15)):
            d.line([(x, y), (x, y + 5)], fill=rgb("#000000"))
    out.append(wall)                                                   # 10 cave wall
    # houses: 2x2 of tiles (roof left/right, wall left/right)
    def roof(flip):
        im = Image.new("RGBA", (16, 16), rgb(c("1")) + (255,))
        d = ImageDraw.Draw(im)
        for y in range(2, 16, 4):
            d.line([(0, y), (15, y)], fill=rgb(c("4")))
        d.line([(0, 0), (15, 0)], fill=rgb("#000000"))
        d.line([(15 if flip else 0, 0), (15 if flip else 0, 15)], fill=rgb("#000000"))
        return im

    def wall2(door, sign=False, flip=False):
        im = Image.new("RGBA", (16, 16), rgb("#f0d0b0") + (255,))
        d = ImageDraw.Draw(im)
        d.line([(15 if flip else 0, 0), (15 if flip else 0, 15)], fill=rgb("#000000"))
        d.line([(0, 15), (15, 15)], fill=rgb("#000000"))
        if door:
            d.rectangle([5, 5, 11, 15], fill=rgb("#000000"))
            d.rectangle([6, 6, 10, 15], fill=rgb("#503000"))
            d.point((9, 11), fill=rgb("#f8b800"))
        elif sign:
            d.rectangle([1, 3, 14, 10], fill=rgb("#000000"))
            d.rectangle([2, 4, 13, 9], fill=rgb(c("3")))
            for x in (4, 7, 11):  # "INN" suggestion: three posts
                d.line([(x, 5), (x, 8)], fill=rgb("#000000"))
            d.line([(7, 5), (9, 8)], fill=rgb("#000000"))
            d.line([(9, 5), (9, 8)], fill=rgb("#000000"))
            d.line([(11, 5), (13, 8)], fill=rgb("#000000"))
            d.line([(13, 5), (13, 8)], fill=rgb("#000000"))
        else:
            d.rectangle([4, 4, 11, 10], fill=rgb("#000000"))
            d.rectangle([5, 5, 10, 9], fill=rgb("#a4e4fc"))
            d.line([(7, 5), (7, 9)], fill=rgb("#000000"))
        return im
    out += [roof(False), roof(True), wall2(False), wall2(True, flip=True)]     # 11-14 house
    inn_roof = lambda f: roof(f)  # noqa: E731
    irl, irr = inn_roof(False), inn_roof(True)
    for im in (irl, irr):
        ImageDraw.Draw(im).rectangle([0, 12, 15, 15], fill=rgb(c("3")))
    out += [irl, irr, wall2(False, sign=True), wall2(True, flip=True)]          # 15-18 inn
    out.append(_noise(c("4"), [c("2"), "#000000"], 9, 16))                     # 19 lair floor
    lw = Image.new("RGBA", (16, 16), rgb("#000000") + (255,))
    d = ImageDraw.Draw(lw)
    d.rectangle([1, 1, 14, 14], fill=rgb(c("1")))
    d.rectangle([3, 3, 12, 12], fill=rgb(c("4")))
    d.point([(5, 5), (10, 10)], fill=rgb(c("3")))
    out.append(lw)                                                     # 20 lair wall
    gate = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(gate)
    d.rectangle([0, 0, 15, 15], fill=rgb("#000000"))
    for y in range(0, 16, 4):
        off = 0 if (y // 4) % 2 else 4
        for x in range(-4, 16, 8):
            d.rectangle([x + off, y, x + off + 6, y + 2], fill=rgb("#f83800"))
    d.rectangle([0, 0, 15, 15], outline=rgb("#f8b800"))
    out.append(gate)                                                   # 21 firewall gate
    cof = grass.copy()
    d = ImageDraw.Draw(cof)
    d.rectangle([3, 4, 12, 14], fill=rgb("#000000"))
    d.rectangle([4, 5, 11, 13], fill=rgb("#bcbcbc"))
    d.rectangle([5, 6, 10, 8], fill=rgb(c("1")))
    d.rectangle([6, 10, 9, 13], fill=rgb("#fcfcfc"))
    d.rectangle([7, 11, 8, 12], fill=rgb("#503000"))
    d.point([(6, 2), (8, 1), (9, 3)], fill=rgb("#fcfcfc"))
    out.append(cof)                                                    # 22 coffee station
    return out


# ---------------------------------------------------------------- chest and item icons
CHEST = [
    E,
    E,
    "..kkkkkkkkkkkk..",
    ".kooooooooooook.",
    ".kobbbbbbbbbbok.",
    ".kkkkkkkkkkkkkk.",
    ".koooookkoooook.",
    ".kooooky3kooook.",
    ".koooookkoooook.",
    ".kbbbbbbbbbbbbk.",
    ".kooooooooooook.",
    ".kooooooooooook.",
    ".kbbbbbbbbbbbbk.",
    ".kkkkkkkkkkkkkk.",
    E,
    E,
]
CHEST_OPEN = [
    "..kkkkkkkkkkkk..",
    ".kbbbbbbbbbbbbk.",
    ".kbkkkkkkkkkkbk.",
    ".kkkkkkkkkkkkkk.",
    ".kyYyyYyyYyyYyk.",
    ".kkkkkkkkkkkkkk.",
    ".koooookkoooook.",
    ".koooookkoooook.",
    ".koooookkoooook.",
    ".kbbbbbbbbbbbbk.",
    ".kooooooooooook.",
    ".kooooooooooook.",
    ".kbbbbbbbbbbbbk.",
    ".kkkkkkkkkkkkkk.",
    E,
    E,
]
POTION = [
    "........",
    "...kk...",
    "...kk...",
    "..kwwk..",
    ".kRRRRk.",
    ".kRwRRk.",
    ".kRRRRk.",
    "..kkkk..",
]
ETHER = [r.replace("R", "B") for r in POTION]
HOTFIX = [
    "..kkkk..",
    ".kGGGGk.",
    "kGGwwGGk",
    "kGwwwwGk",
    "kGGwwGGk",
    ".kGGGGk.",
    "..kkkk..",
    "........",
]
RELIC = [
    "..kkkk..",
    ".k3333k.",
    "k33ww33k",
    "k3w33w3k",
    "k33ww33k",
    ".k3333k.",
    "..k11k..",
    "..kkkk..",
]


# ---------------------------------------------------------------- two more monsters and the big boss
def _enemy_4(pal):
    """A spiky gear crab (a 'tank')."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, dark, acc = _c(pal, "k"), _c(pal, "2"), _c(pal, "4"), _c(pal, "3")
        for i in range(8):
            import math
            a = i * math.pi / 4 + f * 0.2
            x, y = 16 + math.cos(a) * 13, 17 + math.sin(a) * 11
            d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=k)
        d.ellipse([4, 6, 28, 28], fill=k)
        d.ellipse([5, 7, 27, 27], fill=rgb("#7c7c7c"))
        d.ellipse([9, 11, 23, 23], fill=body if body != (0, 0, 0) else dark)
        for ex in (12, 19):
            d.rectangle([ex, 14, ex + 2, 16], fill=rgb("#fcfcfc"))
            d.point((ex + 1, 15), fill=k)
        d.line([(12, 20), (20, 20)], fill=k)
        for side in (-1, 1):
            cx = 16 + side * 14
            d.ellipse([cx - 4, 2 + f, cx + 4, 10 + f], fill=k)
            d.ellipse([cx - 3, 3 + f, cx + 3, 9 + f], fill=acc)
        frames.append(im)
    return frames


def _enemy_5(pal):
    """A dripping slime worm (a 'caster')."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, light = _c(pal, "k"), rgb("#9878f8"), rgb("#f878f8")
        segs = [(8, 24), (14, 21 - f), (20, 18), (24, 12 - f)]
        for (x, y) in segs:
            d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=k)
        for (x, y) in segs:
            d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=body)
        for (x, y) in segs[:3]:
            d.ellipse([x - 3, y - 4, x, y - 2], fill=light)
        hx, hy = segs[-1]
        d.rectangle([hx - 3, hy - 2, hx - 1, hy], fill=rgb("#fcfcfc"))
        d.rectangle([hx + 1, hy - 2, hx + 3, hy], fill=rgb("#fcfcfc"))
        d.point([(hx - 2, hy - 1), (hx + 2, hy - 1)], fill=k)
        for i in range(3):  # magic sparks
            sx, sy = 26 - i * 9 + f * 2, 4 + (i * 5 + f * 3) % 7
            d.point([(sx, sy), (sx + 1, sy), (sx, sy + 1)], fill=_c(pal, "3"))
        d.ellipse([3, 27, 9, 31], fill=body)
        frames.append(im)
    return frames


def _boss(pal):
    """The final boss (64x64): a crowned legacy mainframe on cable legs."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, panel, acc, prim = _c(pal, "k"), rgb("#7c7c7c"), _c(pal, "4"), _c(pal, "3"), _c(pal, "1")
        for i, x in enumerate((14, 24, 38, 48)):
            sw = 3 if (i + f) % 2 else -3
            d.line([(x, 54), (x + sw, 59), (x - sw, 63)], fill=k, width=3)
        d.rectangle([9, 12, 54, 56], fill=k)
        d.rectangle([11, 14, 52, 54], fill=body)
        d.rectangle([14, 17, 49, 30], fill=panel)
        eye = acc if f == 0 else rgb("#fcfcfc")
        d.rectangle([19, 21, 27, 26], fill=eye)
        d.rectangle([36, 21, 44, 26], fill=eye)
        d.rectangle([22, 23, 24, 25], fill=k)
        d.rectangle([39, 23, 41, 25], fill=k)
        d.line([(18, 19), (28, 21)], fill=k, width=2)
        d.line([(45, 19), (35, 21)], fill=k, width=2)
        for row, y in enumerate(range(34, 52, 5)):
            d.rectangle([14, y, 49, y + 3], fill=k)
            for j in range(6):
                on = (j + row + f) % 3 == 0
                d.rectangle([16 + j * 4, y + 1, 17 + j * 4, y + 2], fill=(rgb("#00b800") if on else rgb("#a81000")))
            d.rectangle([42, y + 1, 47, y + 2], fill=prim)
        # crown
        d.polygon([(12, 12), (16, 1 + f), (22, 8), (32, 0 + f), (42, 8), (48, 1 + f), (52, 12)], fill=k)
        d.polygon([(14, 11), (17, 4 + f), (22, 10), (32, 3 + f), (42, 10), (47, 4 + f), (50, 11)], fill=rgb("#f8b800"))
        d.point([(32, 6 + f), (17, 7 + f), (47, 7 + f)], fill=prim)
        frames.append(im)
    return frames


SPRITES = {
    "hero": PLAYER,
    "chest": [CHEST, CHEST_OPEN],
    "item_potion": [POTION],
    "item_ether": [ETHER],
    "item_hotfix": [HOTFIX],
    "item_relic": [RELIC],
    **{k: [v] for k, v in ICONS.items()},
}

PROCEDURAL = {
    "tiles": _tiles,
    "party_1": _person("k", "a", "3", "n", _glasses),
    "party_2": _person("y", "t", "G", "k", _cross),
    "npc_1": _person("b", "t", "1", "n"),
    "npc_2": _person("R", "o", "B", "b"),
    "npc_3": _person("g", "t", "5", "k"),
    "enemy_1": _enemy_1, "enemy_2": _enemy_2, "enemy_3": _enemy_3, "enemy_4": _enemy_4, "enemy_5": _enemy_5,
    "boss": _boss,
}


# ---------------------------------------------------------------- 8x8 battle/HUD icons (fixed kit art)
# 0 strike, 1 magic, 2 data, 3 unknown, 4 leak, 5 frozen, 6 throttled, 7 focused,
# 8 gold, 9 weapon, 10 armour, 11 charm, 12 break, 13 alert, 14 star, 15 chest
ICONS8 = [
    ["......wk", ".....wlk", "....wlk.", "k..wlk..", ".kwlk...", "..kk....", ".kbkk...", "kb..k..."],
    ["...y....", "...y....", "..yYy...", "yyYwYyy.", "..yYy...", "...y....", "...y..y.", "......Y."],
    [".......k", "......Qk", "......Qk", "...Q..Qk", "...Q..Qk", "Q..Q..Qk", "Q..Q..Qk", "kkkkkkkk"],
    ["kkkkkkkk", "kgwwwwgk", "kggggwgk", "kgggwwgk", "kggwwggk", "kggggggk", "kggwwggk", "kkkkkkkk"],
    ["...E....", "...E....", "..EEE...", ".EEwEE..", ".EwEEE..", ".EEEEE..", "..EEE...", "........"],
    ["C..C..C.", ".C.C.C..", "..CwC...", "CCwwwCC.", "..CwC...", ".C.C.C..", "C..C..C.", "........"],
    ["kkkkkkk.", ".kYYYk..", "..kyk...", "...k....", "..kyk...", ".kyyyk..", "kkkkkkk.", "........"],
    ["..iiii..", ".i....i.", "i..ii..i", "i.iwwi.i", "i.iwwi.i", "i..ii..i", ".i....i.", "..iiii.."],
    ["..kkkk..", ".kyyyyk.", "kyYyyyyk", "kyYkkyyk", "kyYyyyyk", "kyyyyyok", ".kyyyok.", "..kkkk.."],
    [".....ll.", "....lwl.", "...lwl..", "..lwl...", "olwl....", ".ok.....", "o.o.....", "........"],
    ["kkkkkkk.", "kBBwBBk.", "kBBwBBk.", "kwwwwwk.", "kBBwBBk.", ".kBwBk..", "..kBk...", "...k...."],
    ["..k.k...", ".k.k.k..", "..kPk...", ".kPIPk..", "kPIwIPk.", ".kPIPk..", "..kPk...", "...k...."],
    ["kkkkkkk.", "kRRkRRk.", "kRk.kRk.", "kRRkRRk.", "kRkkRRk.", ".kRkRk..", "..kRk...", "...k...."],
    ["..kRk...", "..kRk...", "..kRk...", "..kRk...", "..kRk...", "...k....", "..kRk...", "..kkk..."],
    ["...y....", "...y....", "..yyy...", "yyyYyyy.", ".yyYyy..", "..yyy...", ".yy.yy..", ".y...y.."],
    ["........", ".kkkkkk.", "kobbbbok", "kbbybbbk", "kkkykkkk", "kbbbbbbk", "kobbbbok", ".kkkkkk."],
]
SPRITES["saga_icons"] = ICONS8


# ---------------------------------------------------------------- off-the-road extras (fixed kit art)
def _beard(rows):
    rows = list(rows)
    rows[6] = ".....TllllT....."
    rows[7] = "......llll......"
    return rows


def _wyrm(pal):
    """The optional superboss (64x64): a coiled serpent of tangled legacy cables with TODO-note scales."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, body, belly, note, eye = _c(pal, "k"), rgb("#007800"), rgb("#58d854"), rgb("#f8d878"), rgb("#f83800")
        # coils (back to front)
        for (cx, cy, r) in ((40, 50, 13), (22, 48, 12), (32, 38, 11)):
            d.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=k)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=body)
            d.arc([cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3], 20, 160, fill=belly, width=3)
        # sticky-note scales
        for i, (x, y) in enumerate(((16, 44), (42, 46), (30, 33), (24, 52), (46, 54))):
            y += (f if i % 2 else -f)
            d.rectangle([x - 1, y - 1, x + 4, y + 4], fill=k)
            d.rectangle([x, y, x + 3, y + 3], fill=note)
        # neck and head
        hx, hy = 38 + f, 14 - f
        d.line([(32, 30), (36, 22), (hx, hy + 6)], fill=k, width=9)
        d.line([(32, 30), (36, 22), (hx, hy + 6)], fill=body, width=6)
        d.polygon([(hx - 12, hy - 2), (hx + 12, hy - 4), (hx + 16, hy + 6), (hx - 10, hy + 10)], fill=k)
        d.polygon([(hx - 10, hy - 1), (hx + 11, hy - 3), (hx + 14, hy + 5), (hx - 8, hy + 8)], fill=body)
        # horns: two frayed cable ends
        for sx in (-6, 4):
            d.line([(hx + sx, hy - 2), (hx + sx - 3, hy - 10)], fill=k, width=3)
            d.point([(hx + sx - 3, hy - 11), (hx + sx - 5, hy - 10), (hx + sx - 1, hy - 11)], fill=rgb("#f8b800"))
        d.rectangle([hx - 4, hy + 1, hx - 1, hy + 3], fill=eye)
        d.rectangle([hx + 5, hy + 1, hx + 8, hy + 3], fill=eye)
        d.line([(hx - 6, hy + 7), (hx + 10, hy + 6)], fill=k, width=1)
        for tx in range(hx - 4, hx + 9, 4):
            d.point([(tx, hy + 7 + (1 if f else 0))], fill=rgb("#fcfcfc"))
        frames.append(im)
    return frames


def _map_bits(pal):
    """16x16 map props: 0 shop sign, 1 wall crack overlay, 2 the lost keyboard, 3 sparkle."""
    k = _c(pal, "k")
    out = []
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, 13, 10], fill=k)
    d.rectangle([3, 3, 12, 9], fill=rgb("#ac7c00"))
    d.ellipse([5, 4, 10, 8], fill=rgb("#f8b800"))            # a gold coin on the sign
    d.point([(7, 5), (7, 6), (8, 7)], fill=rgb("#ac7c00"))
    d.rectangle([7, 11, 8, 15], fill=k)
    out.append(im)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line([(8, 1), (6, 5), (9, 8), (6, 12), (8, 15)], fill=k, width=1)
    d.line([(9, 8), (13, 10)], fill=k, width=1)
    d.line([(6, 5), (3, 4)], fill=k, width=1)
    out.append(im)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 6, 14, 13], fill=k)
    d.rectangle([2, 7, 13, 12], fill=rgb("#bcbcbc"))
    for yy in (8, 10):
        for xx in range(3, 13, 2):
            d.point([(xx, yy)], fill=k)
    d.line([(5, 12), (10, 12)], fill=k)
    d.point([(13, 3), (12, 4), (14, 4), (13, 5)], fill=rgb("#fcfcfc"))
    out.append(im)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for (x, y) in ((8, 4), (8, 12), (4, 8), (12, 8)):
        d.point([(x, y)], fill=rgb("#f8d878"))
    d.line([(8, 5), (8, 11)], fill=rgb("#fcfcfc"))
    d.line([(5, 8), (11, 8)], fill=rgb("#fcfcfc"))
    out.append(im)
    return out


PROCEDURAL["quest_npc"] = _person("l", "t", "q", "g", _beard)
PROCEDURAL["wyrm"] = _wyrm
PROCEDURAL["saga_map"] = _map_bits


def _hat(rows):
    rows = list(rows)
    rows[0] = "....kkkkkkkk...."
    rows[1] = "...kOOOOOOOOk..."
    rows[2] = "..kkkkkkkkkkkk.."
    return rows


PROCEDURAL["merchant"] = _person("b", "a", "p", "b", _hat)
