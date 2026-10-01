#!/usr/bin/env python3
"""Kit acceptance test (Gate 1 in the spec). Works for any kit through the window.__game hooks.

    uv run -q --with playwright --with pillow python tests/accept.py <kit> [--fuzz 20] [--no-bot] [--out DIR]

Needs a built kit (node build-kits.mjs <kit>). For the default theme and every themes/examples/*.json:
  1. load, title -> how-to -> game with real key presses, play with held keys, check frames change
  2. bot run: __game.debug.autopilot + speed until win/lose (kit.json "tests.bot_patch" sets e.g. easy
     difficulty; "tests.bot_expect" says whether the bot must win)
  3. restart from the end screen with Enter
Then fuzz: N mutated themes (long strings, emoji, wrong types, missing fields, bad colours) must load,
reach the game and the end screen with no page errors. Then a load test via debug.flood if the kit has it.
Writes <out>/report.json and <out>/contact.png. Exit code 0 only if everything passed.

Kit debug contract (window.__game.debug): autopilot(on), speed(n), god(on), lose(), win(); flood() optional.
"""
import argparse
import copy
import functools
import http.server
import json
import os
import random
import shutil
import socket
import sys
import tempfile
import threading
import time

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

KITS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def serve(root):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=root)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def set_path(d, dotted, value):
    keys = dotted.split(".")
    for k in keys[:-1]:
        d = d[int(k)] if isinstance(d, list) else d.setdefault(k, {})
    d[keys[-1]] = value


# ---------------------------------------------------------------- fuzzing
WEIRD = ["", " ", "A" * 220, "🔥🚀💥 emoji only 🐛", "Ünïcödé Çømpåñÿ — “quotes” …", "<script>alert(1)</script>",
         "new\nlines\nin\nit", "x", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "12345", "日本語のテキスト"]


def mutate(theme, rnd):
    t = copy.deepcopy(theme)
    paths = []

    def walk(v, p):
        paths.append((p, v))
        if isinstance(v, dict):
            for k, x in v.items():
                walk(x, p + [k])
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, p + [i])
    walk(t, [])
    for _ in range(rnd.randint(3, 10)):
        p, v = rnd.choice(paths[1:])
        parent = t
        try:
            for k in p[:-1]:
                parent = parent[k]
        except (KeyError, IndexError, TypeError):
            continue
        key = p[-1]
        op = rnd.random()
        try:
            if op < 0.15:
                if isinstance(parent, dict):
                    parent.pop(key, None)
                elif isinstance(parent, list) and len(parent) > 0:
                    parent.pop(min(key, len(parent) - 1))
            elif isinstance(v, str):
                parent[key] = rnd.choice(WEIRD) if rnd.random() < 0.8 else rnd.choice([None, 42, [], {}, True])
            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                parent[key] = rnd.choice([-1, 0, 1e9, -1e9, "fast", None, 3.7])
            elif isinstance(v, list):
                parent[key] = rnd.choice([[], v * 5, "not a list", [None, 1, "x"], v[::-1]])
            elif isinstance(v, dict):
                parent[key] = rnd.choice([{}, [], "nope", None])
        except (KeyError, IndexError, TypeError):
            pass
    if rnd.random() < 0.3 and "palette" in t and isinstance(t["palette"], dict):
        t["palette"]["primary"] = rnd.choice(["red", "#fff", "#GGGGGG", "#ffffff", "#000000", 7])
    return t


# ---------------------------------------------------------------- browser helpers
class Session:
    def __init__(self, browser, url, shots_dir, tag):
        self.errors = []
        self.page = browser.new_page(viewport={"width": 960, "height": 540})
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)[:400]))
        self.page.on("console", lambda m: m.type == "error" and self.errors.append("console: " + m.text[:400]))
        self.page.on("requestfailed", lambda r: self.errors.append("requestfailed: " + r.url[-160:]))
        self.shots_dir, self.tag, self.shots = shots_dir, tag, []
        self.page.goto(url)
        self.page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        # The splash screen (PostHog or the prospect's logo): keep a shot of it, then wait for the title.
        self.page.wait_for_timeout(700)
        if self.g("__game.scene") == "Splash":
            self.shot("splash")
            self.page.wait_for_function("__game.scene !== 'Splash'", timeout=8000)

    def g(self, expr):
        return self.page.evaluate(expr)

    def state(self):
        return self.g("__game.state")

    def wait_state(self, states, timeout_s):
        end = time.time() + timeout_s
        while time.time() < end:
            if self.state() in states:
                return True
            self.page.wait_for_timeout(250)
        return False

    def key(self, k, wait=450):
        self.page.keyboard.press(k)
        self.page.wait_for_timeout(wait)

    def hold(self, k, ms):
        self.page.keyboard.down(k)
        self.page.wait_for_timeout(ms)
        self.page.keyboard.up(k)

    def shot(self, name):
        path = os.path.join(self.shots_dir, f"{self.tag}-{len(self.shots):02d}-{name}.png")
        self.page.screenshot(path=path)
        self.shots.append(path)
        return path

    def close(self):
        self.page.close()


