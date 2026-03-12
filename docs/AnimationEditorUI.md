# Animation Editor UI Specification

## Purpose

Define a standalone web application UI that lets designers create, edit, validate, and preview:

- Entity animation state tables (`this.states`)
- Entity body hitboxes (`this.bbox`)
- Weapon attack chains from `assets/data/weapons.json` (`frames`, per-frame hitboxes, motion impulses)

The app must produce data compatible with the current runtime behavior documented in `docs/AnimationAndHitboxes.md`.

## Product Goals

- Make threshold-based animation editing intuitive for users who do not think in code first.
- Keep collision and hitbox authoring visual-first, with numeric precision always available.
- Prevent invalid data early with clear, actionable errors.
- Match runtime behavior exactly in preview so output is trustworthy.

## Non-Goals

- Replacing Phaser animation systems (not used by gameplay entities).
- Editing tile maps.
- Executing gameplay scripts such as weapon `eval` strings in the preview.

## Runtime Compatibility Rules

The editor must enforce/preview these exact rules:

- Bbox max edges (`x2`, `y2`) are inclusive.
- Body and weapon bboxes are authored in right-facing local space.
- Left-facing uses runtime mirroring logic.
- Animation and weapon frame threshold tables must contain a `0` key.
- Threshold tables are interpreted as "latest key <= counter/frame".
- `reset > 0` loops state counter at `reset`.
- `reset == 0` holds first frame.
- `reset == -1` does not auto-loop.

## Supported Formats

## Entity Animation Profile (editor canonical model)

This model represents data currently stored across entity class constructors:

- `entityName`
- `spriteSheetPath` (example: `sprites/player_default`)
- `bbox`
- `states`

The app must export:

- JSON for sharing/backups.
- JS snippet blocks for direct paste into entity constructor (`this.bbox = ...`, `this.states = ...`).

## Weapon Profile (runtime format)

Directly edits runtime-compatible weapon data shape from `assets/data/weapons.json`:

- Weapon name -> array of chain entries.
- Chain entry fields: `power`, `anim_duration`, optional `cancel`, `sfx`, `knockback`, `origin`, optional `stopMove`, optional `eval`, optional `frames`.
- Frame keys are thresholds (`"0"`, `"3"`, ...).
- Frame fields: `sprite`, `bbox`, optional `xm`, optional `ym`.

The app must preserve unknown keys when loading/saving weapon chain entries.

## Information Architecture

Top-level routes:

- `/` Project Home
- `/entity/:entityId` Entity Editor
- `/weapon/:weaponName/:chainIndex` Weapon Editor
- `/settings` App Settings

Global shell layout (desktop >= 1200px):

- Top App Bar: 56px height
- Left Navigator: 280px width
- Center Workspace: fluid
- Right Inspector: 340px width
- Bottom Timeline/Diagnostics: 220px height

Tablet (768px-1199px):

- Left navigator collapses to icon rail (64px), flyout on demand.
- Right inspector becomes drawer.

Mobile (< 768px):

- Single-pane with segmented tabs: `Canvas`, `Timeline`, `Inspector`, `Issues`.
- Persistent bottom action bar with `Play/Pause`, `Save`, `Add Keyframe`.

## Primary Screens

## 1. Project Home

Purpose: open/create data with clear file provenance.

Sections:

- `Recent Projects`
- `Open Weapon JSON`
- `Create Entity Profile`
- `Import Entity Profile JSON`
- `Open Folder (File System Access API)`

Required behavior:

- If File System Access API is unavailable, show explicit blocking message and offer manual file import/export mode.
- Never silently switch modes.

## 2. Entity Editor

Main regions:

- Navigator: list of entities/profiles.
- Canvas: sprite + bbox preview.
- Timeline: state keyframes by threshold.
- Inspector: selected state/frame/bbox properties.
- Issues panel: validation errors and warnings.

### Entity Editor: Canvas

