"""hog-saga characters (hero, party, npcs), monsters, bosses, chest, items."""
import os

from PIL import Image

from make_sprites import NA, OUTLINE, builder, px, recolour, write
import pixel

CH = f"{NA}/Actor/Character"
SHADE_SKIN, SKIN = "#e9ab8c", "#ffcba9"


def char(name, n=0):
    im = Image.open(f"{CH}/{name}/SpriteSheet.png").convert("RGBA")
    return im.crop(((n % 4) * 16, (n // 4) * 16, (n % 4) * 16 + 16, (n // 4) * 16 + 16))


def bob(im, feet=3):
    """Idle bob: everything above the feet drops 1px."""
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    h = im.height
    top = im.crop((0, 0, im.width, h - feet))
    out.alpha_composite(im.crop((0, h - feet, im.width, h)), (0, h - feet))
    body = Image.new("RGBA", im.size, (0, 0, 0, 0))
    body.alpha_composite(top, (0, 1))
    out.alpha_composite(body)
    return out


def paint(im, spec):
    """spec: {hex: [(x, y), ...]}"""
    im = im.copy()
    for col, pts in spec.items():
        if col is None:
            for x, y in pts:
                im.putpixel((x, y), (0, 0, 0, 0))
        else:
            px(im, pts, col)
    return im


def person(slot, base, remap=None, spec=None, tokens=None, note=""):
    im = char(base)
    if remap:
        im = recolour(im, remap)
    if spec:
        im = paint(im, spec)
    write(slot, [im, bob(im)], tokens, note or f"Ninja Adventure {base} + edits")


# ---------------------------------------------------------------- hero: the PostHog hog, polished
def hero_polish(im):
    K, SP, SPD, SPH = pixel.rgb(OUTLINE), pixel.rgb("#6b3a2c"), pixel.rgb("#4a2a22"), pixel.rgb("#965340")
    FACE, FACED = pixel.rgb(SKIN), pixel.rgb(SHADE_SKIN)
    src = im.copy()
    m = {(0, 0, 0): K, (0x50, 0x30, 0x00): SP, (0xac, 0x7c, 0x00): SPH, (0xf0, 0xd0, 0xb0): FACE,
         (0xf8, 0x58, 0x98): pixel.rgb("#ff8fa3")}
    out = src.copy()
    W, H = src.size
    get = lambda x, y: src.getpixel((x, y)) if 0 <= x < W and 0 <= y < H else (0, 0, 0, 0)  # noqa: E731
    for y in range(H):
        for x in range(W):
            p = src.getpixel((x, y))
            if not p[3]:
                continue
            c = m.get(p[:3], p[:3])
            if p[:3] == (0x50, 0x30, 0x00):
                r, b = get(x + 1, y), get(x, y + 1)
                if (r[3] and r[:3] == (0, 0, 0)) or (b[3] and b[:3] == (0, 0, 0)):
                    c = SPD
            if p[:3] == (0xf0, 0xd0, 0xb0):
                r, b = get(x + 1, y), get(x, y + 1)
                if (r[:3] in ((0, 0, 0), (0x50, 0x30, 0x00)) and r[3]) or (b[3] and b[:3] == (0, 0, 0)):
                    c = FACED
            out.putpixel((x, y), c + (255,))
    return out


@builder
def hero():
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import importlib.util
    spec = importlib.util.spec_from_file_location("art", os.path.join(os.path.dirname(__file__), "..", "art.py"))
    art = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "shared"))
    spec.loader.exec_module(art)
    import sprites as ks
    frames = [hero_polish(ks.render(f, ks.brand(None))) for f in art.SPRITES["hero"]]
    write("hero", frames, None, "PostHog hedgehog from art.py, recoloured to the Ninja Adventure palette + shading")


# ---------------------------------------------------------------- party and townsfolk (generic defaults)
PURPLE = {"#f1c471": "#a58ad8", "#d78b4a": "#7b5bb5", "#8d977f": "#54408a"}


@builder
def party_1():  # Ada, data analyst: glasses, purple hoodie
    person("party_1", "Princess", {**PURPLE, "#e0394c": "#4e484a", "#f1c471": "#a58ad8"},
           {None: [(10, 0), (11, 0), (12, 0), (13, 1), (14, 2)],
            OUTLINE: [(10, 1), (11, 1), (12, 1), (13, 2), (6, 8), (9, 8)],
            "#4e484a": [(9, 2), (10, 2), (11, 2), (12, 2), (10, 3), (11, 3), (12, 3)],
            "#dff3f5": [(4, 8), (11, 8)]},
           note="Ninja Adventure Princess -> analyst: glasses, purple hoodie")


@builder
def party_2():  # Sam, support lead: headset, green shirt
    person("party_2", "Villager3", {"#56864c": "#3fae5a", "#a8a129": "#2e8a4a"},
           {"#3b3643": [(1, 7), (1, 8), (2, 7), (2, 8), (13, 7), (13, 8), (14, 7), (14, 8), (3, 10)],
            "#abc2bc": [(2, 7), (13, 7), (4, 11)]},
           note="Ninja Adventure Villager3 -> support lead: headset, green shirt")


@builder
def npc_1():  # Old Dev: grey beard, mug
    person("npc_1", "OldMan", {"#79b8ce": "#548789"},
           {"#f0e5d1": [(4, 10), (5, 10), (6, 10), (9, 10), (10, 10), (11, 10), (4, 11), (5, 11), (6, 11), (7, 11),
                        (8, 11), (9, 11), (10, 11), (11, 11), (5, 12), (6, 12), (9, 12), (10, 12), (12, 12)],
            "#8d977f": [(7, 12), (8, 12), (11, 11)],
            "#c0392b": [(12, 13), (13, 13), (12, 14), (13, 14)],
            OUTLINE: [(14, 13), (14, 14)]},
           tokens={"#c0392b": "@1"}, note="Ninja Adventure OldMan -> old developer: grey beard, brand mug")


@builder
def npc_2():  # PM Pat: clipboard
    person("npc_2", "Villager4", None,
           {OUTLINE: [(5, 12), (6, 12), (7, 12), (8, 12), (9, 12), (10, 12), (5, 13), (5, 14), (10, 13), (10, 14),
                      (6, 15), (7, 15), (8, 15), (9, 15)],
            "#f2eaf1": [(6, 13), (7, 13), (8, 13), (9, 13), (6, 14), (7, 14), (8, 14), (9, 14)],
            "#abc2bc": [(7, 13), (8, 14)]},
           tokens={"#e0394c": "@1", "#8f3e56": "@1d"}, note="Ninja Adventure Villager4 -> product manager with clipboard, brand shirt")


@builder
def npc_3():  # Intern: brand cap, backpack straps
    person("npc_3", "Child", None,
           {"#965340": [(3, 12), (3, 13), (12, 12), (12, 13)]},
           tokens={"#5f7160": "@1"}, note="Ninja Adventure Child -> intern: brand cap, backpack straps")


@builder
def quest_npc():  # bearded sage
    person("quest_npc", "Master", None, None, tokens={"#e0394c": "@2", "#8f3e56": "@2d"},
           note="Ninja Adventure Master (white beard), robe in brand secondary")


@builder
def merchant():  # hat
    person("merchant", "Noble", None, {"#ffd35b": [(4, 5), (5, 5), (6, 5), (7, 5), (8, 5), (9, 5), (10, 5), (11, 5)]},
           tokens={"#ffd35b": "@3"}, note="Ninja Adventure Noble (top hat) -> merchant, hat band in brand accent")


# ---------------------------------------------------------------- monsters (32x32, 2x Ninja Adventure + detail)
from PIL import ImageDraw  # noqa: E402

from make_sprites import monster, pad, up2  # noqa: E402


def drop(im, n=1):
    """Whole-sprite float bob (for flyers)."""
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(im, (0, n))
    return out


def lines(im, segs, col):
    d = ImageDraw.Draw(im)
    for seg in segs:
        d.line(seg, fill=pixel.rgb(col))
    return im


def fly(im):
    im = recolour(im, {"#548789": "#8fcfdc", "#79b8ce": "#d8f6fa", "#fce2ca": "#3b3643"})
    return paint(im, {"#e0394c": [(13, 4), (14, 4), (13, 5), (14, 5), (17, 4), (18, 4), (17, 5), (18, 5)],
                      "#fbf5ef": [(13, 4), (17, 4), (11, 12), (20, 12), (5, 14), (26, 14)],
                      "#6b6470": [(14, 10), (15, 10), (16, 10), (17, 10), (14, 14), (15, 14), (16, 14), (17, 14)]})


@builder
def enemy_1():  # Flaky Test: small buzzing fly with glassy wings
    a, b = up2(monster("ButterflyBlue", 0)), up2(monster("ButterflyBlue", 4))
    write("enemy_1", [fly(a), fly(b)], None, "Flaky Test: Ninja ButterflyBlue 2x -> buzzing fly, glass wings, red eyes")


def masked(im):
    im = recolour(im, {"#5f7160": "#3b3643"})
    mask = [(x, y) for y in (11, 12, 13) for x in range(10, 22)]
    im = paint(im, {"#2b2436": mask})
    return paint(im, {"#fbf5ef": [(12, 12), (13, 12), (14, 12), (17, 12), (18, 12), (19, 12)],
                      OUTLINE: [(14, 12), (17, 12)],
                      "#2b2436": [(22, 11), (23, 10), (24, 9), (23, 12), (24, 13)],
                      "#ff7a86": [(11, 9), (12, 9), (13, 10)]})


@builder
def enemy_2():  # Silent Error: sneaky red beetle with a ninja mask
    a, b = up2(monster("SpiderRed", 0)), up2(monster("SpiderRed", 4))
    write("enemy_2", [masked(a), masked(b)], None, "Silent Error: Ninja SpiderRed 2x -> red beetle with a ninja mask")


def creep(im):
    im = recolour(im, {"#56864c": "#f1c471", "#a8a129": "#ffe7a0", "#e0394c": "#d78b4a"})
    im = paint(im, {OUTLINE: [(10, 10), (11, 10), (10, 11), (11, 11), (20, 10), (21, 10), (20, 11), (21, 11)],
                    "#fbf5ef": [(10, 10), (20, 10)]})
    d = ImageDraw.Draw(im)
    d.rectangle([26, 13, 31, 31], fill=pixel.rgb(OUTLINE))
    d.rectangle([27, 14, 30, 30], fill=pixel.rgb("#f7f3fb"))
    for y in range(16, 29, 3):
        d.line([(27, y), (29, y)], fill=pixel.rgb("#8a82a8"))
    d.rectangle([28, 29, 29, 30], fill=pixel.rgb("#c0392b"))
    return im


@builder
def enemy_3():  # Scope Creep: fluffy yellow larva/moth dragging a long list
    a, b = up2(monster("Larva", 0)), up2(monster("Larva", 4))
    write("enemy_3", [creep(a), creep(b)], {"#c0392b": "@1"}, "Scope Creep: Ninja Larva 2x -> fluffy yellow creeper with a long list")


def rusty(im):
    im = recolour(im, {"#e0394c": "#c0662d", "#8f3e56": "#7a3f2a", "#e46d3a": "#6b5d57", "#ffad5d": "#9c8f86"})
    im = lines(im, [[(9, 8), (6, 6), (5, 3), (3, 2)], [(22, 8), (25, 6), (27, 3), (29, 2)], [(12, 4), (16, 1), (20, 4)]],
               "#2b2436")
    return paint(im, {"#3fae5a": [(2, 1), (3, 1), (2, 2)], "#1b51dc": [(29, 1), (30, 1), (30, 2)],
                      "#2b2436": [(27, 4), (26, 5)], "#ffd35b": [(16, 0), (15, 0)], "#e08a4a": [(12, 5), (13, 5), (20, 11), (8, 12), (23, 15)]})


@builder
def enemy_4():  # Tech Debt: rusty armoured snail with cables
    a, b = up2(monster("Mollusc", 0)), up2(monster("Mollusc", 4))
    write("enemy_4", [rusty(a), rusty(b)], None, "Tech Debt: Ninja Mollusc 2x -> rusty armoured shell with cables")


def chartfog(im):
    im = recolour(im, {"#79b8ce": "#5f587e", "#ffffff": "#8c86a8", "#8f3e56": "#3b3643"})
    return paint(im, {"#e8590c": [(12, 22), (13, 21), (14, 22), (15, 21), (16, 20), (17, 21), (18, 20), (19, 19)],
                      "#ffb000": [(7, 21), (8, 21), (7, 22), (8, 22), (7, 23), (8, 23), (9, 22), (10, 22), (9, 23), (10, 23)],
                      "#fbf5ef": [(12, 16), (18, 16)]})


@builder
def enemy_5():  # Dashboard Fog: floating grey fog ghost made of charts
    a = chartfog(up2(monster("Spirit", 0)))
    write("enemy_5", [a, drop(a)], {"#ffb000": "@3", "#e8590c": "@1"},
          "Dashboard Fog: Ninja Spirit 2x -> grey chart ghost, bars in brand colours")


# ---------------------------------------------------------------- bosses and chest
def _art():
    import importlib.util
    import sys
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(here, "..", "..", "shared"))
    spec = importlib.util.spec_from_file_location("art", os.path.join(here, "..", "art.py"))
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    return art


