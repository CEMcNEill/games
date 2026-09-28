"""Play with real keys, human-ish and a bit random, for N turns: Tab/arrows/Enter/C/T/E/1/2/Esc/U.
Fails on page errors or a state stuck for too long.  uv run -q --with playwright python hogtopia/tools/keyfuzz.py <dist> [turns] [seed] [runs_before]"""
import functools, http.server, json, random, socket, sys, threading, time
from playwright.sync_api import sync_playwright
dist = sys.argv[1]; turns = int(sys.argv[2]) if len(sys.argv) > 2 else 12; rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 1)
runs_before = int(sys.argv[4]) if len(sys.argv) > 4 else 0
s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=dist))
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    pg = b.new_page(viewport={"width": 960, "height": 540})
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:300]))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:300]))
    pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_function("window.__game && window.__game.ready")
    if runs_before:
        pg.evaluate(f"__game.debug.meta({{runs: {runs_before}, wins: {runs_before}}})"); pg.reload()
        pg.wait_for_function("window.__game && window.__game.ready")
    for _ in range(6):
        pg.wait_for_timeout(700)
        if pg.evaluate("__game.scene") == "Map": break
        pg.keyboard.press("Enter")
    print("scene", pg.evaluate("__game.scene"), pg.evaluate("__game.state"))
    pg.evaluate("__game.debug.speed(3)")
    t0 = time.time(); last_turn = 0; last_change = time.time(); states = {}
    while time.time() - t0 < 400:
        st = pg.evaluate("__game.state"); turn = pg.evaluate("__game.stats.turn || 0")
        states[st] = states.get(st, 0) + 1
        if st in ("win", "lose") or turn > turns: break
        if turn != last_turn: last_turn = turn; last_change = time.time()
        if time.time() - last_change > 60: errs.append(f"stuck: state {st} turn {turn}"); break
        if st in ("aiturn", "over"): pg.wait_for_timeout(150); continue
        if st in ("levelup", "truce"):
            pg.keyboard.press(rnd.choice(["ArrowLeft", "ArrowRight", "Digit1", "Digit2", "Enter", "Enter"])); pg.wait_for_timeout(60); continue
        if st in ("tech", "menu"):
            pg.keyboard.press(rnd.choice(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Enter", "Escape"])); pg.wait_for_timeout(60); continue
        k = rnd.choices(["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "KeyC", "KeyT", "KeyE", "KeyU", "Escape"],
                        [8, 4, 4, 4, 4, 10, 2, 1, 1.2, 0.5, 1])[0]
        pg.keyboard.press(k); pg.wait_for_timeout(40)
    print(json.dumps({"turn": pg.evaluate("__game.stats.turn"), "state": pg.evaluate("__game.state"), "states": states,
                      "stats": {k: v for k, v in pg.evaluate("__game.stats").items() if k in ("cities", "units", "techs", "perks", "vets", "monuments", "map", "personality")},
                      "textWarnings": pg.evaluate("__game.textWarnings")}))
    b.close()
print("errors:", errs)
sys.exit(1 if errs else 0)
