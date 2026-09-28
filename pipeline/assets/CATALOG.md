# CC0 asset packs (all public domain: CC0 1.0, no attribution required)

Bases for Claude-drawn sprites. Workflow and rules: `~/games/kits/shared/prompts/sprite-style.md`.
Tool: `~/games/tools/pixel.py` (browse a sheet with indices, grab cells into a .sprite, render, lint).
Re-download: Kenney from kenney.nl/assets/<name>; itch packs with `~/games/tools/itch_dl.py <page> <dir>`.

| Pack | Licence (verified 2026-09-28) | Size | Best for |
|---|---|---|---|
| ninja-adventure (Pixel-Boy & AAA) | LICENSE.txt = CC0 1.0 | 16px actors (64x64 sheets: 4 directions x 4 frames), bosses up to ~80px | creatures, characters, bosses, faces (Faceset.png 38x38), items, FX, UI. Style anchor: warm, outlined, 5-6 colours per sprite |
| 0x72-dungeontilesetii-v1.7 | itch page: CC0 1.0 | 16x16 atlas, monsters 16x16..32x36 | dungeon monsters (imps, orcs, demons, slimes), props, floors |
| tiny-dungeon (Kenney) | License.txt = CC0 | 16x16 | simple heroes/monsters/items, low-colour |
| tiny-town (Kenney) | CC0 | 16x16 | buildings, shops, city tiles (4X / overworld maps) |
| micro-roguelike (Kenney) | CC0 | 8x8 | tiny icons, pickups, HUD glyphs |
| 1-bit-pack (Kenney) | CC0 | 16x16, 1-colour | icons and symbols to recolour (products, upgrades, UI) |
| pixel-platformer (Kenney) | CC0 | 18x18 | platformer characters, tiles, items |

## Where things are

- Ninja Adventure: `Actor/Monster/<Name>/<Name>.png or SpriteSheet.png` (column 0 = facing down; `--index 0,4` grabs
  2 walk frames), `Actor/Boss/<Name>/Idle.png` (frames in a row; use `--box`), `Actor/Character/<Name>/SpriteSheet.png`
  (60+ people: knights, monks, villagers, inspector, noble, old man... good for a named cast), `Items/`, `FX/`, `Ui/`.
  Contact sheet of all monsters and bosses: `ninja-adventure/monsters-contact.png`.
- 0x72: `0x72_DungeonTilesetII_v1.7/frames/*.png` (one file per animation frame, named `<monster>_idle_anim_f0.png`).
- Kenney: `Tiles/tile_NNNN.png` or `Tilemap/*.png` sheets (use `pixel.py browse --cell 16` to see indices).
