"""Default art for Data Inspector. Letters are master-palette colours (shared/sprites.py LEGEND);
digits 1-5 are the prospect's brand colours (1 primary, 2 secondary, 3 accent, 4 dark, 5 light).
Portraits are built procedurally so each persona gets a distinct face, hair and shirt."""
import random

from PIL import Image

from sprites import render

# The PostHog hedgehog inspector (24x24), same design as Bug Survivors.
HOG_BODY = [
    "........................",
    "..........k..k..........",
    ".......k.kbkkbk.k.......",
    "......kbkbbbbbbkbk......",
    ".....kbbbbobbbobbbk.....",
    "....kbbobbbbbbbbobbk....",
    "...kbbbbbbbobbbbbbbbk...",
    "..kbobbbbbbbbbbbbbttk...",
    "..kbbbbbbobbbbbbbttttk..",
    ".kbbbbbbbbbbbbbbtttttk..",
    ".kbbbobbbbbbobbttwktttk.",
    "kbbbbbbbbbbbbbbtttkkttk.",
    "kbobbbbbbbbbbbtttttttttk",
    "kbbbbbbobbbbbttttttttkkk",
    ".kbbbbbbbbbbtttttttttk..",
    ".kbbbbbbbbbtttiiitttk...",
    "..kbbbbbbbbttttttttk....",
    "...kkbbbbbbtttttttk.....",
    ".....kkkbbbbtttttk......",
    "........kkkkkkkkk......."
]
HOG_FEET = ["......kttk...kttk.......", "......kkkk...kkkk.......", "........................", "........................"]

# PostHog product icons (16x16), fixed kit art.
ICONS = {
    "icon_session_replay": [
        "................",
        "..kkkkkkkkkkkk..",
        ".kyyyyyyyyyyyyk.",
        ".kykkkkkkkkkkyk.",
        ".kykwwkwwkwwkyk.",
        ".kykkkkkkkkkkyk.",
        ".kykkkwkkkkkkyk.",
        ".kykkkwwkkkkkyk.",
        ".kykkkwwwkkkkyk.",
        ".kykkkwwkkkkkyk.",
        ".kykkkwkkkkkkyk.",
        ".kykkkkkkkkkkyk.",
        ".kyyyyyyyyyyyyk.",
        "..kkkkkkkkkkkk..",
        "....kkkkkkkk....",
        "................"
    ],
    "icon_feature_flags": [
        "................",
        "...kk...........",
        "...kGkkkkkkkk...",
        "...kGeeeeeeeGk..",
        "...kGeweeeeeeGk.",
        "...kGeeeeeeeeGk.",
        "...kGeeeeeeeGk..",
        "...kGkkkkkkkk...",
        "...kGk..........",
        "...kGk..........",
        "...kGk..........",
        "...kGk..........",
        "...kGk..........",
        "..kkkkk.........",
        "..kgggk.........",
        "................"
    ],
    "icon_experiments": [
        "................",
        ".kkkkkk..kkkkkk.",
        ".kvvvvk..kiiiik.",
        ".kvkkvk..kikkik.",
        ".kvkkvk..kikkik.",
        ".kvvvvk..kiiiik.",
        ".kvkkvk..kikkik.",
        ".kvkkvk..kiiiik.",
        ".kkkkkk..kkkkkk.",
        "................",
        "...kkkkkkkkkk...",
        "...kwwwwwwwwk...",
        "...kwkkwkwwwk...",
        "...kwwwwwwwwk...",
        "...kkkkkkkkkk...",
        "................"
    ],
    "icon_error_tracking": [
        "................",
        ".......kk.......",
        "......kRRk......",
        "......kRRk......",
        ".....kRRRRk.....",
        ".....kRwwRk.....",
        "....kRRwwRRk....",
        "....kRRwwRRk....",
        "...kRRRwwRRRk...",
        "...kRRRwwRRRk...",
        "..kRRRRRRRRRRk..",
        "..kRRRRwwRRRRk..",
        ".kRRRRRwwRRRRRk.",
        ".kRRRRRRRRRRRRk.",
        ".kkkkkkkkkkkkkk.",
        "................"
    ],
    "icon_product_analytics": [
        "................",
        ".kk.............",
        ".kk.........kk..",
        ".kk........kCCk.",
        ".kk........kCCk.",
        ".kk....kk..kCCk.",
        ".kk...kBBk.kCCk.",
        ".kk...kBBk.kCCk.",
        ".kk.kkkBBk.kCCk.",
        ".kk.kckBBk.kCCk.",
        ".kk.kckBBk.kCCk.",
        ".kk.kckBBk.kCCk.",
        ".kkkkkkkkkkkkkk.",
        ".kkkkkkkkkkkkkk.",
        "................",
        "................"
    ],
    "icon_surveys": [
        "................",
        "..kkkkkkkkkkkk..",
        ".kiiiiiiiiiiiik.",
        ".kiwwwwwwwwwwik.",
        ".kiwkkkkkkkkwik.",
        ".kiwwwwwwwwwwik.",
        ".kiwkkkkkwwwwik.",
        ".kiwwwwwwwwwwik.",
        ".kiiiiiiiiiiiik.",
        "..kkkkkiikkkkk..",
        "......kiik......",
        "......kik.......",
        "......kk........",
        "................",
        "................",
        "................"
    ]
}


