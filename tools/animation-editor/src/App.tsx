import { useCallback, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorModal } from './components/ErrorModal';
import { hasBlockingIssues } from './domain/validation';
import { downloadPortableBundle } from './io/portable';
import {
  writeEntityProfileToRepository,
  writeWeaponsFileToRepository,
} from './io/repository';
import { EntityEditorRoute } from './routes/EntityEditorRoute';
import { ProjectHome } from './routes/ProjectHome';
import { SettingsRoute } from './routes/SettingsRoute';
import { WeaponEditorRoute } from './routes/WeaponEditorRoute';
import { useEditorStore } from './store/editorStore';

export function App(): JSX.Element {
  const location = useLocation();

  const { activeError, clearActiveError } = useEditorStore();

  const saveAction = useCallback(async () => {
    const state = useEditorStore.getState();

    if (hasBlockingIssues(state.issues)) {
      state.setActiveError('Blocking validation issues must be resolved before save.', 'save');
      return;
    }

    try {
      if (state.mode === 'repository') {
        if (!state.repositoryHandles) {
          throw new Error('Repository mode selected but no folder is open.');
        }

        await writeWeaponsFileToRepository(state.repositoryHandles, state.weapons);
        for (const entity of state.entityProfiles) {
          await writeEntityProfileToRepository(state.repositoryHandles, entity);
        }
      } else {
        const bundle = state.exportBundlePayload();
        downloadPortableBundle(bundle);
      }

      state.markSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.setActiveError(message, 'save');
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      const state = useEditorStore.getState();
      const onEntityRoute = location.pathname.startsWith('/entity/');
      const onWeaponRoute = location.pathname.startsWith('/weapon/');

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveAction();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }

      if (isTyping) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (state.selection.kind === 'entity-keyframe') {
          state.duplicateEntityKeyframe(state.selection.stateKey, state.selection.threshold);
        } else if (state.selection.kind === 'weapon-frame') {
          state.duplicateWeaponFrame(state.selection.threshold);
        }
        return;
      }

      if (event.key === 'Delete') {
        if (state.selection.kind === 'entity-keyframe') {
          state.removeEntityKeyframe(state.selection.stateKey, state.selection.threshold);
        } else if (state.selection.kind === 'weapon-frame') {
          state.removeWeaponFrame(state.selection.threshold);
        }
        return;
      }

      if (event.key.toLowerCase() === 'k') {
        if (onEntityRoute) {
          const activeEntity = state.entityProfiles.find((item) => item.id === state.activeEntityId);
          if (!activeEntity) {
            return;
          }
          const stateKey =
            state.selection.kind === 'entity-state' || state.selection.kind === 'entity-keyframe'
              ? state.selection.stateKey
              : Object.keys(activeEntity.states)[0];
          state.addEntityKeyframe(stateKey, state.entityPlayback.counter, 0);
        }
        if (onWeaponRoute) {
          const chains = state.weapons[state.activeWeaponName];
          const chain = chains?.[state.activeWeaponChainIndex];
          if (!chain) {
            return;
          }
          state.addWeaponFrame(Math.max(chain.anim_duration - state.weaponPlayback.attackTimer - 1, 0));
        }
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        state.toggleFacing();
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        state.toggleGrid();
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        if (onEntityRoute) {
          state.toggleEntityPlayback();
        }
        if (onWeaponRoute) {
          state.toggleWeaponPlayback();
        }
        return;
      }

      if (event.key === ',') {
        event.preventDefault();
        if (onEntityRoute) {
          state.stepEntityCounter(-1);
        }
        if (onWeaponRoute) {
          state.stepWeaponAttackTimer(1);
        }
        return;
      }

      if (event.key === '.') {
        event.preventDefault();
        if (onEntityRoute) {
          state.stepEntityCounter(1);
        }
        if (onWeaponRoute) {
          state.stepWeaponAttackTimer(-1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [location.pathname, saveAction]);

  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectHome />} />
        <Route path="/entity/:entityId" element={<EntityEditorRoute onSave={saveAction} />} />
        <Route
          path="/weapon/:weaponName/:chainIndex"
          element={<WeaponEditorRoute onSave={saveAction} />}
        />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ErrorModal error={activeError} onClose={clearActiveError} />
    </>
  );
}
