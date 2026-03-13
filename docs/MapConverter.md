# MapConverter

Map conversion script:

- `scripts/convert_maps_to_ldtk.mjs`
- `scripts/extract_ldtk_compat_meta.mjs`

## Purpose

Converts the legacy Pixelbox map bank in `assets/maps.json` plus legacy map metadata in
`assets/data/mapdata.json` and `assets/data/npcs.json` into a single LDtk project.

## Output

- `assets/maps.ldtk`
- `assets/maps.ldtk.meta.json`
- `assets/maps_ldtk_backups/maps_<timestamp>.ldtk` (automatic backup of the prior generated project)

## Usage

```bash
npm run convert:maps
npm run extract:ldtk-meta
```

## Notes

- Tile size is fixed at `8x8`.
- The generated project targets the official LDtk `1.5.3` JSON schema, including root project settings, level metadata,
  field definitions, layer definitions, and editor-required instance fields.
- `npm run convert:maps` now emits both the editor-facing LDtk project and a runtime compat sidecar
  (`assets/maps.ldtk.meta.json`).
- Output is one LDtk level per logical region or standalone map.
- Legacy `bg.*`, `main`, and `fg` maps become LDtk tile layers inside that level.
- Legacy `"<region>/entities"` maps become the LDtk `entities` layer.
- Tileset sizes are read from the source PNG files, so LDtk sees the real atlas dimensions instead of hard-coded `16x16`
  tile pages.
- Tile layers write both `__tilesetDefUid` and `overrideTilesetUid` on each LDtk layer instance so the editor keeps the
  correct sheet bound even when the same logical layer name (`main`, `bg_0`, etc.) is reused across levels with
  different tilesets.
- Background layers are padded to the `main` layer dimensions, and their original width/height plus parallax values
  are stored in the LDtk level field `CompatMapsJson`.
- Remaining runtime metadata (`bgcolor`, `atlas`) is also serialized into `CompatMapsJson`, so the runtime no longer
  reads `assets/data/mapdata.json` or `assets/data/npcs.json`.
- Entity metadata is serialized into LDtk field instances, with `dialog` pretty-printed as JSON text.
- LDtk currently rewrites some hidden compat field values to `null` on save, so the runtime also reads
  `assets/maps.ldtk.meta.json` for preserved `CompatMapsJson` and entity metadata keyed by LDtk level/entity identity.
- `npm run extract:ldtk-meta` can rebuild the sidecar from an intact LDtk project or backup without regenerating
  `assets/maps.ldtk`, which is useful after editor-only layout changes.
- The converter validates that metadata coordinates match actual entity placements and throws on mismatch.
- Runtime map names are preserved in `CompatMapsJson` so gameplay can continue using `getMap("Crash Site/bg.0")`.
- `flipR`/diagonal tile rotation is rejected during conversion because the runtime now stores maps in LDtk tile layers.
