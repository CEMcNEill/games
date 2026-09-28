#!/usr/bin/env python3
"""Build hog-saga default .sprite files from CC0 bases (Ninja Adventure) plus hand edits.

    cd ~/games/kits && uv run -q --with pillow python hog-saga/sprites/make_sprites.py [slot ...]

The .sprite files it writes are the source of truth for the kit's default art (shared/sprites.py prefers
them over art.py). Hand-edit them freely; re-running this overwrites the slots you name (or all).
Brand tokens (@1 primary, @2 secondary, @3 accent, d/l = shadow/highlight) recolour per prospect.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "shared"))
import pixel  # noqa: E402

NA = os.path.expanduser("~/games/assets/ninja-adventure/Ninja Adventure - Asset Pack")
TS = f"{NA}/Backgrounds/Tilesets"
OUTLINE = "#141b1b"


def cell(sheet, n, size=16, path=TS):
    im = Image.open(f"{path}/{sheet}.png").convert("RGBA")
    cols = im.width // size
    x, y = (n % cols) * size, (n // cols) * size
    return im.crop((x, y, x + size, y + size))


def box(path, x, y, w, h):
    return Image.open(path).convert("RGBA").crop((x, y, x + w, y + h))


def over(base, top, xy=(0, 0)):
    out = base.copy()
    out.alpha_composite(top, xy)
    return out


def px(im, pts, col):
    rgb = pixel.rgb(col) + (255,)
    for x, y in pts:
        im.putpixel((x, y), rgb)
    return im


def recolour(im, mapping):
    """mapping {hex: hex} applied to an image."""
    m = {pixel.rgb(k): pixel.rgb(v) for k, v in mapping.items()}
    out = im.copy()
    for y in range(out.height):
        for x in range(out.width):
            p = out.getpixel((x, y))
            if p[3] and p[:3] in m:
                out.putpixel((x, y), m[p[:3]] + (p[3],))
    return out


def colours(im):
    from collections import Counter
    return Counter(pixel.hexc(p) for p in im.getdata() if p[3] >= 128)


def write(slot, frames, tokens=None, note=""):
    """frames: list of RGBA images. tokens {hex: '@1d', ...} turns base colours into brand tokens."""
    spr = pixel.from_images(frames, {"concept": note} if note else {})
    for ch, (col, n) in list(spr["legend"].items()):
        if tokens and col in tokens:
            spr["legend"][ch] = (tokens[col], f"brand (was {col})")
    pixel.save(os.path.join(HERE, f"{slot}.sprite"), spr)
    return spr


BUILDERS = {}


def builder(fn):
    BUILDERS[fn.__name__] = fn
    return fn


if __name__ == "__main__":
    import make_sprites as ms  # the importable copy the slot modules register into
    import slots_tiles  # noqa: F401,E402
    import slots_actors  # noqa: F401,E402
    want = sys.argv[1:] or list(ms.BUILDERS)
    for name in want:
        ms.BUILDERS[name]()
        print("wrote", name)


def monster(name, n=0, path=None):
    """One 16x16 cell from a Ninja Adventure monster sheet (column 0 = facing down)."""
    import glob
    d = path or f"{NA}/Actor/Monster/{name}"
    f = [p for p in glob.glob(d + "/*.png") if "Faceset" not in p][0]
    im = Image.open(f).convert("RGBA")
    return im.crop(((n % 4) * 16, (n // 4) * 16, (n % 4) * 16 + 16, (n // 4) * 16 + 16))


def up2(im, outline=OUTLINE):
    """2x nearest upscale, then thin the doubled outline back to 1px so it reads as native 32px art."""
    big = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    W, H = big.size
    K = pixel.rgb(outline)
    src = big.copy()
    get = lambda x, y: src.getpixel((x, y)) if 0 <= x < W and 0 <= y < H else (0, 0, 0, 0)  # noqa: E731
    is_k = lambda p: p[3] and p[:3] == K  # noqa: E731
    edge = {(x, y) for y in range(H) for x in range(W) if is_k(get(x, y)) and
            any(not get(x + dx, y + dy)[3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
    for y in range(H):
        for x in range(W):
            if (x, y) in edge or not is_k(get(x, y)):
                continue
            # an inner outline pixel next to an edge pixel: take the colour from the opposite (inward) side
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (x + dx, y + dy) in edge:
                    q = get(x - dx, y - dy)
                    if q[3] and not is_k(q):
                        big.putpixel((x, y), q)
                    break
    return big


def pad(im, w, h, bottom=True):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(im, ((w - im.width) // 2, (h - im.height) if bottom else (h - im.height) // 2))
    return out
