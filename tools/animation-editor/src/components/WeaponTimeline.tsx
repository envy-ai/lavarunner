import { useMemo, useState } from 'react';
import type { WeaponChain, WeaponFrame } from '../domain/types';

interface WeaponTimelineProps {
  weaponName: string;
  chainIndex: number;
  chain: WeaponChain;
  selectedThreshold: number | null;
  attackTimer: number;
  playing: boolean;
  speed: 0.25 | 0.5 | 1 | 2;
  issuePaths: string[];
  onSelectFrame: (threshold: number) => void;
  onAddFrame: (threshold: number, frame?: Partial<WeaponFrame>) => void;
  onRemoveFrame: (threshold: number) => void;
  onDuplicateFrame: (threshold: number) => void;
  onUpdateThreshold: (oldThreshold: number, nextThreshold: number) => void;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onAttackTimerScrub: (timer: number) => void;
  onSpeedChange: (speed: 0.25 | 0.5 | 1 | 2) => void;
}

interface DragState {
  originalThreshold: number;
  draftThreshold: number;
}

function parseThresholds(frames: WeaponChain['frames']): number[] {
  if (!frames) {
    return [];
  }
  return Object.keys(frames)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

export function WeaponTimeline(props: WeaponTimelineProps): JSX.Element {
  const {
    weaponName,
    chainIndex,
    chain,
    selectedThreshold,
    attackTimer,
    playing,
    speed,
    issuePaths,
    onSelectFrame,
    onAddFrame,
    onRemoveFrame,
    onDuplicateFrame,
    onUpdateThreshold,
    onTogglePlay,
    onStepBack,
    onStepForward,
    onAttackTimerScrub,
    onSpeedChange,
  } = props;

  const [dragState, setDragState] = useState<DragState | null>(null);

  const thresholds = useMemo(() => parseThresholds(chain.frames), [chain.frames]);
  const maxThreshold = Math.max(chain.anim_duration, thresholds[thresholds.length - 1] ?? 0, 16);

  const activeThreshold = selectedThreshold ?? thresholds[0] ?? 0;
  const activeFrame = chain.frames?.[String(activeThreshold)];
  const timelineCounter = Math.max(chain.anim_duration - attackTimer - 1, 0);

  return (
    <section className="timeline-panel" aria-label="Weapon Timeline">
      <header className="timeline-controls">
        <h3>
          Weapon Keyframes: {weaponName} Chain {chainIndex + 1}
        </h3>
        <div>
          <button type="button" onClick={onTogglePlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={onStepBack}>
            Step -1
          </button>
          <button type="button" onClick={onStepForward}>
            Step +1
          </button>
        </div>

        <label>
          Time Remaining (Frames)
          <input
            type="range"
            min={0}
            max={Math.max(chain.anim_duration, 1)}
            value={attackTimer}
            onChange={(event) => onAttackTimerScrub(Number(event.target.value))}
          />
          <code>
            {attackTimer} remaining | timeline {timelineCounter}/{chain.anim_duration}
          </code>
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

      <div className="track-line weapon-track"
        onPointerMove={(event) => {
          if (!dragState) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const localX = event.clientX - rect.left;
          const draftThreshold = Math.max(0, Math.round((localX / rect.width) * maxThreshold));
          setDragState({ ...dragState, draftThreshold });
        }}
        onPointerUp={() => {
          if (!dragState) {
            return;
          }
          onUpdateThreshold(dragState.originalThreshold, dragState.draftThreshold);
          setDragState(null);
        }}
      >
        <div
          className="counter-caret"
          style={{ left: `${(timelineCounter / Math.max(maxThreshold, 1)) * 100}%` }}
        />

        {thresholds.map((threshold) => {
          const selected = selectedThreshold === threshold;
          return (
            <button
              key={threshold}
              type="button"
              className={`keyframe-dot ${selected ? 'is-selected' : ''}`}
              style={{ left: `${(threshold / Math.max(maxThreshold, 1)) * 100}%` }}
              onClick={() => onSelectFrame(threshold)}
              onPointerDown={(event) => {
                event.preventDefault();
                setDragState({ originalThreshold: threshold, draftThreshold: threshold });
              }}
              title={`Keyframe threshold ${threshold}`}
            />
          );
        })}
      </div>

      <div className="inline-actions">
        <button type="button" onClick={() => onAddFrame(Math.max(chain.anim_duration - attackTimer - 1, 0))}>
          Add Keyframe At Counter
        </button>
      </div>

      <div className="keyframe-editor-card">
        <h4>Selected Keyframe Summary</h4>
        <label>
          Keyframe Threshold
          <input type="number" value={activeThreshold} readOnly />
        </label>

        <label>
          Sprite Selection
          <input type="text" value={formatSprite(activeFrame?.sprite ?? null)} readOnly />
        </label>

        <label>
          Hitbox
          <input type="text" value={formatBbox(activeFrame?.bbox ?? null)} readOnly />
        </label>
        <p className="hint-line">Use Inspector {'>'} Keyframe for sprite, hitbox, and motion edits.</p>

        <div className="inline-actions">
          <button type="button" onClick={() => onDuplicateFrame(activeThreshold)}>
            Duplicate
          </button>
          <button type="button" onClick={() => onRemoveFrame(activeThreshold)}>
            Delete
          </button>
        </div>

        {issuePaths
          .filter((path) => path.includes(`${weaponName}[${chainIndex}].frames`))
          .map((path) => (
            <p key={path} className="inline-error">
              {path}
            </p>
          ))}
      </div>
    </section>
  );
}

function formatSprite(sprite: WeaponFrame['sprite']): string {
  if (sprite === null) {
    return 'none';
  }
  if (typeof sprite === 'number') {
    return String(sprite);
  }
  return `[${sprite[0]},${sprite[1]},${sprite[2]}]`;
}

function formatBbox(bbox: WeaponFrame['bbox']): string {
  if (bbox === null) {
    return 'none';
  }
  return `${bbox.x1},${bbox.y1},${bbox.x2},${bbox.y2}`;
}
