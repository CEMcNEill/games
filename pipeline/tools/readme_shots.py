#!/usr/bin/env python3
"""Screenshots for the README: title + gameplay for every kit, and a re-skin comparison.

    uv run -q --with playwright --with pillow python pipeline/tools/readme_shots.py [--out docs/screenshots]

Serves the built kits (<kit>/dist) locally, drives each into gameplay with the __game debug hooks
(showcase() when the kit has one, else autopilot for a few seconds) and saves 960x540 PNGs.
"""
import functools
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))
KITS = ["bug-survivors", "data-inspector", "hog-quest", "hog-saga", "hogtopia", "hogshop"]
RESKIN = ("bug-survivors", "ledgerly")  # kit, example theme shown next to the default
out = os.path.abspath(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else os.path.join(REPO, "docs", "screenshots")
os.makedirs(out, exist_ok=True)

site = tempfile.mkdtemp(prefix="readme-shots-")
for k in KITS:
    shutil.copytree(os.path.join(REPO, k, "dist"), os.path.join(site, k))
kit, ex = RESKIN
shutil.copytree(os.path.join(REPO, kit, "dist"), os.path.join(site, f"{kit}-{ex}"))
shutil.copy(os.path.join(REPO, kit, "themes", "examples", f"{ex}.json"), os.path.join(site, f"{kit}-{ex}", "theme", "theme.json"))

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=site))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}"


def capture(browser, path, name):
    pg = browser.new_page(viewport={"width": 960, "height": 540})
    pg.goto(f"{base}/{path}/")
    pg.wait_for_function("window.__game && window.__game.ready", timeout=30000)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=os.path.join(out, f"{name}-title.png"))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    if pg.evaluate("typeof (__game.debug && __game.debug.showcase) === 'function'"):
        pg.evaluate("__game.debug.showcase()")
        pg.wait_for_timeout(2500)
    else:
        pg.evaluate("__game.debug.autopilot(true); __game.debug.speed(4)")
        pg.wait_for_timeout(9000)
        pg.evaluate("__game.debug.speed(1)")
        pg.wait_for_timeout(800)
    for _ in range(4):  # step past any dialog/intro box so the shot shows play
        if pg.evaluate("__game.state") == "playing":
            break
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(out, f"{name}-play.png"))
    pg.close()
    print("shot", name)


with sync_playwright() as p:
    b = p.chromium.launch()
    for k in KITS:
        capture(b, k, k)
    capture(b, f"{kit}-{ex}", f"{kit}-{ex}")
    b.close()
srv.shutdown()
shutil.rmtree(site)
print("->", out)
