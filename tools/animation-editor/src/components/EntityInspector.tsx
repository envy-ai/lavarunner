import { useEffect, useMemo, useRef, useState } from 'react';
import { BBOX_PRESETS } from '../domain/defaults';
import { generateEntityConstructorSnippets, serializeEntityProfile } from '../domain/serialization';
import type { EntityProfile } from '../domain/types';

type InspectorTab = 'state' | 'keyframe' | 'bbox' | 'export';

interface EntityInspectorProps {
  entity: EntityProfile;
  selectedStateKey: string;
  selectedThreshold: number | null;
  onRenameState: (oldKey: string, newKey: string) => void;
  onSetReset: (stateKey: string, reset: number) => void;
  onUpdateKeyframeThreshold: (stateKey: string, oldThreshold: number, nextThreshold: number) => void;
  onUpdateKeyframeSprite: (stateKey: string, threshold: number, sprite: number) => void;
  onUpdateBbox: (bbox: EntityProfile['bbox']) => void;
  onApplyPreset: (bbox: EntityProfile['bbox']) => void;
}

export function EntityInspector(props: EntityInspectorProps): JSX.Element {
  const {
    entity,
    selectedStateKey,
    selectedThreshold,
    onRenameState,
    onSetReset,
    onUpdateKeyframeThreshold,
    onUpdateKeyframeSprite,
    onUpdateBbox,
    onApplyPreset,
  } = props;

  const [tab, setTab] = useState<InspectorTab>('state');
  const [stateRenameDraft, setStateRenameDraft] = useState(selectedStateKey);
  const [copiedSnippet, setCopiedSnippet] = useState<'bbox' | 'states' | null>(null);
  const copyResetTimer = useRef<number | null>(null);

  const state = entity.states[selectedStateKey] ?? entity.states[Object.keys(entity.states)[0]];
  const firstThreshold = Number(Object.keys(state.anim)[0] ?? 0);
  const keyframeThreshold = selectedThreshold ?? firstThreshold;
  const keyframeSprite = state.anim[String(keyframeThreshold)] ?? state.anim['0'] ?? 0;

  const snippets = useMemo(() => generateEntityConstructorSnippets(entity), [entity]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const handleCopySnippet = (kind: 'bbox' | 'states', value: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedSnippet(kind);
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
      copyResetTimer.current = window.setTimeout(() => {
        setCopiedSnippet((current) => (current === kind ? null : current));
      }, 1500);
    });
  };

  return (
    <section className="inspector-panel" aria-label="Entity Inspector">
      <header className="inspector-tabs" role="tablist">
        <button type="button" className={tab === 'state' ? 'is-active' : ''} onClick={() => setTab('state')}>
          State
        </button>
        <button
          type="button"
          className={tab === 'keyframe' ? 'is-active' : ''}
          onClick={() => setTab('keyframe')}
        >
          Keyframe
        </button>
        <button type="button" className={tab === 'bbox' ? 'is-active' : ''} onClick={() => setTab('bbox')}>
          Body Box
        </button>
        <button
          type="button"
          className={tab === 'export' ? 'is-active' : ''}
          onClick={() => setTab('export')}
        >
          Export
        </button>
      </header>

      {tab === 'state' ? (
        <div className="inspector-content">
          <label>
            Rename State
            <input
              type="text"
              value={stateRenameDraft}
              onChange={(event) => setStateRenameDraft(event.target.value)}
              data-field-path={`${entity.entityName}.states.${selectedStateKey}`}
            />
          </label>
          <button type="button" onClick={() => onRenameState(selectedStateKey, stateRenameDraft)}>
            Apply Rename
          </button>

          <label>
            Reset Counter
            <input
              type="number"
              value={state.reset}
              onChange={(event) => onSetReset(selectedStateKey, Number(event.target.value))}
              data-field-path={`${entity.entityName}.states.${selectedStateKey}.reset`}
            />
          </label>

          <p>Keyframe count: {Object.keys(state.anim).length}</p>
          <p>
            Effective range: {Math.min(...Object.keys(state.anim).map(Number))} -{' '}
            {Math.max(...Object.keys(state.anim).map(Number))}
          </p>
        </div>
      ) : null}

      {tab === 'keyframe' ? (
        <div className="inspector-content">
          <label>
            Keyframe Threshold
            <input
              type="number"
              min={0}
              value={keyframeThreshold}
              onChange={(event) =>
                onUpdateKeyframeThreshold(selectedStateKey, keyframeThreshold, Number(event.target.value))
              }
              data-field-path={`${entity.entityName}.states.${selectedStateKey}.anim.${keyframeThreshold}`}
            />
          </label>

          <label>
            Sprite Index
            <input
              type="number"
              min={0}
              value={keyframeSprite}
              onChange={(event) =>
                onUpdateKeyframeSprite(selectedStateKey, keyframeThreshold, Number(event.target.value))
              }
              data-field-path={`${entity.entityName}.states.${selectedStateKey}.anim.${keyframeThreshold}.sprite`}
            />
          </label>
        </div>
      ) : null}

      {tab === 'bbox' ? (
        <div className="inspector-content">
          <p className="hint-line">Body hitbox is authored in right-facing local space. Left preview mirrors at runtime.</p>

          <div className="inspector-group">
            <p className="inspector-group-title">Body Hitbox (Inclusive Edges)</p>
            <div className="axis-input-row">
              <label>
                X1
                <input
                  type="number"
                  value={entity.bbox.x1}
                  onChange={(event) =>
                    onUpdateBbox({
                      ...entity.bbox,
                      x1: Number(event.target.value),
                    })
                  }
                  data-field-path={`${entity.entityName}.bbox.x1`}
                />
              </label>
              <label>
                Y1
                <input
                  type="number"
                  value={entity.bbox.y1}
                  onChange={(event) =>
                    onUpdateBbox({
                      ...entity.bbox,
                      y1: Number(event.target.value),
                    })
                  }
                  data-field-path={`${entity.entityName}.bbox.y1`}
                />
              </label>
            </div>
            <div className="axis-input-row">
              <label>
                X2
                <input
                  type="number"
                  value={entity.bbox.x2}
                  onChange={(event) =>
                    onUpdateBbox({
                      ...entity.bbox,
                      x2: Number(event.target.value),
                    })
                  }
                  data-field-path={`${entity.entityName}.bbox.x2`}
                />
              </label>
              <label>
                Y2
                <input
                  type="number"
                  value={entity.bbox.y2}
                  onChange={(event) =>
                    onUpdateBbox({
                      ...entity.bbox,
                      y2: Number(event.target.value),
                    })
                  }
                  data-field-path={`${entity.entityName}.bbox.y2`}
                />
              </label>
            </div>
          </div>

          <div className="inline-actions">
            <button type="button" onClick={() => onApplyPreset(BBOX_PRESETS.fullTile)}>
              Full Tile (0,0,7,7)
            </button>
            <button type="button" onClick={() => onApplyPreset(BBOX_PRESETS.centerSix)}>
              Center 6x6
            </button>
            <button type="button" onClick={() => onApplyPreset(BBOX_PRESETS.playerDefault)}>
              Player Default (2,1,6,7)
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'export' ? (
        <div className="inspector-content export-content">
          <label>
            Body Hitbox Constructor Snippet
            <textarea readOnly rows={6} value={snippets.bboxSnippet} />
          </label>
          <button type="button" onClick={() => handleCopySnippet('bbox', snippets.bboxSnippet)}>
            {copiedSnippet === 'bbox' ? 'Copied Body Hitbox Snippet' : 'Copy Body Hitbox Snippet'}
          </button>

          <label>
            Animation States Constructor Snippet
            <textarea readOnly rows={10} value={snippets.statesSnippet} />
          </label>
          <button type="button" onClick={() => handleCopySnippet('states', snippets.statesSnippet)}>
            {copiedSnippet === 'states'
              ? 'Copied Animation States Snippet'
              : 'Copy Animation States Snippet'}
          </button>

          <label>
            Entity Profile JSON
            <textarea readOnly rows={8} value={serializeEntityProfile(entity)} />
          </label>
        </div>
      ) : null}
    </section>
  );
}
