"""Default art for Hog Quest. Letters are master-palette colours (shared/sprites.py LEGEND);
digits 1-5 are the prospect's brand colours (1 primary, 2 secondary, 3 accent, 4 dark, 5 light).
Tiles and NPC defaults are recoloured per prospect; enemies and the boss are procedural."""
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


# ---------------------------------------------------------------- tiles (16x16, one sheet)
T_FLOOR = ["llllllllllllllll"] * 15 + ["gggggggggggggggg"]
T_FLOOR = [r[:15] + "g" for r in T_FLOOR[:15]] + [T_FLOOR[15]]
T_FLOOR[4] = "lllwllllllllllg"[:15] + "g"
T_FLOOR[11] = "lllllllllwlllll"[:15] + "g"
T_RUG = ["1111111111111111"] + ["1" + "5" * 14 + "1"] * 14 + ["1111111111111111"]
T_RUG[3] = "15555555555355551"[:16]
T_RUG[11] = "1553555555555551"
T_WALLFACE = ["wwwwwwwwwwwwwwww"] * 8 + ["1111111111111111", "4444444444444444"] + ["wwwwwwwwwwwwwwww"] * 3 + ["llllllllllllllll", "gggggggggggggggg", "kkkkkkkkkkkkkkkk"]
T_WALLTOP = ["k" + "2" * 14 + "k"] * 16
T_WALLTOP = ["kkkkkkkkkkkkkkkk"] + ["k4kkkkkkkkkkkk4k"] + ["kkkkkkkkkkkkkkkk"] * 12 + ["k4kkkkkkkkkkkk4k", "kkkkkkkkkkkkkkkk"]
T_DESK = [
    E,
    "...kkkkkkkkkk...",
    "...kcccccccCk...",
    "...kcCcccccck...",
    "...kcccccccck...",
    "...kkkkkkkkkk...",
    "......kggk......",
    "kkkkkkkkkkkkkkkk",
    "koooooooooooooak",
    "kokkkkkkkkkkkkok",
    "koooooooooooooak",
    "kbbbbbbbbbbbbbbk",
    "kbk..........kbk",
    "kbk..........kbk",
    "kkk..........kkk",
    E,
]
T_PLANT = [
    "......k.k.......",
    "....kkekeGk.....",
    "...keeGeGGeek...",
    "..keGeGdGeGGek..",
    "..kGeGdGGdGeGk..",
    ".keGdGGeGGdGGek.",
    ".kGGeGdGeGdGeGk.",
    "..kdGGdGGdGGdk..",
    "...kkdGdGdkk....",
    "....kOOOOOOk....",
    "...kOaaaaaaOk...",
    "...kOOOOOOOOk...",
    "....kOOOOOOk....",
    "....kOOOOOOk....",
    ".....kkkkkk.....",
    E,
]
T_SERVER = [
    "kkkkkkkkkkkkkkkk",
    "kggggggggggggggk",
    "kgkkkkkkkkkkkkgk",
    "kgkGkykkkkkRkkgk",
    "kgkkkkkkkkkkkkgk",
    "kggggggggggggggk",
    "kgkkkkkkkkkkkkgk",
    "kgkykGkkkkkkGkgk",
    "kgkkkkkkkkkkkkgk",
    "kggggggggggggggk",
    "kgkkkkkkkkkkkkgk",
    "kgkGkkkRkkkkykgk",
    "kgkkkkkkkkkkkkgk",
    "kggggggggggggggk",
    "kgkkgkkkkkkgkkgk",
    "kkkkkkkkkkkkkkkk",
]
T_TABLE = ["kkkkkkkkkkkkkkkk"] + ["koooooooooooooak"] * 3 + ["koaooooooooooook"] + ["koooooooooooooak"] * 9 + ["kbbbbbbbbbbbbbbk", "kkkkkkkkkkkkkkkk"]
T_COUNTER = ["kkkkkkkkkkkkkkkk", "kwwwwwwwwwwwwwwk", "kllllllllllllllk", "kkkkkkkkkkkkkkkk"] + \
    ["kgglllllllllllgk"] * 2 + ["kglkkkkkkkkkklgk", "kglkggggggggklgk", "kglkggkkkgggklgk", "kglkggggggggklgk", "kglkkkkkkkkkklgk"] + \
    ["kgllllllllllllgk"] * 3 + ["kggggggggggggggk", "kkkkkkkkkkkkkkkk"]
T_WHITEBOARD = [
    "wwwwwwwwwwwwwwww",
    "kkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwk",
    "kwRRwwwwwwBwwwwk",
    "kwwwRwwwwBwBwwwk",
    "kwwwwRRwBwwwBwwk",
    "kwGGGwwwwwwwwwwk",
    "kwwwwwwwGGGGwwwk",
    "k11111111111111k",
    "k44444444444444k",
    "kwwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkkk",
    "wwwwwwwwwwwwwwww",
    "llllllllllllllll",
    "gggggggggggggggg",
    "kkkkkkkkkkkkkkkk",
]
T_DOOR = ["llllllllllllllll"] + ["l33333333333333l"] + ["l3" + "Y3" * 6 + "3l"] + ["l3" + "3Y" * 6 + "3l"] * 0 + \
    [("l3" + ("Y3" if i % 2 else "3Y") * 6 + "3l") for i in range(11)] + ["l33333333333333l", "llllllllllllllll", "llllllllllllllll"]
