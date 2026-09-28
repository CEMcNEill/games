#!/usr/bin/env python3
"""Screenshots of the new systems for review (title, rooms, battles, patterns, shop, endings).

    uv run -q --with playwright --with pillow python hog-quest/tools/shots.py OUT_DIR [--theme theme.json]

Drives the built hog-quest/dist through __game.debug and the live scenes; writes PNGs and sheet.png.
"""
import argparse
import functools
import glob
import http.server
import json
import os
import shutil
import socket
import tempfile
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = "const e=__phaser.scene.getScene('Explore');"
BA = "const s=__phaser.scene.getScene('Battle');"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--theme")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for f in glob.glob(os.path.join(a.out, "*.png")):
        os.remove(f)
    tmp = tempfile.mkdtemp(prefix="hqshots-")
    shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
    if a.theme:
        shutil.copy(a.theme, os.path.join(tmp, "g/theme/theme.json"))
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=tmp))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs = []
    n = [0]
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        js = pg.evaluate
        wait = pg.wait_for_timeout

        def shot(name):
            n[0] += 1
            pg.screenshot(path=os.path.join(a.out, f"{n[0]:02d}-{name}.png"))

        def start():
            pg.goto(f"http://127.0.0.1:{port}/g/")
            pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
            wait(700)
            pg.keyboard.press("Enter"); wait(500)
            pg.keyboard.press("Enter"); wait(1200)
            js(f"{EX} e.closeDialogue()")

        def battle(i, extra=""):
            js(f"{EX} e.closeDialogue(); __game.debug.battle({i})")
            for _ in range(20):  # the boss says its taunt first
                wait(400)
                if js("__phaser.scene.isActive('Battle')"):
                    break
                js(f"{EX} if (e.dlg) {{ e.dlg.tw.finish(); e.advance(); }}")
            wait(1800)
            js(f"{BA} s.tw.finish()")
            if extra:
                js(extra)

        # returning player's title
        pg.goto(f"http://127.0.0.1:{port}/g/")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        js("__game.debug.meta({runs: 4, wins: 3, bestScore: 9120, maxHeatCleared: 1, kit: {endings: ['pacifist', 'neutral'], rushBest: 98.4, visits: 4, lastEnding: 'neutral'}})")
        pg.reload(); pg.wait_for_function("window.__game && window.__game.ready", timeout=20000); wait(900)
        shot("title-returning")
        js("__game.debug.resetMeta()")
        start()
        js("__game.debug.warp(4, 5, 'up')"); wait(300)
        shot("room-props")
        battle(0, f"{BA} s.choose(1)"); wait(300)
        shot("act-menu")
        js(f"{BA} s.act('check')"); wait(3500)
        shot("check-hint")
        js(f"{BA} s.tw.finish(); s.next && s.next(); s.choose(1); s.act(s.puzzle.verbs.find(v => v.id !== s.puzzle.seq[0]).id)"); wait(300)
        js(f"{BA} s.tw.finish()"); wait(200)
        shot("wrong-act-annoyed")
        js("__game.debug.god(true)")
        for pat in ["gems", "stoplight", "gravity", "laser", "thread", "burst", "squeeze"]:
            js(f"__game.debug.pattern('{pat}')"); wait(2600)
            shot(f"pattern-{pat}")
            js(f"{BA} s.dodge.t = 99"); wait(900)
        js(f"{BA} s.mode='menu'; s.choose(0)"); wait(620)
        shot("fight-bar")
        # scene restart for the boss views
        start()
        js("__game.debug.outcomes('ddd')"); wait(200)
        battle(3)
        js("__game.debug.god(true); __game.debug.showcase()"); wait(3000)
        shot("bugfix-boss-hell")
        start()
        js("__game.debug.gold(60); __game.debug.room(1); __game.debug.shop()"); wait(400)
        shot("vending-machine")
        start()
        js("__game.debug.warp(14, 2, 'up'); __game.debug.interact()"); wait(2200)
        shot("hidden-door")
        js(f"{EX} e.closeDialogue(); __game.debug.battle(4)"); wait(2600)
        shot("miniboss")
        start()
        js("__game.debug.autopilot(true); __game.debug.speed(8)")
        pg.wait_for_function("__game.state === 'win' || __game.state === 'lose'", timeout=120000)
        wait(2500)
        shot("end-pacifist")
        b.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    fs = sorted(glob.glob(os.path.join(a.out, "[0-9]*.png")))
    cols = 4
    sheet = Image.new("RGB", (cols * 480, ((len(fs) + cols - 1) // cols) * 270))
    for i, f in enumerate(fs):
        sheet.paste(Image.open(f).convert("RGB").resize((480, 270)), ((i % cols) * 480, (i // cols) * 270))
    sheet.save(os.path.join(a.out, "sheet.png"))
    print(len(fs), "shots; errors:", errs)


if __name__ == "__main__":
    main()