SENTINEL = {"1": "#010101", "2": "#020202", "3": "#030303", "4": "#040404", "5": "#050505"}


def edge_shade(im, base, hi, lo):
    """Pixels of colour `base` next to the outline on their left/top get `hi`, on their right/bottom get `lo`."""
    src, out = im.copy(), im.copy()
    B, K = pixel.rgb(base), pixel.rgb(OUTLINE)
    W, H = im.size
    get = lambda x, y: src.getpixel((x, y)) if 0 <= x < W and 0 <= y < H else (0, 0, 0, 0)  # noqa: E731
    for y in range(H):
        for x in range(W):
            p = src.getpixel((x, y))
            if not p[3] or p[:3] != B:
                continue
            if get(x - 1, y)[:3] == K or get(x, y - 1)[:3] == K:
                out.putpixel((x, y), pixel.rgb(hi) + (255,))
            elif get(x + 1, y)[:3] == K or get(x, y + 1)[:3] == K:
                out.putpixel((x, y), pixel.rgb(lo) + (255,))
    return out


@builder
def boss():  # Legacy Monolith: crowned mainframe (kit art, repainted in the Ninja palette with shading)
    frames = []
    for im in _art().PROCEDURAL["boss"](SENTINEL):
        im = recolour(im, {"#000000": OUTLINE, "#7c7c7c": "#8e8a99", "#a81000": "#e0394c", "#00b800": "#3fae5a",
                           "#f8b800": "#ffd35b"})
        im = edge_shade(im, "#8e8a99", "#b7b3c4", "#5f5b6e")
        im = edge_shade(im, "#ffd35b", "#fff1a8", "#d99a2b")
        frames.append(im)
    write("boss", frames, {"#010101": "@1", "#030303": "@3", "#040404": "@4", "#050505": "@5", "#020202": "@2"},
          "Legacy Monolith: kit art.py mainframe, Ninja palette + edge light/shade; brand panels kept as tokens")


