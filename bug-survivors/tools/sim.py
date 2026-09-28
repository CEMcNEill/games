#!/usr/bin/env python3
"""Balance runs: play N autopilot games of the built kit and print outcome stats.

    uv run -q --with playwright python bug-survivors/tools/sim.py [--n 6] [--diff easy] [--heat 0] [--mode 0]
        [--speed 6] [--par 3] [--timeout 200] [--shop '{"might":2}'] [--hog im-the-driver] [--god] [--cash 99]

--mode is the title mode index (0 RUN, 1 DAILY, 2 YOLO). --cash N: the bot cashes out after wave N's boss (default 99:
play the ladder until death). Prints each run's death wave and per-wave telemetry (clear time, level, DPS, boss fight s). Heat/modes above what a fresh save allows are
unlocked with debug.unlockAll() first. Prints one line per run and a summary; --json writes all results.
"""
import argparse
import asyncio
import functools
import http.server
import json
import os
import shutil
import socket
import tempfile
import threading
import time

from playwright.async_api import async_playwright

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


async def one(browser, url, a, i):
    page = await browser.new_page(viewport={"width": 960, "height": 540})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:300]))
    await page.goto(url)
    await page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
    await page.wait_for_timeout(600)
    setup = []
    if a.heat or a.mode or a.shop or a.hog:
        setup.append("__game.debug.unlockAll()")
    if a.shop:
        setup.append(f"__game.meta.kit.shop = Object.assign(__game.meta.kit.shop || {{}}, {a.shop})")
    if a.hog:
        setup.append(f"__game.meta.kit.hogs = [...new Set([...(__game.meta.kit.hogs || []), '{a.hog}'])]; __game.meta.kit.hog = '{a.hog}'")
    if a.mode == 2:
        setup.append("__game.meta.kit.bestWave = Math.max(__game.meta.kit.bestWave || 0, 6)")
    if setup:
        # debug.goto('Title') from the title leaves it stopped, so save and reload instead.
        await page.evaluate("; ".join(setup) + "; __game.debug.meta({})")
        await page.reload()
        await page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        await page.wait_for_timeout(800)
    for _ in range(a.mode):
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(150)
    if a.heat:
        await page.wait_for_timeout(150)
        await page.keyboard.press("ArrowDown")
        await page.wait_for_timeout(150)
        for _ in range(a.heat):
            await page.keyboard.press("ArrowRight")
            await page.wait_for_timeout(150)
    for _ in range(12):  # title -> how-to -> game (slow under parallel load)
        if await page.evaluate("__game.scene") == "Game":
            break
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(700)
    if await page.evaluate("__game.scene") != "Game":
        raise RuntimeError(f"never reached the game: {errors[:2]}")
    await page.wait_for_timeout(300)
    await page.evaluate(f"__game.debug.autopilot(true, '{"novice" if a.novice else ""}'); __game.debug.botCash({a.cash}); __game.debug.speed({a.speed}); {'__game.debug.god(true);' if a.god else ''}")
    t0 = time.time()
    last = {}
    while time.time() - t0 < a.timeout:
        st = await page.evaluate("({s: __game.state, e: __game.elapsed, stats: __game.stats, fps: __game.fps, run: __game.run})")
        if st["s"] in ("win", "lose"):
            break
        last = st
        await page.wait_for_timeout(500)
    end = await page.evaluate("({s: __game.state, score: __game.score, meta: {coins: __game.meta.coins}, scene: __game.scene, e: __game.elapsed, boss: __game.stats.boss, en: __game.stats.enemies})")
    if end["s"] not in ("win", "lose"):
        print("STUCK", i, end, flush=True)
    await page.close()
    s = last.get("stats", {}) or {}
    return {"i": i, "outcome": end["s"] if end["s"] in ("win", "lose") else "timeout", "real_s": round(time.time() - t0),
            "game_s": round(last.get("e", 0)), "score": end["score"], "level": s.get("level"), "kills": s.get("kills"),
            "hp": s.get("hp"), "bossKills": s.get("bossKills"), "gold": s.get("gold"), "chests": s.get("chests"), "elites": s.get("elites"),
            "evolutions": s.get("evolutions"), "weapons": s.get("weapons"), "passives": s.get("passives"),
            "dmg": s.get("dmg"), "hurtBy": s.get("hurtBy"), "fps": last.get("fps"), "bank": end["meta"]["coins"], "errors": errors,
            "run": last.get("run"), "wave": s.get("wave"), "waves": s.get("waves"), "releases": s.get("releases"),
            "powerups": s.get("powerups"), "tools": s.get("tools"), "versions": s.get("versions"), "funding": s.get("funding")}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--par", type=int, default=3)
    ap.add_argument("--diff", default="easy")
    ap.add_argument("--heat", type=int, default=0)
    ap.add_argument("--mode", type=int, default=0)
    ap.add_argument("--speed", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--shop", default="")
    ap.add_argument("--hog", default="")
    ap.add_argument("--cash", type=int, default=99)
    ap.add_argument("--god", action="store_true")
    ap.add_argument("--novice", action="store_true")
    ap.add_argument("--theme", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix="bs-sim-")
    shutil.copytree(os.path.join(KIT, "dist"), os.path.join(tmp, "g"))
    th = json.load(open(a.theme or os.path.join(KIT, "themes/default.json")))
    th["game"]["difficulty"] = a.diff
    json.dump(th, open(os.path.join(tmp, "g/theme/theme.json"), "w"))
    srv, port = serve(tmp)
    url = f"http://127.0.0.1:{port}/g/"
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required",
                                                                      "--use-gl=angle", "--use-angle=swiftshader"])
        sem = asyncio.Semaphore(a.par)

        async def guarded(i):
            async with sem:
                r = await one(browser, url, a, i)
                ev = ",".join(r["evolutions"] or [])
                wv = " ".join(f"w{w['wave']}@{w['t']}s/lv{w['level']}/dps{w['dps']}/boss{w['boss']}s" for w in (r["waves"] or []))
                print(f"run {i}: h{(r['run'] or {}).get('heat')} {(r['run'] or {}).get('mode')} {r['outcome']:7} WAVE {r['wave']} game {r['game_s']:4}s "
                      f"real {r['real_s']:3}s lv {r['level']} kills {r['kills']} gold {r['gold']} bosses {r['bossKills']} pu {r['powerups']} "
                      f"evo {len(r['evolutions'] or [])} rel {list((r['releases'] or {}).keys())} fps {r['fps']} err {len(r['errors'])}\n    {wv}\n    "
                      f"top dmg {sorted((r['dmg'] or {}).items(), key=lambda x: -x[1])[:5]} hurt {r['hurtBy']}", flush=True)
                if r["errors"]:
                    print("    ERRORS", r["errors"][:3], flush=True)
                results.append(r)
        await asyncio.gather(*(guarded(i) for i in range(a.n)))
        await browser.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    wins = sum(r["outcome"] == "win" for r in results)
    avg = lambda k: round(sum((r[k] or 0) for r in results) / max(1, len(results)), 1)
    waves = sorted((r["wave"] or 1) for r in results)
    med = waves[len(waves) // 2] if waves else 0
    boss = [w["boss"] for r in results for w in (r["waves"] or []) if w["wave"] >= 2]
    print(f"SUMMARY diff={a.diff} heat={a.heat} mode={a.mode} n={len(results)} wins={wins} death waves={waves} median={med} "
          f"avg game_s={avg('game_s')} level={avg('level')} kills={avg('kills')} gold={avg('gold')} "
          f"evolved={sum(bool(r['evolutions']) for r in results)} boss fights (w2+) s={sorted(boss)} "
          f"errors={sum(len(r['errors']) for r in results)}")
    if a.json:
        json.dump(results, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    asyncio.run(main())
