# Documentation Index

- `developer_overview.md`: High-level architecture and runtime model.
- `AnimationAndHitboxes.md`: Where entity sprite animations and hitboxes are defined and resolved, plus authored conventions for inclusive bbox bounds, right-facing bbox source data, and required `0` thresholds.
- `AnimationEditorUI.md`: Implementation-ready UI specification for a standalone editor that creates, edits, validates, and previews entity/weapon animation and hitbox data in the runtime format.
- `AnimationEditorTaskBreakdown.md`: Project-manager task plan with phased backlog, dependencies, estimates, QA gates, and release criteria for implementing the standalone animation editor.
- `AnimationEditor.md`: Implemented standalone editor architecture, route map, modules, save behavior, repository-mode browser requirements, responsive-shell behavior (including compact collapsed tablet navigator rail badge/capsule tokens), inspector terminology polish (friendly labels + grouped X/Y inputs), follow-up intuitiveness updates (consistent keyframe wording, summary-only timeline card, friendly issue-path labels, clearer mode naming, copy feedback, flex-wrapped X/Y rows for narrow widths), and local commands for `tools/animation-editor`.
- `PixelboxRuntime.md`: Phaser compatibility-layer details, including map-layer loading, fixed-aspect integer scaling behavior, bitmap-font text rendering (`setCharset` support), and dialog wrapping behavior.
- `Audio.md`: Manifest format and runtime audio mapping.
- `MapConverter.md`: Pixelbox -> Tiled conversion workflow, including combined map/layer output and `dialog` property serialization details.
- `EntityPlacement.md`: Tiled object-layer entity placement model, sprite mappings, and required metadata properties.
