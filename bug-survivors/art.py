"""Default art for Bug Survivors. Letters are master-palette colours (shared/sprites.py LEGEND);
digits 1-5 are the prospect's brand colours (1 primary, 2 secondary, 3 accent, 4 dark, 5 light)."""
import random

from PIL import Image, ImageDraw

from sprites import rgb, LEGEND

# The PostHog-style hedgehog, facing right. Body rows are shared; feet alternate for the walk.
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
    "........kkkkkkkkk.......",
]
HOG_FEET = [
    ["......kttk...kttk.......", "......kkkk...kkkk.......", "........................", "........................"],
    [".....kttk.....kttk......", ".....kkkk.....kkkk......", "........................", "........................"],
    ["......kttk...kttk.......", "......kkkk...kkkk.......", "........................", "........................"],
    [".......kttk.kttk........", ".......kkkk.kkkk........", "........................", "........................"],
]


def hog_frame(i):
    body = HOG_BODY if i % 2 == 0 else ["." * 24] + HOG_BODY[:-1]  # bob one pixel
    rows = body + HOG_FEET[i]
    return rows[:20] + HOG_FEET[i] if len(rows) != 24 else rows


# Bugs: 16x16, two frames (legs/wings move). 1 = brand primary so defaults carry the prospect colour.
BEETLE = [
    [
        "................",
        "....k......k....",
        ".....k....k.....",
        "......kkkk......",
        ".....k4444k.....",
        "..k.k414414k.k..",
        "...kk111111kk...",
        "....k115511k....",
        "..kkk111111kkk..",
        "....k141141k....",
        "...kk111111kk...",
        "..k.k414414k.k..",
        ".....k1111k.....",
        "......kkkk......",
        "................",
        "................",
    ],
    [
        "................",
        "...k........k...",
        "....k......k....",
        "......kkkk......",
        ".....k4444k.....",
        ".k..k414414k..k.",
        "..kkk111111kkk..",
        "....k115511k....",
        "...kk111111kk...",
        "..k.k141141k.k..",
        "....k111111k....",
        ".k.kk414414kk.k.",
        ".....k1111k.....",
        "......kkkk......",
        "................",
        "................",
    ],
]

FLY = [
    [
        "................",
        "..kkk......kkk..",
        ".kCCCk....kCCCk.",
        ".kCwCCk..kCCwCk.",
        "..kCCCkkkkCCCk..",
        "...kkk5555kkk...",
        "....k5wk5wk5k...",
        "....k5kk5kk5k...",
        "....k555555k....",
        ".....k3535k.....",
        ".....k5353k.....",
        "......k33k......",
        ".......kk.......",
        "................",
        "................",
        "................",
    ],
    [
        "................",
        "................",
        "................",
        "..kkkk....kkkk..",
        ".kCCCCkkkkCCCCk.",
        ".kCwCk5555kCwCk.",
        "..kkkk5wk5wkkk..",
        "....k5kk5kk5k...",
        "....k555555k....",
        ".....k3535k.....",
        ".....k5353k.....",
        "......k33k......",
        ".......kk.......",
        "................",
        "................",
        "................",
    ],
]

MOTH = [
    [
        "................",
        "......k..k......",
        ".......kk.......",
        ".kkk..k33k..kkk.",
        "k353kk3333kk353k",
        "k5335k3wk3k5335k",
        "k33533kk33k33533",
        "k353333333333353",
        ".k3355k33k5533k.",
        "..k335k33k533k..",
        "...kkk3333kkk...",
        "......k33k......",
        "......k33k......",
        ".......kk.......",
        "................",
        "................",
    ],
    [
        "................",
        "......k..k......",
        ".......kk.......",
        "......k33k......",
        "..kkkk3333kkkk..",
        ".k3553k3wk35535k",
        ".k3335kkk3k5333k",
        "..k33333333333k.",
        "...kk53k33k35kk.",
        ".....k3k33k3k...",
        "......k3333k....",
        "......k33k......",
        "......k33k......",
        ".......kk.......",
        "................",
        "................",
    ],
]

GEM = [[
    "...kk...",
    "..kCck..",
    ".kCwcck.",
    "kCcccBBk",
    "kccBBBnk",
    ".kcBBnk.",
    "..kBnk..",
    "...kk...",
]]

ORB = [[
    "..kkkk..",
    ".kYYyyk.",
    "kYwYyyOk",
    "kYYyyyOk",
    "kyyyyOOk",
    "kyyyOOOk",
    ".kyOOOk.",
    "..kkkk..",
]]

SHOT = [[
    ".kkkk.",
    "kvVVVk",
    "kVwvVk",
    "kVvvVk",
    "kVVVVk",
    ".kkkk.",
]]

HOMING = [[
    "..kkk...",
    ".kRRRk..",
    "kRswRRkk",
    "kRRRRRsk",
    "kRRRRRsk",
    "kRRRRRkk",
    ".kRRRk..",
    "..kkk...",
]]

BOSS_SHOT = [[
    ".kkkk.",
    "kPIIPk",
    "kIwIPk",
    "kIIPPk",
    "kPPPpk",
    ".kkkk.",
]]

