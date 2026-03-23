# PixelboxRuntime

`src/pixelbox_compat.js` contains the Phaser-backed compatibility layer.

## Responsibilities

- Loads project images and JSON data through Phaser.
- Builds the legacy `window.assets` structure expected by gameplay code.
- Loads the LDtk project from `assets/maps.ldtk`.
- Parses runtime-supported LDtk root `spriteEditor` animation/body-box/attack-box data and exposes it on
  `assets.spriteEditor[identifier]`.
- Loads optional runtime compat metadata from `assets/maps.ldtk.meta.json`.
- Resolves LDtk level/layer metadata into virtual per-layer `CompatTileMap` instances.
- Normalizes typed LDtk entity identifiers back into the legacy sprite ids expected by `src/main.js`.
- Exposes Pixelbox-like globals:
  - drawing: `tilesheet`, `sprite`, `draw`, `cls`, `rect`, `rectf`, `pen`, `paper`, `print`
  - map access: `getMap`
  - input: `gamepad`
  - audio: `sfx`, `music`, `patatracker.playSong`, `patatracker.stop`
  - helpers: `clamp`, `random`, `advanceTime`, `render_game_to_text`
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
- `getObjectLayer(name)` for normalized LDtk entity layers
- runtime lookup compatibility: `getMap(nameOrIndex)` returns `undefined` for missing maps (matching Pixelbox behavior)

and preserves horizontal/vertical tile flip flags from encoded map data.

### Layer + Parallax Metadata

Each loaded `CompatTileMap` also carries:

- `_parallaxX`, `_parallaxY`: taken from preserved compat metadata (`CompatMapsJson` in the LDtk file when present,
  otherwise `assets/maps.ldtk.meta.json`)
- `_sourceWidth`, `_sourceHeight`: original layer dimensions before LDtk padding
- `_bgcolor`: map background color index for `main` layers
- `_atlas`: decorative atlas items authored for that logical layer

### Object Layer Shape

`getObjectLayer(name)` returns objects with:

- placement: `x`, `y`, `tx`, `ty`
- tile placement info: `sprite`, `flipH`, `flipV`, `flipR`
- metadata: `properties` (name/value pairs from LDtk field instances)

The runtime currently copies the LDtk `entities` layer onto every virtual map created from the same level,
matching the old combined-map behavior where the entity object layer was visible from `main`, `bg.*`, and `fg`.

For newly generated projects, `sprite` is inferred from the LDtk entity identifier (`PlayerSpawn`, `Npc`, `DoorOpen`,
etc.) rather than read from a hidden `CompatSpriteId` field.

### LDtk Round-Trip Metadata

- LDtk saves can currently null out hidden compatibility field payloads.
- Current generated projects only still depend on one hidden payload: the level field `CompatMapsJson`.
- Typed LDtk entities no longer require hidden `CompatSpriteId` fields; runtime sprite ids are inferred from the typed
  entity identifier and older files still fall back to embedded compat data or the sidecar.
- To keep gameplay loading stable after editor-only level layout changes, the runtime merges preserved metadata from
  `assets/maps.ldtk.meta.json`.
- Sidecar entity metadata is matched by LDtk entity `iid` first, then by entity grid coordinate as a fallback for
  editor saves that rewrite some entity `iid` values to `0`.

### Sprite Editor Animations And Box Data

- Gameplay entity body animation/body boxes and player weapon attack boxes are sourced from `assets/maps.ldtk` root
  `spriteEditor`.
- Parsed sprite data is exposed on `window.assets.spriteEditor`.
- Each parsed state includes animation thresholds plus `boxesByType` threshold maps.
- Each parsed sprite definition also exposes `defaultBoxes` for fallback use during `state.custom`.
- Runtime-backed identifiers currently include:
  - `player_default`
  - `bee_enemy`, `fireball_enemy`, `inky_enemy`, `inky_projectile`, `lava_bubble_enemy`, `mogus_enemy`
  - `chest_goodie`, `coin_goodie`, `door_goodie`, `grenade_projectile`, `item_goodie`, `npc_goodie`, `volcano_goodie`,
    `weapon_goodie`
  - `weapon_attack_dagger_0`, `weapon_attack_sword_0`, `weapon_attack_sword_1`, `weapon_attack_sword_2`
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` still override their per-instance `stand` frame sprite id from entity
  metadata after construction, but they no longer keep local `this.states` tables.
- Body-animation playback still supports the existing single-tile `8x8` sprite model only:
  - one tile per frame
  - tile placed at `(0,0)`
  - gameplay sprites require a `body` box type with usable per-state box tracks
  - no per-frame tile flips
  - one tileset path per runtime sprite definition
- Weapon attack hitbox definitions are box-driven only at runtime:
  - they use an `attack` box type instead of `body`
  - they may use larger canvases and multi-tile frame visuals for editor context
  - explicit empty `attack` thresholds resolve to `null` hitboxes
- Invalid root `spriteEditor` data throws during startup, and missing required sprite identifiers/body boxes throw when
  the corresponding gameplay entity is constructed.

## Testing Hooks

- `window.advanceTime(ms)` steps the runtime in fixed 60 FPS increments for automation.
- `window.render_game_to_text()` exposes a compact JSON snapshot of map/player/render status.
- In headless Playwright runs, the visible Phaser canvas can capture as black while the offscreen
  `128x128` surface is populated; use `render_game_to_text()` to verify the actual game state.

## Texture Support

`src/pixelbox_texture.js` replaces `pixelbox/Texture` and is used by `src/textbox.js`.
