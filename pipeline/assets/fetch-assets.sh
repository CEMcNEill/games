#!/bin/bash
# Download the CC0 asset packs listed in CATALOG.md into ~/games/assets (not committed: ~120 MB).
set -e
A=${ASSETS:-$HOME/games/assets}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$A/_dl" && cd "$A/_dl"
for p in tiny-dungeon tiny-town micro-roguelike 1-bit-pack pixel-platformer; do
  u=$(curl -sL "https://kenney.nl/assets/$p" | grep -oE 'https://kenney.nl/media/pages/assets/[^"]+\.zip' | head -1)
  curl -sL -o "$p.zip" "$u" && mkdir -p "$A/$p" && unzip -qo "$p.zip" -d "$A/$p" && echo "kenney $p"
done
python3 "$HERE/itch_dl.py" https://0x72.itch.io/dungeontileset-ii . .zip
mkdir -p "$A/0x72-dungeontilesetii-v1.7" && unzip -qo 0x72_DungeonTilesetII_v1.7.zip -d "$A/0x72-dungeontilesetii-v1.7"
rm -rf "$A/0x72-dungeontilesetii-v1.7/__MACOSX"
python3 "$HERE/itch_dl.py" https://pixel-boy.itch.io/ninja-adventure-asset-pack . "Asset Pack"
mkdir -p "$A/ninja-adventure" && unzip -qo Ninja* -d "$A/ninja-adventure"
ln -sf "$HERE/CATALOG.md" "$A/CATALOG.md"; ln -sf "$HERE/LICENSES.md" "$A/LICENSES.md"
cd "$A" && rm -rf _dl && echo "assets ready in $A"
