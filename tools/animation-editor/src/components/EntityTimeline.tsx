import { useMemo, useState } from 'react';
import type { EntityProfile } from '../domain/types';

interface EntityTimelineProps {
  entity: EntityProfile;
  selectedStateKey: string;
  selectedThreshold: number | null;
  counter: number;
  playing: boolean;
  speed: 0.25 | 0.5 | 1 | 2;
  issues: string[];
  onSelectState: (stateKey: string) => void;
  onSelectKeyframe: (stateKey: string, threshold: number) => void;
  onAddKeyframe: (stateKey: string) => void;
  onDeleteKeyframe: (stateKey: string, threshold: number) => void;
  onDuplicateKeyframe: (stateKey: string, threshold: number) => void;
  onUpdateThreshold: (stateKey: string, oldThreshold: number, nextThreshold: number) => void;
  onUpdateSprite: (stateKey: string, threshold: number, sprite: number) => void;
  onUpdateReset: (stateKey: string, reset: number) => void;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onCounterScrub: (counter: number) => void;
  onSpeedChange: (speed: 0.25 | 0.5 | 1 | 2) => void;
}

interface DragState {
  stateKey: string;
  originalThreshold: number;
  draftThreshold: number;
}

export function EntityTimeline(props: EntityTimelineProps): JSX.Element {
  const {
    entity,
    selectedStateKey,
    selectedThreshold,
    counter,
    playing,
    speed,
    issues,
    onSelectState,
    onSelectKeyframe,
    onAddKeyframe,
    onDeleteKeyframe,
    onDuplicateKeyframe,
    onUpdateThreshold,
    onUpdateSprite,
    onUpdateReset,
    onTogglePlay,
    onStepBack,
    onStepForward,
    onCounterScrub,
    onSpeedChange,
  } = props;

  const [dragState, setDragState] = useState<DragState | null>(null);

  const maxThreshold = useMemo(() => {
    let max = 16;
    for (const state of Object.values(entity.states)) {
      for (const key of Object.keys(state.anim)) {
        const threshold = Number(key);
        if (Number.isFinite(threshold)) {
          max = Math.max(max, threshold + 2);
        }
      }
    }
    return max;
  }, [entity.states]);

  const activeState = entity.states[selectedStateKey] ?? entity.states[Object.keys(entity.states)[0]];
  const activeThreshold = selectedThreshold !== null ? selectedThreshold : Number(Object.keys(activeState.anim)[0] ?? 0);
  const activeSprite = activeState.anim[String(activeThreshold)] ?? activeState.anim['0'] ?? 0;

  return (
    <section className="timeline-panel" aria-label="Entity Timeline">
      <header className="timeline-controls">
        <h3>Entity Timeline</h3>
        <div>
          <button type="button" onClick={onTogglePlay} aria-label="Play or pause playback">
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={onStepBack} aria-label="Step backward">
            Step -1
          </button>
          <button type="button" onClick={onStepForward} aria-label="Step forward">
            Step +1
          </button>
        </div>
        <label>
          Counter
          <input
            type="range"
            min={0}
            max={Math.max(maxThreshold, 1)}
            value={counter}
            onChange={(event) => onCounterScrub(Number(event.target.value))}
          />
          <code>{counter}</code>
        </label>
        <label>
          Speed
          <select
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value) as 0.25 | 0.5 | 1 | 2)}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </label>
      </header>

      <div className="state-tracks">
        {Object.entries(entity.states).map(([stateKey, state]) => {
          const thresholds = Object.keys(state.anim)
            .map((key) => Number(key))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);

          return (
            <div key={stateKey} className={`state-track ${selectedStateKey === stateKey ? 'is-selected' : ''}`}>
              <div className="state-track-header">
                <button type="button" className="state-key" onClick={() => onSelectState(stateKey)}>
                  {stateKey}
                </button>
                <label>
                  Reset Counter
                  <input
                    type="number"
                    value={state.reset}
                    onChange={(event) => onUpdateReset(stateKey, Number(event.target.value))}
                    data-field-path={`${entity.entityName}.states.${stateKey}.reset`}
                  />
                </label>
                <button type="button" onClick={() => onAddKeyframe(stateKey)}>
                  + Keyframe
                </button>
              </div>

              <div
                className="track-line"
                onPointerMove={(event) => {
                  if (!dragState || dragState.stateKey !== stateKey) {
                    return;
                  }
                  const target = event.currentTarget;
                  const rect = target.getBoundingClientRect();
                  const localX = event.clientX - rect.left;
                  const nextThreshold = Math.max(
                    0,
                    Math.round((localX / rect.width) * maxThreshold),
                  );
                  if (nextThreshold !== dragState.draftThreshold) {
                    setDragState({ ...dragState, draftThreshold: nextThreshold });
                  }
                }}
                onPointerUp={() => {
                  if (!dragState || dragState.stateKey !== stateKey) {
                    return;
                  }
                  onUpdateThreshold(stateKey, dragState.originalThreshold, dragState.draftThreshold);
                  setDragState(null);
                }}
              >
                <div className="counter-caret" style={{ left: `${(counter / maxThreshold) * 100}%` }} />
                {thresholds.map((threshold) => {
                  const isSelected = selectedStateKey === stateKey && selectedThreshold === threshold;
                  return (
                    <button
                      key={`${stateKey}-${threshold}`}
                      type="button"
                      className={`keyframe-dot ${isSelected ? 'is-selected' : ''}`}
                      style={{ left: `${(threshold / maxThreshold) * 100}%` }}
                      onClick={() => onSelectKeyframe(stateKey, threshold)}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setDragState({
                          stateKey,
                          originalThreshold: threshold,
                          draftThreshold: threshold,
                        });
                      }}
                      title={`${stateKey} @ ${threshold}`}
                    />
                  );
                })}
              </div>

              {issues
                .filter((path) => path.includes(`${entity.entityName}.states.${stateKey}.anim`))
                .map((path) => (
                  <p key={path} className="inline-error">
                    {path}
                  </p>
                ))}
            </div>
          );
        })}
      </div>

      <div className="keyframe-editor-card" aria-label="Selected Keyframe">
        <h4>Selected Keyframe</h4>
        <label>
          Animation State
          <input type="text" value={selectedStateKey} readOnly />
        </label>

        <label>
          Keyframe Threshold
          <input
            type="number"
            min={0}
            value={activeThreshold}
            onChange={(event) =>
              onUpdateThreshold(selectedStateKey, activeThreshold, Number(event.target.value))
            }
            data-field-path={`${entity.entityName}.states.${selectedStateKey}.anim.${activeThreshold}`}
          />
        </label>

        <label>
          Sprite Index
          <input
            type="number"
            min={0}
            value={activeSprite}
            onChange={(event) =>
              onUpdateSprite(selectedStateKey, activeThreshold, Number(event.target.value))
            }
            data-field-path={`${entity.entityName}.states.${selectedStateKey}.anim.${activeThreshold}.sprite`}
          />
        </label>

        <div className="inline-actions">
          <button type="button" onClick={() => onDuplicateKeyframe(selectedStateKey, activeThreshold)}>
            Duplicate
          </button>
          <button type="button" onClick={() => onDeleteKeyframe(selectedStateKey, activeThreshold)}>
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}
