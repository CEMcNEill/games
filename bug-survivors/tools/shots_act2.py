#!/usr/bin/env python3
"""Screenshots of Act 2 for review: ACT 1 CLEAR, the toolbox, the five tools, each powerup, the final boss's
Rollout, and both end screens (full clear, cash out). Needs a built kit.

    uv run -q --with playwright python bug-survivors/tools/shots_act2.py [out_dir] [theme.json]
"""
import functools
import http.server
import os
import shutil
import socket
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KIT, "overnight-shots", "act2")
theme = sys.argv[2] if len(sys.argv) > 2 else ""
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp(prefix="bs-act2-")
shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
if theme:
    shutil.copy(theme, os.path.join(tmp, "g/theme/theme.json"))
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tmp)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
h = functools.partial(Quiet, directory=tmp)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs, shots = [], []

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

    def state():
        return J("__game.state")

    def clear():
        """Pick through any level-up cards or chests so the shot shows the arena."""
        for _ in range(20):
            if state() in ("levelup", "chest"):
                pg.keyboard.press("Enter"); W(450)
            else:
                break

    pg.goto(f"http://127.0.0.1:{port}/g/")
    pg.wait_for_function("window.__game && window.__game.ready", timeout=30000)
    W(900)
    pg.keyboard.press("Enter"); W(700)
    pg.keyboard.press("Enter"); W(900)
    # Act 1 boss down -> ACT 1 CLEAR
    J("__game.debug.god(true); __game.debug.giveAll(); __game.debug.xp(60)"); W(400)
    for _ in range(12):  # clear any level-up cards
        if state() == "levelup":
            pg.keyboard.press("Enter"); W(450)
    J("__game.debug.act2()"); W(2600)
    for _ in range(8):
        if state() == "actbreak" and J("__game.debug && 1"):
            break
        if state() in ("levelup", "chest"):
            pg.keyboard.press("Enter")
        W(400)
    shot("act1-clear")
    pg.keyboard.press("Enter"); W(900)
    shot("toolbox")
    pg.keyboard.press("Enter"); W(1200)
    shot("act2-start")
    clear()
    # All five tools levelled, a crowd to use them on.
    J("__game.debug.tools(); __game.debug.maxAll(); __game.debug.spawn('swarmer', 40); __game.debug.spawn('tank', 10); __game.debug.spawn('charger', 8)")
    W(3500)
    clear()
    shot("act2-tools")
    J("__game.debug.activate('autopilot')"); W(1500)
    clear()
    shot("self-driving")
    W(4500)
    J("__game.debug.spawn('swarmer', 30); __game.debug.spawn('spitter', 6)"); W(1500)
    J("__game.debug.activate('freeze')"); W(900)
    clear()
    shot("feature-freeze")
    W(3500)
    J("__game.debug.activate('shipit')"); W(900)
    clear()
    shot("ship-it")
    J("__game.debug.powerup('rewind'); __game.debug.powerup('freeze')"); W(600)
    clear()
    shot("powerups-on-floor")
    J("__game.debug.event('incident')"); W(1800)
    clear()
    shot("incident")
    J("__game.debug.finalBoss()"); W(1500)
    clear()
    J("__game.debug.bossHp(40); __game.debug.bossHere(110)"); W(1500)
    clear()
    shot("final-boss")
    # Wait for a Rollout telegraph.
    for _ in range(80):
        if J("__game.stats.bossMode") == 5:
            break
        W(150)
    W(300)
    clear()
    shot("final-boss-rollout-telegraph")
    for _ in range(20):
        if J("__game.stats.bossMode") == 6:
            break
        W(60)
    shot("final-boss-rollout-live")
    J("__game.debug.hurtBoss(1)"); W(3500)
    clear()
    shot("end-full-clear")
    # Cash out path on a fresh run.
    pg.keyboard.press("Enter"); W(1500)
    if state() not in ("playing", "boss"):
        pg.keyboard.press("Enter"); W(1200)
    J("__game.debug.god(true); __game.debug.act2()"); W(2600)
    for _ in range(8):
        if state() == "actbreak":
            break
        if state() in ("levelup", "chest"):
            pg.keyboard.press("Enter")
        W(400)
    pg.keyboard.press("ArrowRight"); W(300)
    shot("act1-clear-cashout-selected")
    pg.keyboard.press("Enter"); W(3500)
    shot("end-cash-out")
    b.close()
srv.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
print("\n".join(shots))
print("page errors:", errs or "none")
