#!/usr/bin/env python3
"""Bake PostHog brand art (hoggies + team crests from the @posthog/brand npm package) into small sprite sheets.

    uv run -q --with pillow python bug-survivors/tools/import_brand.py [--pkg path/to/unpacked/package]

Without --pkg it runs `npm pack @posthog/brand@<VERSION>` into a temp dir. Writes (committed, kit-fixed art):
  public/assets/kit/hoggies32.png   in-world player sprites, 32x32 cells, 16 per row
  public/assets/kit/hoggies64.png   portraits for menus and unlock toasts, 64x64 cells, 16 per row
  public/assets/kit/crests16.png    crest mini badges as 16x16 icons (HUD, cards), 11 per row
  public/assets/kit/crests64.png    full crests for the records page, 64x64 cells, 11 per row
  src/brand.json                    {hoggies: [{id, name, tags}], crests: [{id, name}]}; frame index = list order
Art is used with PostHog's permission (the package itself is PolyForm Strict).
"""
import argparse
import glob
import json
import os
import re
import subprocess
import tempfile

from PIL import Image, ImageFilter

VERSION = "0.12.3"
KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(KIT, "public", "assets", "kit")
OUTLINE = (20, 27, 27, 255)


def unpack() -> str:
    tmp = tempfile.mkdtemp(prefix="brand-")
    subprocess.run(["npm", "pack", f"@posthog/brand@{VERSION}", "--silent"], cwd=tmp, check=True, stdout=subprocess.DEVNULL)
    tgz = glob.glob(os.path.join(tmp, "*.tgz"))[0]
    subprocess.run(["tar", "xzf", tgz], cwd=tmp, check=True)
    return os.path.join(tmp, "package")


def read_meta(path: str) -> dict:
    """The generated .mjs meta files hold one JSON object literal."""
    src = open(path).read()
    start = src.index("{", src.index("const meta"))
    body = src[start: src.index("\n};", start) + 2]
    return json.loads(re.sub(r":\s*\.(\d)", r": 0.\1", body))  # JS allows ".91"


def fit(img: Image.Image, size: int, pad: int, crisp: bool) -> Image.Image:
    """Crop to content, scale to fit (size - 2*pad), paste bottom-centred on a transparent cell."""
    img = img.convert("RGBA")
    box = img.getbbox()
    if box:
        img = img.crop(box)
    inner = size - 2 * pad
    k = min(inner / img.width, inner / img.height)
    w, h = max(1, round(img.width * k)), max(1, round(img.height * k))
    img = img.resize((w, h), Image.LANCZOS)
    if crisp:
        # Hard alpha so the art sits on the pixel grid like the rest of the game.
        a = img.getchannel("A").point(lambda v: 255 if v > 110 else 0)
        img.putalpha(a)
    cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cell.paste(img, ((size - w) // 2, size - pad - h), img)
    if crisp:
        # A 1px dark outline so the character reads on any arena floor.
        a = cell.getchannel("A")
        grown = a.filter(ImageFilter.MaxFilter(3))
        ring = Image.new("RGBA", cell.size, OUTLINE)
        ring.putalpha(grown)
        ring.alpha_composite(cell)
        cell = ring
    return cell


def sheet(cells: list, size: int, cols: int) -> Image.Image:
    rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cols * size, rows * size), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.paste(c, ((i % cols) * size, (i // cols) * size), c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkg", help="an unpacked @posthog/brand package dir")
    args = ap.parse_args()
    pkg = args.pkg or unpack()
    gen = os.path.join(pkg, "dist", "generated")
    os.makedirs(OUT, exist_ok=True)

    hoggies = []
    for m in sorted(glob.glob(os.path.join(gen, "hoggies", "meta", "*.mjs"))):
        fid = os.path.basename(m)[:-4]
        png = os.path.join(gen, "hoggies", "png", f"{fid}.png")
        if not os.path.exists(png):
            # A few PNG modules point at a differently named file ("996" -> "9-9-6.png").
            mod = os.path.join(gen, "hoggies", "png", f"{fid}.mjs")
            ref = re.search(r'new URL\("\./([^"]+\.png)"', open(mod).read()) if os.path.exists(mod) else None
            png = os.path.join(gen, "hoggies", "png", ref.group(1)) if ref else png
        if not os.path.exists(png):
            continue
        meta = read_meta(m)
        name = meta.get("name", fid)
        var = (meta.get("variant") or {}).get("variant")
        if var and not re.search(r"\d$", name):
            name = f"{name} {var}"
        hoggies.append({"id": fid, "name": name, "tags": meta.get("tags", []), "png": png})
    crests = []
    for m in sorted(glob.glob(os.path.join(gen, "crests", "full", "meta", "*.mjs"))):
        fid = os.path.basename(m)[:-4]
        full = os.path.join(gen, "crests", "full", "png", f"{fid}.png")
        mini = os.path.join(gen, "crests", "mini", "png", f"{fid}.png")
        if not (os.path.exists(full) and os.path.exists(mini)):
            continue
        crests.append({"id": fid, "name": read_meta(m).get("name", fid), "full": full, "mini": mini})

    src = [Image.open(h["png"]) for h in hoggies]
    sheet([fit(i, 32, 1, True) for i in src], 32, 16).save(os.path.join(OUT, "hoggies32.png"), optimize=True)
    sheet([fit(i, 64, 2, False) for i in src], 64, 16).save(os.path.join(OUT, "hoggies64.png"), optimize=True)
    sheet([fit(Image.open(c["mini"]), 16, 0, False) for c in crests], 16, 11).save(os.path.join(OUT, "crests16.png"), optimize=True)
    sheet([fit(Image.open(c["full"]), 64, 2, False) for c in crests], 64, 11).save(os.path.join(OUT, "crests64.png"), optimize=True)

    data = {"version": VERSION,
            "hoggies": [{"id": h["id"], "name": h["name"], "tags": h["tags"][:8]} for h in hoggies],
            "crests": [{"id": c["id"], "name": c["name"]} for c in crests]}
    with open(os.path.join(KIT, "src", "brand.json"), "w") as f:
        json.dump(data, f, indent=0, separators=(",", ":"))
        f.write("\n")
    sizes = {n: os.path.getsize(os.path.join(OUT, n)) // 1024 for n in os.listdir(OUT)}
    print(f"{len(hoggies)} hoggies, {len(crests)} crests -> {OUT} {sizes}")


if __name__ == "__main__":
    main()
