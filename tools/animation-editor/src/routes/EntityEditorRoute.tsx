import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditorLayout } from '../components/EditorLayout';
import { EntityInspector } from '../components/EntityInspector';
import { EntityNavigator } from '../components/EntityNavigator';
import { EntityPreviewCanvas } from '../components/EntityPreviewCanvas';
import { EntityTimeline } from '../components/EntityTimeline';
import { IssuesPanel } from '../components/IssuesPanel';
import { TopBar } from '../components/TopBar';
import { nextStateCounter, resolveEntitySprite } from '../preview/engine';
import { useActiveEntity, useEditorStore } from '../store/editorStore';

interface EntityEditorRouteProps {
  onSave: () => Promise<void>;
}

function selectedEntityStateKey(
  selection: ReturnType<typeof useEditorStore.getState>['selection'],
  entity: ReturnType<typeof useActiveEntity>,
): string {
  if (selection.kind === 'entity-state' || selection.kind === 'entity-keyframe') {
    if (entity.states[selection.stateKey]) {
      return selection.stateKey;
    }
  }
  return Object.keys(entity.states)[0];
}

function selectedThreshold(
  selection: ReturnType<typeof useEditorStore.getState>['selection'],
  entity: ReturnType<typeof useActiveEntity>,
  stateKey: string,
): number | null {
  if (selection.kind === 'entity-keyframe' && selection.stateKey === stateKey) {
    return selection.threshold;
  }
  const first = Object.keys(entity.states[stateKey]?.anim ?? { '0': 0 })[0];
  return first ? Number(first) : null;
}

