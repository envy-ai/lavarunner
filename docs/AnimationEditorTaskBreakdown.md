# Animation Editor Project Plan And Task Breakdown

## Objective

Convert the UI specification in `docs/AnimationEditorUI.md` into an execution-ready implementation plan with prioritized tasks, dependencies, and acceptance criteria.

## Planning Assumptions

- Team can execute frontend, validation/runtime logic, and testing in parallel once foundation tasks are complete.
- Existing runtime behavior documented in `docs/AnimationAndHitboxes.md` is the source of truth.
- The editor is a standalone web app, not embedded into gameplay runtime.
- Estimates are in story points (`1`, `2`, `3`, `5`, `8`) where:
  - `1` is a small, low-risk task
  - `8` is a large, multi-file or multi-concern task

## Key Risks To Track

1. Runtime parity drift between editor preview and game logic.
2. Data corruption risk when saving `assets/data/weapons.json`.
3. Complexity creep in timeline and hitbox interactions.
4. Browser capability variance for File System Access API.

## Milestones

1. Milestone A: Foundation + Entity Editor MVP
2. Milestone B: Weapon Editor + Sprite Picker
3. Milestone C: Persistence Modes + A11y + Release Hardening

## Task Backlog

## Milestone A: Foundation + Entity Editor MVP

### AE-001 Project Scaffold And Tooling

- Priority: P0
- Estimate: 3
- Depends on: none
- Deliverables:
  - Standalone app scaffold (`React + TypeScript + Vite` or approved equivalent)
  - Route skeleton for `/`, `/entity/:entityId`, `/weapon/:weaponName/:chainIndex`, `/settings`
  - Lint/test scripts wired in package scripts
- Definition of done:
  - Local dev server runs
  - Build succeeds
  - Baseline lint/test commands pass

### AE-002 Editor Shell Layout System

- Priority: P0
- Estimate: 5
- Depends on: AE-001
- Deliverables:
  - Desktop layout regions: top bar, left nav, center workspace, right inspector, bottom timeline/issues
  - Tablet and mobile responsive breakpoints from UI spec
  - Shared spacing/typography/color tokens
- Definition of done:
  - All required regions visible at desktop
  - Tablet and mobile behavior matches specification
  - No horizontal overflow in supported breakpoints

### AE-003 Core Domain Types And Schema Validation

- Priority: P0
- Estimate: 5
- Depends on: AE-001
- Deliverables:
  - Type models for entity profiles, weapon chains, frames, bbox
  - Schema validators for entity and weapon formats
  - Issue model with severity and path references
- Definition of done:
  - Invalid payloads fail loudly with explicit error paths
  - Valid payloads pass without transformation loss
  - Schema tests cover required blocking rules

### AE-004 Preview Engine Runtime-Parity Module

- Priority: P0
- Estimate: 8
- Depends on: AE-003
- Deliverables:
  - Pure functions:
    - threshold resolution
    - state counter update/reset logic
    - right-to-left bbox mirror logic
    - weapon frame resolution by `attackTimer`
    - overlap/collision function
  - Unit tests for all functions
- Definition of done:
  - Test vectors match formulas and behavior in runtime docs
  - No UI framework dependency in preview engine package

### AE-005 Global Editor State, Selection, Undo/Redo

- Priority: P0
- Estimate: 8
- Depends on: AE-003
- Deliverables:
  - Centralized state store
  - Selection model (entity/state/keyframe/bbox handles)
  - Undo/redo command stack (100+ actions)
  - Dirty-state tracking
- Definition of done:
  - Edits are undoable/redoable across timeline and inspector changes
  - Drag actions collapse into one undo unit on pointer-up
  - Dirty indicator updates correctly

### AE-006 Project Home Screen

- Priority: P1
- Estimate: 3
- Depends on: AE-001, AE-002
- Deliverables:
  - Home actions:
    - open weapon JSON
    - create entity profile
    - import entity profile JSON
    - open folder (if available)
  - Explicit unsupported message when File System Access API is unavailable
- Definition of done:
  - All actions route to intended flows
  - Unsupported API state is explicit and non-silent

### AE-007 Entity Navigator And Workspace Wiring

- Priority: P1
- Estimate: 3
- Depends on: AE-002, AE-005
- Deliverables:
  - Entity list with select/create/duplicate/delete
  - Active item and dirty markers
  - Selection synchronization with canvas and inspector
- Definition of done:
  - Changing entity updates all editor panes
  - Entity create/duplicate/delete operations are undoable

### AE-008 Entity Preview Canvas (Sprite + Body Bbox)

- Priority: P0
- Estimate: 8
- Depends on: AE-004, AE-005, AE-007
- Deliverables:
  - Canvas rendering for sprite and bbox overlays
  - Facing controls: right/left/split
  - Grid, zoom, onion, background controls
  - Bbox drag handles and keyboard nudging
- Definition of done:
  - Width/height display uses inclusive formulas (`+1`)
  - Left-facing bbox matches mirror equation
  - Drag/nudge edits write back to model accurately

