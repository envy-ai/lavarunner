# Entity Placement

Gameplay entities are authored in LDtk on an entity layer named `entities`.

## Authoring Model

- Each placement now uses a typed LDtk entity identifier instead of a hidden `CompatSpriteId` field.
- The runtime compatibility layer maps each LDtk identifier back to the legacy sprite id that `src/main.js` still uses for spawning.
- `PlayerSpawn` must appear exactly once per playable map.
- Two legacy placements with no current gameplay behavior are still preserved as explicit LDtk types: `LegacySprite48` and `LegacySprite115`.

## LDtk Entity Types

- `PlayerSpawn` -> legacy sprite `0` -> `Player`
- `Coin` -> legacy sprite `16` -> `CoinGoodie`
- `DoorOpen` -> legacy sprite `17` -> `DoorGoodie`
- `DoorClosed` -> legacy sprite `18` -> `DoorGoodie`
- `Chest` -> legacy sprite `19` -> `ChestGoodie`
- `WeaponPickup` -> legacy sprite `20` -> `WeaponGoodie`
- `Npc` -> legacy sprite `32` -> `NpcGoodie`
- `Exit` -> legacy sprite `34` -> `ExitScript`
- `ItemPickup` -> legacy sprite `35` -> `ItemGoodie`
- `LegacySprite48` -> legacy sprite `48` -> currently ignored by gameplay
- `MogusEnemy` -> legacy sprite `112` -> `MogusEnemy`
- `FireballEnemy` -> legacy sprite `113` -> `FireballEnemy`
- `Volcano` -> legacy sprite `114` -> `VolcanoGoodie`
- `LegacySprite115` -> legacy sprite `115` -> currently ignored by gameplay
- `BeeEnemy` -> legacy sprite `116` -> `BeeEnemy`
- `InkyEnemy` -> legacy sprite `117` -> `InkyEnemy`

## Metadata Fields

LDtk field instances are normalized back into `entity.metadata`. Required fields are now typed directly on the relevant LDtk entity definitions, so the editor can validate them without relying on hidden compat fields.

- `DoorOpen`, `DoorClosed`, and `Exit`:
  - `map` (`string`, required)
  - `x` (`int`, optional; requires `y` at runtime)
  - `y` (`int`, optional; requires `x` at runtime)
- `Chest`:
  - `contents` (`Multilines`, required JSON object; example `{"key":1}`)
  - `sprite` (`int`, optional custom pickup sprite shown to player)
- `WeaponPickup`:
  - `sprite` (`int`, required)
  - `weapon` (`string`, required)
- `ItemPickup`:
  - `sprite` (`int`, required)
  - `item` (`string`, required)
- `Npc`:
  - `sprite` (`int`, required)
  - `dialog` (`Multilines`, required JSON array of dialog entries)

For `WeaponPickup`, `ItemPickup`, and `Npc`, the runtime now consumes the typed LDtk `sprite` field through a shared
placement-sprite path and applies it to the seeded LDtk `stand` frame automatically during entity initialization.

## Strict Parsing

- `dialog` and `contents` are parsed as JSON at load time.
- Invalid/missing required metadata throws an error instead of silently falling back.
- The runtime still accepts older `CompatEntity` / `CompatSpriteId` projects for compatibility, but new generated LDtk projects no longer depend on hidden entity fields.

## Converter Migration

`scripts/convert_maps_to_ldtk.mjs` migrates legacy metadata from:

- `assets/data/mapdata.json` (`entities` blocks)
- `assets/data/npcs.json`

into typed LDtk entity instances on each generated `entities` layer.
