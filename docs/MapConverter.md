# MapConverter

Map conversion script:

- `scripts/convert_maps_to_tiled.mjs`

## Purpose

Converts the legacy Pixelbox map bank in `assets/maps.json` into Tiled JSON maps.

## Output

- `assets/maps_tiled/manifest.json`
- `assets/maps_tiled/<map>.json` (one file per map)

## Usage

```bash
node scripts/convert_maps_to_tiled.mjs
```

## Notes

- Tile size is fixed at `8x8`.
- Pixelbox sprite indices are converted to Tiled GIDs (`gid = sprite + 1`).
- Empty Pixelbox tiles become `gid = 0`.
- Pixelbox flip bits are preserved in Tiled flip flags.
