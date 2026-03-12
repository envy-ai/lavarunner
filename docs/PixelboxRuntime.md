# PixelboxRuntime

`src/pixelbox_compat.js` contains the Phaser-backed compatibility layer.

## Responsibilities

- Loads project images and JSON data through Phaser.
- Builds the legacy `window.assets` structure expected by gameplay code.
- Loads converted Tiled map data from `assets/maps_tiled/manifest.json` and combined-region JSON files.
- Resolves manifest `tilelayer` entries into virtual per-layer `CompatTileMap` instances.
- Exposes Pixelbox-like globals:
  - drawing: `tilesheet`, `sprite`, `draw`, `cls`, `rect`, `rectf`, `pen`, `paper`, `print`
  - map access: `getMap`
  - input: `gamepad`
  - audio: `sfx`, `music`, `patatracker.playSong`, `patatracker.stop`
  - helpers: `clamp`, `random`
- Updates input each Phaser frame and calls `update()` from `src/main.js`.
- Loads `audio/manifest.json` and routes audio calls without aborting gameplay if files are missing.
- Scales the 128x128 render surface with preserved aspect ratio and centered letterboxing; uses integer scale factors when viewport size is at least `1x`.
- Draws `print` text using a bitmap font atlas (legacy Pixelbox mini text glyphs, default `4x6` cells) with color tinting.
- Runtime default charset comes from `assets/fonts/minitext.png`.
- `setCharset(spriteOrImage)` is supported again; it binds a custom bitmap charset source and updates line metrics.
- The built-in code fallback charset lives in `src/minitext_bitmap_font.js` as an editable `#`/`.` atlas grid.
- Dialog text layout in `src/textbox.js` wraps by measured pixel width (dialog interior width), not fixed character count.

## Map Support

`CompatTileMap` supports:

- `get(x, y)`
- `find(sprite, flagA, flagB)`
- `draw(x, y)`
- `getObjectLayer(name)` for Tiled object layers (returns normalized object entries)
- runtime lookup compatibility: `getMap(nameOrIndex)` returns `undefined` for missing maps (matching Pixelbox behavior)

and preserves tile flip/flag bits from encoded map data.

### Layer + Parallax Metadata

Each loaded `CompatTileMap` also carries:

- `_parallaxX`, `_parallaxY`: taken from Tiled layer `parallaxx` / `parallaxy`
- `_sourceWidth`, `_sourceHeight`: original layer dimensions before converter padding

### Object Layer Shape

`getObjectLayer(name)` returns objects with:

- placement: `x`, `y`, `tx`, `ty` (`y` is normalized to top-left for tile objects)
- tile placement info: `sprite`, `flipH`, `flipV`, `flipR`
- metadata: `properties` (name/value pairs from Tiled custom properties)

## Texture Support

`src/pixelbox_texture.js` replaces `pixelbox/Texture` and is used by `src/textbox.js`.
