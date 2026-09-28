#!/usr/bin/env python3
"""Run the autopilot N times per setting and print win rate, run length and stats.

    uv run -q --with playwright python hog-quest/tools/botbatch.py [--n 5] [--diff easy,normal,hard]
        [--speed 6] [--route pacifist|bugfix] [--heat 0] [--theme path.json] [--js "extra js before the bot"]

Stages hog-quest/dist with the patched default theme, presses Enter through title/how-to (so K.run is the
title default unless --heat patches it through debug), then autopilot until win/lose.
"""
import argparse
import copy
import functools
import http.server
import json
import os
import shutil
import socket
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def serve(root):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()

    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--diff", default="easy,normal,hard")
    ap.add_argument("--speed", type=int, default=6)
    ap.add_argument("--route", default="")
    ap.add_argument("--heat", type=int, default=0)
    ap.add_argument("--theme")
    ap.add_argument("--js", default="")
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--meta", default="", help="JSON patch for debug.meta() before the title (e.g. to unlock modes)")
    ap.add_argument("--title_keys", default="", help="comma-separated keys pressed on the title before Enter")
    a = ap.parse_args()
    base = json.load(open(a.theme or os.path.join(KIT, "themes/default.json")))
    tmp = tempfile.mkdtemp(prefix="hqbot-")
    for d in a.diff.split(","):
        t = copy.deepcopy(base)
        t["game"]["difficulty"] = d
        shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, d))
        json.dump(t, open(os.path.join(tmp, d, "theme/theme.json"), "w"))
    srv, port = serve(tmp)
    summary = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
        for d in a.diff.split(","):
            runs = []
            for i in range(a.n):
                pg = b.new_page(viewport={"width": 960, "height": 540})
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                pg.goto(f"http://127.0.0.1:{port}/{d}/")
                pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
                if a.heat:
                    pg.evaluate("__game.debug.meta({maxHeatCleared: 4})")
                if a.meta:
                    pg.evaluate(f"__game.debug.meta({a.meta})")  # persisted: reload to redraw the title
                    pg.reload()
                    pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
                pg.wait_for_timeout(700)
                for k in [k for k in a.title_keys.split(",") if k]:
                    pg.keyboard.press(k)
                    pg.wait_for_timeout(150)
                pg.keyboard.press("Enter")
                pg.wait_for_timeout(500)
                pg.keyboard.press("Enter")
                pg.wait_for_timeout(700)
                if a.heat:
                    pg.evaluate(f"__game.debug.heat && __game.debug.heat({a.heat})")
                if a.route:
                    pg.evaluate(f"__game.debug.route('{a.route}')")
                if a.js:
                    pg.evaluate(a.js)
                pg.evaluate(f"__game.debug.autopilot(true); __game.debug.speed({a.speed})")
                t0 = time.time()
                out = "timeout"
                while time.time() - t0 < a.timeout:
                    st = pg.evaluate("__game.state")
                    if st in ("win", "lose"):
                        out = st
                        break
                    pg.wait_for_timeout(300)
                last = pg.evaluate("__game.stats")
                r = {"out": out, "game_s": round(pg.evaluate("__game.elapsed") or 0), "wall_s": round(time.time() - t0),
                     "score": pg.evaluate("__game.score"), "errors": errs, "last": last}
                runs.append(r)
                print(d, i, json.dumps({k: v for k, v in r.items() if k != "last"}), json.dumps(last)[:300], flush=True)
                pg.close()
            wins = sum(r["out"] == "win" for r in runs)
            summary[d] = {"win_rate": f"{wins}/{len(runs)}", "avg_game_s": round(sum(r["game_s"] for r in runs) / len(runs)),
                          "max_wall_s": max(r["wall_s"] for r in runs)}
        b.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
