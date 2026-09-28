"""Screenshots of Hogtopia's systems for a look-over (tech tree, level-up reward, veteran, monuments, truce,
rival summary, end screen, map types).  uv run -q --with playwright python hogtopia/tools/shots.py <dist> <out> [scenario...]"""
import functools, http.server, json, os, socket, sys, threading, shutil, tempfile
from playwright.sync_api import sync_playwright

def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port

dist, out = sys.argv[1], sys.argv[2]
want = sys.argv[3:] or ["main"]
os.makedirs(out, exist_ok=True)
srv, port = serve(dist)
errs = []
def start(b, pre=None):
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:300]))
    pg.on("console", lambda m: m.type == "error" and errs.append(f"console: {m.text[:300]}"))
    pg.goto(f"http://127.0.0.1:{port}/")
    pg.wait_for_function("window.__game && window.__game.ready", timeout=15000)
    if pre: pg.evaluate(pre)
    pg.wait_for_timeout(700); pg.keyboard.press("Enter"); pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    return pg
def shot(pg, name): pg.screenshot(path=os.path.join(out, name + ".png"))
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    if "main" in want:
        pg = start(b)
        shot(pg, "01-start")
        pg.evaluate("__game.debug.techTree()"); pg.wait_for_timeout(300); shot(pg, "02-tech")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        pg.evaluate("__game.debug.levelUp()"); pg.wait_for_timeout(500); shot(pg, "03-reward")
        pg.keyboard.press("ArrowRight"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
        pg.evaluate("__game.debug.showcase(); __game.debug.vet(); __game.debug.monument('warlord')"); pg.wait_for_timeout(300); shot(pg, "04-showcase")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(120); shot(pg, "05-attack-mid"); pg.wait_for_timeout(600); shot(pg, "06-attack-after")
        pg.evaluate("__game.debug.summary()"); pg.wait_for_timeout(200); shot(pg, "07-summary")
        pg.evaluate("__game.debug.turn(21); __game.debug.truce()"); pg.wait_for_timeout(300); shot(pg, "08-truce")
        pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
        pg.evaluate("__game.debug.speed(3); __game.debug.autopilot(true)"); pg.wait_for_timeout(6000); shot(pg, "09-auto")
        pg.wait_for_function("['win','lose'].includes(__game.state)", timeout=120000); pg.wait_for_timeout(1500); shot(pg, "10-end")
        print(json.dumps(pg.evaluate("__game.stats"))[:600])
        pg.keyboard.press("Enter"); pg.wait_for_timeout(1500); shot(pg, "11-run2")
        print(pg.evaluate("JSON.stringify(__game.debug.setup())"))
        pg.evaluate("__game.debug.goto('Title')"); pg.wait_for_timeout(800); shot(pg, "12-title-returning")
        pg.close()
    for m in [w for w in want if w.startswith("map:")]:
        pg = start(b)
        pg.evaluate(f"__game.debug.map('{m[4:]}')"); pg.wait_for_timeout(800)
        pg.evaluate("__game.debug.reveal()"); pg.wait_for_timeout(300); shot(pg, "map-" + m[4:])
        print(m, pg.evaluate("JSON.stringify(__game.debug.setup())"))
        pg.close()
    if "heat" in want:
        pg = start(b)
        pg.evaluate("__game.debug.heat(5)"); pg.wait_for_timeout(800); pg.evaluate("__game.debug.reveal()"); pg.wait_for_timeout(300); shot(pg, "heat5")
        print(json.dumps(pg.evaluate("__game.stats"))[:400])
        pg.close()
    b.close()
print("errors:", errs)
