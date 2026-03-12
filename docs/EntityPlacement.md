# Entity Placement

Gameplay entities are authored in Tiled inside each `"<region>/main"` map file on an object layer named `entities`.

## Placement Rules

- Use **tile objects** on the `entities` object layer.
- The placed tile's sprite index determines which runtime class is spawned.
- `sprite 0` is the player spawn and must appear exactly once per playable map.

## Sprite-to-Entity Mapping

- Player:
  - `0` -> `Player`
- Enemies:
  - `112` -> `MogusEnemy`
  - `113` -> `FireballEnemy`
  - `116` -> `BeeEnemy`
  - `117` -> `InkyEnemy`
- Goodies:
  - `16` -> `CoinGoodie`
  - `17` -> `DoorGoodie` (open)
  - `18` -> `DoorGoodie` (closed)
  - `19` -> `ChestGoodie`
  - `20` -> `WeaponGoodie`
  - `32` -> `NpcGoodie`
  - `35` -> `ItemGoodie`
  - `114` -> `VolcanoGoodie`
- Scripts:
  - `34` -> `ExitScript`

## Object Properties (Metadata)

Properties are read from each placed object and provided as `entity.metadata`.

- `DoorGoodie` and `ExitScript`:
  - `map` (`string`, required)
  - `x` (`int`, optional; requires `y`)
  - `y` (`int`, optional; requires `x`)
- `ChestGoodie`:
  - `contents` (`string`, required JSON object; e.g. `{"key":1}`)
  - `sprite` (`int`, optional custom pickup sprite shown to player)
- `WeaponGoodie`:
  - `sprite` (`int`, required)
  - `weapon` (`string`, required)
- `ItemGoodie`:
  - `sprite` (`int`, required)
  - `item` (`string`, required)
- `NpcGoodie`:
  - `sprite` (`int`, required)
  - `dialog` (`string`, required JSON array of dialog entries)

## Strict Parsing

- `dialog` and `contents` are parsed as JSON at load time.
- Invalid/missing required metadata throws an error instead of silently falling back.

## Converter Migration

`scripts/convert_maps_to_tiled.mjs` migrates legacy metadata from:

- `assets/data/mapdata.json` (`entities` blocks)
- `assets/data/npcs.json`

into Tiled object properties on each generated `entities` layer.
