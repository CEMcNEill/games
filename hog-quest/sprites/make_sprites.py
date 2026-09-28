#!/usr/bin/env python3
"""hog-quest default art: CC0 bases (~/games/assets) + edits -> sprites/<slot>.sprite.

    cd ~/games/kits && uv run -q --with pillow python hog-quest/sprites/make_sprites.py

The .sprite files are the source of truth (hand-edit them freely); this script records how they were made.
Brand tokens (@1 @2 @3, d/l steps) mark the parts that take each prospect's colours.
Slots still on art.py: tiles, props, soul, bullet, icon_* (see the kit report).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "shared"))
from PIL import Image  # noqa: E402

import pixel  # noqa: E402

NA = os.path.expanduser("~/games/assets/ninja-adventure/Ninja Adventure - Asset Pack")
OUTLINE = "#141b1b"


# ---------------------------------------------------------------- grid helpers
def grab(png, boxes):
    im = Image.open(png).convert("RGBA")
    ims = [im.crop((x, y, x + w, y + h)) for x, y, w, h in boxes]
    return pixel.from_images(ims, {"base": os.path.relpath(png, os.path.expanduser("~/games/assets"))})


def cell(png, idx, cell=16):
    im = Image.open(png)
    cols = im.width // cell
    return [((i % cols) * cell, (i // cols) * cell, cell, cell) for i in idx]


def letter_of(spr, hexcol):
    return next(ch for ch, (c, _) in spr["legend"].items() if c == hexcol)


def free_letter(spr):
    used = set(spr["legend"]) | {"."}
    return next(c for c in pixel.CHARS if c not in used)


def add(spr, col, note=""):
    ch = free_letter(spr)
    spr["legend"][ch] = (col, note)
    return ch


def region_recolor(spr, mapping, rows, frames=None):
    """mapping {old_letter: (colour_token, note)} applied only on the given rows -> new letters."""
    new = {old: add(spr, col, note) for old, (col, note) in mapping.items()}
    for fi, fr in enumerate(spr["frames"]):
        if frames is not None and fi not in frames:
            continue
        for y in rows:
            fr[y] = "".join(new.get(ch, ch) for ch in fr[y])
    return new


def prune(spr):
    used = {ch for f in spr["frames"] for r in f for ch in r}
    spr["legend"] = {k: v for k, v in spr["legend"].items() if k in used}


def upres(spr, outline_ch):
    """2x nearest, then thin the doubled outline back to 1px so pixel density matches 32px art."""
    frames = []
    for fr in spr["frames"]:
        big = []
        for row in fr:
            r2 = "".join(ch * 2 for ch in row)
            big += [r2, r2]
        g = [list(r) for r in big]
        H, W = len(g), len(g[0])
        drop = []
        for y in range(H):
            for x in range(W):
                if g[y][x] != outline_ch:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ox, oy, ix, iy = x + dx, y + dy, x - dx, y - dy
                    out_empty = not (0 <= ox < W and 0 <= oy < H) or g[oy][ox] == "."
                    inner_ol = 0 <= ix < W and 0 <= iy < H and g[iy][ix] == outline_ch
                    if out_empty and inner_ol:
                        drop.append((x, y))
                        break
        for x, y in drop:
            g[y][x] = "."
        frames.append(["".join(r) for r in g])
    spr["frames"] = frames
    spr["w"] *= 2
    spr["h"] *= 2


def shade_edges(spr, body, shadow_ch, dirs=((1, 0), (0, 1)), frames=None):
    """Body pixels whose right/bottom neighbour is outline or empty become the shadow letter (light from top-left)."""
    for fi, fr in enumerate(spr["frames"]):
        if frames is not None and fi not in frames:
            continue
        g = [list(r) for r in fr]
        H, W = len(g), len(g[0])
        for y in range(H):
            for x in range(W):
                if g[y][x] not in body:
                    continue
                for dx, dy in dirs:
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < W and 0 <= ny < H) or fr[ny][nx] in (".",) or \
                            spr["legend"].get(fr[ny][nx], ("",))[0] == OUTLINE:
                        g[y][x] = shadow_ch
                        break
        spr["frames"][fi] = ["".join(r) for r in g]


def stamp(spr, fi, x0, y0, rows, keep_dot=True):
    fr = [list(r) for r in spr["frames"][fi]]
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch == " " or (keep_dot and ch == "."):
                continue
            fr[y0 + dy][x0 + dx] = ch
    spr["frames"][fi] = ["".join(r) for r in fr]


def save(spr, slot, concept):
    prune(spr)
    spr["meta"]["concept"] = concept
    pixel.save(os.path.join(HERE, f"{slot}.sprite"), spr)
    print("wrote", slot, f"{spr['w']}x{spr['h']}", len(spr["frames"]), "frames")


# ---------------------------------------------------------------- player: the PostHog hog, recoloured + shaded
def player():
    from sprites import load_art, render  # kit's own art.py grids -> images
    art = load_art(os.path.join(HERE, ".."))
    ims = [render(f, {}) for f in art.SPRITES["player"]]
    spr = pixel.from_images(ims, {"base": "hog-quest/art.py PLAYER (PostHog hog), repainted"})
    remap = {"#000000": (OUTLINE, "outline"), "#503000": ("#6e4a36", "quills"),
             "#ac7c00": ("#b5793f", "quill tips"), "#f0d0b0": ("#f2c79c", "face"),
             "#fcfcfc": ("#ffffff", "eye shine"), "#f85898": ("#e0707a", "nose / blush")}
    for ch, (c, _) in list(spr["legend"].items()):
        if c in remap:
            spr["legend"][ch] = remap[c]
    quill = letter_of(spr, "#6e4a36")
    face = letter_of(spr, "#f2c79c")
    qs = add(spr, "#4a2f24", "quill shadow")
    fs = add(spr, "#d99a6c", "face shadow")
    qh = add(spr, "#8f6448", "quill highlight")
    shade_edges(spr, {quill}, qs)
    shade_edges(spr, {quill}, qh, dirs=((-1, 0), (0, -1)))
    shade_edges(spr, {face}, fs, dirs=((0, 1),))
    save(spr, "player", "the PostHog hedgehog: warm brown quills, shaded bottom-right")


# ---------------------------------------------------------------- NPCs: Ninja Adventure villagers in brand-coloured clothes
NPCS = [  # slot, base, {letter-hex: token}, rows, concept
    ("npc_1", "OldWoman", {"#2d697b": "@2d", "#548789": "@2"}, range(13, 16),
     "friendly senior receptionist with lilac hair; cardigan in brand secondary"),
    ("npc_2", "Princess", {"#d78b4a": "@2d", "#f1c471": "@2"}, range(0, 16),
     "product manager with a bun; hair pin and dress in brand secondary"),
    ("npc_3", "Boy", {"#548789": "@1", "#d14b34": "@1d"}, range(14, 16),
     "engineer with red hair and a white collar; hoodie in brand primary"),
    ("npc_4", "Villager3", {"#56864c": "@1d", "#a8a129": "@1"}, range(12, 16),
     "data person, curly dark hair; shirt in brand primary"),
    ("npc_5", "Noble", {"#3b3643": "@1d", "#4e484a": "@1"}, range(12, 16),
     "exec in a fedora and a brand-primary suit"),
    ("npc_6", "Villager2", {"#8f3e56": "@3d", "#548789": "@3"}, range(12, 16),
     "designer with big dark hair; shirt in brand accent"),
]


def npcs():
    for slot, base, mapping, rows, concept in NPCS:
        png = f"{NA}/Actor/Character/{base}/SpriteSheet.png"
        spr = grab(png, cell(png, [0, 4]))
        m = {letter_of(spr, h): (tok, "clothes (brand)") for h, tok in mapping.items()}
        new = region_recolor(spr, m, rows, frames=[0])
        # the walk frame sits one row lower: same clothes rows, shifted
        for fr in spr["frames"][1:]:
            for y in range(min(rows) + 1, 16):
                fr[y] = "".join(new.get(ch, ch) for ch in fr[y])
        save(spr, slot, concept)


# ---------------------------------------------------------------- battle enemies (32x32): 16px Ninja monsters at 2x,
# outline thinned back to 1px, then 1px detail added so they read at the 32px density
def monster(name, idx=(0, 4)):
    import glob
    png = [p for p in glob.glob(f"{NA}/Actor/Monster/{name}/*.png") if "Faceset" not in p][0]
    return grab(png, cell(png, list(idx)))


def enemy_1():
    """Flaky Test: Ninja 'Cyclope' (red one-eyed critter) with a brand-accent checkmark on its belly; jitters."""
    spr = monster("Cyclope")
    upres(spr, letter_of(spr, OUTLINE))
    ck = add(spr, "@3", "checkmark (brand accent)")
    ckd = add(spr, "@3d", "checkmark shade")
    a = letter_of(spr, OUTLINE)
    CHECK = ["....aa",
             "...aca",
             "a.acda",
             "cacda.",
             "acda..",
             ".aa..."]
    CHECK = [r.replace("c", ck).replace("d", ckd).replace("a", a) for r in CHECK]
    for fi in range(2):
        fr = spr["frames"][fi]
        top = min(y for y in range(32) if any(ch != "." for ch in fr[y][12:20]))
        stamp(spr, fi, 13, top + 3, CHECK)
    # jitter: second frame nudged one pixel left
    spr["frames"][1] = [r[1:] + "." for r in spr["frames"][1]]
    save(spr, "enemy_1", "Flaky Test: one-eyed red critter, brand checkmark on its forehead, jittery")


def enemy_3():
    """Scope Creep: Ninja 'Slime3' as a sleepy fog cloud with brand-accent question marks drifting up."""
    spr = monster("Slime3", idx=(0, 0))
    remap = {"#79b8ce": ("#e4e0ee", "fog"), "#548789": ("#b4aecb", "fog shade"), "#4a5270": ("#7a7396", "fog shadow"),
             "#f2eaf1": ("#ffffff", "fog highlight")}
    for ch, (c, _) in list(spr["legend"].items()):
        if c in remap:
            spr["legend"][ch] = remap[c]
    a = letter_of(spr, OUTLINE)
    fog = letter_of(spr, "#e4e0ee")
    # sleepy face: replace the face with closed eyes (lines) and a small 'o' mouth, both frames
    for fi, fr in enumerate(spr["frames"]):
        spr["frames"][fi] = [r if not (7 <= y <= 11) else
                             r[:2] + "".join(fog if ch == a else ch for ch in r[2:14]) + r[14:]
                             for y, r in enumerate(fr)]
    upres(spr, a)
    q = add(spr, "@3", "question mark (brand accent)")
    qd = add(spr, "@3d", "question mark shade")
    Q = [".aaa.",
         "aqqqa",
         "aqaqa",
         ".aaqa",
         "..aqa",
         "..aaa",
         "..aqa",
         "..aaa"]
    Q = [r.replace("q", q).replace("a", a) for r in Q]
    for fi in range(2):
        fr = spr["frames"][fi]
        body_top = next(y for y in range(32) if a in fr[y])
        eye_y = body_top + 9
        # closed eyes: two 3px dark lines; tiny mouth
        stamp(spr, fi, 10, eye_y, [a * 3])
        stamp(spr, fi, 19, eye_y, [a * 3])
        stamp(spr, fi, 15, eye_y + 4, [a + a])
        stamp(spr, fi, 24 + fi, max(0, body_top - 8 - fi), Q)
        stamp(spr, fi, 3 - fi, max(0, body_top - 5 + fi), Q[:1] + [r.replace(q, qd) for r in Q[1:]])
    f1 = spr["frames"][1]
    spr["frames"][1] = ["." * 32] + f1[:-1]
    save(spr, "enemy_3", "Scope Creep: sleepy fog cloud, brand-accent question marks drifting above")


# ---------------------------------------------------------------- drawn from scratch in the pack's style (no fitting base)
class Canvas:
    def __init__(self, w, h, legend):
        self.w, self.h, self.legend = w, h, dict(legend)
        self.g = [["."] * w for _ in range(h)]

    def px(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = ch

    def rect(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, ch)

    def box(self, x0, y0, x1, y1, fill, outline="a"):
        self.rect(x0, y0, x1, y1, outline)
        self.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill)

    def rows(self):
        return ["".join(r) for r in self.g]


def sprite_from(frames, w, h, legend, base):
    return {"w": w, "h": h, "legend": {k: (v[0], v[1]) for k, v in legend.items()}, "frames": frames,
            "meta": {"base": base}}


def enemy_2():
    """Silent Error: a little error-dialog window with X eyes, a wobbly mouth and stubby legs."""
    L = {"a": (OUTLINE, "outline"), "p": ("#f2eaf1", "window"), "s": ("#c9c2d9", "window shade"),
         "w": ("#ffffff", "window light"), "t": ("@1", "title bar (brand)"), "T": ("@1l", "title highlight"),
         "u": ("@1d", "title shade"), "f": ("#4e484a", "feet"), "g": ("#8a82a8", "text grey")}
    frames = []
    for f in range(2):
        c = Canvas(32, 32, L)
        y0 = 5 + f
        c.box(3, y0, 28, y0 + 19, "p")
        c.rect(4, y0 + 1, 27, y0 + 4, "t")          # title bar
        c.rect(4, y0 + 1, 27, y0 + 1, "T")
        c.rect(4, y0 + 5, 27, y0 + 5, "u")
        c.rect(23, y0 + 2, 25, y0 + 4, "p")          # close button
        c.px(23, y0 + 2, "a"); c.px(25, y0 + 2, "a"); c.px(24, y0 + 3, "a"); c.px(23, y0 + 4, "a"); c.px(25, y0 + 4, "a")
        c.rect(6, y0 + 2, 13, y0 + 2, "w")           # title text
        c.rect(6, y0 + 3, 10, y0 + 3, "T")
        c.rect(4, y0 + 6, 4, y0 + 18, "w")           # light left edge
        c.rect(27, y0 + 6, 27, y0 + 18, "s")         # shade right + bottom
        c.rect(5, y0 + 18, 27, y0 + 18, "s")
        for ex in (9, 19):                            # X eyes
            for d in range(4):
                c.px(ex + d, y0 + 8 + d, "a"); c.px(ex + 3 - d, y0 + 8 + d, "a")
        for i, x in enumerate(range(12, 20)):         # wobbly frown
            c.px(x, y0 + 15 + (1 if i in (0, 7) else 0) - (i % 2 if f else 0), "a")
        for lx, up in ((8, f == 0), (20, f == 1)):   # stubby legs, alternating
            ly = y0 + 20 - (1 if up else 0)
            c.rect(lx, y0 + 20, lx + 3, ly + 3, "a")
            c.rect(lx + 1, y0 + 20, lx + 2, ly + 2, "f")
            c.rect(lx - 1, ly + 3, lx + 4, ly + 4, "a")
        frames.append(c.rows())
    save(sprite_from(frames, 32, 32, L, "drawn (no CC0 base fits a dialog window)"), "enemy_2",
         "Silent Error: error dialog with X eyes and stubby legs; title bar in brand primary")


def miniboss():
    """Tech Debt: a wobbly stack of three sticky notes with tired eyes (fixed kit monster)."""
    L = {"a": (OUTLINE, "outline"), "n": ("#f7d154", "note"), "N": ("#fff1a0", "note light"),
         "m": ("#d9a520", "note shade"), "o": ("#f0a45c", "note 2"), "O": ("#ffd29a", "note 2 light"),
         "M": ("#c9713a", "note 2 shade"), "t": ("@1", "scribbles (brand)"), "b": ("#8a5a9a", "eye bags")}
    frames = []
    for f in range(2):
        c = Canvas(32, 32, L)
        notes = [(5, 21, "n", "N", "m"), (7 + f, 12, "o", "O", "M"), (4 - f, 3, "n", "N", "m")]
        for x0, y0, fill, lit, sh in notes:
            c.box(x0, y0, x0 + 22, y0 + 10, fill)
            c.rect(x0 + 1, y0 + 1, x0 + 21, y0 + 1, lit)
            c.rect(x0 + 1, y0 + 9, x0 + 21, y0 + 9, sh)
            c.rect(x0 + 21, y0 + 2, x0 + 21, y0 + 9, sh)
            c.px(x0 + 21, y0 + 1, "a"); c.px(x0 + 20, y0 + 1, sh)   # curled corner
        tx, ty = notes[0][0], notes[0][1]
        c.rect(tx + 3, ty + 4, tx + 12, ty + 4, "t"); c.rect(tx + 3, ty + 6, tx + 9, ty + 6, "t")
        tx, ty = notes[2][0], notes[2][1]
        c.rect(tx + 3, ty + 4, tx + 14, ty + 4, "t"); c.rect(tx + 3, ty + 6, tx + 8, ty + 6, "t")
        mx, my = notes[1][0], notes[1][1]              # tired eyes on the middle note
        for ex in (mx + 5, mx + 13):
            c.rect(ex, my + 4, ex + 3, my + 4, "a")    # heavy lid
            c.rect(ex + 1, my + 5, ex + 2, my + 5, "a")  # pupil peeking under it
            c.rect(ex, my + 6, ex + 3, my + 6, "b")    # bags
        frames.append(c.rows())
    save(sprite_from(frames, 32, 32, L, "drawn (sticky notes; no CC0 base)"), "miniboss",
         "Tech Debt: wobbly stack of sticky notes with tired eyes; scribbles in brand primary")


def boss():
    """The Monolith: an old server rack with glowing yellow eyes and cable legs (48x48)."""
    L = {"a": (OUTLINE, "outline"), "r": ("#5a5468", "rack"), "R": ("#7a7390", "rack light"),
         "s": ("#3b3643", "rack shade"), "v": ("@1d", "visor (brand)"), "V": ("@1", "visor trim (brand)"),
         "y": ("#ffdc37", "eye glow"), "Y": ("#fff6c0", "eye core"), "k": ("#1f1b26", "drive slot"),
         "g": ("#3fd46a", "led green"), "G": ("@3", "led accent (brand)"), "c": ("@2", "cable (brand)"),
         "C": ("@2l", "cable light (brand)")}
    frames = []
    for f in range(2):
        c = Canvas(48, 48, L)
        top = 4 + f
        c.box(11, top, 36, top + 32, "r")
        c.rect(12, top + 1, 12, top + 30, "R")        # lit left edge
        c.rect(12, top + 1, 35, top + 1, "R")
        c.rect(35, top + 2, 35, top + 31, "s")        # shaded right + bottom
        c.rect(13, top + 31, 35, top + 31, "s")
        c.box(14, top + 3, 33, top + 10, "v")         # visor
        c.rect(15, top + 4, 32, top + 4, "V")
        for ex in (18, 27):                           # glowing eyes (squint on frame 1)
            if f == 0:
                c.rect(ex, top + 6, ex + 3, top + 8, "y"); c.rect(ex + 1, top + 7, ex + 2, top + 7, "Y")
            else:
                c.rect(ex, top + 7, ex + 3, top + 8, "y"); c.rect(ex + 1, top + 7, ex + 2, top + 7, "Y")
        for i in range(4):                            # drive bays with blinking LEDs
            by = top + 13 + i * 4
            c.rect(15, by, 32, by + 2, "a")
            c.rect(16, by + 1, 27, by + 1, "k")
            c.px(29, by + 1, "g" if (i + f) % 2 else "G")
            c.px(31, by + 1, "G" if (i + f) % 2 else "g")
        c.rect(15, top + 29, 32, top + 29, "s")      # vent line
        # cable legs: four wavy cables
        for j, lx in enumerate((15, 23, 31)):
            x = lx
            for y in range(top + 33, 46):
                sway = ((y + j + f) // 3) % 2
                xx = x + (sway if j % 2 else -sway)
                c.px(xx - 1, y, "a"); c.px(xx + 2, y, "a")
                c.px(xx, y, "c"); c.px(xx + 1, y, "C")
            c.rect(x - 2, 46, x + 3, 46, "a")
            c.rect(x - 1, 45, x + 2, 45, "c")
        # antenna + blinking tip
        c.rect(23, top - 3, 24, top - 1, "a")
        c.px(23 + f, max(0, top - 4), "G")
        frames.append(c.rows())
    save(sprite_from(frames, 48, 48, L, "drawn (server rack; no CC0 base)"), "boss",
         "The Monolith: old server rack with glowing eyes, brand visor and cable legs")


if __name__ == "__main__":
    what = sys.argv[1:] or ["player", "npcs", "enemy_1", "enemy_2", "enemy_3", "miniboss", "boss"]
    for w in what:
        globals()[w]()
