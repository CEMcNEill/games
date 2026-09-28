#!/usr/bin/env python3
"""Screenshots of the new systems for review: title, level-up hints, evolution chest, chaos, stampede, tricks,
boss, shop tabs, end screen. Needs a built kit.

    uv run -q --with playwright --with pillow python bug-survivors/tools/shots.py [out_dir] [theme.json]
"""
import functools
import http.server
import json
import os
import shutil
import socket
import sys
import tempfile
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KIT, "overnight-shots")
theme = sys.argv[2] if len(sys.argv) > 2 else ""
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp(prefix="bs-shots-")
shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
if theme:
    shutil.copy(theme, os.path.join(tmp, "g/theme/theme.json"))
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tmp)
h.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs = []
shots = []

with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    J = lambda js: pg.evaluate(js)
    W = pg.wait_for_timeout

    def shot(name):
        path = os.path.join(out, f"{len(shots):02d}-{name}.png")
        pg.screenshot(path=path)
        shots.append(path)

    def boot():
        pg.wait_for_function("window.__game && window.__game.ready", timeout=30000)
        W(900)

    def start_game():
        pg.keyboard.press("Enter"); W(700)
        pg.keyboard.press("Enter"); W(800)

    pg.goto(f"http://127.0.0.1:{port}/g/")
    boot()
    shot("title-first-visit")
    start_game()
    J("__game.debug.xp(6)"); W(1200)
    shot("levelup-hints")
    pg.keyboard.press("Enter"); W(400)
    # Evolution chest: max weapons + partner passives, walk into a chest.
    J("__game.debug.god(true); __game.debug.giveAll(); __game.debug.maxAll(); __game.debug.passives(1); __game.debug.chest()"); W(300)
    pg.keyboard.down("ArrowRight"); W(500); pg.keyboard.up("ArrowRight"); W(500)
    shot("evolution-chest")
    W(2600)
    J("__game.debug.autopilot(true); __game.debug.showcase()"); W(4000)
    shot("evolved-chaos")
    J("__game.debug.event('stampede')"); W(1100)
    shot("stampede-warning")
    W(1300)
    shot("stampede")
    J("__game.debug.lose()"); W(2500)
    # Tricks on a fresh run: exploders, chargers, spitters, crate, puddle.
    pg.keyboard.press("Enter"); W(1500)
    J("__game.debug.god(true); __game.debug.warp(100); __game.debug.spawn('charger', 8); __game.debug.spawn('exploder', 8); "
      "__game.debug.spawn('spitter', 5); __game.debug.crate(); __game.debug.puddle(); __game.debug.elite('tank')"); W(4500)
    shot("tricks-elite-hazards")
    J("__game.debug.giveAll(); __game.debug.maxAll(); __game.debug.heat(5); __game.debug.spawnBoss()"); W(3500)
    shot("boss-arrives")
    J("__game.debug.autopilot(true); __game.debug.hurtBoss(0.55)"); W(5000)
    shot("boss-angry")
    J("__game.debug.hurtBoss(0.3)"); W(4000)
    shot("boss-rage")
    J("__game.debug.hurtBoss(1)"); W(2500)
    shot("overtime")
    J("__game.debug.heat(0); __game.debug.win()"); W(4500)
    shot("end-screen")
    # Returning player: title, shop tabs.
    J("__game.debug.unlockAll(); __game.meta.kit.codex = ['Rage Click Vortex', 'Funnel Quake']; "
      "__game.meta.kit.daily = {date: new Date().toISOString().slice(0, 10), best: 4321}; __game.debug.meta({})")
    pg.reload(); boot()
    shot("title-returning")
    for k in ["ArrowRight", "ArrowRight", "ArrowRight"]:
        pg.keyboard.press(k); W(200)
    pg.keyboard.press("Enter"); W(1200)
    pg.keyboard.press("ArrowDown"); W(200); pg.keyboard.press("Enter"); W(400)
    shot("shop-upgrades")
    pg.keyboard.press("ArrowRight"); W(300); pg.keyboard.press("ArrowDown"); W(200); pg.keyboard.press("Enter"); W(400)
    shot("shop-heroes")
    pg.keyboard.press("ArrowRight"); W(400)
    shot("shop-records")
    pg.keyboard.press("Escape"); W(900)
    for k in ["ArrowLeft", "ArrowLeft", "ArrowLeft"]:
        pg.keyboard.press(k); W(200)
    pg.keyboard.press("ArrowDown"); W(200); pg.keyboard.press("ArrowRight"); W(200); pg.keyboard.press("ArrowRight"); W(200)
    shot("title-heat2")
    start_game()
    W(1500)
    shot("hero-sprinter-heat2")
    J("__game.debug.hurtBoss(0); __game.debug.pickup('hotfix')")
    b.close()
srv.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
# Contact sheet
ims = [Image.open(x).convert("RGB").resize((480, 270)) for x in shots]
cols = 3
sheet = Image.new("RGB", (cols * 480, ((len(ims) + cols - 1) // cols) * 270), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 480, (i // cols) * 270))
sheet.save(os.path.join(out, "sheet.png"))
print(json.dumps({"shots": len(shots), "errors": errs}))
