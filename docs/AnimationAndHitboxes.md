# Animation And Hitboxes

This project uses a custom entity animation and collision model on top of Pixelbox-style rendering. Gameplay entity
body animation and body boxes now come from LDtk `spriteEditor`; weapon hitboxes and some script triggers still come
from gameplay code/data, not Phaser animation configs.

## Quick Answer

- Gameplay entity body animations now come from `assets/maps.ldtk` root `spriteEditor`.
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` now get their per-instance stand-frame sprite id from typed LDtk entity
  `sprite` fields through a shared runtime placement-sprite path.
- Gameplay entity body hitboxes now come from LDtk `spriteEditor` `body` boxes.
- Script trigger hitboxes still come from `this.bbox` in `src/entity/script/*.js`.
- Player weapon attack hitboxes now come from LDtk `spriteEditor` `attack` boxes.
- Player weapon attack visuals, origin, timing, knockback, and eval hooks still come from `assets/data/weapons.json`.
- Tile collision categories (`solid`, `platform`, `exit`) come from `assets/data/tiletypes.json`.

## Confirmed Authoring Conventions

- `bbox` max edges (`x2`, `y2`) are treated as inclusive in collision math.
- Author body and weapon `bbox` values in right-facing local space; runtime mirroring handles left-facing.
- Include a `0` threshold key in entity `anim` tables and weapon `frames` tables.
- LDtk `spriteEditor` frame boxes use `x`/`y` plus positive `w`/`h`; the runtime converts them to inclusive
  `{x1, y1, x2, y2}` bbox values.
- Weapon attack frames can intentionally clear a hitbox by using an LDtk frame with no `attack` box at that threshold.

## Where Animations Are Defined

### 1. LDtk body animation + body boxes

The runtime now reads gameplay body animation from the LDtk project root:

- `assets/maps.ldtk` -> `spriteEditor` -> `sprites[]`
- `src/pixelbox_compat.js` parses all runtime-supported sprite definitions at startup and exposes them on
  `assets.spriteEditor[identifier]`
- parsed sprite states now include both `anim` thresholds and `boxesByType.body` thresholds
- entity classes map gameplay states like `state.move` or `state.closed` to LDtk state identifiers like `move`,
  `knockback`, `open`, and `closed`

Current runtime-backed body-animation identifiers:

- player: `player_default`
- enemies: `bee_enemy`, `fireball_enemy`, `inky_enemy`, `inky_projectile`, `lava_bubble_enemy`, `mogus_enemy`
- goodies: `chest_goodie`, `coin_goodie`, `door_goodie`, `grenade_projectile`, `item_goodie`, `npc_goodie`,
  `volcano_goodie`, `weapon_goodie`

Current runtime constraints for LDtk sprite editor playback:

- the referenced sprite identifier must exist in `spriteEditor.sprites[]`
- each runtime-played sprite must be `8x8`
- each frame must contain exactly one `8x8` tile at `(0,0)`
- gameplay sprites must define a `body` box type, and every gameplay-used state must have a `body` box at threshold `0`
- per-frame tile flips and multi-tile compositions are rejected by the current runtime
- each sprite must resolve to a single tileset path across all of its states

### 2. LDtk placement-sprite overrides

Some typed LDtk entities carry a per-instance `sprite` field that should replace the seeded `stand` frame at runtime.
That override is now applied generically by the runtime instead of per-class goodie code.

Runtime flow:

- `src/pixelbox_compat.js` normalizes typed LDtk entity fields and stamps a reserved placement-sprite metadata key for
  `Npc`, `WeaponPickup`, and `ItemPickup`
- `src/entity/entity.js` applies that reserved value to the seeded LDtk `stand` frame during `init(...)`
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` no longer keep custom `setSprite(...)` / `metadata.sprite` override code

### 3. How a frame is picked

Frame selection is centralized in `src/entity/entity.js`:

- `getSprite()` reads the current animation config for the entity state
- for all gameplay entities, that config now comes from `assets.spriteEditor[identifier].states[...]`
- runtime placement-sprite entities first receive the LDtk-authored `stand` frame override during `Entity.init(...)`
- It selects the latest sprite key whose counter threshold is <= `stateCounter`

`stateCounter` lifecycle:

- Incremented every update in `updateStateCounter()`
- Reset to `0` when `setState(newState)` changes state
- Looped or held by each state's timing config:
- `reset > 0`: loop when counter reaches reset
- optional `loopToCounter`: restart from a non-zero timeline point
- `reset == -1`: do not auto-loop

### 4. Global enums used by states/facing

Defined in `src/main.js`:

- `window.state` enum values (`stand`, `move`, `jump`, etc.)
- `window.facing` (`left`, `right`)

### 5. LDtk editor/runtime relationship

`assets/maps.ldtk` contains a root `spriteEditor` block with seeded runtime sprite definitions for the player and the
gameplay entity classes listed above.

- `npm run convert:maps` preserves existing `spriteEditor` content and seeds any missing runtime sprite definitions.
- All gameplay entity body animation now uses that LDtk data at runtime.
- Player weapon attack hitboxes now also use LDtk `spriteEditor` definitions:
  - `weapon_attack_dagger_0`
  - `weapon_attack_sword_0`
  - `weapon_attack_sword_1`
  - `weapon_attack_sword_2`
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` still use typed LDtk `sprite` fields for per-instance visuals, but the
  shared runtime now applies those overrides before class-specific gameplay logic runs.

## Where Hitboxes Are Defined

### 1. Gameplay entity body hitbox (`spriteEditor` `body`)

Gameplay entity body boxes now live in LDtk:

- `assets/maps.ldtk` -> `spriteEditor` -> `sprites[]` -> `states[]` -> `frames[]` -> `boxes[]`
- `scripts/convert_maps_to_ldtk.mjs` seeds and backfills a `body` box type plus per-frame body boxes for the
  runtime-backed gameplay sprites
- `src/pixelbox_compat.js` parses those boxes into `assets.spriteEditor[identifier].states[stateId].boxesByType.body`
- `src/entity/entity.js` resolves `getBbox()` from the current LDtk `body` box track for sprite-editor entities
- `state.custom` falls back to `assets.spriteEditor[identifier].defaultBoxes.body`

Scripts are still code-authored:

- `src/entity/script/script.js`
- `src/entity/script/scripts/exit_script.js`

### 2. Player weapon attack hitbox (`spriteEditor` `attack`)

Player weapon hitboxes now live in separate LDtk sprite-editor definitions:

- `assets/maps.ldtk` -> `spriteEditor` -> `sprites[]` -> `identifier: "weapon_attack_*"`
- each weapon-chain definition uses an `attack` box type and a single `attack` state
- `src/entity/player/player.js` resolves `getWeaponBbox()` from the LDtk `attack` box track for the current weapon,
  chain index, and frame threshold
- explicit empty attack frames resolve to `null` hitboxes, matching the old `bbox: null` behavior
- weapon attack visuals still come from `assets/data/weapons.json` `frames[*].sprite`

### 3. Facing-aware mirroring

`getBbox()` in `src/entity/entity.js` mirrors the resolved local body box when facing left. This is why gameplay body
boxes are still authored once in right-facing local space.

Weapon hitboxes are mirrored separately in `Player.getWeaponBbox()`.

### 4. World-space conversion

`getRealBbox()` in `src/entity/entity.js` converts local bbox to world coordinates by offsetting with entity `x`/`y`.
`Player.getRealWeaponBbox()` does the same for the current weapon attack box plus weapon origin offsets.

### 5. Collision checks that consume bboxes

In `src/entity/entity.js`:

- `getMove()` handles tile collision resolution using bbox edges
- `collidingWith(entity)` does AABB-vs-AABB
- `collidingWithBox(rect)` does AABB-vs-raw box
- `touching*` helpers probe neighboring tiles around the bbox

## Tile Collision Data Source

Tile collision is property-driven:

- `assets/data/tiletypes.json` maps sprite IDs -> properties like `solid`, `platform`, `exit`
- `src/main.js` loads active tile properties for current map tilesheet into global `tiles`
- `Entity.touchingTile()` and movement code test these properties

## Weapon Attack Animations And Hitboxes

Player melee/ranged attack frame data is data-driven in:

- `assets/data/weapons.json`
- `assets/maps.ldtk` root `spriteEditor` (`weapon_attack_*` definitions for hitboxes only)

Each weapon chain entry can contain:

- `anim_duration`
- `cancel`
- `origin`
- `frames`

Inside `frames`, each key is a frame threshold and each value can contain:

- `sprite`: weapon sprite index/atlas chunk
- optional motion impulses: `xm`, `ym`

Runtime flow in `src/entity/player/player.js`:

1. Determine current attack frame from `anim_duration - attackTimer`
2. Select latest applicable `frames[f]`
3. Set `weapon_sprite`
4. Read the LDtk `weapon_attack_*` `attack` box via `getWeaponBbox()`, mirror for facing, then convert to world coords
   via `getRealWeaponBbox()`
5. Check enemies with `enemy.collidingWithBox(weapon_real_bbox)`

## Sprite Sheets Used For Entity Drawing

Entity base/default sprite sheet is set on classes:

- `src/entity/entity.js`: default `assets.tilesheet`
- `src/entity/enemy/enemy.js`: `assets.sprites.enemies`
- `src/entity/goodie/goodie.js`: `assets.sprites.goodies`
- `src/entity/player/player.js`: `assets.sprites.player_default`

The actual draw call is in `Entity.draw()` (`src/entity/entity.js`) via Pixelbox-style `sprite(...)`.

## Debugging Aids

- `this.showBbox` on entities draws their body box in `Entity.draw()`
- `drawBbox(...)` and `queueBox(...)` helpers are in `src/main.js`
- Weapon hitbox debug hook is in `src/entity/player/player.js` (commented `queueBox(weapon_real_bbox)`)

## Typical Edit Checklist

When changing visuals/collision for an entity:

1. Update the animation source for the thing you are changing:
   - entity body animation: `assets/maps.ldtk` root `spriteEditor`
   - if the entity uses a typed LDtk `sprite` placement field (`NpcGoodie` / `WeaponGoodie` / `ItemGoodie`), edit that
     LDtk field for per-instance visuals; the runtime applies the `stand` frame override automatically
2. Update the gameplay entity's LDtk `body` boxes, or update `this.bbox` only if you are editing a script trigger.
3. Verify behavior in both facings (left/right mirroring).
4. If changing attacks, update:
   - `assets/maps.ldtk` `weapon_attack_*` `attack` boxes for hitboxes
   - `assets/data/weapons.json` `frames` `sprite` plus other non-hitbox weapon metadata
5. Validate against solid/platform tiles from `assets/data/tiletypes.json`.

## Common Gotchas

- This project does not use Phaser animation clips for gameplay entities; changing Phaser `anims` will not affect these sprites.
- Gameplay body animation is now sourced from LDtk `spriteEditor`.
- Gameplay body hitboxes are now sourced from LDtk `spriteEditor` `body` boxes.
- Player weapon attack hitboxes are now sourced from LDtk `spriteEditor` `attack` boxes.
- `NpcGoodie`, `WeaponGoodie`, and `ItemGoodie` still use typed LDtk `sprite` fields for per-instance visuals, so
  changing their authored default tile in root `spriteEditor` does not replace those per-instance LDtk field values.
- If `assets/maps.ldtk` is missing required runtime sprite definitions, entity construction throws instead of silently
  falling back to hardcoded constructor tables.
- If a gameplay LDtk sprite is missing its `body` boxes, entity construction/runtime bbox lookup throws instead of
  silently falling back to constructor `bbox` data.
- If a weapon attack LDtk sprite is missing its `attack` boxes, `Player.getWeaponBbox()` throws instead of silently
  falling back to `weapons.json`.
- `anim` and weapon `frames` keys are threshold points, not "single-frame only" entries.
- An attack frame with no LDtk `attack` box means no hitbox (no damage) for that slice.
- Facing left mirrors bboxes automatically, so raw numbers should usually be authored for right-facing orientation.
- Bbox bounds are inclusive; avoid assuming `x2`/`y2` are exclusive edges when tuning collision.
- Omitting a `0` threshold can cause undefined startup frame behavior; always include `0`.