def hog_frames():
    a = HOG_BODY + HOG_FEET
    b = ["." * 24] + HOG_BODY[:-1] + HOG_FEET  # bob one pixel while stamping
    # Blink on the second frame: the eye row loses its highlight.
    b = [r.replace("twk", "tkk") for r in b]
    return [a, b]


STAMP_OK = [
    "................",
    ".....kkkkkk.....",
    "...kkGGGGGGkk...",
    "..kGGGGGGGGGGk..",
    "..kGGGGGGGGwwk..",
    ".kGGGGGGGGwwwGk.",
    ".kGGGGGGGwwwGGk.",
    ".kGGwwGGwwwGGGk.",
    ".kGGwwwwwwGGGGk.",
    ".kGGGwwwwGGGGGk.",
    ".kGGGGwwGGGGGGk.",
    "..kGGGGGGGGGGk..",
    "..kdGGGGGGGGdk..",
    "...kkddddddkk...",
    ".....kkkkkk.....",
    "................",
]

STAMP_FLAG = [
    "................",
    ".....kkkkkk.....",
    "...kkRRRRRRkk...",
    "..kRRRRRRRRRRk..",
    "..kRwwRRRRwwRk..",
    ".kRRwwwRRwwwRRk.",
    ".kRRRwwwwwwRRRk.",
    ".kRRRRwwwwRRRRk.",
    ".kRRRRwwwwRRRRk.",
    ".kRRRwwwwwwRRRk.",
    ".kRRwwwRRwwwRRk.",
    "..kRwwRRRRwwRk..",
    "..krRRRRRRRRrk..",
    "...kkrrrrrrkk...",
    ".....kkkkkk.....",
    "................",
]


