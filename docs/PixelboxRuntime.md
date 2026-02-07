# PixelboxRuntime

`src/pixelbox_compat.js` contains the Phaser-backed compatibility layer.

## Responsibilities

- Loads project images and JSON data through Phaser.
- Builds the legacy `window.assets` structure expected by gameplay code.
- Loads converted Tiled map data from `assets/maps_tiled/manifest.json` and per-map JSON files.
- Exposes Pixelbox-like globals:
  - drawing: `tilesheet`, `sprite`, `draw`, `cls`, `rect`, `rectf`, `pen`, `paper`, `print`
  - map access: `getMap`
  - input: `gamepad`
  - audio: `sfx`, `music`, `patatracker.playSong`, `patatracker.stop`
  - helpers: `clamp`, `random`
- Updates input each Phaser frame and calls `update()` from `src/main.js`.
- Loads `audio/manifest.json` and routes audio calls without aborting gameplay if files are missing.

## Map Support

`CompatTileMap` supports:

- `get(x, y)`
- `find(sprite, flagA, flagB)`
- `draw(x, y)`
- runtime lookup compatibility: `getMap(nameOrIndex)` returns `undefined` for missing maps (matching Pixelbox behavior)

and preserves tile flip/flag bits from encoded map data.

## Texture Support

`src/pixelbox_texture.js` replaces `pixelbox/Texture` and is used by `src/textbox.js`.
