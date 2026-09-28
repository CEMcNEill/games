"""Default art for Hogtopia. Letters are master-palette colours (shared/sprites.py LEGEND); digits 1-5 are
the prospect brand colours. Terrain, cities, units and UI are fixed kit art; the rival leader and the
prospect HQ can be replaced per prospect by Flux."""
# Product icons copied from bug-survivors / hog-quest art (16x16).
ICONS = {
    'icon_session_replay': [
        '................',
        '..kkkkkkkkkkkk..',
        '.kyyyyyyyyyyyyk.',
        '.kykkkkkkkkkkyk.',
        '.kykwwkwwkwwkyk.',
        '.kykkkkkkkkkkyk.',
        '.kykkkwkkkkkkyk.',
        '.kykkkwwkkkkkyk.',
        '.kykkkwwwkkkkyk.',
        '.kykkkwwkkkkkyk.',
        '.kykkkwkkkkkkyk.',
        '.kykkkkkkkkkkyk.',
        '.kyyyyyyyyyyyyk.',
        '..kkkkkkkkkkkk..',
        '....kkkkkkkk....',
        '................',
    ],
    'icon_feature_flags': [
        '................',
        '...kk...........',
        '...kGkkkkkkkk...',
        '...kGeeeeeeeGk..',
        '...kGeweeeeeeGk.',
        '...kGeeeeeeeeGk.',
        '...kGeeeeeeeGk..',
        '...kGkkkkkkkk...',
        '...kGk..........',
        '...kGk..........',
        '...kGk..........',
        '...kGk..........',
        '...kGk..........',
        '..kkkkk.........',
        '..kgggk.........',
        '................',
    ],
    'icon_experiments': [
        '................',
        '.kkkkkk..kkkkkk.',
        '.kvvvvk..kiiiik.',
        '.kvkkvk..kikkik.',
        '.kvkkvk..kikkik.',
        '.kvvvvk..kiiiik.',
        '.kvkkvk..kikkik.',
        '.kvkkvk..kiiiik.',
        '.kkkkkk..kkkkkk.',
        '................',
        '...kkkkkkkkkk...',
        '...kwwwwwwwwk...',
        '...kwkkwkwwwk...',
        '...kwwwwwwwwk...',
        '...kkkkkkkkkk...',
        '................',
    ],
    'icon_error_tracking': [
        '................',
        '.......kk.......',
        '......kRRk......',
        '......kRRk......',
        '.....kRRRRk.....',
        '.....kRwwRk.....',
        '....kRRwwRRk....',
        '....kRRwwRRk....',
        '...kRRRwwRRRk...',
        '...kRRRwwRRRk...',
        '..kRRRRRRRRRRk..',
        '..kRRRRwwRRRRk..',
        '.kRRRRRwwRRRRRk.',
        '.kRRRRRRRRRRRRk.',
        '.kkkkkkkkkkkkkk.',
        '................',
    ],
    'icon_product_analytics': [
        '................',
        '.kk.............',
        '.kk.........kk..',
        '.kk........kCCk.',
        '.kk........kCCk.',
        '.kk....kk..kCCk.',
        '.kk...kBBk.kCCk.',
        '.kk...kBBk.kCCk.',
        '.kk.kkkBBk.kCCk.',
        '.kk.kckBBk.kCCk.',
        '.kk.kckBBk.kCCk.',
        '.kk.kckBBk.kCCk.',
        '.kkkkkkkkkkkkkk.',
        '.kkkkkkkkkkkkkk.',
        '................',
        '................',
    ],
    'icon_surveys': [
        '................',
        '..kkkkkkkkkkkk..',
        '.kiiiiiiiiiiiik.',
        '.kiwwwwwwwwwwik.',
        '.kiwkkkkkkkkwik.',
        '.kiwwwwwwwwwwik.',
        '.kiwkkkkkwwwwik.',
        '.kiwwwwwwwwwwik.',
        '.kiiiiiiiiiiiik.',
        '..kkkkkiikkkkk..',
        '......kiik......',
        '......kik.......',
        '......kk........',
        '................',
        '................',
        '................',
    ],
    'icon_data_warehouse': [
        '................',
        '....kkkkkkkk....',
        '..kkCCCCCCCCkk..',
        '.kCCwwwwwwwwCCk.',
        '.kkCCCCCCCCCCkk.',
        '.kcckkkkkkkkcck.',
        '.kccccccccccccc.',
        '.kkccccccccccckk',
        '.kcckkkkkkkkcck.',
        '.kccccccccccccc.',
        '.kkccccccccccckk',
        '.kcckkkkkkkkcck.',
        '.kcccccccccccck.',
        '..kkcccccccckk..',
        '....kkkkkkkk....',
        '................',
    ],
}

