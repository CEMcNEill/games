"""Real-time length of a game at normal animation speed with the autopilot: total, and time spent in rival turns.
    uv run -q --with playwright python hogtopia/tools/timing.py <dist> [difficulty]"""
import functools, http.server, json, os, shutil, socket, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright
dist = sys.argv[1]; diff = sys.argv[2] if len(sys.argv) > 2 else "easy"
tmp = tempfile.mkdtemp(); shutil.copytree(dist, tmp + "/g")
th = json.load(open(tmp + "/g/theme/theme.json")); th["game"]["difficulty"] = diff; json.dump(th, open(tmp + "/g/theme/theme.json", "w"))
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=tmp + "/g"))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_function("window.__game && window.__game.ready")
    pg.wait_for_timeout(700); pg.keyboard.press("Enter"); pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    pg.evaluate("__game.debug.autopilot(true)")
    t0 = time.time(); ai = 0.0; last = time.time(); turns = {}
    while pg.evaluate("__game.state") not in ("win", "lose") and time.time() - t0 < 900:
        st = pg.evaluate("__game.state"); now = time.time()
        if st == "aiturn": ai += now - last
        last = now; pg.wait_for_timeout(100)
    print(json.dumps({"total_s": round(time.time() - t0), "rival_turns_s": round(ai), "state": pg.evaluate("__game.state"), "turn": pg.evaluate("__game.stats.turn")}))
    b.close()