def changed(a, b):
    return ImageChops.difference(Image.open(a).convert("RGB"), Image.open(b).convert("RGB")).getbbox() is not None


def filled(path):
    im = Image.open(path).convert("RGB").resize((160, 90))
    bg = max(im.getcolors(160 * 90), key=lambda c: c[0])[1]
    diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L")
    return sum(diff.histogram()[17:]) / (160 * 90)


def enter_game(s, res):
    """Title -> how-to -> game with real key presses."""
    s.page.wait_for_timeout(900)
    res["title_shot"] = s.shot("title")
    res["title_filled"] = round(filled(res["title_shot"]), 3)
    s.key("Enter", 600)
    res["howto"] = s.state()
    s.shot("howto")
    s.key("Enter", 800)
    res["game_state"] = s.state()
    return s.g("__game.scene") not in ("Title", "HowTo", "Boot")


# ---------------------------------------------------------------- stages
def stage_theme(dist, theme, tmp, name):
    d = os.path.join(tmp, name)
    shutil.copytree(dist, d)
    json.dump(theme, open(os.path.join(d, "theme/theme.json"), "w"), ensure_ascii=False)
    return d


def run_theme(browser, root, port_map, name, cfg, out, bot=True):
    res = {"theme": name, "ok": False}
    s = Session(browser, f"http://127.0.0.1:{port_map}/{name}/", out, name)
    try:
        res["theme_issues"] = s.g("__game.themeIssues")
        res["in_game"] = enter_game(s, res)
        a = s.shot("play-start")
        for k in cfg.get("play_keys", ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]):
            s.hold(k, 700)
        b = s.shot("play-keys")
        res["animating"] = changed(a, b)
        if bot:
            s.g("__game.debug.autopilot(true); __game.debug.speed(%d)" % cfg.get("bot_speed", 6))
            t0 = time.time()
            done = s.wait_state(["win", "lose"], cfg.get("bot_timeout_s", 150))
            res["bot_outcome"] = s.state() if done else "timeout"
            res["bot_seconds"] = round(time.time() - t0)
            res["bot_elapsed_game_s"] = round(s.g("__game.elapsed") or 0)
            res["bot_stats"] = s.g("__game.stats")
        else:
            s.g("__game.debug.lose()")
            s.wait_state(["lose"], 10)
        s.page.wait_for_timeout(1500)
        s.shot("end")
        res["end_state"] = s.state()
        s.key("Enter", 1500)
        res["restart_state"] = s.state()
        res["restarted"] = s.g("__game.scene") not in ("End", "Title", "HowTo")
        res["fallbacks"] = s.g("__game.fallbacks")
        res["text_warnings"] = s.g("__game.textWarnings")
        res["fps"] = s.g("__game.fps")
    except Exception as e:  # noqa: BLE001 - report, don't crash the whole run
        res["exception"] = str(e)[:400]
    res["errors"] = s.errors
    res["shots"] = s.shots
    s.close()
    expect = cfg.get("bot_expect") if bot else None
    res["ok"] = bool(res.get("in_game") and res.get("animating") and not res["errors"] and res.get("restarted")
                     and res.get("end_state") in ("win", "lose") and (expect is None or res.get("bot_outcome") == expect))
    return res


def run_fuzz(browser, port, name, out, keep_shots):
    res = {"theme": name, "ok": False}
    s = Session(browser, f"http://127.0.0.1:{port}/{name}/", out, name)
    try:
        res["theme_issues"] = len(s.g("__game.themeIssues"))
        res["in_game"] = enter_game(s, res)
        s.page.wait_for_timeout(1200)
        s.shot("play")
        s.g("__game.debug.lose()")
        res["ended"] = s.wait_state(["lose"], 10)
        s.page.wait_for_timeout(1200)
        s.shot("end")
    except Exception as e:  # noqa: BLE001
        res["exception"] = str(e)[:400]
    res["errors"] = s.errors
    res["text_warnings"] = len(s.g("__game.textWarnings") or [])
    if not keep_shots:
        for p in s.shots:
            os.remove(p)
        s.shots = []
    res["shots"] = s.shots
    s.close()
    res["ok"] = bool(res.get("in_game") and res.get("ended") and not res["errors"])
    return res