### AE-009 Entity Timeline Editor

- Priority: P0
- Estimate: 8
- Depends on: AE-004, AE-005, AE-007
- Deliverables:
  - Per-state threshold timeline
  - Keyframe add/edit/delete/duplicate/drag
  - State-level `reset` editor
  - Playback controls and scrubber
- Definition of done:
  - Keyframe order auto-sorts ascending
  - Duplicate thresholds are blocked with inline issue
  - Playback output matches preview engine results

### AE-010 Entity Inspector Panel

- Priority: P1
- Estimate: 5
- Depends on: AE-007, AE-008, AE-009
- Deliverables:
  - Tabs: `State`, `Keyframe`, `Bbox`, `Export`
  - Numeric field editing for thresholds, sprites, bbox values
  - Bbox presets and mirror explanation text
- Definition of done:
  - Inspector edits update canvas/timeline in real time
  - Invalid edits produce explicit, field-level errors

### AE-011 Entity Export Snippet Generator

- Priority: P1
- Estimate: 3
- Depends on: AE-003, AE-010
- Deliverables:
  - Generated constructor snippets for `this.bbox` and `this.states`
  - Copy-to-clipboard controls
- Definition of done:
  - Output is paste-ready JS syntax
  - Generated data round-trips without structural changes

### AE-012 Validation Issues Panel And Jump-To-Field

- Priority: P0
- Estimate: 5
- Depends on: AE-003, AE-010
- Deliverables:
  - Issues list with severity, message, data path
  - Jump-to-field navigation from issue click
- Definition of done:
  - Blocking issues prevent save actions
  - Warnings do not block save
  - Issue selection focuses correct editor control

### AE-013 Milestone A QA Gate

- Priority: P0
- Estimate: 5
- Depends on: AE-001 through AE-012
- Deliverables:
  - Unit tests for entity timeline and bbox interactions
  - Integration flow:
    - create entity profile
    - configure 3 states
    - export snippet
  - Regression checklist for viewport breakpoints
- Definition of done:
  - All milestone A acceptance checks pass
  - No P0/P1 defects open for entity MVP workflows

## Milestone B: Weapon Editor + Sprite Picker

### AE-014 Weapon Data Loader And Safe Writer

- Priority: P0
- Estimate: 5
- Depends on: AE-003, AE-005
- Deliverables:
  - Load and normalize weapon JSON
  - Preserve unknown keys in chains/frames on save
  - Deterministic serializer ordering rules
- Definition of done:
  - Unknown fields survive edit/save cycles unchanged
  - Invalid writes fail with explicit error path/context

### AE-015 Weapon Navigator (Weapon + Chain Selector)

- Priority: P1
- Estimate: 3
- Depends on: AE-014, AE-002
- Deliverables:
  - Weapon list
  - Chain index selector and create/duplicate/delete controls
- Definition of done:
  - Chain operations keep model valid
  - Selection state remains stable across edits

### AE-016 Weapon Chain Inspector

- Priority: P0
- Estimate: 5
- Depends on: AE-014, AE-015
- Deliverables:
  - Editable fields:
    - `power`
    - `anim_duration`
    - `cancel`
    - `sfx`
    - `knockback`
    - `origin`
    - `stopMove`
    - `eval`
  - Validation wiring for required/optional fields
- Definition of done:
  - Missing required fields raise blocking issues
  - `cancel` missing generates warning, not blocking
  - `eval` is displayed and saved but never executed

### AE-017 Weapon Frame Timeline Editor

- Priority: P0
- Estimate: 8
- Depends on: AE-004, AE-015, AE-016
- Deliverables:
  - Threshold frame timeline for chain `frames`
  - Frame add/edit/delete/duplicate
  - Per-frame `sprite`, `bbox`, `xm`, `ym` editing
- Definition of done:
  - Threshold logic uses `latest key <= weaponFrame`
  - Missing threshold `0` is blocking issue
  - Duplicate threshold prevention works

### AE-018 Weapon Preview Overlay And Collision Probe

- Priority: P0
- Estimate: 8
- Depends on: AE-004, AE-016, AE-017
- Deliverables:
  - Player body bbox overlay
  - Weapon sprite render at runtime-equivalent origin offsets
  - Weapon hitbox overlay and dummy enemy target overlap highlight
  - Facing toggle parity checks
- Definition of done:
  - Right/left preview aligns with documented mirror/origin rules
  - Overlap highlight uses runtime overlap formula

### AE-019 Sprite Picker (Integer + Block Array Forms)

- Priority: P0
- Estimate: 8
- Depends on: AE-002, AE-005
- Deliverables:
  - Tilesheet dropdown and grid view
  - Single tile select -> integer sprite
  - Rectangle select -> `[start,width,height]`
  - Null sprite mode
- Definition of done:
  - Picker output validates against sprite schema
  - Selection preview is canonical and copy-safe

### AE-020 Weapon Save/Export Flows

- Priority: P1
- Estimate: 3
- Depends on: AE-014 through AE-019
- Deliverables:
  - Save action for weapon file
  - Optional chain-level export/import for portable sharing
