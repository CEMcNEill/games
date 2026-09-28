#!/usr/bin/env python3
"""Run __game.debug.selfTest() (rule engine consistency) on the default theme, the examples, the real prospect
themes and N fuzzed themes.   uv run -q --with playwright --with pillow python data-inspector/tools/selftest.py [--fuzz 10]"""
import argparse, glob, json, os, random, shutil, sys, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from botrun import serve, KIT
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "tests"))
from accept import mutate  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument("--fuzz", type=int, default=10); a = ap.parse_args()
themes = {"default": json.load(open(os.path.join(KIT, "themes/default.json")))}
for f in sorted(glob.glob(os.path.join(KIT, "themes/examples/*.json"))):
    themes[os.path.basename(f)[:-5]] = json.load(open(f))
for m in glob.glob(os.path.expanduser("~/games/play/*/theme/manifest.json")):
    if json.load(open(m)).get("kit") == "data-inspector":
        themes["play:" + m.split("/")[-3]] = json.load(open(os.path.join(os.path.dirname(m), "theme.json")))
rnd = random.Random(99)
for i in range(a.fuzz):
    themes[f"fuzz{i}"] = mutate(themes["default"], rnd)
tmp = tempfile.mkdtemp()
for k, t in themes.items():
    d = os.path.join(tmp, k.replace(":", "_")); shutil.copytree(os.path.join(KIT, "dist"), d)
    json.dump(t, open(os.path.join(d, "theme/theme.json"), "w"))
srv, port = serve(tmp)
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    for k in themes:
        pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto(f"http://127.0.0.1:{port}/{k.replace(':', '_')}/"); pg.wait_for_function("window.__game && window.__game.ready")
        pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
        r = pg.evaluate("__game.debug.selfTest(150)")
        base = sum(r["baseBad"].values()); miss = sum(r["breakMiss"].values())
        ok = miss == 0 and base / r["records"] < 0.03 and not errs
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {k}: records={r['records']} baseline_breaks={r['baseBad']} break_misses={r['breakMiss']} "
              f"break_fails={r['breakFail']} rules={' '.join(r['rules'])} issues={r['issues']} errors={errs}")
        pg.close()
    b.close()
srv.shutdown(); shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if bad else 0)
