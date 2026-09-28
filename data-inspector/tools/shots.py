#!/usr/bin/env python3
"""Screenshots of every Data Inspector screen (for looking at, and for overnight-shots/).

    uv run -q --with playwright --with pillow python data-inspector/tools/shots.py <out_dir> [--theme theme.json] [--dist DIR]

Title (first visit + returning), day 1 desk, day 5 desk with every document tab, the reason picker,
a manager request and its reply, the end-of-day bills, the end screen, endless, plus a contact sheet.
"""
import argparse, functools, http.server, json, os, shutil, socket, tempfile, threading
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--theme")
    ap.add_argument("--dist", default=os.path.join(KIT, "dist"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="dishots-")
    shutil.copytree(a.dist, os.path.join(tmp, "g"))
    if a.theme:
        shutil.copy(a.theme, os.path.join(tmp, "g/theme/theme.json"))
    srv, port = serve(os.path.join(tmp, "g"))
    shots, errs = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:300]))
        pg.goto(f"http://127.0.0.1:{port}/")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        ev, key, wait = pg.evaluate, pg.keyboard.press, pg.wait_for_timeout

        def shot(name):
            path = os.path.join(a.out, f"{len(shots) + 1:02d}-{name}.png")
            pg.screenshot(path=path)
            shots.append(path)

        wait(900); shot("title-first")
        key("Enter"); wait(600); key("Enter"); wait(2600); shot("day1-intro")
        key("Enter"); wait(1500); shot("day1-desk")
        ev("__game.debug.day(5)"); wait(3000); shot("day5-intro")
        key("Enter"); wait(2600); shot("day5-request")
        key("KeyD"); wait(1800); shot("day5-answered")
        wait(600); shot("day5-rules")
        for _ in range(4):
            key("Tab"); wait(250); shot("day5-" + ev("__game.stats.tab"))
        key("KeyR"); wait(200)
        key("KeyD"); wait(500); shot("day5-picker")
        key("Digit1"); wait(900); shot("day5-stamped")
        ev("__game.debug.autopilot(true); __game.debug.speed(4)"); wait(2500)
        ev("__game.debug.autopilot(false); __game.debug.day(4)"); wait(400)
        key("Enter"); wait(700); key("KeyA"); wait(700); key("Enter"); wait(900)
        ev("__game.debug.skipDay()"); wait(1600); shot("day4-bills")
        key("Enter"); wait(400)
        ev("__game.debug.botPlan({}); __game.debug.autopilot(true); __game.debug.speed(8)")
        pg.wait_for_function("['win','lose'].includes(__game.state)", timeout=120000)
        wait(1600); shot("end")
        ev("__game.debug.unlockAll()"); ev("location.reload()")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000); wait(1200); shot("title-returning")
        key("ArrowRight"); wait(200); key("Enter"); wait(600); key("Enter"); wait(1200)
        ev("__game.debug.autopilot(true); __game.debug.speed(4)"); wait(5000); shot("endless")
        b.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    cols, w, h = 3, 480, 270
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 12)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, s in enumerate(shots):
        x, y = (i % cols) * w, (i // cols) * (h + 12)
        sheet.paste(Image.open(s).convert("RGB").resize((w, h)), (x, y + 12))
        d.text((x + 3, y), os.path.basename(s), fill=(220, 220, 220))
    sheet.save(os.path.join(a.out, "contact.png"))
    print(json.dumps({"shots": len(shots), "errors": errs}))


if __name__ == "__main__":
    main()
