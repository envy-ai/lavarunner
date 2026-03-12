import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditorLayout } from '../components/EditorLayout';
import { IssuesPanel } from '../components/IssuesPanel';
import { TopBar } from '../components/TopBar';
import { WeaponInspector } from '../components/WeaponInspector';
import { WeaponNavigator } from '../components/WeaponNavigator';
import { WeaponPreviewCanvas } from '../components/WeaponPreviewCanvas';
import { WeaponTimeline } from '../components/WeaponTimeline';
import { useEditorStore } from '../store/editorStore';

interface WeaponEditorRouteProps {
  onSave: () => Promise<void>;
}

function selectedThreshold(
  selection: ReturnType<typeof useEditorStore.getState>['selection'],
  frameKeys: number[],
): number | null {
  if (selection.kind === 'weapon-frame') {
    return selection.threshold;
  }
  return frameKeys[0] ?? null;
}

export function WeaponEditorRoute(props: WeaponEditorRouteProps): JSX.Element {
  const { onSave } = props;
  const params = useParams();
  const navigate = useNavigate();

  const {
    weapons,
    activeWeaponName,
    activeWeaponChainIndex,
    selection,
    weaponPlayback,
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
    selectWeapon,
    createWeaponChain,
    duplicateWeaponChain,
    deleteWeaponChain,
    updateWeaponChainField,
    addWeaponFrame,
    updateWeaponFrameThreshold,
    updateWeaponFrameField,
    removeWeaponFrame,
    duplicateWeaponFrame,
    toggleWeaponPlayback,
    stepWeaponAttackTimer,
    setWeaponAttackTimer,
    setWeaponSpeed,
    setFacing,
    undo,
    redo,
  } = useEditorStore();

  const weaponName = activeWeaponName;
  const chainIndex = activeWeaponChainIndex;
  const chain = weapons[weaponName]?.[chainIndex];
  if (!chain) {
    throw new Error(
      `Active weapon chain index ${chainIndex} does not exist for ${weaponName}`,
    );
  }

  const frameKeys = useMemo(
    () =>
      Object.keys(chain.frames ?? {})
        .map(Number)
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b),
    [chain.frames],
  );

  const threshold = selectedThreshold(selection, frameKeys);

  useEffect(() => {
    const requestedWeapon = params.weaponName;
    const requestedChain = params.chainIndex ? Number(params.chainIndex) : NaN;

    if (!requestedWeapon || requestedWeapon === 'active') {
      return;
    }

    const chains = weapons[requestedWeapon];
    if (!chains) {
      navigate('/weapon/active/0', { replace: true });
      return;
    }

    if (!Number.isInteger(requestedChain) || requestedChain < 0 || requestedChain >= chains.length) {
      navigate('/weapon/active/0', { replace: true });
      return;
    }

    if (requestedWeapon !== activeWeaponName || requestedChain !== activeWeaponChainIndex) {
      selectWeapon(requestedWeapon, requestedChain);
    }
  }, [
    activeWeaponChainIndex,
    activeWeaponName,
    navigate,
    params.chainIndex,
    params.weaponName,
    selectWeapon,
    weapons,
  ]);

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
      if (state.weaponPlayback.playing) {
        accumulator += elapsed * state.weaponPlayback.speed;
        if (accumulator >= 100) {
          const chains = state.weapons[state.activeWeaponName];
          const currentChain = chains?.[state.activeWeaponChainIndex];
          if (currentChain) {
            let timer = state.weaponPlayback.attackTimer;
            while (accumulator >= 100) {
              if (timer <= 0) {
                timer = currentChain.anim_duration;
              }
              timer -= 1;
              accumulator -= 100;
            }
            state.setWeaponAttackTimer(Math.max(0, timer));
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

  const safeAction = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      setActiveError(error instanceof Error ? error.message : String(error), 'weapon-editor-action');
    }
  };

  const issuePaths = issues.map((issue) => issue.path);

  return (
    <EditorLayout
      topBar={
        <TopBar
          title="Weapon Editor"
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
        <WeaponNavigator
          weapons={weapons}
          activeWeaponName={activeWeaponName}
          activeChainIndex={activeWeaponChainIndex}
          onSelectWeapon={(nextWeapon, nextChain) => safeAction(() => selectWeapon(nextWeapon, nextChain))}
          onCreateChain={(nextWeapon) => safeAction(() => createWeaponChain(nextWeapon))}
          onDuplicateChain={(nextWeapon, nextChain) =>
            safeAction(() => duplicateWeaponChain(nextWeapon, nextChain))
          }
          onDeleteChain={(nextWeapon, nextChain) =>
            safeAction(() => deleteWeaponChain(nextWeapon, nextChain))
          }
        />
      }
      canvas={
        <WeaponPreviewCanvas
          chain={chain}
          attackTimer={weaponPlayback.attackTimer}
          zoom={canvasOptions.zoom}
          facing={canvasOptions.facing === 'left' ? 'left' : 'right'}
          onAttackTimerChange={setWeaponAttackTimer}
          onFacingChange={(nextFacing) => setFacing(nextFacing)}
        />
      }
      timeline={
        <WeaponTimeline
          weaponName={weaponName}
          chainIndex={chainIndex}
          chain={chain}
          selectedThreshold={threshold}
          attackTimer={weaponPlayback.attackTimer}
          playing={weaponPlayback.playing}
          speed={weaponPlayback.speed}
          issuePaths={issuePaths}
          onSelectFrame={(selectedFrame) => setSelection({ kind: 'weapon-frame', threshold: selectedFrame })}
          onAddFrame={(frameThreshold, frame) => safeAction(() => addWeaponFrame(frameThreshold, frame))}
          onRemoveFrame={(frameThreshold) => safeAction(() => removeWeaponFrame(frameThreshold))}
          onDuplicateFrame={(frameThreshold) => safeAction(() => duplicateWeaponFrame(frameThreshold))}
          onUpdateThreshold={(oldThreshold, nextThreshold) =>
            safeAction(() => updateWeaponFrameThreshold(oldThreshold, nextThreshold))
          }
          onTogglePlay={toggleWeaponPlayback}
          onStepBack={() => stepWeaponAttackTimer(1)}
          onStepForward={() => stepWeaponAttackTimer(-1)}
          onAttackTimerScrub={setWeaponAttackTimer}
          onSpeedChange={setWeaponSpeed}
        />
      }
      inspector={
        <WeaponInspector
          weaponName={weaponName}
          chainIndex={chainIndex}
          chain={chain}
          selectedThreshold={threshold}
          weapons={weapons}
          onUpdateChainField={(path, value) => safeAction(() => updateWeaponChainField(path, value))}
          onUpdateFrameField={(frameThreshold, path, value) =>
            safeAction(() => updateWeaponFrameField(frameThreshold, path, value))
          }
        />
      }
      issues={<IssuesPanel issues={issues} onJumpToPath={(path) => setFocusedPath(path)} />}
      mobileTab={mobileTab}
      onMobileTabChange={setMobileTab}
      mobileActions={
        <>
          <button type="button" onClick={toggleWeaponPlayback}>
            {weaponPlayback.playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => void onSave()}>
            Save
          </button>
          <button
            type="button"
            onClick={() =>
              safeAction(() => addWeaponFrame(Math.max(chain.anim_duration - weaponPlayback.attackTimer - 1, 0)))
            }
          >
            + Keyframe
          </button>
        </>
      }
    />
  );
}