T_DOOR = T_DOOR[:16]
T_COUCH = [
    E,
    E,
    ".kkkkkkkkkkkkkk.",
    "k44444444444444k",
    "k41111111111114k",
    "k41111111111114k",
    "k45555555555554k",
    "k44444444444444k",
    "k41111k1111k114k",
    "k41111k1111k114k",
    "k41111k1111k114k",
    "k44444444444444k",
    "kkkkkkkkkkkkkkkk",
    ".kk..........kk.",
    E,
    E,
]
T_WINDOW = [
    "wwwwwwwwwwwwwwww",
    "wkkkkkkkkkkkkkkw",
    "wkCCCCCCkCCCCCkw",
    "wkCwwCCCkCCCCCkw",
    "wkCCwCCCkCwCCCkw",
    "wkCCCCCCkCCwCCkw",
    "wkkkkkkkkkkkkkkw",
    "wkCCCCCCkCCCCCkw",
    "wkcccccckcccccKw".replace("K", "k"),
    "1111111111111111",
    "4444444444444444",
    "wwwwwwwwwwwwwwww",
    "wwwwwwwwwwwwwwww",
    "llllllllllllllll",
    "gggggggggggggggg",
    "kkkkkkkkkkkkkkkk",
]
T_CHAIR = [
    E,
    E,
    E,
    "....kkkkkkkk....",
    "....k222222k....",
    "....k222222k....",
    "....k222222k....",
    "....kkkkkkkk....",
    "...kggggggggk...",
    "...kglllllllgk..".replace("gk..", "k...")[:16],
    "...kggggggggk...",
    "....kkkkkkkk....",
    "......kggk......",
    ".....kkkkkk.....",
    ".....k....k.....",
    E,
]
T_COFFEE = [
    E,
    "...kkkkkkkkkk...",
    "...kggggggggk...",
    "...kgkkkkkkgk...",
    "...kgkRkkGkgk...",
    "...kgkkkkkkgk...",
    "...kggggggggk...",
    "...kggkkkkggk...",
    "...kgk....kgk...",
    "...kgk.ww.kgk...",
    "...kgkwbbwkgk...",
    "...kgkwwwwkgk...",
    "...kggggggggk...",
    "...kkkkkkkkkk...",
    "..kkkkkkkkkkkk..",
    E,
]
T_SHELF = [
    "kkkkkkkkkkkkkkkk",
    "kbbbbbbbbbbbbbbk",
    "kbRRkBBkGkyy1kbk",
    "kbRRkBBkGkyy1kbk",
    "kbRRkBBkGkyy1kbk",
    "kbbbbbbbbbbbbbbk",
    "kb1kyykRRkBkGGbk",
    "kb1kyykRRkBkGGbk",
    "kb1kyykRRkBkGGbk",
    "kbbbbbbbbbbbbbbk",
    "kbGGkRk3kBBkyykk".replace("ykk", "ybk")[:16],
    "kbGGkRk3kBBkyybk",
    "kbGGkRk3kBBkyybk",
    "kbbbbbbbbbbbbbbk",
    "kbk..........kbk",
    "kkk..........kkk",
]
T_SRVFLOOR = ["gggggggggggggggk"] * 15 + ["kkkkkkkkkkkkkkkk"]
T_SRVFLOOR[7] = "gggggggqgggggggk"

TILES = [T_FLOOR, T_RUG, T_WALLFACE, T_WALLTOP, T_DESK, T_PLANT, T_SERVER, T_TABLE, T_COUNTER,
         T_WHITEBOARD, T_DOOR, T_COUCH, T_WINDOW, T_CHAIR, T_COFFEE, T_SHELF, T_SRVFLOOR]

# ---------------------------------------------------------------- battle bits
SOUL = [
    ".kk..kk.",
    "kRRkkRRk",
    "kRwRRRRk",
    "kRRRRRRk",
    ".kRRRRk.",
    "..kRRk..",
    "...kk...",
    "........",
]
BULLET = [
    "..ww..",
    ".wwww.",
    "wwwwww",
    "wwwwww",
    ".wwww.",
    "..ww..",
]

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

SPRITES = {
    "player": PLAYER,
    "tiles": TILES,
    "soul": [SOUL],
    "bullet": [BULLET],
    **{k: [v] for k, v in ICONS.items()},
}


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


PROCEDURAL = {
    "enemy_1": _enemy_1, "enemy_2": _enemy_2, "enemy_3": _enemy_3, "boss": _boss,
    **{f"npc_{i + 1}": _npc(i) for i in range(6)},
}
