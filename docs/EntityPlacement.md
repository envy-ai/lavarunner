# Entity Placement

Gameplay entities are authored in LDtk on an entity layer named `entities`.

## Placement Rules

- Each LDtk entity instance must provide `CompatSpriteId`.
- `CompatSpriteId` determines which runtime class is spawned.
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

## Entity Fields (Metadata)

LDtk field instances are normalized back into `entity.metadata`.

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

`scripts/convert_maps_to_ldtk.mjs` migrates legacy metadata from:

- `assets/data/mapdata.json` (`entities` blocks)
- `assets/data/npcs.json`

into LDtk field instances on each generated `entities` layer.
