#!/usr/bin/env python3
"""Worst-case text check: every theme string at its schema maxLength (wide letters, long words), then
screenshots of the text-heavy moments (intro, NPC talk, CHECK, a right act, the product solve, ending).

    uv run -q --with playwright python hog-quest/tools/longtext.py OUT_DIR

Prints __game.textWarnings (cut text) and page errors at the end.
"""
import copy
import functools
import http.server
import json
import os
import shutil
import socket
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS = ["Wombat", "MMMM", "Quarterly", "WWWWWWW", "roadmap", "dashboards", "Mmm", "WHY", "synergy"]


def filler(n):
    out, i = "", 0
    while len(out) < n:
        out += (" " if out else "") + WORDS[i % len(WORDS)]
        i += 1
    return out[:n].rstrip()


def longest(v, schema):
    t = schema.get("type")
    if t == "string" and "enum" not in schema and "maxLength" in schema:
        return filler(schema["maxLength"])
    if t == "object":
        for k, s in schema.get("properties", {}).items():
            if k in v:
                v[k] = longest(v[k], s)
        return v
    if t == "array" and isinstance(v, list):
        mx = schema.get("maxItems", len(v))
        while len(v) < mx and v:
            v.append(copy.deepcopy(v[-1]))
        return [longest(x, schema.get("items", {})) for x in v]
    return v


def main(out):
    os.makedirs(out, exist_ok=True)
    schema = json.load(open(os.path.join(KIT, "theme.schema.json")))
    theme = longest(json.load(open(os.path.join(KIT, "themes/default.json"))), schema)
    tmp = tempfile.mkdtemp(prefix="hqlong-")
    shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
    json.dump(theme, open(os.path.join(tmp, "g/theme/theme.json"), "w"))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tmp)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.goto(f"http://127.0.0.1:{port}/g/")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        n = [0]

        def shot(name, wait=1600):
            pg.wait_for_timeout(wait)
            n[0] += 1
            pg.screenshot(path=os.path.join(out, f"{n[0]:02d}-{name}.png"))

        def key(k, wait=250):
            pg.keyboard.press(k)
            pg.wait_for_timeout(wait)

        pg.wait_for_timeout(800)
        key("Enter", 500); key("Enter", 800)
        shot("intro", 3500)
        pg.evaluate("__game.debug.battle(3)")
        shot("boss-intro", 4000)
        key("Enter"); key("ArrowRight"); key("Enter")  # ACT
        key("Enter")  # CHECK
        shot("check", 4500)
        pg.evaluate("__game.debug.god(true)")
        key("Enter", 7000)  # enemy turn
        key("ArrowRight"); key("Enter")  # POSTHOG from the menu (sel was ACT)
        shot("products", 600)
        # pick the boss's solved_by
        pg.evaluate("""(() => { const s = __phaser.scene.getScene('Battle');
            const i = s.choices.findIndex(c => c.id === s.def.solved_by); s.subSel = Math.max(0, i); })()""")
        key("Enter")
        shot("solve", 4500)
        warns = pg.evaluate("__game.textWarnings")
        b.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    print("textWarnings:", json.dumps(warns, indent=1))
    print("errors:", errs)


if __name__ == "__main__":
    main(sys.argv[1])