FLAG = [[
    "kk..........",
    "kGkkkkkk....",
    "kGeeeeeGk...",
    "kGeweeeeGk..",
    "kGeeeeeeGk..",
    "kGeeeeeGk...",
    "kGkkkkkk....",
    "kGk.........",
    "kGk.........",
    "kGk.........",
    "kGk.........",
    "kGk.........",
    "kGk.........",
    "kGk.........",
    "kkkk........",
    "kggk........",
]]

# Product icons (16x16), drawn once in PostHog-ish colours; never regenerated per prospect.
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
        "................",
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
        "................",
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
        "................",
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
        "................",
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
        "................",
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
        "................",
    ],
    "icon_speed": [
        "................",
        "........kkkk....",
        ".......kYYYk....",
        "......kYYYk.....",
        ".....kYYYk......",
        "....kYYYkkkk....",
        "...kYYYYYYYk....",
        "...kkkkYYYk.....",
        "......kYYk......",
        ".....kYYk.......",
        "....kYYk........",
        "....kYk.........",
        "....kk..........",
        "................",
        "................",
        "................",
    ],
    "icon_magnet": [
        "................",
        "...kkkk..kkkk...",
        "...kwwk..kwwk...",
        "...kRRk..kBBk...",
        "...kRRk..kBBk...",
        "...kRRk..kBBk...",
        "...kRRkkkkBBk...",
        "...kRRRRBBBBk...",
        "....kRRRBBBk....",
        ".....kkkkkk.....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "icon_maxhp": [
        "................",
        "................",
        "...kkk...kkk....",
        "..kRRRk.kRRRk...",
        ".kRwwRRkRRRRRk..",
        ".kRwRRRRRRRRRk..",
        ".kRRRRRRRRRRRk..",
        "..kRRRRRRRRRk...",
        "...kRRRRRRRk....",
        "....kRRRRRk.....",
        ".....kRRRk......",
        "......kRk.......",
        ".......k........",
        "................",
        "................",
        "................",
    ],
    "icon_cooldown": [
        "................",
        ".....kkkkkk.....",
        "....kccccccK....",
        "...kcwwwwwwck...",
        "..kcwwwkwwwwck..",
        "..kcwwwkwwwwck..",
        "..kcwwwkwwwwck..",
        "..kcwwwkkkkwck..",
        "..kcwwwwwwwwck..",
        "..kcwwwwwwwwck..",
        "...kcwwwwwwck...",
        "....kcccccck....",
        ".....kkkkkk.....",
        "................",
        "................",
        "................",
    ],
}
ICONS["icon_cooldown"] = [r.replace("K", "k") for r in ICONS["icon_cooldown"]]

SPRITES = {
    "player": [hog_frame(i) for i in range(4)],
    "enemy_1": FLY,
    "enemy_2": BEETLE,
    "enemy_3": MOTH,
    "gem": GEM,
    "orb": ORB,
    "shot": SHOT,
    "homing": HOMING,
    "boss_shot": BOSS_SHOT,
    "flag": FLAG,
    **{k: [v] for k, v in ICONS.items()},
}


def _boss(pal):
    """A 64x64 two-frame 'monolith bug': a big armoured beetle in the brand's dark and primary colours."""
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        k, dark, prim, light, acc = rgb("#000000"), rgb(pal["4"]), rgb(pal["1"]), rgb(pal["5"]), rgb(pal["3"])
        leg = 2 if f else -2
        for i, y in enumerate((26, 36, 46)):
            dy = leg if i % 2 else -leg
            d.line([(14, y), (3, y + dy - 4), (1, y + dy + 4)], fill=k, width=3)
            d.line([(49, y), (60, y - dy - 4), (62, y - dy + 4)], fill=k, width=3)
        d.ellipse([10, 14, 53, 60], fill=k)
        d.ellipse([12, 16, 51, 58], fill=dark)
        d.ellipse([14, 18, 49, 54], fill=prim)
        d.line([(32, 18), (32, 58)], fill=k, width=2)  # wing-case split
        for (x, y) in ((22, 28), (41, 28), (20, 42), (43, 42), (31, 50)):
            d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=dark)
        d.ellipse([18, 21, 26, 29], fill=light)
        d.ellipse([19, 4, 44, 22], fill=k)  # head
        d.ellipse([21, 6, 42, 20], fill=dark)
        eye = acc if f == 0 else rgb("#fcfcfc")
        d.rectangle([24, 10, 28, 14], fill=eye)
        d.rectangle([35, 10, 39, 14], fill=eye)
        d.rectangle([26, 12, 27, 13], fill=k)
        d.rectangle([37, 12, 38, 13], fill=k)
        d.line([(24, 5), (17, 0 + f)], fill=k, width=2)
        d.line([(39, 5), (46, 0 + f)], fill=k, width=2)
        frames.append(im)
    return frames


def _tile(pal):
    """32x32 arena floor: near-black with a faint dotted grid in a dark brand shade, so sprites pop."""
    base = rgb("#000000")
    line = rgb(pal["4"])
    im = Image.new("RGBA", (32, 32), base + (255,))
    for i in range(0, 32, 2):
        im.putpixel((i, 0), line + (255,))
        im.putpixel((0, i), line + (255,))
    rnd = random.Random(7)
    for _ in range(3):
        im.putpixel((rnd.randrange(4, 29), rnd.randrange(4, 29)), rgb(pal["2"]) + (255,))
    return [im]


PROCEDURAL = {"boss": _boss, "tile": _tile}