def portrait(skin, hair, style, shirt, glasses=False, mouth_open=False, tie=None, blush=True):
    """A 32x32 bust: shoulders in `shirt`, head ellipse in `skin`, a hair style, then a 1px outline."""
    W = 32
    c = [["." for _ in range(W)] for _ in range(W)]
    cx, cy, rx, ry = 15.5, 13.5, 7.2, 8.2

    def ell(x, y, a, b, x0=cx, y0=cy):
        return ((x - x0) / a) ** 2 + ((y - y0) / b) ** 2 <= 1

    for y in range(24, 32):  # shoulders
        spread = 7 + (y - 24)
        for x in range(W):
            if abs(x - cx) <= spread + 0.5:
                c[y][x] = shirt
    for y in range(20, 25):  # neck
        for x in range(13, 19):
            c[y][x] = skin
    for y, (x0, x1) in zip((24, 25, 26), ((13, 18), (14, 17), (15, 16))):  # V collar
        for x in range(x0, x1 + 1):
            c[y][x] = skin
    if tie:
        for y in range(26, 32):
            for x in (15, 16):
                c[y][x] = tie
        c[31][14] = c[31][17] = tie
    for y in range(W):
        for x in range(W):
            if ell(x, y, rx, ry):
                c[y][x] = skin
    for y in (13, 14, 15):  # ears
        c[y][8] = c[y][23] = skin

    def hair_at(x, y):
        if style == "short":
            return ell(x, y, rx + 1, ry + 1) and (y < cy - 3 or (y < cy and abs(x - cx) > rx - 1.5))
        if style == "long":
            top = ell(x, y, rx + 1.5, ry + 1.5) and (y < cy - 3 or abs(x - cx) > rx - 1.2)
            side = cy - 3 <= y <= 25 and rx - 1.2 < abs(x - cx) <= rx + 2
            return top or side
        if style == "curly":
            base = ell(x, y, rx + 1.8, ry + 1.6) and (y < cy - 2 or (y < cy + 2 and abs(x - cx) > rx - 1.5))
            fringe = ell(x, y, rx + 2.8, ry + 2.6) and y < cy - 1 and (x + y) % 2 == 0 and not ell(x, y, rx + 1.8, ry + 1.6)
            return base or fringe
        if style == "bun":
            return (ell(x, y, rx + 1, ry + 1) and y < cy - 3) or ell(x, y, 3.3, 3, 15.5, 3.2)
        if style == "cap":
            return (ell(x, y, rx + 1, ry + 1) and y < cy - 3) or (y == int(cy - 3) and cx - 2 < x < cx + 11)
        return False

    for y in range(W):
        for x in range(W):
            if hair_at(x, y):
                c[y][x] = hair
    brow = hair if style != "cap" else "k"
    for x in (11, 12, 13, 18, 19, 20):
        c[11][x] = brow
    for y in (13, 14):
        c[y][12] = c[y][19] = "k"
    if blush:
        c[16][11] = c[16][20] = "i"
    if mouth_open:
        for x in range(14, 18):
            c[18][x] = "k"
            c[19][x] = "m"
        c[20][15] = c[20][16] = "k"
    else:
        c[18][14] = c[18][17] = "k"
        c[19][15] = c[19][16] = "k"
    if glasses:
        for (x0, x1) in ((10, 14), (17, 21)):
            for x in range(x0, x1 + 1):
                c[12][x] = c[15][x] = "k"
            for y in (12, 13, 14, 15):
                c[y][x0] = c[y][x1] = "k"
        c[13][15] = c[13][16] = "k"
    # Outline: any empty pixel touching a filled one.
    filled = [[v != "." for v in row] for row in c]
    for y in range(W):
        for x in range(W):
            if filled[y][x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < W and filled[ny][nx]:
                    c[y][x] = "k"
                    break
    return ["".join(r) for r in c]


PERSONAS = [
    dict(skin="t", hair="b", style="short", shirt="1"),
    dict(skin="a", hair="r", style="long", shirt="3"),
    dict(skin="o", hair="k", style="curly", shirt="B"),
    dict(skin="b", hair="g", style="bun", shirt="G", glasses=True),
]


def _persona(i):
    return lambda pal: [render(portrait(**PERSONAS[i]), pal)]


def _manager(pal):
    base = dict(skin="t", hair="y", style="short", shirt="n", glasses=True, tie="1", blush=False)
    return [render(portrait(**base), pal), render(portrait(mouth_open=True, **base), pal)]


def _desk(pal):
    """32x32 wooden desk top: planks with grain, in warm browns."""
    rnd = random.Random(3)
    rows = []
    for y in range(32):
        if y % 8 == 7:
            rows.append("k" * 32)
            continue
        r = ["b"] * 32
        for x in range(32):
            if rnd.random() < 0.05:
                r[x] = "o"
        if y % 8 in (2, 5):
            s = rnd.randrange(0, 20)
            for x in range(s, s + rnd.randrange(5, 12)):
                r[x % 32] = "o"
        rows.append("".join(r))
    return [render(rows, pal)]


SPRITES = {
    "inspector": hog_frames(),
    "stamp_ok": [STAMP_OK],
    "stamp_flag": [STAMP_FLAG],
    **{k: [v] for k, v in ICONS.items()},
}

PROCEDURAL = {
    "manager": _manager,
    "desk": _desk,
    **{f"persona_{i + 1}": _persona(i) for i in range(4)},
}
