#!/usr/bin/env python3
"""Gate 2: check one assembled prospect game and record a gameplay GIF.

    uv run -q --with playwright --with pillow python game_check.py <game_dir> <out_dir>

Title -> how-to -> game with real keys, a bot run to the end screen (win or lose both fine), restart,
no console/page errors or failed requests, screens not blank. Also records a 5-second GIF of bot play
and a contact sheet. Writes <out_dir>/report.json; exit code 0 only if the game passed.
"""
import json
import os
import shutil
import sys
import tempfile

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__)))), "tests"))
import accept  # noqa: E402


def record_gif(browser, port, name, out_path, seconds=5, fps=8):
    s = accept.Session(browser, f"http://127.0.0.1:{port}/{name}/", os.path.dirname(out_path), "gif")
    frames = []
    try:
        accept.enter_game(s, {})
        s.g("__game.debug.autopilot(true); __game.debug.god(true); __game.debug.showcase && __game.debug.showcase()")
        s.page.wait_for_timeout(3500)  # let the action build up
        for _ in range(seconds * fps):
            png = s.page.screenshot()
            im = Image.open(__import__("io").BytesIO(png)).convert("RGB").resize((480, 270), Image.NEAREST)
            frames.append(im.quantize(colors=64, method=Image.Quantize.MEDIANCUT))
            s.page.wait_for_timeout(int(1000 / fps) - 40)
    finally:
        s.close()
    if frames:
        frames[0].save(out_path, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, optimize=True)
    return len(frames)


def main(game_dir, out_dir):
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    kit = json.load(open(os.path.join(game_dir, "theme", "manifest.json"))).get("kit", "")
    kit_cfg = {}
    kj = os.path.expanduser(f"~/games/kits/{kit}/kit.json")
    if os.path.exists(kj):
        kit_cfg = json.load(open(kj)).get("tests", {})
    cfg = {**kit_cfg, "bot_expect": None}
    tmp = tempfile.mkdtemp(prefix="check-")
    shutil.copytree(game_dir, os.path.join(tmp, "game"))
    srv, port = accept.serve(tmp)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required",
                                                                "--use-gl=angle", "--use-angle=swiftshader"])
        r = accept.run_theme(browser, tmp, port, "game", cfg, out_dir, bot=True)
        try:
            r["gif_frames"] = record_gif(browser, port, "game", os.path.join(out_dir, "gameplay.gif"))
        except Exception as e:  # noqa: BLE001
            r["gif_error"] = str(e)[:300]
        browser.close()
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    blank = [s for s in r.get("shots", []) if accept.filled(s) < 0.01]
    r["blank_shots"] = blank
    theme = json.load(open(os.path.join(game_dir, "theme", "theme.json")))
    name = theme["prospect"]["name"].lower()
    r["name_on_title"] = name in (theme["title"] + " " + theme["tagline"]).lower() or \
        theme["prospect"]["short"].lower() in theme["title"].lower()
    r["passed"] = bool(r["ok"] and not blank)
    json.dump(r, open(os.path.join(out_dir, "report.json"), "w"), indent=1, ensure_ascii=False)
    accept.contact_sheet(r.get("shots", []), os.path.join(out_dir, "contact.png"), cols=3)
    print(json.dumps({k: r.get(k) for k in ("passed", "bot_outcome", "bot_elapsed_game_s", "errors", "fallbacks",
                                             "text_warnings", "theme_issues", "name_on_title", "gif_frames")}, indent=1))
    sys.exit(0 if r["passed"] else 1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