Canvas controls:

- `Facing`: Right / Left / Split (side-by-side)
- `Grid`: Off / 1px / 8px
- `Onion`: previous/next frame ghosting
- `Zoom`: 4x, 8x, 12x, 16x
- `Background`: checker / dark / light

Visual overlays:

- Sprite bounds
- Body bbox (inclusive edge rendering)
- Mirrored bbox preview when facing left
- Pivot marker at local origin (0,0)

Hitbox interaction:

- Drag box edges/corners.
- Hold `Shift` for 1px snapping bypass (free drag).
- Arrow keys nudge selected edge by 1.
- `Alt` + Arrow nudge by 4.

Numeric readout:

- `x1`, `y1`, `x2`, `y2`
- Derived `width = x2 - x1 + 1`
- Derived `height = y2 - y1 + 1`

### Entity Editor: Timeline

Timeline is counter-based (not milliseconds).

Tracks:

- One track per state (`stand`, `move`, `jump`, etc. or custom keys).
- Keyframe markers at threshold integers.

Keyframe card fields:

- `threshold` (int >= 0)
- `sprite` (tile index integer)

State-level fields:

- `reset` (`-1`, `0`, or `>0`)

Timeline behavior:

- Drag keyframe horizontally to change threshold.
- Duplicate keyframe (`Ctrl/Cmd + D`).
- Snap to integer counters.
- Reject duplicate thresholds in same state with inline error.
- Auto-sort ascending after edits.

Playback controls:

- `Play/Pause`
- `Step -1`, `Step +1`
- Counter scrubber
- Speed multiplier: `0.25x`, `0.5x`, `1x`, `2x`

Playback logic must match runtime `getSprite()` + `updateStateCounter()`.

### Entity Editor: Inspector

Context-sensitive tabs:

- `State`
- `Keyframe`
- `Bbox`
- `Export`

`State` tab:

- Rename state key (if custom)
- Reset value editor
- Keyframe count
- Effective frame range preview

`Keyframe` tab:

- Threshold input
- Sprite picker launcher
- Sprite index numeric input

`Bbox` tab:

- Numeric bbox editing
- Preset buttons: `Full Tile (0,0,7,7)`, `Center 6x6`, `Player Default (2,1,6,7)`
- Mirror preview toggle explanation

`Export` tab:

- Generated JS snippet for `this.bbox`
- Generated JS snippet for `this.states`
- Copy buttons
- Format target: `ES module class constructor`

## 3. Weapon Editor

Main regions mirror Entity Editor, with weapon-specific timeline tracks.

Left sub-navigator:

- Weapon name list
- Chain selector (`Chain 1`, `Chain 2`, ...)

Chain fields panel:

- `power` (number)
- `anim_duration` (int > 0)
- `cancel` (optional int)
- `sfx` (string)
- `knockback.x`, `knockback.y` (number)
- `origin.x`, `origin.y` (int)
- `stopMove` (boolean)
- `eval` (string, raw; never executed in preview)

Frame timeline:

- Threshold keyframes on one track.
- Each keyframe can set:
  - `sprite`: integer, `[start,width,height]`, or `null`
  - `bbox`: object or `null`
  - optional `xm`, `ym`

Weapon preview:

- Right/left facing toggle.
- Player body bbox overlay.
- Weapon sprite overlay at computed origin.
- Weapon hitbox overlay.
- Dummy enemy target box with collision highlight on overlap.

Preview counter:

- Driven by `attackTimer` simulation:
  - `weaponFrame = anim_duration - attackTimer - 1`
  - latest threshold <= weaponFrame determines active frame

## Sprite Picker Specification

The picker must support both runtime sprite forms:

- Single tile index integer.
- Multi-tile block array `[start,width,height]`.

UI:

- Tilesheet dropdown based on loaded assets.
- 8x8 grid overlay.
- Single-click selects one tile -> integer value.
- Drag rectangle selection constrained to grid -> array value.
- Preview chip shows canonical serialized result.

