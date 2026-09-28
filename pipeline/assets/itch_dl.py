#!/usr/bin/env python3
"""itch_dl.py <game page url> <out dir> [name filter]: download the files of a free itch.io asset pack."""
import http.cookiejar, json, os, re, sys, urllib.parse, urllib.request
page, out = sys.argv[1], sys.argv[2]
filt = sys.argv[3] if len(sys.argv) > 3 else ""
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders = [("User-Agent", "Mozilla/5.0"), ("X-Requested-With", "XMLHttpRequest")]
get = lambda u, data=None: op.open(u, urllib.parse.urlencode(data).encode() if data else None).read().decode()
csrf = re.search(r'name="csrf_token" value="([^"]+)"', get(page)).group(1)
listing = get(json.loads(get(page + "/download_url", {"csrf_token": csrf}))["url"])
os.makedirs(out, exist_ok=True)
for uid, name in re.findall(r'data-upload_id="(\d+)".*?class="name">([^<]+)<', listing, re.S):
    if filt not in name:
        continue
    u = json.loads(get(f"{page}/file/{uid}?source=game_download", {"csrf_token": csrf}))["url"]
    fn = os.path.join(out, name.split(" ")[0])
    open(fn, "wb").write(op.open(u).read())
    print(uid, name, os.path.getsize(fn))