DG = f"{NA}/Actor/Boss/DragonGreen"


def _stick_notes(im, pts):
    d = ImageDraw.Draw(im)
    for x, y in pts:
        d.rectangle([x, y, x + 4, y + 4], fill=pixel.rgb(OUTLINE))
        d.rectangle([x + 1, y + 1, x + 3, y + 3], fill=pixel.rgb("#ffd35b"))
        d.point((x + 3, y + 1), fill=pixel.rgb("#fff1a8"))
    return im


@builder
def wyrm():  # Tech Debt Wyrm: Ninja DragonGreen head + body segments, covered in sticky notes
    head = Image.open(f"{DG}/Head.png").convert("RGBA")
    seg = Image.open(f"{DG}/Body1.png").convert("RGBA")
    seg2 = Image.open(f"{DG}/Body2.png").convert("RGBA")
    frames = []
    for f in range(2):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        im.alpha_composite(seg2, (1, 36 + f))
        im.alpha_composite(seg, (12, 27 - f))
        _stick_notes(im, [(7, 44 + f), (13, 33 - f)])
        im.alpha_composite(head, (20, 1 + f))
        frames.append(im)
    write("wyrm", frames, None, "Tech Debt Wyrm: Ninja Adventure DragonGreen head+segments, sticky notes on its coils")


X72 = os.path.expanduser("~/games/assets/0x72-dungeontilesetii-v1.7/0x72_DungeonTilesetII_v1.7/frames")


@builder
def chest():
    closed = Image.open(f"{X72}/chest_full_open_anim_f0.png").convert("RGBA")
    opened = Image.open(f"{X72}/chest_full_open_anim_f2.png").convert("RGBA")
    write("chest", [closed, opened], None, "0x72 DungeonTileset II chest (closed, open)")