# The hedgehog (24x24, facing right), from bug-survivors.
HOG = [
    '........................',
    '..........k..k..........',
    '.......k.kbkkbk.k.......',
    '......kbkbbbbbbkbk......',
    '.....kbbbbobbbobbbk.....',
    '....kbbobbbbbbbbobbk....',
    '...kbbbbbbbobbbbbbbbk...',
    '..kbobbbbbbbbbbbbbttk...',
    '..kbbbbbbobbbbbbbttttk..',
    '.kbbbbbbbbbbbbbbtttttk..',
    '.kbbbobbbbbbobbttwktttk.',
    'kbbbbbbbbbbbbbbtttkkttk.',
    'kbobbbbbbbbbbbtttttttttk',
    'kbbbbbbobbbbbttttttttkkk',
    '.kbbbbbbbbbbtttttttttk..',
    '.kbbbbbbbbbtttiiitttk...',
    '..kbbbbbbbbttttttttk....',
    '...kkbbbbbbtttttttk.....',
    '.....kkkbbbbtttttk......',
    '........kkkkkkkkk.......',
    '......kttk...kttk.......',
    '......kkkk...kkkk.......',
    '........................',
    '........................',
]


import random

from PIL import Image, ImageDraw

from sprites import rgb, snap, dist, shade

BIOMES = ["meadow", "desert", "tundra", "circuit"]
# Terrain sheet: 8 frames per biome.
T_PLAIN, T_PLAIN2, T_FOREST, T_MOUNTAIN, T_WATER, T_WATER2, T_RUINS, T_FOG = range(8)

BIOME_COLS = {
    #          plain      speck      canopy     canopy-lt  trunk      rock       rock-lt    peak       water      water-lt
    "meadow": ["#007800", "#00b800", "#005800", "#58d854", "#503000", "#7c7c7c", "#bcbcbc", "#fcfcfc", "#0058f8", "#3cbcfc"],
    "desert": ["#f8d878", "#fca044", "#007800", "#58d854", "#ac7c00", "#ac7c00", "#fca044", "#f8d878", "#008888", "#00e8d8"],
    "tundra": ["#bcbcbc", "#fcfcfc", "#004058", "#008888", "#503000", "#7c7c7c", "#bcbcbc", "#fcfcfc", "#0000bc", "#3cbcfc"],
    "circuit": ["#004058", "#008888", "#7c7c7c", "#bcbcbc", "#000000", "#4428bc", "#9878f8", "#00e8d8", "#000000", "#0058f8"],
}


def rival_colour(pal):
    """The rival's team colour: the candidate that differs most from the prospect's primary."""
    cands = ["#940084", "#a80020", "#4428bc", "#7c7c7c"]
    return max(cands, key=lambda c: dist(c, pal["1"]))


