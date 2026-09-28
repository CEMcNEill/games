#!/usr/bin/env python3
"""Screenshot tour of the wave ladder: hoggies, the SHIPPED screen, releases, the new tools, wave modifiers, boss affixes,
powerups, the unhinged set pieces and the shop tabs. Fails loudly on page errors.

    uv run -q --with playwright --with pillow python bug-survivors/tools/shots_waves.py [out_dir]

Needs a built kit (node build-kits.mjs bug-survivors). Writes numbered PNGs and sheet.png to out_dir
(default bug-survivors/overnight-shots/waves).
"""
import functools
import http.server
import os
import socket
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KIT, "overnight-shots", "waves")


def serve(root):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    os.makedirs(OUT, exist_ok=True)
    srv, port = serve(os.path.join(KIT, "dist"))
    shots, errors = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader"])
        page = b.new_page(viewport={"width": 960, "height": 540})
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text[:300]))
        g = lambda js: page.evaluate(js)
        wait = lambda ms: page.wait_for_timeout(ms)

        def shot(name):
            path = os.path.join(OUT, f"{len(shots):02d}-{name}.png")
            page.locator("canvas").screenshot(path=path)
            shots.append(path)

        def to_game():
            for _ in range(12):
                if g("__game.scene") == "Game":
                    return
                page.keyboard.press("Enter")
                wait(600)

        page.goto(f"http://127.0.0.1:{port}/")
        page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        # A returning player with a few unlocks, so the title and shop show the collection.
        g("__game.debug.unlockAll(); __game.meta.kit = Object.assign(__game.meta.kit || {}, {hogs: ['im-the-driver','wizard-1','terminator',"
          "'self-driving','driving-hogzilla','reaper','party','dj','noir-2','coffee-cup'], hog: 'terminator', bestWave: 7, migrated: 1,"
          " relics: ['cap','socks'], pages: [0,1,2,5]}); __game.debug.meta({})")
        page.reload()
        page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        wait(1200)
        shot("title")
        to_game()
        g("__game.debug.god(true); __game.debug.holdLevels(true); __game.debug.botCash(99)")
        wait(2500)
        shot("wave1-hoggie")
        g("__game.debug.warp(170); __game.debug.flood(80)")
        wait(1500)
        shot("wave1-swarm")
        g("__game.debug.killBoss()")
        wait(2600)
        shot("shipped")
        page.keyboard.press("Enter")
        wait(900)
        shot("release-pick")
        page.keyboard.press("Enter")
        wait(1500)
        shot("wave2-start")
        g("__game.debug.autopilot(true)")  # closes chests (and later SHIPPED screens) so they don't hide the shots
        # Every new tool, evolved, in a crowd.
        g("__game.debug.tool('data_pipelines'); __game.debug.tool('logs'); __game.debug.tool('replay_vision'); __game.debug.tool('scouts');"
          " __game.debug.tool('ai_observability'); __game.debug.tool('endpoints'); __game.debug.tool('desktop'); __game.debug.tool('revenue');"
          " __game.debug.tool('hogql'); __game.debug.tool('batch_exports'); __game.debug.flood(150)")
        wait(4000)
        shot("tools-base")
        g("__game.debug.evolveAll(); __game.debug.flood(120)")
        wait(4000)
        shot("tools-evolved")
        g("__game.debug.release('hedgehog'); __game.debug.release('deskhog'); __game.debug.release('dopamine'); __game.debug.xp(400)")
        wait(3000)
        shot("companions")
        # Level-up with patches and tools on offer.
        g("__game.debug.holdLevels(false); __game.debug.xp(60)")
        wait(1500)
        shot("levelup-patches")
        g("__game.debug.holdLevels(true)")
        for _ in range(3):
            page.keyboard.press("Enter")
            wait(300)
        # Wave modifiers and new tricks.
        g("__game.debug.wave(4); __game.debug.spawn('nest', 3); __game.debug.spawn('regression', 12)")
        wait(2500)
        shot("wave4-migration")
        g("__game.debug.wave(7); __game.debug.spawn('heisen', 20); __game.debug.spawn('flaky', 12)")
        wait(2500)
        shot("wave7-outage")
        g("__game.debug.wave(8); __game.debug.spawn('race', 10); __game.debug.spawn('creep', 10)")
        wait(2500)
        shot("wave8-freeze")
        # Boss affixes.
        g("__game.debug.wave(6); __game.debug.spawnBoss()")
        wait(1500)
        g("__game.debug.bossHere(90)")
        wait(1500)
        shot("boss6-monolith")
        g("__game.debug.killBoss()")
        wait(2600)
        page.keyboard.press("Enter")
        wait(700)
        page.keyboard.press("Enter")
        wait(1200)
        g("__game.debug.wave(3); __game.debug.spawnBoss()")
        wait(1500)
        g("__game.debug.bossHere(90); __game.debug.hurtBoss(0.55)")
        wait(1500)
        shot("boss3-race-fork")
        g("__game.debug.killBoss()")
        wait(2600)
        page.keyboard.press("Enter")
        wait(700)
        page.keyboard.press("Enter")
        wait(1200)
        # Powerups.
        g("__game.debug.activate('party'); __game.debug.flood(60)")
        wait(1500)
        shot("pu-party")
        g("__game.debug.activate('hogzilla')")
        wait(1500)
        shot("pu-hogzilla")
        g("__game.debug.activate('sampling'); __game.debug.activate('troop')")
        wait(1500)
        shot("pu-sampling-troop")
        g("__game.debug.autopilot(false); __game.debug.activate('cmdk')")
        wait(900)
        shot("pu-cmdk")
        page.keyboard.press("Enter")
        wait(800)
        g("__game.debug.autopilot(true)")
        # Unhinged.
        g("__game.debug.god(false); __game.debug.driveBy(); __game.debug.flood(80)")
        wait(1000)
        shot("driveby-warning")
        wait(1300)
        shot("driveby-car")
        g("__game.debug.god(true); __game.debug.allHands(24)")
        wait(900)
        shot("all-hands")
        g("__game.debug.reaper()")
        wait(2500)
        shot("reaper")
        g("__game.debug.autopilot(false); __game.debug.relic(); __game.debug.page(7)")
        wait(1500)
        page.keyboard.press("Escape")
        wait(400)
        shot("pause")
        page.keyboard.press("Escape")
        wait(300)
        g("__game.debug.god(false); __game.debug.lose()")
        wait(4000)
        shot("end")
        # Shop tabs.
        page.keyboard.press("Enter")
        wait(800)
        g("__game.debug.goto('Title')")
        wait(800)
        for _ in range(3):
            page.keyboard.press("ArrowRight")
            wait(150)
        page.keyboard.press("Enter")
        wait(1200)
        for i in range(4):
            g(f"__game.debug.tab({i})")
            wait(500)
            shot(f"shop-{['upgrades', 'hoggies', 'crests', 'lore'][i]}")
        b.close()
    srv.shutdown()
    # Contact sheet.
    ims = [Image.open(s).convert("RGB").resize((480, 270)) for s in shots]
    cols = 4
    sheet = Image.new("RGB", (cols * 480, ((len(ims) + cols - 1) // cols) * 270), (0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % cols) * 480, (i // cols) * 270))
    sheet.save(os.path.join(OUT, "sheet.png"))
    print(f"{len(shots)} shots -> {OUT}")
    if errors:
        print("PAGE ERRORS:")
        for e in errors[:20]:
            print("  ", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
