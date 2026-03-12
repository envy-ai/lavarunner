# Animation And Hitboxes

This project uses a custom entity animation and collision model on top of Pixelbox-style rendering. Sprite selection and hitboxes are defined in gameplay code/data, not in Phaser animation configs.

## Quick Answer

- Entity animations are defined in each entity class via `this.states` (`anim` + `reset`).
- Entity body hitboxes are defined via `this.bbox` in each entity class.
- Player weapon attack hitboxes are defined in `assets/data/weapons.json` per frame (`bbox`).
- Tile collision categories (`solid`, `platform`, `exit`) come from `assets/data/tiletypes.json`.

## Confirmed Authoring Conventions

- `bbox` max edges (`x2`, `y2`) are treated as inclusive in collision math.
- Author body and weapon `bbox` values in right-facing local space; runtime mirroring handles left-facing.
- Include a `0` threshold key in entity `anim` tables and weapon `frames` tables.

## Where Animations Are Defined

### 1. Per-entity state animation tables

Each entity class defines a `states` object in its constructor. Example pattern:

```js
this.states = {
  [state.move]: {
    anim: {
      0: 3,
      4: 2,
      8: 1,
    },
    reset: 12,
  },
};
```

Key files:

- `src/entity/player/player.js`
- `src/entity/enemy/enemies/*.js`
- `src/entity/goodie/goodies/*.js`

### 2. How a frame is picked

Frame selection is centralized in `src/entity/entity.js`:

- `getSprite()` reads `this.states[this.state].anim`
- It selects the latest sprite key whose counter threshold is <= `stateCounter`

`stateCounter` lifecycle:

- Incremented every update in `updateStateCounter()`
- Reset to `0` when `setState(newState)` changes state
- Looped or held by each state's `reset` value:
- `reset > 0`: loop when counter reaches reset
- `reset == 0`: effectively fixed first frame
- `reset == -1`: do not auto-loop

### 3. Global enums used by states/facing

Defined in `src/main.js`:

- `window.state` enum values (`stand`, `move`, `jump`, etc.)
- `window.facing` (`left`, `right`)

## Where Hitboxes Are Defined

### 1. Entity body hitbox (`this.bbox`)

Base default is in `src/entity/entity.js`, but each gameplay entity usually overrides it in its constructor:

- `src/entity/player/player.js`
- `src/entity/enemy/enemies/*.js`
- `src/entity/goodie/goodies/*.js`
- `src/entity/script/*.js`

`bbox` format:

```js
{
  x1: number,
  y1: number,
  x2: number,
  y2: number
}
```

Coordinates are local to the entity's top-left sprite anchor (tile size is 8 px).

### 2. Facing-aware mirroring

`getBbox()` in `src/entity/entity.js` mirrors `bbox` when facing left. This is why most entities only define one bbox orientation.

### 3. World-space conversion

`getRealBbox()` in `src/entity/entity.js` converts local bbox to world coordinates by offsetting with entity `x`/`y`.

### 4. Collision checks that consume bboxes

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

Each weapon chain entry can contain:

- `anim_duration`
- `cancel`
- `origin`
- `frames`

Inside `frames`, each key is a frame threshold and each value can contain:

- `sprite`: weapon sprite index/atlas chunk
- `bbox`: attack hitbox for that frame, or `null`
- optional motion impulses: `xm`, `ym`

Runtime flow in `src/entity/player/player.js`:

1. Determine current attack frame from `anim_duration - attackTimer`
2. Select latest applicable `frames[f]`
3. Set `weapon_sprite`
4. Read `bbox` via `getWeaponBbox()`, mirror for facing, then convert to world coords via `getRealWeaponBbox()`
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

1. Update the entity's `this.states` animation map.
2. Update the entity's `this.bbox`.
3. Verify behavior in both facings (left/right mirroring).
4. If changing attacks, update `assets/data/weapons.json` `frames` `sprite`/`bbox`.
5. Validate against solid/platform tiles from `assets/data/tiletypes.json`.

## Common Gotchas

- This project does not use Phaser animation clips for gameplay entities; changing Phaser `anims` will not affect these sprites.
- `anim` and weapon `frames` keys are threshold points, not "single-frame only" entries.
- A `bbox: null` on a weapon frame means no hitbox (no damage) for that slice.
- Facing left mirrors bboxes automatically, so raw numbers should usually be authored for right-facing orientation.
- Bbox bounds are inclusive; avoid assuming `x2`/`y2` are exclusive edges when tuning collision.
- Omitting a `0` threshold can cause undefined startup frame behavior; always include `0`.