def _terrain(pal):
    frames = []
    for bi, b in enumerate(BIOMES):
        c = [rgb(x) + (255,) for x in BIOME_COLS[b]]
        k = (0, 0, 0, 255)
        rnd = random.Random(bi * 17 + 3)
        for f in range(8):
            im = Image.new("RGBA", (16, 16), c[0])
            d = ImageDraw.Draw(im)
            if f in (T_PLAIN, T_PLAIN2, T_RUINS, T_FOREST, T_MOUNTAIN):
                for _ in range(5 if f != T_PLAIN2 else 8):
                    im.putpixel((rnd.randrange(1, 15), rnd.randrange(1, 15)), c[1])
                if b == "circuit":
                    d.line([(0, 8), (5, 8), (8, 5), (15, 5)], fill=c[1])
            if f == T_FOREST:
                for (x, y) in ((4, 5), (11, 4), (7, 11)):
                    if b == "circuit":  # server racks
                        d.rectangle([x - 2, y - 3, x + 2, y + 3], fill=c[2], outline=k)
                        im.putpixel((x - 1, y - 1), c[7]); im.putpixel((x + 1, y + 1), (248, 56, 0, 255))
                        continue
                    d.rectangle([x, y + 2, x, y + 4], fill=c[4])
                    d.polygon([(x - 3, y + 2), (x, y - 4), (x + 3, y + 2)], fill=c[2], outline=k)
                    im.putpixel((x - 1, y - 1), c[3])
            if f == T_MOUNTAIN:
                d.polygon([(1, 14), (7, 2), (14, 14)], fill=c[5], outline=k)
                d.polygon([(5, 6), (7, 2), (9, 6)], fill=c[7])
                d.line([(8, 5), (11, 13)], fill=c[6])
            if f in (T_WATER, T_WATER2):
                im = Image.new("RGBA", (16, 16), c[8])
                d = ImageDraw.Draw(im)
                off = 0 if f == T_WATER else 3
                for y in (3, 9, 14):
                    x = (y * 5 + off) % 12
                    d.line([(x, y), (x + 3, y)], fill=c[9])
            if f == T_RUINS:
                g, lt = (124, 124, 124, 255), (188, 188, 188, 255)
                d.rectangle([2, 7, 5, 14], fill=g, outline=k)
                d.rectangle([10, 4, 13, 14], fill=g, outline=k)
                d.rectangle([5, 11, 10, 14], fill=g, outline=k)
                im.putpixel((11, 6), lt); im.putpixel((3, 9), lt)
                d.rectangle([7, 8, 8, 9], fill=(60, 188, 252, 255))  # glowing data shard
            if f == T_FOG:
                im = Image.new("RGBA", (16, 16), (0, 0, 0, 255))
                for (x, y) in ((3, 4), (11, 9), (7, 13)):
                    im.putpixel((x, y), (40, 40, 60, 255))
            frames.append(im)
    return frames


def _res(pal):
    """Resource overlays: data crystal (plain), berries (forest), fish (water)."""
    out = []
    k = "#000000"
    crystal = ["................", "................", "................", "................",
               "......kk........", ".....kCck.kk....", ".....kcBkkcCk...", "....kCcBkkcBk...",
               "....kcBnk.kBk...", ".....kBk..kk....", "......k.........", "................",
               "................", "................", "................", "................"]
    berries = ["................", "................", "................", "................",
               "................", "................", "................", "................",
               "................", ".........kk.....", "....kk..kRRk....", "...kRRk.kRsk....",
               "...kRsk..kk.kk..", "....kk.....kRRk.", "...........kRsk.", "............kk.."]
    fish = ["................", "................", "................", "................",
            "................", "................", "................", "..........kkk...",
            ".....kkkkkaaak..", "....kaawaaaaak..", "k..kaaaaaaaaak..", "kkkaaaaaaaaak...",
            "k..kaaaaaaak....", "....kkkkkkk.....", "................", "................"]
    from sprites import render
    for g in (crystal, berries, fish):
        out.append(render(g, pal))
    return out