Validation:

- Integer mode: `tile >= 0`.
- Array mode:
  - exactly 3 integers
  - `width > 0`, `height > 0`
  - `start >= 0`

## Data Model (TypeScript Interfaces)

```ts
type Bbox = { x1: number; y1: number; x2: number; y2: number };

type StateAnimMap = Record<number, number>; // threshold -> sprite index

type EntityState = {
  anim: StateAnimMap;
  reset: number; // -1, 0, or >0
};

type EntityProfile = {
  id: string;
  entityName: string;
  spriteSheetPath: string;
  bbox: Bbox;
  states: Record<string, EntityState>;
};

type WeaponFrame = {
  sprite: number | [number, number, number] | null;
  bbox: Bbox | null;
  xm?: number;
  ym?: number;
  [unknownKey: string]: unknown;
};

type WeaponChain = {
  power: number;
  anim_duration: number;
  cancel?: number;
  sfx: string;
  knockback: { x: number; y: number };
  origin: { x: number; y: number };
  stopMove?: boolean;
  eval?: string;
  frames?: Record<number, WeaponFrame>;
  [unknownKey: string]: unknown;
};

type WeaponsFile = Record<string, WeaponChain[]>;
```

## Preview Engine Requirements

Implement a deterministic preview module independent from UI framework:

- `resolveEntitySprite(state, counter, states): number`
- `nextStateCounter(counter, reset): number`
- `mirrorBboxRightToLeft(bbox, tileSize = 8): Bbox`
- `resolveWeaponFrame(chain, attackTimer): { threshold: number | null; frame: WeaponFrame | null }`
- `resolveWeaponRealBbox(...)` using runtime offsets/origin equations

Mirror equation (must match runtime):

```ts
left.x1 = tileSize - right.x2 - 1;
left.y1 = right.y1;
left.x2 = tileSize - right.x1;
left.y2 = right.y2;
```

Collision check in preview must match runtime overlap semantics:

```ts
const overlaps =
  a.x1 < b.x2 &&
  a.x2 > b.x1 &&
  a.y1 < b.y2 &&
  a.y2 > b.y1;
```

## Validation Rules

Blocking errors:

- Missing threshold `0` in any state `anim` map.
- Missing threshold `0` in any weapon chain `frames` map (if `frames` exists).
- Non-integer threshold keys.
- Duplicate thresholds within the same map.
- Invalid bbox where `x1 > x2` or `y1 > y2`.
- Invalid sprite array form (wrong length/types).
- Missing required chain fields (`power`, `anim_duration`, `sfx`, `knockback`, `origin`).

Warnings (save allowed):

- `reset > 0` but `reset <= maxThreshold` (animation may loop before later keys are reached).
- `cancel` missing (runtime default will be `anim_duration + 1`).
- `bbox` outside nominal tile extents for body boxes.
- `eval` present (not executed in preview).

Issue panel behavior:

- Show severity, message, exact path (example: `Sword[1].frames.10.bbox.x2`), and "jump to field" action.

## File I/O and Persistence

Modes:

- `Repository Mode` (File System Access API):
  - Open project folder
  - Read/write `assets/data/weapons.json`
  - Save entity profiles to `tools/animation-editor/entities/*.json`
  - Export snippets for manual paste into entity classes
- `Portable Mode`:
  - Import/export single JSON bundle file

Autosave:

- Debounced 500ms to in-memory draft.
- Explicit `Save` required for file write.
- Dirty-state indicator in top bar.

On write failure:

- Raise explicit error modal with raw error text and attempted path.
- Do not silently retry with alternate location.

## Interaction Details

Keyboard shortcuts:

