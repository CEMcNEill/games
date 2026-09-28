#!/usr/bin/env python3
"""Default art for HogShop, drawn by Claude in the Ninja Adventure style (see shared/prompts/sprite-style.md).

    cd ~/games/kits && uv run -q --with pillow python hogshop/sprites/make_sprites.py

Writes hogshop/sprites/<slot>.sprite. Reused art: the PostHog hog from hog-quest (player), the manager
portrait from data-inspector, the PostHog product icons from data-inspector's built defaults. Items are
hand-drawn text grids; the room pieces (belt, floor, table, doors, lever, bins, wrap roll) are drawn with
small helpers. '@' tokens take each prospect's brand colours (dock frames, the returns bin, the lever knob).
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KITS = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(KITS, "shared"))
import pixel  # noqa: E402
from PIL import Image  # noqa: E402

OUT = HERE
K = "#141b1b"


def save(slot, frames, legend, concept, base=None):
    h, w = len(frames[0]), len(frames[0][0])
    for fi, f in enumerate(frames):
        assert len(f) == h, (slot, fi, len(f))
        for y, r in enumerate(f):
            assert len(r) == w, (slot, fi, y, len(r), r)
            for ch in r:
                assert ch == "." or ch in legend, (slot, fi, y, ch)
    meta = {"concept": concept}
    if base:
        meta["base"] = base
    used = {ch for f in frames for r in f for ch in r if ch != "."}
    spr = {"w": w, "h": h, "legend": {c: legend[c] if isinstance(legend[c], tuple) else (legend[c], "") for c in legend if c in used},
           "frames": frames, "meta": meta}
    pixel.save(os.path.join(OUT, f"{slot}.sprite"), spr)


# ---------------------------------------------------------------- reused art
def copy(src, slot):
    shutil.copy(os.path.join(KITS, src), os.path.join(OUT, f"{slot}.sprite"))


def grab_png(png, slot, concept):
    im = Image.open(os.path.join(KITS, png)).convert("RGBA")
    spr = pixel.from_images([im], {"concept": concept, "base": png})
    pixel.save(os.path.join(OUT, f"{slot}.sprite"), spr)


# ---------------------------------------------------------------- items (16x16, hand-drawn)
ITEMS = {
    "item_1": ("Mealworms: a glass jar of freeze-dried mealworms, brown lid", {
        "k": K, "l": "#6b3e26", "L": "#a0643c", "M": "#d49a5c", "g": "#6a8aa8", "G": "#b8d8e8", "H": "#f0fbff",
        "w": "#d8a860", "W": "#a07038"}, [
        "................",
        "....kkkkkkkk....",
        "...kLMMMMMMLk...",
        "...klLLLLLLlk...",
        "...kkkkkkkkkk...",
        "...kHGGGGGGgk...",
        "..kHGwWGGwWGgk..",
        "..kHGGwwGGGwgk..",
        "..kGwWGGwWGGgk..",
        "..kGGGwwGGwWgk..",
        "..kGwWGGGwwGgk..",
        "..kGGGwWGGGGgk..",
        "..kgGGGGGGGggk..",
        "..kggggggggggk..",
        "...kkkkkkkkkk...",
        "................"]),
    "item_2": ("Hog Food: a tied green bag with a paper label", {
        "k": K, "d": "#2e6b3a", "G": "#4c9a4a", "l": "#8fd16a", "t": "#d49a5c", "p": "#f7f3fb", "b": "#8a5a2b"}, [
        "................",
        "......k..k......",
        ".....klkklk.....",
        "......kttk......",
        ".....kGttGk.....",
        "....klGGGGdk....",
        "...klGGGGGGdk...",
        "..klGppppppGdk..",
        "..klGpbbpbpGdk..",
        "..klGpbbbbpGdk..",
        "..klGppppppGdk..",
        "..kGGGGGGGGGdk..",
        "..kdGGGGGGGddk..",
        "...kddddddddk...",
        "....kkkkkkkk....",
        "................"]),
    "item_3": ("Wheel: a blue exercise wheel with a gold hub on a grey stand", {
        "k": K, "B": "#3c7dd9", "b": "#1b4f9c", "c": "#79b8ce", "S": "#9a93b5", "s": "#6a6478", "h": "#e0a820"}, [
        "................",
        ".....kkkkkk.....",
        "...kkcccccBkk...",
        "..kccBkkkkBBbk..",
        "..kcBk....kBbk..",
        ".kcBk......kBbk.",
        ".kcBk..hh..kBbk.",
        ".kcBkSShhSSkBbk.",
        ".kcBk..hh..kBbk.",
        ".kBBk......kBbk.",
        "..kBBk....kBbk..",
        "..kbBBkkkkBbbk..",
        "...kkbbbbbbkk...",
        ".....kkkkkk.....",
        "....kSk..kSk....",
        "...kSSSkkSssk..."]),
    "item_4": ("Plushie: a round brown hedgehog plush with a pink-cheeked face", {
        "k": K, "q": "#6b3e26", "Q": "#8a5a3c", "R": "#b07a4a", "f": "#f0c89a", "F": "#d49a70", "n": "#3b2020", "p": "#f07a90"}, [
        "................",
        "...k.k.kk.k.k...",
        "..kRkQkQQkQkRk..",
        ".kRQQQQQQQQQQRk.",
        ".kQQQQffffQQQQk.",
        "kQQQQffffffQQQqk",
        "kQQQfkffffkfQQqk",
        "kQQQfffnnfffQQqk",
        "kQQpfffffffpQqqk",
        "kqQQFffffffFQqqk",
        ".kqQQFFFFFFQQqk.",
        ".kqqQQQQQQQQqqk.",
        "..kqqqqqqqqqqk..",
        "...kffkkkkffk...",
        "....kk....kk....",
        "................"]),
    "item_5": ("Mug: a white mug with an orange stripe and a handle", {
        "k": K, "w": "#f7f3fb", "W": "#c8c0d8", "V": "#9a93b5", "o": "#e0702a", "O": "#a0441c", "c": "#6b3e26"}, [
        "................",
        "................",
        "..kkkkkkkkk.....",
        "..kccccccck.....",
        "..kwwwwwwWkkk...",
        "..kwwwwwwWkWWk..",
        "..kwwwwwwWk.Wk..",
        "..koooooOWk.Wk..",
        "..koooooOWk.Wk..",
        "..kwwwwwwWkWWk..",
        "..kwwwwwWWkkk...",
        "..kWwwwwWVk.....",
        "..kVWWWWVVk.....",
        "...kkkkkkk......",
        "................",
        "................"]),
    "item_6": ("T-Shirt: an orange t-shirt, front view", {
        "k": K, "o": "#e0702a", "O": "#a0441c", "y": "#f8b060"}, [
        "................",
        "................",
        "....kkk..kkk....",
        "..kkyyykkooOkk..",
        ".kyyyyyyooooOOk.",
        "kyyyoooooooooOOk",
        "kyoookoooooOkOOk",
        ".kkkykoooooOkkk.",
        "....kyoooooOk...",
        "....kyoooooOk...",
        "....kyoooooOk...",
        "....kyoooooOk...",
        "....kOoooooOk...",
        "....kOOOOOOOk...",
        "....kkkkkkkkk...",
        "................"]),
    "item_7": ("Sleep Bag: a rolled purple sleeping bag with a grey strap", {
        "k": K, "v": "#4a2f7a", "V": "#7a52b8", "u": "#b08ae0", "s": "#3b3643", "S": "#6a6478"}, [
        "................",
        "................",
        "................",
        "...kkkkkkkkkk...",
        "..kuukuuuuuuVk..",
        ".kuVVukuuSuuVVk.",
        ".kuVkVkVVSVVVvk.",
        ".kuVVVkVVSVVVvk.",
        ".kVukVkVVSVVVvk.",
        ".kVVuukVVSVVvvk.",
        "..kVVkvvvsvvvk..",
        "...kkkkkkkkkk...",
        "................",
        "................",
        "................",
        "................"]),
    "item_8": ("Bowl Set: a pale blue ceramic bowl", {
        "k": K, "c": "#9cc8e0", "C": "#5a8aa8", "h": "#d8f0f8", "i": "#3c6a88"}, [
        "................",
        "................",
        "................",
        "................",
        "................",
        "..kkkkkkkkkkkk..",
        ".khhhhhhhhhhhck.",
        ".kCiiiiiiiiiiCk.",
        ".khhcccccccccCk.",
        "..khcccccccCCk..",
        "...kccccccCCk...",
        "....kkCCCCkk....",
        "....kCCCCCCk....",
        "....kkkkkkkk....",
        "................",
        "................"]),
    "hot_item": ("Hog Mansion: a tiny luxury house with a red roof and gold trim", {
        "k": K, "r": "#8f2a35", "R": "#d0404a", "e": "#f07a70", "c": "#f0e0b0", "C": "#c8b080", "G": "#e0a820",
        "d": "#6b3e26", "w": "#79b8ce"}, [
        ".......kk.......",
        "......kRRk......",
        ".....kReRRk.....",
        "....kReRRRrk....",
        "...kReRRRRRrk...",
        "..kReRRRRRRRrk..",
        ".kGGGGGGGGGGGGk.",
        "..kccccccccCCk..",
        "..kcwwcccwwcCk..",
        "..kcwwcccwwcCk..",
        "..kccccddcccCk..",
        "..kccccddccCCk..",
        "..kGGGGddGGGGk..",
        "..kkkkkkkkkkkk..",
        "................",
        "................"]),
}

# ---------------------------------------------------------------- boxes and wrap
CARD = {"k": K, "a": "#8a5a2b", "b": "#c68a4a", "c": "#e8b878", "i": "#4a2f1a", "t": "#f0dca0", "T": "#c8b070",
        "r": "#d0404a", "g": "#4c9a4a", "l": "#f7f3fb"}
BOX_BODY = [
    "..kkkkkkkkkkkk..",
    "..kcbbbbbbbbak..",
    "..kcbbbbbbbbak..",
    "..kcbbbbbbbbak..",
    "..kbbbbbbbbbak..",
    "..kbbbbbbbbaak..",
    "..kaaaaaaaaaak..",
    "..kkkkkkkkkkkk.."]
BOX_OPEN = ["................", "................", "................",
            ".kk..........kk.",
            ".kckkkkkkkkkkck.",
            "..kkiiiiiiiikk..",
            "..kciiiiiiiibk.."] + BOX_BODY + ["................"]
BOX_FULL = ["................", "................", "................",
            ".kk...rr.ll..kk.",
            ".kckkkrrkllkkck.",
            "..kkggrrillikk..",
            "..kcggiiillibk.."] + BOX_BODY + ["................"]
BOX_SEALED = ["................", "................", "................", "................",
              "..kkkkkkkkkkkk..",
              "..kcccctTcccak..",
              "..kbbbbtTbbbak..",
              "..kkkkktTkkkkk..",
              "..kcbbbtTbbbak..",
              "..kcbllllllbak..",
              "..kcblkkkklbak..",
              "..kbbllllllbak..",
              "..kbbbbtTbbaak..",
              "..kaaaatTaaaak..",
              "..kkkkkkkkkkkk..",
              "................"]
RETURN_BOX = [r for r in BOX_SEALED]
RETURN_BOX[8] = "..kcbrrrrrrbak.."
RETURN_BOX[9] = "..kcbrlrrrrbak.."
RETURN_BOX[10] = "..kcbllllllbak.."
RETURN_BOX[11] = "..kbbrlrrrrbak.."
RETURN_BOX[12] = "..kbbrrrrrraak.."
WRAP = {"k": K, "s": "#9cc8e0", "S": "#5a8aa8", "h": "#f0fbff", "b": "#d8f0f8"}
WRAP_SHEET = [
    "................",
    "................",
    "..kkkkkkkkkkk...",
    "..khbshbshbSk...",
    "..kbbsbbsbbSk...",
    "..kssssssssSk...",
    "..khbshbshbSk...",
    "..kbbsbbsbbSk...",
    "..kssssssssSk...",
    "..khbshbshbSk...",
    "..kbbsbbsbbSk...",
    "..kSSSSSSSSSk...",
    "..kkkkkkkkkkk...",
    "................",
    "................",
    "................"]


# ---------------------------------------------------------------- drawn room pieces
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [["."] * w for _ in range(h)]

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def frame(self, x0, y0, x1, y1, c):
        for x in range(x0, x1 + 1):
            self.px(x, y0, c)
            self.px(x, y1, c)
        for y in range(y0, y1 + 1):
            self.px(x0, y, c)
            self.px(x1, y, c)

    def outline(self, c="k"):
        """Dark outline around every filled pixel (4-neighbour), drawn on transparent pixels."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != ".":
                    continue
                if any(0 <= x + dx < self.w and 0 <= y + dy < self.h and self.g[y + dy][x + dx] not in (".", c)
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    add.append((x, y))
        for x, y in add:
            self.g[y][x] = c

    def rows(self):
        return ["".join(r) for r in self.g]


def belt():
    c = Canvas(16, 16)
    c.rect(0, 0, 15, 0, "M")
    c.rect(0, 1, 15, 1, "m")
    c.rect(0, 2, 15, 13, "d")
    for x in range(0, 16, 4):
        c.rect(x, 3, x, 12, "r")
        c.px(x + 1, 3, "h")
    c.rect(0, 14, 15, 14, "m")
    c.rect(0, 15, 15, 15, "k")
    return [c.rows()], {"k": K, "M": "#9a93b5", "m": "#6a6478", "d": "#2a2630", "r": "#4a4458", "h": "#6a6478"}


def floor():
    """Cool dark warehouse concrete in 16px slabs: the brown hog and bright products pop on it."""
    c = Canvas(32, 32)
    c.rect(0, 0, 31, 31, "p")
    for o in (0, 16):
        c.rect(0, o, 31, o, "s")
        c.rect(o, 0, o, 31, "s")
        c.rect(1, o + 1, 31, o + 1, "l")
        c.rect(o + 1, 1, o + 1, 31, "l")
    for (x, y) in ((6, 5), (21, 9), (11, 22), (27, 26), (4, 13), (24, 19)):
        c.px(x, y, "g")
    c.px(22, 9, "l")
    c.rect(8, 27, 10, 27, "g")
    return [c.rows()], {"p": "#303246", "l": "#3c3f56", "s": "#22232f", "g": "#282a3a"}


def table():
    c = Canvas(32, 24)
    c.rect(1, 1, 30, 9, "t")      # top surface
    c.rect(1, 1, 30, 1, "T")      # lit back edge
    c.rect(2, 3, 12, 3, "T")      # grain
    c.rect(18, 6, 28, 6, "T")
    c.rect(1, 10, 30, 13, "f")    # front edge
    c.rect(1, 13, 30, 13, "F")
    for x in (3, 27):             # legs
        c.rect(x, 14, x + 2, 21, "f")
        c.rect(x + 2, 14, x + 2, 21, "F")
    c.rect(6, 17, 25, 18, "F")    # shelf rail
    c.rect(24, 3, 28, 7, "o")     # a tape roll on the corner
    c.rect(25, 4, 27, 6, "O")
    c.px(26, 5, "t")
    c.outline()
    return [c.rows()], {"k": K, "t": "#c8925a", "T": "#e8b878", "f": "#8a5a3c", "F": "#5c3a26", "o": "#f0dca0", "O": "#a0643c"}


def dock():
    frames = []
    for open_ in (False, True):
        c = Canvas(32, 40)
        c.rect(0, 0, 31, 39, "1")         # brand frame
        c.rect(0, 0, 31, 1, "L")
        c.rect(0, 0, 1, 39, "L")
        c.rect(30, 0, 31, 39, "D")
        c.rect(3, 4, 28, 37, "x")         # opening
        slats = 10 if open_ else 33
        for y in range(4, 4 + slats):
            c.rect(3, y, 28, y, "S" if (y - 4) % 3 == 0 else "s")
        c.rect(3, 4 + slats, 28, 4 + slats, "h")
        if open_:
            c.rect(6, 30, 25, 31, "y")    # the truck's rear lights glow
            c.px(6, 29, "Y")
            c.px(25, 29, "Y")
        else:
            c.rect(13, 34, 18, 35, "h")   # handle
        c.rect(2, 38, 29, 39, "k")
        c.frame(0, 0, 31, 39, "k")
        frames.append(c.rows())
    return frames, {"k": K, "1": "@1", "L": "@1l", "D": "@1d", "x": "#0c0a10", "s": "#9a93b5", "S": "#6a6478", "h": "#d8d0e8",
                    "y": "#e0a820", "Y": "#f8e070"}


def lever():
    frames = []
    for down in (False, True):
        c = Canvas(16, 16)
        c.rect(3, 11, 12, 14, "m")        # base plate
        c.rect(3, 11, 12, 11, "M")
        c.px(5, 13, "d")
        c.px(10, 13, "d")
        if down:
            for i in range(5):
                c.px(8 + i, 10 - i // 2, "s")
            c.rect(12, 6, 14, 8, "3")
            c.px(12, 6, "l")
        else:
            for i in range(6):
                c.px(7 - i // 2, 10 - i, "s")
            c.rect(3, 2, 5, 4, "3")
            c.px(3, 2, "l")
        c.outline()
        frames.append(c.rows())
    return frames, {"k": K, "m": "#6a6478", "M": "#9a93b5", "d": "#3b3643", "s": "#bcbcbc", "3": "@3", "l": "@3l"}


def bin_():
    c = Canvas(24, 24)
    c.rect(3, 5, 20, 21, "2")             # tub in the brand's secondary
    c.rect(3, 5, 5, 21, "L")
    c.rect(18, 5, 20, 21, "D")
    c.rect(2, 3, 21, 5, "r")              # rim
    c.rect(2, 3, 21, 3, "R")
    c.rect(8, 10, 15, 15, "w")            # return arrow sign
    c.rect(9, 11, 14, 14, "2")
    c.rect(9, 11, 12, 11, "w")
    c.px(8, 11, "w")
    c.px(9, 10, "w")
    c.px(9, 12, "w")
    c.rect(10, 13, 13, 13, "2")
    c.rect(4, 22, 19, 22, "D")
    c.outline()
    return [c.rows()], {"k": K, "2": "#3c7dd9", "L": "#79b8ce", "D": "#1b4f9c", "r": "#6a6478", "R": "#9a93b5", "w": "#f7f3fb"}


def wrap_roll():
    c = Canvas(24, 24)
    c.rect(2, 16, 3, 22, "m")             # stand legs
    c.rect(20, 16, 21, 22, "m")
    c.rect(1, 22, 22, 22, "M")
    c.rect(3, 3, 20, 11, "s")             # the roll
    c.rect(3, 3, 20, 3, "h")
    for x in range(4, 20, 3):
        for y in (5, 8):
            c.px(x, y, "b")
            c.px(x + 1, y, "h")
    c.rect(3, 10, 20, 11, "S")
    c.rect(1, 4, 2, 10, "m")              # axle caps
    c.rect(21, 4, 22, 10, "m")
    c.rect(5, 12, 18, 18, "s")            # sheet hanging off the front
    for x in range(6, 18, 3):
        c.px(x, 14, "b")
        c.px(x + 1, 16, "b")
    c.rect(5, 18, 18, 18, "S")
    c.outline()
    return [c.rows()], {"k": K, "s": "#9cc8e0", "S": "#5a8aa8", "h": "#f0fbff", "b": "#d8f0f8", "m": "#6a6478", "M": "#9a93b5"}


def manager_hog():
    """Max, the store manager: data-inspector's PostHog hog in a brand-coloured shop apron, 32x32 portrait."""
    src = pixel.load(os.path.join(KITS, "data-inspector/sprites/inspector.sprite"))
    legend = dict(src["legend"])
    legend["A"] = ("@1", "apron (brand primary)")
    legend["D"] = ("@1d", "apron shade")
    legend["W"] = ("#f7f3fb", "apron string")
    frames = []
    for f in src["frames"]:
        g = [["."] * 32 for _ in range(32)]
        for y, row in enumerate(f):
            for x, ch in enumerate(row):
                if ch != ".":
                    g[y + 7][x + 4] = ch
        for y in range(22, 27):          # apron over the belly (24px rows 15-19)
            for x in range(14, 24):
                if g[y][x] in ("s", "E", "e", "b", "d"):
                    g[y][x] = "D" if y == 26 or x == 23 else "A"
        for x in range(13, 25):          # apron strings round the middle
            if g[21][x] not in (".", "k"):
                g[21][x] = "W"
        g[23][18] = "W"                  # a pocket
        g[23][19] = "W"
        frames.append(["".join(r) for r in g])
    spr = {"w": 32, "h": 32, "legend": legend, "frames": frames,
           "meta": {"base": "data-inspector/sprites/inspector.sprite", "concept": "Max the store manager: the PostHog hog in a shop apron"}}
    pixel.save(os.path.join(OUT, "manager.sprite"), spr)


def main():
    copy("hog-quest/sprites/player.sprite", "player")
    # The same hog, quills one step lighter: from behind it must read on the dark concrete floor.
    spr = pixel.load(os.path.join(OUT, "player.sprite"))
    for ch, col in {"b": "#8a5c40", "g": "#5e3c2c", "i": "#a87a52"}.items():
        if ch in spr["legend"]:
            spr["legend"][ch] = (col, spr["legend"][ch][1])
    spr["meta"]["concept"] = "the PostHog hedgehog (hog-quest art, quills lightened a step for the dark floor)"
    pixel.save(os.path.join(OUT, "player.sprite"), spr)
    manager_hog()
    for pid in ("product_analytics", "session_replay", "feature_flags", "experiments", "surveys", "error_tracking"):
        grab_png(f"data-inspector/public/assets/default/icon_{pid}.png", f"icon_{pid}", f"PostHog {pid} icon (shared with the other kits)")
    for slot, (concept, legend, grid) in ITEMS.items():
        save(slot, [grid], legend, concept)
    save("box", [BOX_OPEN, BOX_FULL, BOX_SEALED], CARD, "cardboard box: open, open with items, sealed with tape and label",
         base="ninja-adventure Items/Object/CrateEmpty.png (proportions), redrawn as cardboard")
    save("return_box", [RETURN_BOX], CARD, "a sealed box with a red return tag")
    save("wrap", [WRAP_SHEET], WRAP, "a sheet of bubble wrap")
    for slot, fn, concept in (("belt", belt, "conveyor belt segment with ribs (scrolls)"),
                              ("floor", floor, "cool dark concrete warehouse slabs"),
                              ("table", table, "wooden packing table with a tape roll"),
                              ("dock", dock, "roll-up shipping door in a brand-coloured frame: closed, open"),
                              ("lever", lever, "belt-jam lever: up, pulled"),
                              ("bin", bin_, "blue returns bin with a return arrow"),
                              ("wrap_roll", wrap_roll, "bubble wrap roll on a stand")):
        frames, legend = fn()
        save(slot, frames, legend, concept)
    print("wrote", len([f for f in os.listdir(OUT) if f.endswith(".sprite")]), "sprites")


if __name__ == "__main__":
    main()
