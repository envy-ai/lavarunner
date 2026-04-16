# Platformer Map Generator

`src/procgen/platformer_map_generator.mjs` is a standalone procedural map generator for tile-based 2D platformer layouts.

`src/procgen/platformer_map_png.mjs` is a Node-side helper for rendering generated integer tile maps to PNG files.

## What It Returns

`generatePlatformerMap(...)` returns:

- `tiles`: a single-layer `number[][]`
- `tileKey`: semantic tile ids local to the generator
- `movementProfile`: derived movement limits used during synthesis
- `routeMetadata`: the authored traversal route and validation diagnostics

Default tile key:

- `0`: air
- `1`: solid ground
- `2`: one-way platform
- `3`: spikes
- `4`: lava / lethal pit fill
- `5`: accent solid block

## Exported API

- `solveJumpSpeedForHeight({ gravity, targetHeightTiles, tileSizePx })`
- `getJumpProfile({ gravity, jumpSpeed, tileSizePx, landingOffsetPx = 0 })`
- `solveForwardSpeedForDistance({ gravity, jumpSpeed, distanceTiles, tileSizePx, landingOffsetPx = 0 })`
- `generatePlatformerMap({ width = 300, height = 20, tileSizePx, gravity, forwardSpeed, jumpSpeed, playerWidthPx, playerHeightPx, rng = Math.random, maxAttempts = 64, variation })`
- `validatePlatformerMap({ tiles, routeMetadata, tileSizePx, gravity, forwardSpeed, jumpSpeed, playerWidthPx, playerHeightPx })`
- `createRandomDarkTilePalette({ tiles, rng = Math.random, backgroundColor = [255, 255, 255, 255] })`
- `renderTileMapToPngBuffer({ tiles, blockSizePx = 4, backgroundColor = [255, 255, 255, 255], colorByTileId = null, rng = Math.random })`
- `writeTileMapToPng({ tiles, outputPath, blockSizePx = 4, backgroundColor = [255, 255, 255, 255], colorByTileId = null, rng = Math.random })`

`generatePlatformerMap(...)` accepts an additive `variation` object:

- `aerialDensity = 0.7`
- `precisionBias = 0.75`
- `optionalPlatformDensity = 0.45`
- `placementJitter = 0.6`

`validatePlatformerMap(...)` is an extra helper used by generation and smoke tests. It walks the route anchor-by-anchor and simulates each jump with the same discrete update order the repo uses, but it now searches the full walkable takeoff window on each source anchor instead of assuming a single right-edge takeoff.

## Physics Model

The helper math matches the current runtime ordering:

1. `x += xm`
2. `y += ym`
3. `ym += gravity`

This matters for jump tuning. With:

- `gravity = 0.15`
- `tileSizePx = 8`
- `targetHeightTiles = 4.2`

the discrete solver returns:

- `jumpSpeed = 3.1`
- `apexFrames = 21`
- `flightFrames = 43`

The continuous approximation `sqrt(2gh)` is intentionally not used as the authoritative answer because it overshoots this runtime.

## Generator Shape

The generator stitches together a guaranteed main route made of safe anchors and validates the route before returning it. The built-in archetypes include:

- flat runs
- spike trenches
- stair climbs
- raised ledges
- climb towers
- precision airborne platform runs
- low-ceiling passages
- stair descents
- drop shafts
- lava pits
- floating platform bridges
- pillar fields

The current default route mix intentionally biases toward more aerial traversal than the initial version:

- narrow one-way platforms placed at validator-backed landing offsets
- elevated bridge sections with randomized widths, heights, and spacing
- explicit vertical climbs that consume much more of the available height band
- occasional validated descents when the segment pool can place a drop shaft cleanly
- lower landing pads after some pits so descents can keep the route moving vertically without relying only on drop shafts
- precision windows created by smaller platform widths rather than fake tiny gaps that the fixed arc cannot actually land on
- pillar fields with mixed solid / one-way tops
- optional non-route one-way platforms added only when a full revalidation pass says they do not break the guaranteed path
- some high-variation climb shelves extend back left after the landing lip, which creates visible backtracking on a still-forward-validated route

Route-critical aerial sections no longer use fixed landing offsets. They sample from enumerated candidate placements that are proven reachable by the same takeoff-window transition search the validator uses.

The later random section is no longer purely weight-driven. It keeps a quota of meaningful vertical beats so the level does not flatten out after the early showcase sequence.

The generator is height-generic. It still defaults to `20` tiles tall, but it derives the usable vertical band from the supplied `height` and the computed jump apex, so taller maps can use more headroom without changing the API.

The route metadata keeps:

- `anchors`: ordered safe landing / standing surfaces
- `transitions`: ordered `jump` / `drop` moves between anchors
- `segments`: terrain archetypes and the anchors they touch
- `optionalPlatforms`: extra non-route one-way platforms that survived post-placement revalidation
- `archetypes`: unique segment-type summary
- `validation`: final traversal diagnostics produced by `validatePlatformerMap(...)`

Each validated transition now includes the chosen `takeoffLeftX`, so smoke tests and debug artifacts can show which launch point actually made the route work. Segment metadata also records placement windows and per-section width / topY choices for the randomized aerial content.

Vertical segment metadata also includes:

- `totalRiseTiles` for `climb_tower`
- `totalDropTiles` for `drop_shaft`
- `backtrackStepCount` for `climb_tower` when some intermediate shelves extend back left

## PNG Rendering Helper

`writeTileMapToPng(...)` writes a PNG directly with Node built-ins. It uses:

- white for tile `0`
- one random dark RGBA color per non-zero tile id
- `4x4` pixels per tile by default

The helper returns the resolved palette so the caller can see which color each tile id received.

## Smoke Test

Run:

```bash
npm run test:procgen
```

That smoke test verifies:

- the discrete helper regression numbers
- takeoff-window validation on a fixture where the right-edge jump fails but an earlier takeoff succeeds
- deterministic generation with a seeded RNG
- deterministic high-variation generation with repeated seeds
- different seeds produce different platform placements
- PNG rendering with a valid PNG signature and the expected scaled dimensions
- required hazards and terrain variety
- increased airborne platform density under a high-variation profile
- taller climb towers under a high-variation profile
- left-extending climb shelves in the high-variation profile
- meaningful vertical segments still appearing in the later random section
- optional platforms survive a full validation pass and do not overlap guaranteed-route anchors
- successful route validation
- rejection of an intentionally impossible fixture

It also writes artifacts to:

- `tmp/platformer_map_generator_smoke.json`
- `tmp/platformer_map_generator_smoke.png`
