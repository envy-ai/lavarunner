import { useMemo, useState } from 'react';
import { serializeWeaponsFile } from '../domain/serialization';
import type { SpriteValue, WeaponChain, WeaponFrame, WeaponsFile } from '../domain/types';
import { SpritePicker } from './SpritePicker';

type WeaponInspectorTab = 'chain' | 'keyframe' | 'export';

interface WeaponInspectorProps {
  weaponName: string;
  chainIndex: number;
  chain: WeaponChain;
  selectedThreshold: number | null;
  weapons: WeaponsFile;
  onUpdateChainField: (fieldPath: string, value: unknown) => void;
  onUpdateFrameField: (threshold: number, fieldPath: string, value: unknown) => void;
}

const DEFAULT_TILESHEETS = ['sprites/weapons', 'sprites/player_default', 'sprites/enemies', 'sprites/goodies'];

export function WeaponInspector(props: WeaponInspectorProps): JSX.Element {
  const {
    weaponName,
    chainIndex,
    chain,
    selectedThreshold,
    weapons,
    onUpdateChainField,
    onUpdateFrameField,
  } = props;

  const [tab, setTab] = useState<WeaponInspectorTab>('chain');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tilesheet, setTilesheet] = useState(DEFAULT_TILESHEETS[0]);

  const thresholds = useMemo(
    () =>
      Object.keys(chain.frames ?? {})
        .map(Number)
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b),
    [chain.frames],
  );

  const activeThreshold = selectedThreshold ?? thresholds[0] ?? 0;
  const activeFrame: WeaponFrame | null = chain.frames?.[String(activeThreshold)] ?? null;

  const setActiveSprite = (nextSprite: SpriteValue): void => {
    onUpdateFrameField(activeThreshold, 'sprite', nextSprite);
  };

  return (
    <section className="inspector-panel" aria-label="Weapon Inspector">
      <header className="inspector-tabs" role="tablist">
        <button type="button" className={tab === 'chain' ? 'is-active' : ''} onClick={() => setTab('chain')}>
          Chain
        </button>
        <button type="button" className={tab === 'keyframe' ? 'is-active' : ''} onClick={() => setTab('keyframe')}>
          Keyframe
        </button>
        <button type="button" className={tab === 'export' ? 'is-active' : ''} onClick={() => setTab('export')}>
          Export
        </button>
      </header>

      {tab === 'chain' ? (
        <div className="inspector-content">
          <label>
            Power
            <input
              type="number"
              value={chain.power}
              onChange={(event) => onUpdateChainField('power', Number(event.target.value))}
              data-field-path={`${weaponName}[${chainIndex}].power`}
            />
          </label>

          <label>
            Animation Duration
            <input
              type="number"
              min={1}
              value={chain.anim_duration}
              onChange={(event) => onUpdateChainField('anim_duration', Number(event.target.value))}
              data-field-path={`${weaponName}[${chainIndex}].anim_duration`}
            />
          </label>

          <label>
            Cancel Window
            <input
              type="number"
              value={chain.cancel ?? ''}
              placeholder="Optional"
              onChange={(event) => {
                const value = event.target.value;
                onUpdateChainField('cancel', value === '' ? undefined : Number(value));
              }}
              data-field-path={`${weaponName}[${chainIndex}].cancel`}
            />
          </label>

          <label>
            Sound Effect
            <input
              type="text"
              value={chain.sfx}
              onChange={(event) => onUpdateChainField('sfx', event.target.value)}
              data-field-path={`${weaponName}[${chainIndex}].sfx`}
            />
          </label>

          <div className="inspector-group">
            <p className="inspector-group-title">Knockback</p>
            <div className="axis-input-row">
              <label>
                X
                <input
                  type="number"
                  value={chain.knockback.x}
                  onChange={(event) => onUpdateChainField('knockback.x', Number(event.target.value))}
                  data-field-path={`${weaponName}[${chainIndex}].knockback.x`}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={chain.knockback.y}
                  onChange={(event) => onUpdateChainField('knockback.y', Number(event.target.value))}
                  data-field-path={`${weaponName}[${chainIndex}].knockback.y`}
                />
              </label>
            </div>
          </div>

          <div className="inspector-group">
            <p className="inspector-group-title">Weapon Origin</p>
            <div className="axis-input-row">
              <label>
                X
                <input
                  type="number"
                  value={chain.origin.x}
                  onChange={(event) => onUpdateChainField('origin.x', Number(event.target.value))}
                  data-field-path={`${weaponName}[${chainIndex}].origin.x`}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={chain.origin.y}
                  onChange={(event) => onUpdateChainField('origin.y', Number(event.target.value))}
                  data-field-path={`${weaponName}[${chainIndex}].origin.y`}
                />
              </label>
            </div>
          </div>

          <label className="checkbox-field">
            <span>Stop Movement During Attack</span>
            <input
              type="checkbox"
              checked={Boolean(chain.stopMove)}
              onChange={(event) => onUpdateChainField('stopMove', event.target.checked)}
              data-field-path={`${weaponName}[${chainIndex}].stopMove`}
            />
          </label>

          <label>
            Custom Script Text (Advanced)
            <textarea
              rows={3}
              value={chain.eval ?? ''}
              onChange={(event) =>
                onUpdateChainField('eval', event.target.value === '' ? undefined : event.target.value)
              }
              data-field-path={`${weaponName}[${chainIndex}].eval`}
            />
          </label>
          <p className="hint-line">Saved as plain text in the chain and never executed in preview.</p>
        </div>
      ) : null}

      {tab === 'keyframe' ? (
        <div className="inspector-content">
          <p>Selected Keyframe Threshold: {activeThreshold}</p>

          {!activeFrame ? (
            <p className="empty-state">No keyframe selected.</p>
          ) : (
            <>
              <label>
                Sprite Selection
                <input
                  type="text"
                  readOnly
                  value={formatSprite(activeFrame.sprite)}
                  data-field-path={`${weaponName}[${chainIndex}].frames.${activeThreshold}.sprite`}
                />
              </label>
              <button type="button" onClick={() => setPickerOpen(true)}>
                Choose Sprite
              </button>

              <label className="checkbox-field">
                <span>Enable Hitbox</span>
                <input
                  type="checkbox"
                  checked={activeFrame.bbox !== null}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onUpdateFrameField(activeThreshold, 'bbox', {
                        x1: 0,
                        y1: 0,
                        x2: 7,
                        y2: 7,
                      });
                    } else {
                      onUpdateFrameField(activeThreshold, 'bbox', null);
                    }
                  }}
                />
              </label>

              {activeFrame.bbox !== null ? (
                <div className="inspector-group">
                  <p className="inspector-group-title">Hitbox (Inclusive Edges)</p>
                  <div className="axis-input-row">
                    <label>
                      X1
                      <input
                        type="number"
                        value={activeFrame.bbox.x1}
                        onChange={(event) =>
                          onUpdateFrameField(activeThreshold, 'bbox.x1', Number(event.target.value))
                        }
                        data-field-path={`${weaponName}[${chainIndex}].frames.${activeThreshold}.bbox.x1`}
                      />
                    </label>
                    <label>
                      Y1
                      <input
                        type="number"
                        value={activeFrame.bbox.y1}
                        onChange={(event) =>
                          onUpdateFrameField(activeThreshold, 'bbox.y1', Number(event.target.value))
                        }
                        data-field-path={`${weaponName}[${chainIndex}].frames.${activeThreshold}.bbox.y1`}
                      />
                    </label>
                  </div>
                  <div className="axis-input-row">
                    <label>
                      X2
                      <input
                        type="number"
                        value={activeFrame.bbox.x2}
                        onChange={(event) =>
                          onUpdateFrameField(activeThreshold, 'bbox.x2', Number(event.target.value))
                        }
                        data-field-path={`${weaponName}[${chainIndex}].frames.${activeThreshold}.bbox.x2`}
                      />
                    </label>
                    <label>
                      Y2
                      <input
                        type="number"
                        value={activeFrame.bbox.y2}
                        onChange={(event) =>
                          onUpdateFrameField(activeThreshold, 'bbox.y2', Number(event.target.value))
                        }
                        data-field-path={`${weaponName}[${chainIndex}].frames.${activeThreshold}.bbox.y2`}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="inspector-group">
                <p className="inspector-group-title">Keyframe Motion Offset (Optional)</p>
                <div className="axis-input-row">
                  <label>
                    X
                    <input
                      type="number"
                      value={activeFrame.xm ?? ''}
                      placeholder="None"
                      onChange={(event) =>
                        onUpdateFrameField(
                          activeThreshold,
                          'xm',
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    Y
                    <input
                      type="number"
                      value={activeFrame.ym ?? ''}
                      placeholder="None"
                      onChange={(event) =>
                        onUpdateFrameField(
                          activeThreshold,
                          'ym',
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'export' ? (
        <div className="inspector-content export-content">
          <label>
            Weapon JSON
            <textarea readOnly rows={14} value={serializeWeaponsFile(weapons)} />
          </label>
        </div>
      ) : null}

      <SpritePicker
        open={pickerOpen}
        value={activeFrame?.sprite ?? null}
        tilesheets={DEFAULT_TILESHEETS}
        selectedTilesheet={tilesheet}
        onTilesheetChange={setTilesheet}
        onClose={() => setPickerOpen(false)}
        onChange={(next) => {
          setActiveSprite(next);
          setPickerOpen(false);
        }}
      />
    </section>
  );
}

function formatSprite(sprite: SpriteValue): string {
  if (sprite === null) {
    return 'null';
  }
  if (typeof sprite === 'number') {
    return String(sprite);
  }
  return `[${sprite[0]}, ${sprite[1]}, ${sprite[2]}]`;
}
