# MapConverter

Map conversion script:

- `scripts/convert_maps_to_tiled.mjs`

## Purpose

Converts the legacy Pixelbox map bank in `assets/maps.json` into Tiled JSON maps.

## Output

- `assets/maps_tiled/manifest.json`
- `assets/maps_tiled/<region>.json` (one combined file per region, plus standalone maps)
- `assets/maps_tiled/tiles/` (runtime-resolved map tile images)
- `assets/maps_tiled_backups/maps_tiled_<timestamp>/` (automatic backup of prior generated output)

## Usage

```bash
node scripts/convert_maps_to_tiled.mjs
```

## Notes

- Tile size is fixed at `8x8`.
- Pixelbox sprite indices are converted to Tiled GIDs per layer tileset (`gid = firstgid + sprite`).
- Empty Pixelbox tiles become `gid = 0`.
- Pixelbox flip bits are preserved in Tiled flip flags.
- Legacy `"<region>/entities"` maps are merged into the corresponding `"<region>/main"` output map as an object layer named `entities`.
- Legacy `bg.*` / `main` / `fg` maps are merged into layer stacks inside one combined region file.
- Background parallax is emitted via Tiled `parallaxx` / `parallaxy` values on background layers.
- Entity metadata from `assets/data/mapdata.json` and `assets/data/npcs.json` is serialized into per-object Tiled properties on that `entities` layer.
- The `dialog` metadata property is serialized as pretty-printed JSON text for easier editing inside Tiled.
- The converter validates that metadata coordinates match actual entity placements and throws on mismatch.
- The manifest keeps per-layer runtime names (for example `"Crash Site/bg.0"`) and maps them to a shared combined file using a `tilelayer` field.