def _city(pal):
    """0 neutral village, 1-3 player city lvl1-3, 4-6 rival lvl1-3, 7 capital crown overlay."""
    riv = rgb(rival_colour(pal)) + (255,)
    team = rgb(pal["1"]) + (255,)
    k, wall, lt, win = (0, 0, 0, 255), (240, 208, 176, 255), (252, 252, 252, 255), (248, 216, 120, 255)
    frames = []

    def house(d, x, y, w, h, roof, wallc=wall):
        d.rectangle([x, y, x + w, y + h], fill=wallc, outline=k)
        d.polygon([(x - 1, y), (x + w // 2, y - 4), (x + w + 1, y)], fill=roof, outline=k)
        d.point((x + w // 2, y + h // 2), fill=win)

    for owner, roof in (("n", (172, 124, 0, 255)), ("p", team), ("r", riv)):
        levels = [1] if owner == "n" else [1, 2, 3]
        for lvl in levels:
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            if owner == "r":
                # Rival: dark boxy server blocks with glowing slits.
                blocks = [(2, 7, 5, 8), (9, 4, 5, 11)][:1 + (lvl > 1)] + ([(6, 9, 4, 6)] if lvl > 2 else [])
                for (x, y, w, h) in blocks:
                    d.rectangle([x, y, x + w, y + h], fill=roof, outline=k)
                    d.line([(x + 1, y + 2), (x + w - 1, y + 2)], fill=(248, 56, 0, 255))
                    d.line([(x + 1, y + 4), (x + w - 1, y + 4)], fill=(80, 80, 80, 255))
            else:
                if lvl >= 1:
                    house(d, 2, 9, 5, 5, roof)
                if lvl >= 2 or owner == "n":
                    house(d, 9, 8, 5, 6, roof)
                if lvl >= 3:
                    d.rectangle([6, 2, 10, 13], fill=lt, outline=k)  # tower
                    for yy in (4, 7, 10):
                        d.point((8, yy), fill=team)
            frames.append(im)
    crown = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(crown)
    d.polygon([(4, 3), (4, 0), (6, 2), (8, 0), (10, 2), (12, 0), (12, 3)], fill=(248, 184, 0, 255), outline=k)
    frames.append(crown)
    return frames


BODY = [
    "................",
    "................",
    "......kkkk......",
    ".....kbbbbk.....",
    ".....ktttbk.....",
    ".....ktktkk.....",
    ".....ktttk......",
    "......kkk.......",
    ".....k111k......",
    "....k11111k.....",
    "....kt111tk.....",
    ".....k444k......",
    ".....k4k4k......",
    ".....k4k4k......",
    ".....kk.kk......",
    "................",
]
PROPS = {
    "scout": [  # cap, running legs
        "................", "................", ".....kkkk.......", "....k1111kkk....", "................",
        "................", "................", "................", "................", "................",
        "................", "................", "....k4k.k4k.....", "...kk4k..k4k....", "...kk.....kk....", "................"],
    "warrior": [  # hard hat + wrench
        "................", "......kkkk......", ".....kyyyyk.....", "....kyyyyyyk....", "................",
        "................", "............kk..", "...........klk..", "...........klk..", "..........kllk..",
        "..........kkk...", "................", "................", "................", "................", "................"],
    "archer": [  # glasses + laptop chart
        "................", "................", "................", "................", "................",
        ".....kkwkwk.....", "................", "................", "..........kkkkk.", ".........kwwwwwk",
        ".........kwBwcwk", ".........kBBcBwk", "..........kkkkk.", "................", "................", "................"],
    "defender": [  # helmet + flag shield
        "................", "......kkkk......", ".....klllk......", "................", "................",
        "................", "..kkkkk.........", ".kGGGGGk........", ".kGkkkGk........", ".kGkeeGk........",
        ".kGkGGGk........", ".kGGGGGk........", "..kGGGk.........", "...kkk..........", "................", "................"],
    "catcher": [  # bug net
        "..........kkkk..", ".........kwlwlk.", ".........klwlwk.", "..........kkkk..", "...........kok..",
        "...........kok..", "...........kok..", "..........kok...", "..........kok...", "................",
        "................", "................", "................", "................", "................", "................"],
}
UNIT_TYPES = ["scout", "warrior", "archer", "defender", "catcher"]


def _overlay(base, prop):
    return ["".join(p if p != "." else b for b, p in zip(br, pr)) for br, pr in zip(base, prop)]


def _units(pal):
    from sprites import render
    riv = rival_colour(pal)
    rpal = dict(pal, **{"1": riv, "4": shade(riv, 0.55)})
    frames = []
    for team in ("p", "r"):
        for u in UNIT_TYPES:
            rows = _overlay(BODY, PROPS[u])
            if team == "r":  # rival units are grey-skinned bots with glowing eyes
                rows = [r.replace("t", "l").replace("b", "g") for r in rows]
                rows[5] = rows[5][:6] + "R" + rows[5][7:8] + "R" + rows[5][9:]
            frames.append(render(rows, pal if team == "p" else rpal))
    return frames


def _hq(pal):
    """Default HQ: a brand-coloured office tower with a hedgehog flag."""
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k, team, dark, acc = (0, 0, 0, 255), rgb(pal["1"]) + (255,), rgb(pal["4"]) + (255,), rgb(pal["3"]) + (255,)
    d.rectangle([7, 9, 24, 31], fill=team, outline=k)
    d.rectangle([3, 18, 28, 31], fill=dark, outline=k)
    for y in range(12, 30, 4):
        for x in range(10, 23, 4):
            d.rectangle([x, y, x + 1, y + 1], fill=acc)
    d.rectangle([14, 26, 17, 31], fill=k)
    d.line([(16, 1), (16, 9)], fill=k)
    d.rectangle([17, 1, 22, 4], fill=acc, outline=k)
    return [im]


def _rival(pal):
    """Default rival leader: a looming monolith with angry eyes, in the rival colour."""
    riv = rgb(rival_colour(pal)) + (255,)
    dark = rgb(shade(rival_colour(pal), 0.55)) + (255,)
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = (0, 0, 0, 255)
    d.rectangle([6, 2, 25, 31], fill=riv, outline=k)
    d.rectangle([8, 4, 23, 29], fill=dark)
    d.polygon([(9, 10), (15, 12), (9, 14)], fill=(248, 56, 0, 255))
    d.polygon([(22, 10), (16, 12), (22, 14)], fill=(248, 56, 0, 255))
    d.line([(11, 21), (20, 21)], fill=k, width=2)
    for y in (6, 26):
        d.line([(9, y), (22, y)], fill=(124, 124, 124, 255))
    return [im]


def _advisor(pal):
    from sprites import render
    return [render(HOG, pal)]


def _star(pal):
    from sprites import render
    return [render([
        "...kk...",
        "..kyyk..",
        "kkkyYkkk",
        "kyyYYyyk",
        ".kyyyyk.",
        ".kyykyyk",
        "kyyk.kyk",
        "kkk...kk",
    ], pal)]


GIANT = [
    "....kkkkkkkk....",
    "...kbbbbbbbbk...",
    "...kbttttttbk...",
    "...kttkttkttk...",
    "...kttttttttk...",
    "....kttkkttk....",
    "..kkk111111kkk..",
    ".k1111111111111k",
    ".k11k111111k111k",
    ".k1kk111111kk11k",
    ".ktk.k1111k.ktk.",
    ".kk..k4444k..kk.",
    ".....k44k44k....",
    ".....k44kk44k...",
    "....kkkk.kkkk...",
    "................",
]


def _extra(pal):
    """Fixed kit art: 0 giant (yours), 1 giant (rival), 2 boat hull, 3 monument, 4 city wall, 5 park,
    6 veteran chevron, 7 rival-turn marker (skull-ish bug)."""
    from sprites import render
    riv = rival_colour(pal)
    rpal = dict(pal, **{"1": riv, "4": shade(riv, 0.55)})
    rival_giant = [r.replace("t", "l").replace("b", "g") for r in GIANT]
    rival_giant[3] = "...kllRllRllk..."
    frames = [render(GIANT, pal), render(rival_giant, rpal)]
    frames.append(render([
        "................", "................", "................", "................", "................",
        "................", "................", "................", "................", "................",
        "k..............k", "kbbbbbbbbbbbbbbk", ".kboooooooooobk.", "..kbbbbbbbbbbk..", "...kkkkkkkkkk...", "................"], pal))
    frames.append(render([
        ".......kk.......", "......k33k......", "......k33k......", ".......kk.......", "......kwwk......",
        ".....kwllwk.....", ".....kwllwk.....", ".....kwllwk.....", ".....kwllwk.....", "....kwwllwwk....",
        "....kwllllwk....", "...kwwllllwwk...", "...kwllllllwk...", "..kkkkkkkkkkkk..", "..k1111111111k..", "..kkkkkkkkkkkk.."], pal))
    frames.append(render([
        "kkk.kkk..kkk.kkk", "kgk.kgk..kgk.kgk", "kgkkkgkkkkgkkkgk", "kglglglglglglglk", "kkkkkkkkkkkkkkkk",
        "k..............k", "................", "................", "................", "................",
        "................", "................", "................", "................", "................", "................"], pal))
    frames.append(render([
        "................", "......kkkk......", ".....keeeek.....", "....keeGeeek....", "....keGeeeek....", ".....keeeek.....",
        "......kbbk......", "..kk...kbk...kk.", ".keek..kbk..keek", ".kGek..kbk..kGek", "..kk...kbk...kk.",
        "...k..kkkkk..k..", "..kyk.......kIk.", "...k.........k..", "................", "................"], pal))
    frames.append(render([
        "kkkkkk..........", "kyyyyk..........", "kykkyk..........", "kk..kk..........", "kkkkkk..........",
        "kyyyyk..........", "kykkyk..........", "kk..kk..........", "................", "................",
        "................", "................", "................", "................", "................", "................"], pal))
    frames.append(render([
        "................", "................", "...kk......kk...", "..kRRk....kRRk..", "...kRRkkkkRRk...", "....kRRRRRRk....",
        "...kRRkRRkRRk...", "...kRRRRRRRRk...", "....kRkRRkRk....", "...kRk.kk.kRk...", "................",
        "................", "................", "................", "................", "................"], pal))
    return frames


SPRITES = {k: [v] for k, v in ICONS.items()}
PROCEDURAL = {"terrain": _terrain, "res": _res, "city": _city, "units": _units, "hq": _hq, "rival": _rival,
              "advisor": _advisor, "star": _star, "extra": _extra}
