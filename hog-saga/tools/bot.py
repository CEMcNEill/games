#!/usr/bin/env python3
"""Run the Hog Saga autopilot N times and print outcome/timing/stats (balance numbers).

    uv run -q --with playwright python hog-saga/tools/bot.py --diff normal --n 10 [--heat 0] [--mode standard]
        [--optional] [--par 3] [--speed 8] [--meta '{"wins":1}'] [--ng]
Needs a built dist (node build-kits.mjs hog-saga).
"""
import argparse, copy, functools, http.server, json, os, shutil, socket, sys, tempfile, threading, time
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def one(port, a, i):
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
        pg = b.new_page(viewport={"width": 480, "height": 270})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.goto(f"http://127.0.0.1:{port}/g/")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        if a.meta:
            pg.evaluate(f"__game.debug.meta({a.meta})")
        if a.unlock:
            pg.evaluate("__game.debug.unlockAll()")
        pg.wait_for_timeout(900)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
        pg.wait_for_function("__game.debug && typeof __game.debug.autopilot === 'function'", timeout=20000)
        if a.run:
            pg.evaluate(f"__game.debug.run('{a.mode}', {a.heat})"); pg.wait_for_timeout(1200)
            pg.wait_for_function("__game.debug && typeof __game.debug.autopilot === 'function'", timeout=20000)
        pg.evaluate(f"__game.debug.autopilot(true); __game.debug.speed({a.speed}); {'__game.debug.optional(true);' if a.optional else ''}{'__game.debug.naive(true);' if a.naive else ''}")
        t0 = time.time(); st = None
        while time.time() - t0 < a.timeout:
            st = pg.evaluate("__game.state")
            if st in ("win", "lose"):
                break
            pg.wait_for_timeout(500)
        stats = pg.evaluate("__game.stats") or {}
        out = {"i": i, "outcome": st if st in ("win", "lose") else "timeout", "wall": round(time.time() - t0), "game_s": round(pg.evaluate("__game.elapsed") or 0),
               "levels": stats.get("levels"), "rounds": stats.get("rounds"), "breaks": stats.get("breaks"), "combos": stats.get("combos"),
               "scans": stats.get("scans"), "gold": stats.get("gold"), "items": stats.get("items"), "chests": stats.get("chests"),
               "secrets": stats.get("secrets"), "flags": stats.get("flags"), "errors": errs[:3], "gear": stats.get("gear"),
               "boss": [x for x in (stats.get("battles") or []) if x.get("enc") in (8,)],
               "extra": [x for x in (stats.get("battles") or []) if x.get("enc") in (9, 10)],
               "minhp": [x.get("minHp") for x in (stats.get("battles") or [])]}
        b.close()
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--diff", default="normal"); ap.add_argument("--n", type=int, default=5); ap.add_argument("--par", type=int, default=3)
    ap.add_argument("--speed", type=int, default=8); ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--heat", type=int, default=0); ap.add_argument("--mode", default="standard"); ap.add_argument("--optional", action="store_true"); ap.add_argument("--naive", action="store_true")
    ap.add_argument("--meta", default=""); ap.add_argument("--unlock", action="store_true"); ap.add_argument("--theme", default="")
    a = ap.parse_args()
    a.run = a.heat != 0 or a.mode != "standard"
    tmp = tempfile.mkdtemp(prefix="sagabot-")
    shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
    th = json.load(open(a.theme or os.path.join(KIT, "themes/default.json")))
    th["game"]["difficulty"] = a.diff
    json.dump(th, open(os.path.join(tmp, "g/theme/theme.json"), "w"))
    srv, port = serve(tmp)
    with ThreadPoolExecutor(a.par) as ex:
        res = list(ex.map(lambda i: one(port, a, i), range(a.n)))
    for r in res:
        print(json.dumps(r))
    wins = sum(r["outcome"] == "win" for r in res)
    gs = sorted(r["game_s"] for r in res)
    print(f"SUMMARY diff={a.diff} heat={a.heat} mode={a.mode} opt={a.optional} naive={a.naive}: wins {wins}/{len(res)}  wall avg {sum(r['wall'] for r in res)/len(res):.0f}s  "
          f"rounds avg {sum((r['rounds'] or 0) for r in res)/len(res):.0f}  breaks avg {sum((r['breaks'] or 0) for r in res)/len(res):.1f}  "
          f"combos avg {sum((r['combos'] or 0) for r in res)/len(res):.1f}  game_s median {gs[len(gs)//2]}")
    srv.shutdown(); shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