export function EntityEditorRoute(props: EntityEditorRouteProps): JSX.Element {
  const { onSave } = props;
  const params = useParams();
  const navigate = useNavigate();

  const {
    entityProfiles,
    activeEntityId,
    selection,
    entityPlayback,
    canvasOptions,
    issues,
    dirty,
    mode,
    mobileTab,
    history,
    focusedPath,
    setMobileTab,
    setFocusedPath,
    setSelection,
    setActiveError,
    createEntity,
    duplicateEntity,
    deleteEntity,
    selectEntity,
    updateEntityBbox,
    applyEntityBboxPreset,
    renameState,
    setStateReset,
    addEntityKeyframe,
    removeEntityKeyframe,
    duplicateEntityKeyframe,
    updateEntityKeyframeThreshold,
    updateEntityKeyframeSprite,
    toggleEntityPlayback,
    stepEntityCounter,
    setEntityCounter,
    setEntitySpeed,
    setFacing,
    setGrid,
    setOnion,
    setZoom,
    setBackground,
    undo,
    redo,
  } = useEditorStore();

  const entity = useActiveEntity();

  const stateKey = useMemo(() => selectedEntityStateKey(selection, entity), [selection, entity]);
  const threshold = useMemo(() => selectedThreshold(selection, entity, stateKey), [selection, entity, stateKey]);

  useEffect(() => {
    if (params.entityId && params.entityId !== 'active') {
      const exists = entityProfiles.some((item) => item.id === params.entityId);
      if (!exists) {
        navigate('/entity/active', { replace: true });
      } else if (params.entityId !== activeEntityId) {
        selectEntity(params.entityId);
      }
    }
  }, [activeEntityId, entityProfiles, navigate, params.entityId, selectEntity]);

  useEffect(() => {
    if (!focusedPath) {
      return;
    }
    const escapedPath = focusedPath.replaceAll('"', '\\"');
    const target = document.querySelector(`[data-field-path="${escapedPath}"]`) as
      | HTMLElement
      | null;
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedPath]);

  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let accumulator = 0;

    const tick = (now: number): void => {
      const elapsed = now - last;
      last = now;

      const state = useEditorStore.getState();
      if (state.entityPlayback.playing) {
        accumulator += elapsed * state.entityPlayback.speed;
        if (accumulator >= 100) {
          const localEntity = state.entityProfiles.find((item) => item.id === state.activeEntityId);
          if (localEntity) {
            const localStateKey = selectedEntityStateKey(state.selection, localEntity);
            const reset = localEntity.states[localStateKey].reset;
            let nextCounter = state.entityPlayback.counter;
            while (accumulator >= 100) {
              nextCounter = nextStateCounter(nextCounter, reset);
              accumulator -= 100;
            }
            state.setEntityCounter(nextCounter);
          }
        }
      } else {
        accumulator = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const sprite = resolveEntitySprite(stateKey, entityPlayback.counter, entity.states);
  const prevSprite = entityPlayback.counter > 0
    ? resolveEntitySprite(stateKey, Math.max(entityPlayback.counter - 1, 0), entity.states)
    : null;
  const nextSprite = resolveEntitySprite(stateKey, entityPlayback.counter + 1, entity.states);

  const issuePaths = issues.map((issue) => issue.path);

  const safeAction = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      setActiveError(error instanceof Error ? error.message : String(error), 'entity-editor-action');
    }
  };

  return (
    <EditorLayout
      topBar={
        <TopBar
          title="Entity Editor"
          dirty={dirty}
          mode={mode}
          onSave={() => void onSave()}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          saveDisabled={issues.some((issue) => issue.blocking)}
        />
      }
      left={
        <EntityNavigator
          entities={entityProfiles}
          activeEntityId={activeEntityId}
          dirty={dirty}
          onSelect={(entityId) => safeAction(() => selectEntity(entityId))}
          onCreate={() => safeAction(createEntity)}
          onDuplicate={(entityId) => safeAction(() => duplicateEntity(entityId))}
          onDelete={(entityId) => safeAction(() => deleteEntity(entityId))}
        />
      }
      canvas={
        <EntityPreviewCanvas
          bbox={entity.bbox}
          facing={canvasOptions.facing}
          grid={canvasOptions.grid}
          onion={canvasOptions.onion}
          zoom={canvasOptions.zoom}
          background={canvasOptions.background}
          currentSprite={sprite}
          previousSprite={prevSprite}
          nextSprite={nextSprite}
          onFacingChange={setFacing}
          onGridChange={setGrid}
          onOnionChange={setOnion}
          onZoomChange={setZoom}
          onBackgroundChange={setBackground}
          onBboxCommit={(bbox) => safeAction(() => updateEntityBbox(bbox))}
        />
      }
      timeline={
        <EntityTimeline
          entity={entity}
          selectedStateKey={stateKey}
          selectedThreshold={threshold}
          counter={entityPlayback.counter}
          playing={entityPlayback.playing}
          speed={entityPlayback.speed}
          issues={issuePaths}
          onSelectState={(nextState) => setSelection({ kind: 'entity-state', stateKey: nextState })}
          onSelectKeyframe={(selectedState, selectedFrame) =>
            setSelection({ kind: 'entity-keyframe', stateKey: selectedState, threshold: selectedFrame })
          }
          onAddKeyframe={(selectedState) =>
            safeAction(() => addEntityKeyframe(selectedState, entityPlayback.counter, sprite))
          }
          onDeleteKeyframe={(selectedState, selectedFrame) =>
            safeAction(() => removeEntityKeyframe(selectedState, selectedFrame))
          }
          onDuplicateKeyframe={(selectedState, selectedFrame) =>
            safeAction(() => duplicateEntityKeyframe(selectedState, selectedFrame))
          }
          onUpdateThreshold={(selectedState, oldThreshold, nextThreshold) =>
            safeAction(() => updateEntityKeyframeThreshold(selectedState, oldThreshold, nextThreshold))
          }
          onUpdateSprite={(selectedState, selectedFrame, selectedSprite) =>
            safeAction(() => updateEntityKeyframeSprite(selectedState, selectedFrame, selectedSprite))
          }
          onUpdateReset={(selectedState, reset) => safeAction(() => setStateReset(selectedState, reset))}
          onTogglePlay={toggleEntityPlayback}
          onStepBack={() => stepEntityCounter(-1)}
          onStepForward={() => stepEntityCounter(1)}
          onCounterScrub={setEntityCounter}
          onSpeedChange={setEntitySpeed}
        />
      }
      inspector={
        <EntityInspector
          entity={entity}
          selectedStateKey={stateKey}
          selectedThreshold={threshold}
          onRenameState={(oldKey, newKey) => safeAction(() => renameState(oldKey, newKey))}
          onSetReset={(selectedState, reset) => safeAction(() => setStateReset(selectedState, reset))}
          onUpdateKeyframeThreshold={(selectedState, oldThreshold, nextThreshold) =>
            safeAction(() => updateEntityKeyframeThreshold(selectedState, oldThreshold, nextThreshold))
          }
          onUpdateKeyframeSprite={(selectedState, selectedFrame, selectedSprite) =>
            safeAction(() => updateEntityKeyframeSprite(selectedState, selectedFrame, selectedSprite))
          }
          onUpdateBbox={(bbox) => safeAction(() => updateEntityBbox(bbox))}
          onApplyPreset={(bbox) => safeAction(() => applyEntityBboxPreset(bbox))}
        />
      }
      issues={<IssuesPanel issues={issues} onJumpToPath={(path) => setFocusedPath(path)} />}
      mobileTab={mobileTab}
      onMobileTabChange={setMobileTab}
      mobileActions={
        <>
          <button type="button" onClick={toggleEntityPlayback}>
            {entityPlayback.playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => void onSave()}>
            Save
          </button>
          <button
            type="button"
            onClick={() => safeAction(() => addEntityKeyframe(stateKey, entityPlayback.counter, sprite))}
          >
            + Keyframe
          </button>
        </>
      }
    />
  );
}
