#!/usr/bin/env python3
"""Screenshots of HogShop for review: title, how-to, day intro, early shift, busy showcase, end of day, bot week, end.

    cd ~/games/kits && uv run -q --with playwright --with pillow python hogshop/tools/shots.py [out_dir] [--theme path.json] [--speed 6]
"""
import json, os, shutil, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tests"))
import accept  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = args[0] if args else os.path.join(KIT, "test-results", "shots")
theme = sys.argv[sys.argv.index("--theme") + 1] if "--theme" in sys.argv else None
speed = int(sys.argv[sys.argv.index("--speed") + 1]) if "--speed" in sys.argv else 6
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp()
d = os.path.join(tmp, "g")
shutil.copytree(os.path.join(KIT, "dist"), d)
if theme:
    shutil.copy(theme, os.path.join(d, "theme/theme.json"))
srv, port = accept.serve(tmp)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", args=["--use-gl=angle", "--use-angle=swiftshader"])
    s = accept.Session(b, f"http://127.0.0.1:{port}/g/", out, "hs")
    s.page.wait_for_timeout(1200)
    s.shot("title")
    s.key("Enter", 700); s.shot("howto")
    s.key("Enter", 2500); s.shot("dayintro")
    s.key("Enter", 400)
    for k in ["ArrowUp", "ArrowUp", "ArrowRight"]:
        s.hold(k, 400)
    s.page.wait_for_timeout(3000); s.shot("early")
    s.g("__game.debug.hog(236, 212)"); s.page.wait_for_timeout(1200)
    print("hint at bottom belt:", s.g("__game.debug.hint()")); s.shot("hint")
    s.g("__game.debug.showcase()"); s.page.wait_for_timeout(2500); s.shot("showcase")
    s.g("__game.debug.tool(0)"); s.page.wait_for_timeout(600); s.shot("tool")
    s.g("__game.debug.skipDay()"); s.page.wait_for_timeout(1500); s.shot("summary")
    print("stats", json.dumps(s.g("__game.stats")))
    s.g("__game.debug.day(1)"); s.page.wait_for_timeout(500)
    s.g(f"__game.debug.autopilot(true); __game.debug.speed({speed})")
    t0 = time.time(); last = None; days = set()
    while time.time() - t0 < 200:
        st = s.g("__game.stats"); state = s.g("__game.state")
        if state == "summary" and st.get("day") not in days:
            days.add(st.get("day")); s.shot(f"bot-summary-day{st.get('day')}")
            print("day", st.get("day"), json.dumps({k: st.get(k) for k in ("rating", "shipped", "dayShipped", "quota", "expired", "wrongDoor", "returnsLost", "grades")}))
        if st.get("day") == 3 and st.get("clock", 0) < 40 and "mid3" not in days and state == "playing":
            days.add("mid3"); s.shot("bot-day3")
        if st.get("day") == 5 and st.get("clock", 0) < 45 and "mid5" not in days and state == "playing":
            days.add("mid5"); s.shot("bot-day5")
        if state in ("win", "lose"):
            break
        s.page.wait_for_timeout(250)
    print("end", s.g("__game.state"), round(time.time() - t0), "s wall", "elapsed", round(s.g("__game.elapsed")))
    s.page.wait_for_timeout(1500); s.shot("end")
    print("errors", s.errors[:5])
    s.close(); b.close()
srv.shutdown()
print(out)
