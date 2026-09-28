#!/usr/bin/env python3
"""Screenshots of Hog Saga moments for eyeballing UI: python shots.py <url> <outdir> <script>
script: semicolon-separated steps: 'js:<expr>' | 'wait:<ms>' | 'shot:<name>' | 'key:<Key>' | 'start'."""
import os, sys
from playwright.sync_api import sync_playwright
url, out, script = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.on("pageerror", lambda e: print("PAGEERROR", str(e)[:800]))
    pg.goto(url); pg.wait_for_function("window.__game && window.__game.ready", timeout=20000); pg.wait_for_timeout(900)
    for step in script.split(";;"):
        k, _, v = step.strip().partition(":")
        if k == "start":
            pg.keyboard.press("Enter"); pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
        elif k == "js":
            r = pg.evaluate(v)
            if r is not None: print("js ->", str(r)[:300])
        elif k == "wait":
            pg.wait_for_timeout(int(v))
        elif k == "key":
            pg.keyboard.press(v); pg.wait_for_timeout(150)
        elif k == "hold":
            key, _, ms = v.partition(":")
            pg.keyboard.down(key); pg.wait_for_timeout(int(ms or 200)); pg.keyboard.up(key); pg.wait_for_timeout(100)
        elif k == "shot":
            pg.screenshot(path=os.path.join(out, v + ".png"))
    b.close()
