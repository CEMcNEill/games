#!/usr/bin/env python3
"""Balance runs: play N games with the autopilot and print outcome/score/grades/ending per run.

    uv run -q --with playwright python data-inspector/tools/botrun.py [--n 4] [--speed 8] [--difficulty normal]
        [--heat 0] [--mode week] [--theme path.json] [--parallel 2]

Serves data-inspector/dist with a patched theme, enters the game with real keys, then drives __game.debug.
"""
import argparse, functools, http.server, json, os, shutil, socket, tempfile, threading, time
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def one(port, a, i):
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto(f"http://127.0.0.1:{port}/")
        pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        if a.fresh:
            pg.evaluate("__game.debug.resetMeta()")
        pg.wait_for_timeout(700)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
        if a.heat or a.mode != "week":
            pg.evaluate(f"__game.debug.mode('{a.mode}')")
            pg.wait_for_timeout(300)
            pg.evaluate(f"__game.debug.heat({a.heat})")
            pg.wait_for_timeout(500)
        pg.evaluate(f"__game.debug.autopilot(true); __game.debug.speed({a.speed})")
        t0 = time.time()
        while time.time() - t0 < a.timeout and pg.evaluate("__game.state") not in ("win", "lose"):
            pg.wait_for_timeout(500)
        st = pg.evaluate("__game.stats") or {}
        out = {"run": i, "outcome": pg.evaluate("__game.state"), "secs": round(time.time() - t0), "game_s": round(pg.evaluate("__game.elapsed")),
               "score": pg.evaluate("__game.score"), "quality": st.get("quality"), "processed": st.get("processed"), "correct": st.get("correct"),
               "missed": st.get("missed"), "falseFlags": st.get("falseFlags"), "reasons": f"{st.get('reasonsRight')}/{(st.get('reasonsRight') or 0) + (st.get('reasonsWrong') or 0)}",
               "grades": "".join(st.get("grades") or []), "credits": st.get("credits"), "ending": pg.evaluate("__game.debug.endings && __game.meta.kit.endings"),
               "errors": errs}
        b.close()
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--speed", type=int, default=8)
    ap.add_argument("--difficulty", default="normal")
    ap.add_argument("--heat", type=int, default=0)
    ap.add_argument("--mode", default="week")
    ap.add_argument("--theme")
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--parallel", type=int, default=2)
    ap.add_argument("--fresh", action="store_true", help="reset meta before each run")
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix="botrun-")
    shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
    theme = json.load(open(a.theme or os.path.join(KIT, "themes/default.json")))
    theme["game"]["difficulty"] = a.difficulty
    json.dump(theme, open(os.path.join(tmp, "g/theme/theme.json"), "w"))
    srv, port = serve(os.path.join(tmp, "g"))
    with ThreadPoolExecutor(a.parallel) as ex:
        res = list(ex.map(lambda i: one(port, a, i), range(a.n)))
    for r in res:
        print(json.dumps(r))
    wins = sum(r["outcome"] == "win" for r in res)
    print(f"SUMMARY difficulty={a.difficulty} heat={a.heat} mode={a.mode}: {wins}/{len(res)} wins, "
          f"avg score {sum(r['score'] or 0 for r in res) / len(res):.0f}, avg game_s {sum(r['game_s'] for r in res) / len(res):.0f}, "
          f"avg real s {sum(r['secs'] for r in res) / len(res):.0f}")
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