def run_load(browser, port, name, out):
    s = Session(browser, f"http://127.0.0.1:{port}/{name}/", out, "load")
    res = {}
    try:
        enter_game(s, {})
        if not s.g("typeof __game.debug.flood === 'function'"):
            return {"skipped": "kit has no debug.flood"}
        s.g("__game.debug.god(true); __game.debug.autopilot(true); __game.debug.flood()")
        s.page.wait_for_timeout(1500)
        fps = []
        for _ in range(10):
            s.page.wait_for_timeout(500)
            fps.append(s.g("__game.fps"))
        res = {"fps_min": min(fps), "fps_avg": round(sum(fps) / len(fps), 1), "stats": s.g("__game.stats")}
        s.shot("peak")
    except Exception as e:  # noqa: BLE001
        res["exception"] = str(e)[:400]
    res["errors"] = s.errors
    s.close()
    return res


def contact_sheet(paths, out, cols=4, w=480, h=270):
    paths = [p for p in paths if os.path.exists(p)]
    if not paths:
        return
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 12)), (20, 20, 20))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        x, y = (i % cols) * w, (i // cols) * (h + 12)
        sheet.paste(Image.open(p).convert("RGB").resize((w, h)), (x, y + 12))
        d.text((x + 3, y), os.path.basename(p)[:70], fill=(220, 220, 220))
    sheet.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("--fuzz", type=int, default=20)
    ap.add_argument("--no-bot", action="store_true")
    ap.add_argument("--only", help="comma-separated theme names to run (default, example names)")
    ap.add_argument("--out")
    a = ap.parse_args()
    kit_dir = os.path.join(KITS, a.kit)
    kit = json.load(open(os.path.join(kit_dir, "kit.json")))
    cfg = kit.get("tests", {})
    dist = os.path.join(kit_dir, "dist")
    out = a.out or os.path.join(kit_dir, "test-results")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    tmp = tempfile.mkdtemp(prefix="accept-")
    default = json.load(open(os.path.join(kit_dir, "themes/default.json")))
    themes = {"default": default}
    ex_dir = os.path.join(kit_dir, "themes/examples")
    if os.path.isdir(ex_dir):
        for f in sorted(os.listdir(ex_dir)):
            if f.endswith(".json"):
                themes[f[:-5]] = json.load(open(os.path.join(ex_dir, f)))
    if a.only:
        themes = {k: v for k, v in themes.items() if k in a.only.split(",")}
    # Bot run uses the patched default (e.g. easy difficulty) as its own theme.
    bot_theme = copy.deepcopy(default)
    for k, v in cfg.get("bot_patch", {}).items():
        set_path(bot_theme, k, v)
    for name, th in themes.items():
        stage_theme(dist, th, tmp, name)
    stage_theme(dist, bot_theme, tmp, "bot")
    rnd = random.Random(1234)
    fuzz_names = []
    for i in range(a.fuzz):
        n = f"fuzz{i:02d}"
        stage_theme(dist, mutate(default, rnd), tmp, n)
        fuzz_names.append(n)
    srv, port = serve(tmp)
    report = {"kit": a.kit, "themes": [], "fuzz": [], "bot": None, "load": None}
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required",
                                                                "--use-gl=angle", "--use-angle=swiftshader"])
        for name in themes:
            r = run_theme(browser, tmp, port, name, cfg, out, bot=False)
            report["themes"].append(r)
            print(f"theme {name}: {'PASS' if r['ok'] else 'FAIL'}", flush=True)
        if not a.no_bot:
            r = run_theme(browser, tmp, port, "bot", cfg, out, bot=True)
            report["bot"] = r
            print(f"bot: {'PASS' if r['ok'] else 'FAIL'} outcome={r.get('bot_outcome')} game_s={r.get('bot_elapsed_game_s')}", flush=True)
        for i, n in enumerate(fuzz_names):
            r = run_fuzz(browser, port, n, out, keep_shots=i < 4)
            report["fuzz"].append(r)
            if not r["ok"]:
                json.dump(json.load(open(os.path.join(tmp, n, "theme/theme.json"))), open(os.path.join(out, f"{n}-theme.json"), "w"), indent=1, ensure_ascii=False)
        print(f"fuzz: {sum(r['ok'] for r in report['fuzz'])}/{len(fuzz_names)} passed", flush=True)
        report["load"] = run_load(browser, port, "default", out)
        print(f"load: {json.dumps({k: v for k, v in report['load'].items() if k != 'stats'})}", flush=True)
        browser.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    report["seconds"] = round(time.time() - t0)
    report["ok"] = (all(r["ok"] for r in report["themes"]) and all(r["ok"] for r in report["fuzz"])
                    and (a.no_bot or report["bot"]["ok"]) and not report["load"].get("errors"))
    json.dump(report, open(os.path.join(out, "report.json"), "w"), indent=1, ensure_ascii=False)
    shots = [s for r in report["themes"] + ([report["bot"]] if report["bot"] else []) + report["fuzz"] for s in r.get("shots", [])]
    contact_sheet(shots, os.path.join(out, "contact.png"))
    print(("PASS" if report["ok"] else "FAIL") + f" in {report['seconds']}s -> {out}/report.json")
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
