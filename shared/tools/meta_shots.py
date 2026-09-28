#!/usr/bin/env python3
"""Screenshots of the shared meta/title/end/juice features for one or more built kits.

    uv run -q --with playwright python shared/tools/meta_shots.py <out_dir> <kit> [kit...]

Per kit: first-visit title, juice test in game, first end screen, title after debug.unlockAll with a
test titleMenu (mode + heat rows), K.run after starting from it, second end screen, and a run with
localStorage blocked (must still start). Prints errors and the K.run it saw; exit 1 on page errors.
"""
import functools, http.server, json, os, socket, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MENU = """__game.debug.kitDef().titleMenu = () => [
  {key: 'mode', choices: [{label: 'STORY', value: 'story'}, {label: 'DAILY', value: 'daily'}, {label: 'ENDLESS', value: 'endless', locked: true}]},
  {key: 'heat', label: 'HEAT', choices: [0,1,2,3,4,5].map(i => ({label: String(i), value: i, locked: i > __game.meta.maxHeatCleared + 1}))},
]"""
BLOCK = "Object.defineProperty(window, 'localStorage', {get() { throw new Error('blocked'); }});"


def serve(root):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def main():
    out, kits = sys.argv[1], sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader"])
        for kit in kits:
            srv, port = serve(os.path.join(ROOT, kit, "dist"))
            errs = []
            for blocked in (False, True):
                ctx = b.new_context(viewport={"width": 960, "height": 540})
                if blocked:
                    ctx.add_init_script(BLOCK)
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:300]))
                pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:300]))
                pg.goto(f"http://127.0.0.1:{port}/")
                pg.wait_for_function("window.__game && window.__game.ready", timeout=20000)
                shot = lambda n: pg.screenshot(path=os.path.join(out, f"{kit}{'-blocked' if blocked else ''}-{n}.png"))
                pg.wait_for_timeout(900); shot("1-title-first")
                pg.keyboard.press("Enter"); pg.wait_for_timeout(600); pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
                pg.evaluate("__game.debug.juiceTest()"); pg.wait_for_timeout(120); shot("2-juice")
                pg.evaluate("__game.debug.lose()"); pg.wait_for_function("__game.state === 'lose'", timeout=10000)
                pg.wait_for_timeout(1500); shot("3-end-first")
                if blocked:
                    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
                    print(kit, "blocked storage: restarted scene", pg.evaluate("__game.scene"), "runs", pg.evaluate("__game.meta.runs"))
                    ctx.close()
                    continue
                pg.evaluate("__game.debug.unlockAll()")
                pg.evaluate(MENU)
                pg.evaluate("__game.debug.goto('Title')"); pg.wait_for_timeout(900)
                pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
                pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(200)
                pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(300)
                shot("4-title-meta-menu")
                pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
                run = pg.evaluate("__game.run")
                pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
                print(kit, "run from menu:", json.dumps(run))
                pg.evaluate("__game.debug.win ? __game.debug.win() : __game.debug.lose()")
                pg.wait_for_function("__game.state === 'lose' || __game.state === 'win'", timeout=15000)
                pg.wait_for_timeout(1500); shot("5-end-meta")
                ev = [e for e in pg.evaluate("__game.events") if e["event"] in ("game_started", "game_finished")]
                print(kit, "events:", json.dumps(ev[-2:])[:400])
                ctx.close()
            srv.shutdown()
            print(kit, "errors:", errs or "none")
            bad += bool(errs)
        b.close()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
