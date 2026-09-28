"""Quick visual check: serve a built kit, step through screens, save screenshots.
    uv run -q --with playwright python tests/look.py <dist_dir> <out_dir> [js-steps...]"""
import functools, http.server, json, os, socket, sys, threading
from playwright.sync_api import sync_playwright

def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port

dist, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
srv, port = serve(dist)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:300]))
    pg.on("console", lambda m: m.type in ("error", "warning") and errs.append(f"{m.type}: {m.text[:300]}"))
    pg.goto(f"http://127.0.0.1:{port}/")
    pg.wait_for_function("window.__game && window.__game.ready", timeout=15000)
    n = 0
    for step in sys.argv[3:]:
        if step.startswith("key:"):
            pg.keyboard.press(step[4:])
        elif step.startswith("hold:"):
            k, ms = step[5:].split("@"); pg.keyboard.down(k); pg.wait_for_timeout(int(ms)); pg.keyboard.up(k)
        elif step.startswith("wait:"):
            pg.wait_for_timeout(int(step[5:]))
        elif step.startswith("js:"):
            print("js", step[3:], "->", pg.evaluate(step[3:]))
        elif step.startswith("shot:"):
            n += 1
            pg.screenshot(path=os.path.join(out, f"{n:02d}-{step[5:]}.png"))
    g = pg.evaluate("({state: __game.state, scene: __game.scene, fps: __game.fps, score: __game.score, stats: __game.stats, fallbacks: __game.fallbacks, themeIssues: __game.themeIssues, textWarnings: __game.textWarnings, events: __game.events.map(e => e.event)})")
    print(json.dumps(g, indent=1))
    b.close()
print("ERRORS:", json.dumps(errs, indent=1))
