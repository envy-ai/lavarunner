# Animation Editor Implementation

## Overview

A standalone animation editor web app now lives at:

- `tools/animation-editor`

It is isolated from gameplay runtime code and implements the spec from:

- `docs/AnimationEditorUI.md`
- `docs/AnimationEditorTaskBreakdown.md`
- `docs/AnimationAndHitboxes.md`

## Local Commands

Install dependencies:

```bash
npm install --prefix tools/animation-editor
```

Run dev server:

```bash
npm run editor:dev
```

Type check:

```bash
npm run editor:lint
```

Unit/integration tests:

```bash
npm run editor:test
```

Production build:

```bash
npm run editor:build
```

## Routes

- `/` Project Home
- `/entity/:entityId` Entity Editor
- `/weapon/:weaponName/:chainIndex` Weapon Editor
- `/settings` App Settings

`/entity/active` and `/weapon/active/0` resolve to the current active selection in store.

## Implemented Modules

Core domain + preview runtime parity:

- `tools/animation-editor/src/domain/types.ts`
- `tools/animation-editor/src/domain/validation.ts`
- `tools/animation-editor/src/domain/serialization.ts`
- `tools/animation-editor/src/preview/engine.ts`

Persistence:

- `tools/animation-editor/src/io/repository.ts`
- `tools/animation-editor/src/io/portable.ts`
- `tools/animation-editor/src/io/errors.ts`

State + undo/redo:

- `tools/animation-editor/src/store/editorStore.ts`

UI routes and shell:

- `tools/animation-editor/src/routes/ProjectHome.tsx`
- `tools/animation-editor/src/routes/EntityEditorRoute.tsx`
- `tools/animation-editor/src/routes/WeaponEditorRoute.tsx`
- `tools/animation-editor/src/routes/SettingsRoute.tsx`
- `tools/animation-editor/src/components/*`
- `tools/animation-editor/src/styles.scss`

## Runtime-Compatibility Behaviors

The preview engine and validation enforce documented gameplay semantics:

- Inclusive bbox max edges (`x2`, `y2`)
- Right-facing authoring + left-facing mirror function
- Required `0` thresholds in entity and weapon maps
- Latest-threshold resolution (`latest key <= counter/frame`)
- Entity reset semantics (`-1`, `0`, `>0`)
- Weapon frame resolution by `weaponFrame = anim_duration - attackTimer - 1`
- AABB overlap parity (`<`/`>` comparisons)

## Save Behavior

- Portable mode:
  - Save exports a versioned bundle JSON
- Repository mode:
  - Save writes:
    - `assets/data/weapons.json`
    - `tools/animation-editor/entities/*.json`

On write/open failures, the app raises an explicit modal with attempted path + raw error text.

## Repository Mode Requirements

Repository mode uses the browser File System Access API and does not require NW.js.

- Works in browsers that support:
  - `window.showDirectoryPicker`
  - `window.showOpenFilePicker`
- If unsupported, Project Home shows an explicit blocked message and the editor stays in portable mode.

## UI Polish And Stability Updates

- Weapon route stability:
  - `/weapon/active/0` now renders without the previous React render-loop crash.
  - Active weapon chain selection no longer relies on an unstable selector snapshot object.
- Responsive shell behavior:
  - Tablet (`768px-1199px`) now uses explicit navigator and inspector drawer toggles.
  - Tablet inspector starts closed and opens as a right-side drawer.
  - Tablet navigator supports flyout behavior with a scrim overlay.
  - Collapsed tablet navigator rail uses compact labels (`+`, entity initials, weapon/chain abbreviations) rendered as badge/capsule tokens to avoid clipped text and improve scanability.
  - Bottom timeline/issues region at tablet uses fixed-height allocation to prevent panel overlap/clipping.
- Mobile shell compaction:
  - Top bar is reduced so canvas/timeline space is available sooner.
  - Undo/redo controls are hidden on mobile top bar; save remains available.
  - Mobile navigator rail is compacted to reduce vertical chrome.
- Inspector terminology and grouped controls:
  - Raw/internal field names were replaced with user-facing labels (for example, `anim_duration` is presented as "Animation Duration").
  - Vector and coordinate fields now use grouped inline `X`/`Y` rows under a shared header (for example, Knockback, Weapon Origin, Body Hitbox, keyframe hitbox coordinates).
  - Entity and weapon keyframe editors now use clearer labels such as "Keyframe Threshold" and "Sprite Index"/"Sprite Selection".
  - Export panel labels now describe constructor snippets instead of exposing bare variable names as primary labels.
- Readability/intuitiveness follow-up pass:
  - Weapon UI now consistently uses "Keyframe" terminology in visible controls and tabs.
  - Weapon timeline keyframe card is now a summary panel, with direct field editing centralized in Inspector -> Keyframe.
  - Attack-timer controls now read as time-remaining controls and display both remaining frames and timeline position.
  - Issues panel now shows friendly navigation labels (Weapon/Chain/Keyframe/Field) with raw paths moved to secondary text.
  - Mode and persistence language now uses "Portable File Mode" and "Repository Sync Mode" with clearer behavior descriptions.
  - Entity export copy actions now provide explicit "Copied ..." button feedback.
  - Grouped axis controls now use wrapping flex rows so `X`/`Y` inputs fit cleanly at narrow inspector widths without clipping.
- Mobile action bar polish:
  - Mobile quick action text now uses `+ Keyframe` and no-wrap button styling to prevent cramped two-line button text on narrow screens.
- Home screen density:
  - Tablet home route uses a two-column card layout for better scanability.
- Console hygiene:
  - BrowserRouter future flags are enabled to remove React Router future deprecation warnings.
  - Editor favicon is now provided to avoid missing-favicon `404` noise.

## Tests

Implemented test coverage:

- `tools/animation-editor/src/preview/engine.test.ts`
- `tools/animation-editor/src/domain/validation.test.ts`
- `tools/animation-editor/src/test/integration.test.tsx`

Covers:

- threshold/frame resolution
- counter reset logic
- mirror math
- overlap check
- validation blocking rules
- entity snippet generation flow
- weapon edit serialization flow
- keyboard shortcut behavior for grid/play
