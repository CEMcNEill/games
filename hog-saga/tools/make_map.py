"""One-off generator for the hand-tuned overworld in src/map.ts (run once, then the map is fixed code).
Legend: . grass  " flowers  , path  T tree  ~ water  = bridge  ^ mountain  : sand  r rock
        _ cave floor  # cave wall  H house  I inn  % lair floor  & lair wall  F coffee station (heals)
        s start  n NPC  c chest  1-8 encounters  B boss  G/g/X gates (open when their area is cleared)"""
import random

W, H = 60, 34
rnd = random.Random(42)
m = [["." for _ in range(W)] for _ in range(H)]


def put(x, y, ch):
    m[y][x] = ch


def rect(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(x, y, ch)


# borders
for x in range(W):
    put(x, 0, "T" if x < 39 else "^")
    put(x, H - 1, "T" if x < 39 else "^")
for y in range(H):
    put(0, y, "T")
    put(W - 1, y, "^")
# region 3 is desert
rect(41, 1, 58, 32, ":")
# river + bridge
rect(19, 1, 20, 32, "~")
rect(19, 16, 20, 17, "=")
# mountains + pass
rect(39, 1, 40, 32, "^")
rect(39, 8, 40, 9, ",")

# ---- region 1: town + meadow
rect(2, 2, 14, 11, ",")           # town square
for (hx, hy) in ((3, 3), (11, 3), (3, 8)):
    rect(hx, hy, hx + 1, hy + 1, "H")
rect(11, 8, 12, 9, "I")            # inn
for (x, y) in ((6, 3), (9, 3), (6, 10), (9, 10), (2, 6), (14, 6)):
    put(x, y, '"')
rect(8, 11, 9, 17, ",")            # road south
rect(8, 16, 18, 17, ",")           # road east to bridge
for _ in range(60):
    x, y = rnd.randrange(1, 18), rnd.randrange(13, 32)
    if m[y][x] == "." and not (7 <= x <= 10) and not (15 <= y <= 18):
        put(x, y, "T" if rnd.random() < 0.55 else '"')
for _ in range(10):
    x, y = rnd.randrange(15, 18), rnd.randrange(2, 12)
    if m[y][x] == ".":
        put(x, y, "T")

# ---- region 2: forest + cave
for y in range(1, 33):
    for x in range(21, 39):
        if rnd.random() < 0.38:
            put(x, y, "T")
rect(21, 16, 31, 17, ",")          # path from bridge
rect(30, 8, 31, 17, ",")           # path north to the pass
rect(30, 8, 38, 9, ",")
rect(30, 17, 31, 19, ",")          # path south to the cave
rect(24, 20, 37, 32, "#")          # cave
rect(25, 21, 36, 31, "_")
rect(30, 20, 31, 20, "_")          # cave mouth
rect(25, 26, 33, 26, "#")          # inner wall with a gap on the right
rect(22, 14, 23, 15, ".")
# clear around key spots
for (x, y) in ((22, 14), (23, 14), (22, 15), (23, 15), (29, 12), (32, 12), (29, 11)):
    put(x, y, ".")

# ---- region 3: desert + lair
for _ in range(45):
    x, y = rnd.randrange(41, 59), rnd.randrange(13, 32)
    if m[y][x] == ":":
        put(x, y, "r")
rect(44, 26, 47, 28, "~")          # oasis
rect(41, 8, 44, 9, ",")
rect(43, 8, 44, 15, ",")
rect(43, 14, 53, 15, ",")
rect(52, 14, 53, 24, ",")
rect(46, 1, 58, 12, "&")           # lair
rect(47, 2, 57, 11, "%")
rect(52, 12, 53, 13, ",")
for (x, y) in ((49, 4), (55, 4), (49, 8), (55, 8)):
    put(x, y, "&")                 # pillars

# ---- markers
put(7, 6, "s")
put(5, 4, "n"); put(9, 7, "n"); put(13, 5, "n")
put(10, 9, "c") if False else None
put(3, 30, "c")                    # chest 1 (meadow)
put(36, 22, "c")                   # chest 2 (cave)
put(26, 30, "c")                   # chest 3 (cave, lower)
put(57, 31, "c")                   # chest 4 (desert)
put(48, 17, "c")                   # chest 5 (desert: relic)
put(5, 22, "1"); put(14, 25, "2")
put(30, 18, "3"); put(27, 23, "4"); put(29, 29, "5")
put(44, 12, "6"); put(52, 22, "7"); put(52, 13, "8")
put(52, 4, "B")
rect(21, 16, 21, 17, "G")
rect(41, 8, 41, 9, "g")
rect(52, 12, 53, 12, "X")
put(23, 15, "F")
put(45, 9, "F")

rows = ["".join(r) for r in m]
assert all(len(r) == W for r in rows)
print("export const MAP: string[] = [")
for r in rows:
    print("  " + repr(r).replace('"', '\\"').replace("'", "'") + ",")
print("];")
