# Developer Overview

## Runtime Architecture

This project now runs on **Phaser** through a Pixelbox compatibility runtime:

- `index.html` loads `src/phaser.js` and `src/bootstrap.js`.
- `src/bootstrap.js` starts the Phaser game.
- `src/pixelbox_compat.js` provides the Pixelbox-style global API used by game code (`sprite`, `tilesheet`, `getMap`, `gamepad`, `pen`, `paper`, `print`, etc.).
- `src/main.js` and entity logic remain mostly unchanged and run on top of that compatibility layer.

## Rendering Model

The runtime renders to a 128x128 offscreen canvas and displays it via Phaser as a scaled image.

- Logical resolution: `128x128`
- Output scaling is aspect-preserving and centered (no independent X/Y stretch). At `>= 1x`, scale snaps to an integer for crisp pixels; below `1x`, proportional scaling is used.
- Tile size: `8x8`
- Maps are loaded from a generated LDtk project at `assets/maps.ldtk`.
- `src/pixelbox_compat.js` virtualizes LDtk level layers back into the legacy `getMap("<region>/<layer>")` API used by gameplay.
- Gameplay entities are authored on an LDtk `entities` layer and normalized back into `getObjectLayer('entities')`.

## LDtk Source

Runtime source of truth is `assets/maps.ldtk`.

- Map/layer/entity data comes from the LDtk level contents.
- Gameplay entity body animations and body hitboxes also come from the root `spriteEditor` section in `assets/maps.ldtk`.
- Player weapon attack hitboxes also come from root `spriteEditor` `weapon_attack_*` definitions.
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` still choose their visible stand-frame sprite id in gameplay code,
  but their animation timing/source is now LDtk-backed too.
- Script trigger hitboxes still use hardcoded `this.bbox`.
- Player weapon visuals, origin, timing, knockback, and eval hooks still come from `assets/data/weapons.json`.

The repository still keeps the legacy Pixelbox bank in `assets/maps.json` plus older metadata in:

- `assets/data/mapdata.json`
- `assets/data/npcs.json`

Those files are no longer read by the runtime. They are only used by the one-way migration script:

```bash
npm run convert:maps
```

That command regenerates `assets/maps.ldtk` and backs up the prior LDtk project under
`assets/maps_ldtk_backups/`.

## Asset Notes

The Phaser runtime still expects these tile/image sources:

- `assets/maps_tiled/tiles/outdoor/background.png`
- `assets/maps_tiled/tiles/outdoor/tiles.png`
- `assets/maps_tiled/tiles/cave/background.png`
- `assets/maps_tiled/tiles/cave/foreground.png`
- `assets/maps_tiled/tiles/cave/tiles.png`
- `assets/maps_tiled/tiles/entities.png`
- `assets/fonts/minitext.png`
- `assets/sprites/player_default.png`
- `assets/sprites/enemies.png`
- `assets/sprites/goodies.png`

LDtk tileset definitions in `assets/maps.ldtk` point at those existing PNGs.

## Audio Status

Audio is manifest-driven via `audio/manifest.json`.

- `sfx(name)` resolves from `manifest.sfx[name]`
- `patatracker.playSong(index)` resolves from `manifest.bgm[index]`
- missing mappings/files log errors to the browser console and gameplay continues