- `Space`: Play/Pause
- `,` and `.`: Step frame backward/forward
- `K`: Add keyframe at current counter
- `Delete`: Remove selected keyframe
- `Ctrl/Cmd + S`: Save
- `Ctrl/Cmd + D`: Duplicate selected keyframe
- `F`: Toggle facing (right/left)
- `G`: Toggle grid

Undo/redo:

- Command stack with at least 100 actions.
- Group drag moves into one command on pointer-up.

Context actions:

- Right-click keyframe: `Duplicate`, `Delete`, `Convert Sprite Type`, `Copy Threshold`

## Accessibility Requirements

- Full keyboard navigation across timeline, inspector, and file dialogs.
- Minimum contrast ratio 4.5:1 for all text.
- Color is not sole indicator of state/error; use icons and labels.
- Zoomed canvas must still show precise coordinates and focus state.
- All icon-only buttons need tooltips and accessible labels.

## Visual Design Direction

Design goals:

- Dense, professional tool UI without visual clutter.
- Strong spatial hierarchy so users understand "Asset -> Timeline -> Frame -> Hitbox".

Base tokens:

- Background: neutral graphite scale.
- Accent: cyan for active selection, amber for warnings, red for errors, green for valid collision contact.
- Monospace numerics in inspector fields for coordinate legibility.

Motion:

- Subtle 120-180ms transitions for panel open/close and keyframe selection.
- No decorative motion during frame-by-frame editing.

## Component Contract Summary

`<ProjectHome />`

- Emits: `openProject`, `createEntity`, `importBundle`

`<Navigator />`

- Props: item list, active item, dirty indicators
- Emits: select, create, duplicate, delete

`<PreviewCanvas />`

- Props: spritesheet, state/chain data, playback state, facing, overlays
- Emits: bbox drag updates, canvas selection

`<TimelineEditor />`

- Props: threshold map, current counter, playback config
- Emits: add/update/delete keyframe, state reset update, selection change

`<InspectorPanel />`

- Props: selected entity/weapon node, validation issues
- Emits: field updates

`<IssuesPanel />`

- Props: issue list
- Emits: jump-to-path

`<ExportPanel />`

- Props: generated snippets/json
- Emits: copy, download

## Suggested Tech Stack

- React + TypeScript + Vite
- Zustand for editor state
- Canvas 2D for preview renderer (same pixel math as runtime)
- Zod for schema validation
- Monaco Editor (optional) for advanced JSON/code view panes

Implementation note:

- Keep preview engine in framework-agnostic modules so behavior can be unit-tested directly.

## Implementation Phases

Phase 1:

- Project Home
- Entity editor with state timeline, bbox overlay, export snippets
- Validation + issues panel

Phase 2:

- Weapon editor with chain/frame timeline and hitbox preview
- Sprite picker with array selection support
- Collision dummy target preview

Phase 3:

- File System Access repository mode
- Undo/redo polishing
- Keyboard/accessibility hardening

## Acceptance Criteria

- A designer can create a new entity profile with at least 3 states and export valid `this.states`/`this.bbox` snippets without touching raw JSON.
- A designer can edit an existing weapon chain and save a runtime-compatible `assets/data/weapons.json`.
- Left-facing preview of body and weapon hitboxes matches runtime mirror math.
- Playback frame selection for both entity states and weapon frames matches runtime threshold behavior at every tested counter.
- Validation blocks save on schema-breaking errors and provides jump-to-field navigation.
- No silent fallback when opening/saving files fails.

## Test Plan (Minimum)

Unit tests:

- threshold resolution logic
- counter/reset logic
- mirror math
- overlap/collision function
- serializer/deserializer for sprite values

Integration tests:

- create entity profile -> export snippet -> paste-compatible output
- load weapons JSON -> edit frame -> save -> reload and compare
- keyboard shortcut coverage for play, step, add/delete keyframe, save

Manual QA:

- Desktop (Chromium + Firefox)
- Tablet width layout
- Mobile width layout
- High zoom hitbox editing precision