- Definition of done:
  - Save blocked on blocking errors
  - Saved file reopens with no unexpected diffs

### AE-021 Milestone B QA Gate

- Priority: P0
- Estimate: 5
- Depends on: AE-014 through AE-020
- Deliverables:
  - Integration flow:
    - open weapon file
    - edit chain/frames
    - preview collisions
    - save/reload comparison
  - Unit tests for weapon frame resolution and origin placement
- Definition of done:
  - All milestone B acceptance checks pass
  - No P0/P1 defects open for weapon workflows

## Milestone C: Persistence Modes + A11y + Release Hardening

### AE-022 Repository Mode (File System Access API)

- Priority: P1
- Estimate: 5
- Depends on: AE-006, AE-014, AE-020
- Deliverables:
  - Folder open permission flow
  - Read/write support for `assets/data/weapons.json`
  - Entity profile file storage under `tools/animation-editor/entities/`
- Definition of done:
  - Path and permission errors are explicit and non-silent
  - Manual retry path is available after failure

### AE-023 Portable Mode (Bundle Import/Export)

- Priority: P1
- Estimate: 3
- Depends on: AE-006, AE-011, AE-020
- Deliverables:
  - Single-file bundle export/import with entity and weapon data
  - Versioned bundle metadata
- Definition of done:
  - Bundle import validates schema before applying
  - Exported bundle can fully restore editor session data

### AE-024 Keyboard Shortcut System

- Priority: P1
- Estimate: 3
- Depends on: AE-008, AE-009, AE-017
- Deliverables:
  - Shortcut bindings from UI spec:
    - play/pause
    - step
    - add/delete keyframe
    - duplicate
    - save
    - grid/facing toggles
  - Conflict handling by focused context
- Definition of done:
  - Shortcuts trigger only in valid contexts
  - Shortcut map is documented in app help

### AE-025 Accessibility Compliance Pass

- Priority: P0
- Estimate: 5
- Depends on: AE-002 through AE-024
- Deliverables:
  - Keyboard navigation coverage for core flows
  - ARIA labels for controls, especially icon-only buttons
  - Contrast and focus visibility validation
- Definition of done:
  - No critical keyboard traps
  - All major actions are keyboard-reachable
  - Accessibility checklist passes

### AE-026 Responsive And Interaction Polish

- Priority: P1
- Estimate: 5
- Depends on: AE-002 through AE-025
- Deliverables:
  - Final tablet/mobile layout tuning
  - Animation timing polish for panel transitions
  - Timeline interaction smoothness improvements
- Definition of done:
  - All specified breakpoints remain functional
  - No blocking usability defects in manual review

### AE-027 Performance Profiling And Optimization

- Priority: P2
- Estimate: 3
- Depends on: AE-018, AE-026
- Deliverables:
  - Canvas draw profiling on representative data sizes
  - Memoization/batching improvements where needed
- Definition of done:
  - No perceptible lag on keyframe scrubbing and bbox drag in target devices

### AE-028 Final Documentation And Handoff

- Priority: P1
- Estimate: 3
- Depends on: AE-001 through AE-027
- Deliverables:
  - Developer README for architecture and local commands
  - User guide for entity and weapon workflows
  - Troubleshooting section for persistence failures
- Definition of done:
  - New team member can run and use app with docs only
  - All major known limitations documented

### AE-029 Release Candidate Validation

- Priority: P0
- Estimate: 5
- Depends on: AE-025, AE-026, AE-027, AE-028
- Deliverables:
  - Full regression pass against acceptance criteria in `docs/AnimationEditorUI.md`
  - Defect triage and release signoff checklist
- Definition of done:
  - Zero open P0 defects
  - P1 defects explicitly accepted or fixed
  - Release checklist approved

## Dependency Summary

- Critical path:
  - AE-001 -> AE-003 -> AE-004 -> AE-008/AE-009 -> AE-013 -> AE-017/AE-018 -> AE-021 -> AE-025 -> AE-029
- High-risk items:
  - AE-004 (runtime parity)
  - AE-017 (timeline correctness)
  - AE-018 (origin + mirror correctness)
  - AE-022 (filesystem permissions)

## Suggested Sprint Packaging

1. Sprint 1:
   - AE-001, AE-002, AE-003, AE-006
2. Sprint 2:
   - AE-004, AE-005, AE-007, AE-008
3. Sprint 3:
   - AE-009, AE-010, AE-011, AE-012, AE-013
4. Sprint 4:
   - AE-014, AE-015, AE-016, AE-019
5. Sprint 5:
   - AE-017, AE-018, AE-020, AE-021
6. Sprint 6:
   - AE-022, AE-023, AE-024, AE-025, AE-026, AE-027, AE-028, AE-029

## Exit Criteria

- All Milestone A/B/C QA gates complete.
- Acceptance criteria from `docs/AnimationEditorUI.md` are verified.
- Save/load flows fail loudly on invalid states and file errors.
- Runtime parity checks for threshold logic, mirror math, and collision overlap are green.

