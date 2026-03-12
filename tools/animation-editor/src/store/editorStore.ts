import { create } from 'zustand';
import { DEFAULT_CHAIN, DEFAULT_ENTITY } from '../domain/defaults';
import {
  collectAllIssues,
  hasBlockingIssues,
  validateEntityProfile,
  validateWeaponsFile,
} from '../domain/validation';
import { cloneDeep, makeIssueId } from '../domain/utils';
import type {
  Bbox,
  EntityProfile,
  FacingMode,
  GridMode,
  PortableBundle,
  RepositoryHandles,
  ValidationIssue,
  WeaponChain,
  WeaponFrame,
  WeaponsFile,
} from '../domain/types';

const HISTORY_LIMIT = 100;
const DRAFT_DEBOUNCE_MS = 500;

type EditorTab = 'canvas' | 'timeline' | 'inspector' | 'issues';

type Selection =
  | { kind: 'none' }
  | { kind: 'entity-state'; stateKey: string }
  | { kind: 'entity-keyframe'; stateKey: string; threshold: number }
  | { kind: 'bbox'; target: 'entity' | 'weapon'; edge?: keyof Bbox }
  | { kind: 'weapon-chain-field'; field: string }
  | { kind: 'weapon-frame'; threshold: number };

interface HistoryState {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

interface EditorSnapshot {
  entityProfiles: EntityProfile[];
  weapons: WeaponsFile;
  activeEntityId: string;
  activeWeaponName: string;
  activeWeaponChainIndex: number;
  selection: Selection;
}

interface SaveResult {
  ok: boolean;
  reason?: string;
}

interface EditorStoreState extends EditorSnapshot {
  mode: 'portable' | 'repository';
  repositorySupported: boolean;
  repositoryHandles: RepositoryHandles | null;
  entityPlayback: {
    playing: boolean;
    speed: 0.25 | 0.5 | 1 | 2;
    counter: number;
  };
  weaponPlayback: {
    playing: boolean;
    speed: 0.25 | 0.5 | 1 | 2;
    attackTimer: number;
  };
  canvasOptions: {
    facing: FacingMode;
    grid: GridMode;
    onion: boolean;
    zoom: 4 | 8 | 12 | 16;
    background: 'checker' | 'dark' | 'light';
  };
  mobileTab: EditorTab;
  focusedPath: string | null;
  issues: ValidationIssue[];
  interactionIssues: ValidationIssue[];
  dirty: boolean;
  draftSnapshot: EditorSnapshot | null;
  draftSavedAt: number | null;
  activeError: { message: string; path: string } | null;
  history: HistoryState;

  recomputeIssues: () => void;
  setMode: (mode: 'portable' | 'repository') => void;
  setRepositoryHandles: (handles: RepositoryHandles | null) => void;
  setMobileTab: (tab: EditorTab) => void;
  setFocusedPath: (path: string | null) => void;
  setSelection: (selection: Selection) => void;
  clearActiveError: () => void;
  setActiveError: (message: string, path: string) => void;

  loadEntityProfiles: (profiles: EntityProfile[]) => void;
  createEntity: () => void;
  duplicateEntity: (entityId: string) => void;
  deleteEntity: (entityId: string) => void;
  selectEntity: (entityId: string) => void;
  updateEntityMeta: (patch: Partial<Pick<EntityProfile, 'entityName' | 'spriteSheetPath'>>) => void;
  updateEntityBbox: (bbox: Bbox) => void;
  applyEntityBboxPreset: (bbox: Bbox) => void;

  addState: (stateKey: string) => void;
  renameState: (oldKey: string, newKey: string) => void;
  deleteState: (stateKey: string) => void;
  setStateReset: (stateKey: string, reset: number) => void;

  addEntityKeyframe: (stateKey: string, threshold: number, sprite: number) => void;
  removeEntityKeyframe: (stateKey: string, threshold: number) => void;
  duplicateEntityKeyframe: (stateKey: string, threshold: number) => void;
  updateEntityKeyframeThreshold: (
    stateKey: string,
    previousThreshold: number,
    nextThreshold: number,
  ) => void;
  updateEntityKeyframeSprite: (stateKey: string, threshold: number, sprite: number) => void;

  loadWeapons: (weapons: WeaponsFile) => void;
  selectWeapon: (weaponName: string, chainIndex: number) => void;
  createWeaponChain: (weaponName: string) => void;
  duplicateWeaponChain: (weaponName: string, chainIndex: number) => void;
  deleteWeaponChain: (weaponName: string, chainIndex: number) => void;

  updateWeaponChainField: (fieldPath: string, value: unknown) => void;
  addWeaponFrame: (threshold: number, frame?: Partial<WeaponFrame>) => void;
  updateWeaponFrameThreshold: (previousThreshold: number, nextThreshold: number) => void;
  updateWeaponFrameField: (threshold: number, fieldPath: string, value: unknown) => void;
  removeWeaponFrame: (threshold: number) => void;
  duplicateWeaponFrame: (threshold: number) => void;

  toggleEntityPlayback: () => void;
  stepEntityCounter: (delta: number) => void;
  setEntityCounter: (counter: number) => void;
  setEntitySpeed: (speed: 0.25 | 0.5 | 1 | 2) => void;

  toggleWeaponPlayback: () => void;
  stepWeaponAttackTimer: (delta: number) => void;
  setWeaponAttackTimer: (timer: number) => void;
  setWeaponSpeed: (speed: 0.25 | 0.5 | 1 | 2) => void;

  toggleFacing: () => void;
  setFacing: (facing: FacingMode) => void;
  toggleGrid: () => void;
  setGrid: (grid: GridMode) => void;
  setOnion: (onion: boolean) => void;
  setZoom: (zoom: 4 | 8 | 12 | 16) => void;
  setBackground: (background: 'checker' | 'dark' | 'light') => void;

  undo: () => void;
  redo: () => void;

  importBundle: (bundle: PortableBundle) => void;
  exportBundlePayload: () => PortableBundle;

  markSaved: () => void;
  canSave: () => SaveResult;
}

let draftTimer: number | null = null;

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultWeapons(): WeaponsFile {
  return {
    Sword: [cloneDeep(DEFAULT_CHAIN)],
  };
}

function activeEntityOrThrow(snapshot: EditorSnapshot): EntityProfile {
  const entity = snapshot.entityProfiles.find((item) => item.id === snapshot.activeEntityId);
  if (!entity) {
    throw new Error(`Active entity id "${snapshot.activeEntityId}" does not exist`);
  }
  return entity;
}

function activeWeaponChainOrThrow(snapshot: EditorSnapshot): { name: string; chain: WeaponChain } {
  const chains = snapshot.weapons[snapshot.activeWeaponName];
  if (!chains) {
    throw new Error(`Active weapon "${snapshot.activeWeaponName}" does not exist`);
  }
  const chain = chains[snapshot.activeWeaponChainIndex];
  if (!chain) {
    throw new Error(
      `Active weapon chain index ${snapshot.activeWeaponChainIndex} does not exist for ${snapshot.activeWeaponName}`,
    );
  }
  return { name: snapshot.activeWeaponName, chain };
}

function createInitialSnapshot(): EditorSnapshot {
  const entity = cloneDeep(DEFAULT_ENTITY);
  entity.id = randomId('entity');

  return {
    entityProfiles: [entity],
    weapons: defaultWeapons(),
    activeEntityId: entity.id,
    activeWeaponName: 'Sword',
    activeWeaponChainIndex: 0,
    selection: { kind: 'none' },
  };
}

function addInteractionIssue(
  interactionIssues: ValidationIssue[],
  path: string,
  message: string,
): ValidationIssue[] {
  const issue: ValidationIssue = {
    id: makeIssueId('error', `${path}:${message}`),
    severity: 'error',
    path,
    message,
    blocking: true,
  };

  const withoutExisting = interactionIssues.filter((item) => item.id !== issue.id);
  return [...withoutExisting, issue];
}

function scheduleDraftSave(set: (fn: (state: EditorStoreState) => Partial<EditorStoreState>) => void): void {
  if (draftTimer !== null) {
    window.clearTimeout(draftTimer);
  }
  draftTimer = window.setTimeout(() => {
    set((state) => ({
      draftSnapshot: snapshotFromState(state),
      draftSavedAt: Date.now(),
    }));
  }, DRAFT_DEBOUNCE_MS);
}

function snapshotFromState(state: EditorStoreState): EditorSnapshot {
  return {
    entityProfiles: cloneDeep(state.entityProfiles),
    weapons: cloneDeep(state.weapons),
    activeEntityId: state.activeEntityId,
    activeWeaponName: state.activeWeaponName,
    activeWeaponChainIndex: state.activeWeaponChainIndex,
    selection: cloneDeep(state.selection),
  };
}

function computeIssues(state: {
  entityProfiles: EntityProfile[];
  weapons: WeaponsFile;
  interactionIssues: ValidationIssue[];
}): ValidationIssue[] {
  const schemaIssues = collectAllIssues(state.entityProfiles, state.weapons);
  return [...schemaIssues, ...state.interactionIssues];
}

function mutateWithHistory(
  set: (fn: (state: EditorStoreState) => Partial<EditorStoreState> | EditorStoreState) => void,
  get: () => EditorStoreState,
  mutation: (draft: EditorSnapshot, state: EditorStoreState) => void,
): void {
  const current = get();
  const before = snapshotFromState(current);
  const draft = cloneDeep(before);

  mutation(draft, current);

  set((state) => {
    const past = [...state.history.past, before];
    if (past.length > HISTORY_LIMIT) {
      past.splice(0, past.length - HISTORY_LIMIT);
    }

    const nextIssues = computeIssues({
      entityProfiles: draft.entityProfiles,
      weapons: draft.weapons,
      interactionIssues: state.interactionIssues,
    });

    return {
      ...state,
      ...draft,
      dirty: true,
      history: {
        past,
        future: [],
      },
      issues: nextIssues,
    };
  });

  scheduleDraftSave(set);
}

function removeInteractionIssuesAtPath(
  interactionIssues: ValidationIssue[],
  pathPrefix: string,
): ValidationIssue[] {
  return interactionIssues.filter((issue) => !issue.path.startsWith(pathPrefix));
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Field path cannot be empty');
  }

  let ref: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const current = ref[key];
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Cannot set path ${path}: ${segments.slice(0, index + 1).join('.')} is not an object`);
    }
    ref = current as Record<string, unknown>;
  }

  ref[segments[segments.length - 1]] = value;
}

export const useEditorStore = create<EditorStoreState>((set, get) => {
  const initialSnapshot = createInitialSnapshot();

  const initialState: EditorStoreState = {
    ...initialSnapshot,
    mode: 'portable',
    repositorySupported:
      typeof window !== 'undefined' &&
      'showDirectoryPicker' in window &&
      'showOpenFilePicker' in window,
    repositoryHandles: null,
    entityPlayback: {
      playing: false,
      speed: 1,
      counter: 0,
    },
    weaponPlayback: {
      playing: false,
      speed: 1,
      attackTimer: 0,
    },
    canvasOptions: {
      facing: 'right',
      grid: '8px',
      onion: false,
      zoom: 12,
      background: 'checker',
    },
    mobileTab: 'canvas',
    focusedPath: null,
    issues: [],
    interactionIssues: [],
    dirty: false,
    draftSnapshot: null,
    draftSavedAt: null,
    activeError: null,
    history: {
      past: [],
      future: [],
    },

    recomputeIssues: () => {
      set((state) => ({
        issues: computeIssues({
          entityProfiles: state.entityProfiles,
          weapons: state.weapons,
          interactionIssues: state.interactionIssues,
        }),
      }));
    },

    setMode: (mode) => set(() => ({ mode })),
    setRepositoryHandles: (handles) => set(() => ({ repositoryHandles: handles })),
    setMobileTab: (tab) => set(() => ({ mobileTab: tab })),
    setFocusedPath: (path) => set(() => ({ focusedPath: path })),
    setSelection: (selection) => set(() => ({ selection })),
    clearActiveError: () => set(() => ({ activeError: null })),
    setActiveError: (message, path) => set(() => ({ activeError: { message, path } })),

    loadEntityProfiles: (profiles) => {
      if (profiles.length === 0) {
        throw new Error('loadEntityProfiles requires at least one profile');
      }
      for (const profile of profiles) {
        const { profile: validProfile, issues } = validateEntityProfile(profile);
        if (!validProfile) {
          const firstError = issues[0];
          throw new Error(
            `Invalid entity profile at ${firstError?.path ?? 'unknown'}: ${firstError?.message ?? 'unknown error'}`,
          );
        }
      }

      mutateWithHistory(set, get, (draft) => {
        draft.entityProfiles = cloneDeep(profiles);
        draft.activeEntityId = profiles[0].id;
      });
    },

    createEntity: () => {
      mutateWithHistory(set, get, (draft) => {
        const entity = cloneDeep(DEFAULT_ENTITY);
        entity.id = randomId('entity');
        entity.entityName = `Entity ${draft.entityProfiles.length + 1}`;
        draft.entityProfiles.push(entity);
        draft.activeEntityId = entity.id;
        draft.selection = { kind: 'entity-state', stateKey: 'stand' };
      });
    },

    duplicateEntity: (entityId) => {
      mutateWithHistory(set, get, (draft) => {
        const source = draft.entityProfiles.find((entity) => entity.id === entityId);
        if (!source) {
          throw new Error(`Cannot duplicate missing entity ${entityId}`);
        }
        const copy = cloneDeep(source);
        copy.id = randomId('entity');
        copy.entityName = `${source.entityName} Copy`;
        draft.entityProfiles.push(copy);
        draft.activeEntityId = copy.id;
      });
    },

    deleteEntity: (entityId) => {
      mutateWithHistory(set, get, (draft) => {
        if (draft.entityProfiles.length === 1) {
          throw new Error('Cannot delete the last entity profile');
        }
        draft.entityProfiles = draft.entityProfiles.filter((entity) => entity.id !== entityId);
        if (!draft.entityProfiles.some((entity) => entity.id === draft.activeEntityId)) {
          draft.activeEntityId = draft.entityProfiles[0].id;
        }
      });
    },

    selectEntity: (entityId) => {
      set((state) => {
        if (!state.entityProfiles.some((entity) => entity.id === entityId)) {
          throw new Error(`Cannot select missing entity ${entityId}`);
        }
        return {
          activeEntityId: entityId,
          selection: { kind: 'none' as const },
        };
      });
    },

    updateEntityMeta: (patch) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        if (patch.entityName !== undefined) {
          entity.entityName = patch.entityName;
        }
        if (patch.spriteSheetPath !== undefined) {
          entity.spriteSheetPath = patch.spriteSheetPath;
        }
      });
    },

    updateEntityBbox: (bbox) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        entity.bbox = bbox;
        draft.selection = { kind: 'bbox', target: 'entity' };
      });
    },

    applyEntityBboxPreset: (bbox) => {
      mutateWithHistory(set, get, (draft) => {
        activeEntityOrThrow(draft).bbox = cloneDeep(bbox);
        draft.selection = { kind: 'bbox', target: 'entity' };
      });
    },

    addState: (stateKey) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        if (entity.states[stateKey]) {
          throw new Error(`State ${stateKey} already exists`);
        }
        entity.states[stateKey] = {
          anim: { '0': 0 },
          reset: 0,
        };
        draft.selection = { kind: 'entity-state', stateKey };
      });
    },

    renameState: (oldKey, newKey) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        if (!entity.states[oldKey]) {
          throw new Error(`State ${oldKey} does not exist`);
        }
        if (entity.states[newKey]) {
          throw new Error(`State ${newKey} already exists`);
        }
        entity.states[newKey] = entity.states[oldKey];
        delete entity.states[oldKey];

        if (draft.selection.kind === 'entity-state' && draft.selection.stateKey === oldKey) {
          draft.selection = { kind: 'entity-state', stateKey: newKey };
        }
        if (draft.selection.kind === 'entity-keyframe' && draft.selection.stateKey === oldKey) {
          draft.selection = {
            kind: 'entity-keyframe',
            stateKey: newKey,
            threshold: draft.selection.threshold,
          };
        }
      });
    },

    deleteState: (stateKey) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        if (!entity.states[stateKey]) {
          throw new Error(`State ${stateKey} does not exist`);
        }
        if (Object.keys(entity.states).length === 1) {
          throw new Error('Cannot delete the last state');
        }
        delete entity.states[stateKey];
        draft.selection = { kind: 'none' };
      });
    },

    setStateReset: (stateKey, reset) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        if (!entity.states[stateKey]) {
          throw new Error(`State ${stateKey} does not exist`);
        }
        entity.states[stateKey].reset = reset;
      });
    },

    addEntityKeyframe: (stateKey, threshold, sprite) => {
      mutateWithHistory(set, get, (draft, state) => {
        const entity = activeEntityOrThrow(draft);
        const stateEntry = entity.states[stateKey];
        if (!stateEntry) {
          throw new Error(`State ${stateKey} does not exist`);
        }

        const key = String(threshold);
        if (stateEntry.anim[key] !== undefined) {
          const interactionIssues = addInteractionIssue(
            state.interactionIssues,
            `${entity.entityName}.states.${stateKey}.anim.${key}`,
            `Duplicate threshold ${threshold}`,
          );
          set(() => ({ interactionIssues }));
          return;
        }

        stateEntry.anim[key] = sprite;
        draft.selection = { kind: 'entity-keyframe', stateKey, threshold };
        set(() => ({
          interactionIssues: removeInteractionIssuesAtPath(
            state.interactionIssues,
            `${entity.entityName}.states.${stateKey}.anim`,
          ),
        }));
      });
    },

    removeEntityKeyframe: (stateKey, threshold) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        const stateEntry = entity.states[stateKey];
        if (!stateEntry) {
          throw new Error(`State ${stateKey} does not exist`);
        }
        delete stateEntry.anim[String(threshold)];
        draft.selection = { kind: 'entity-state', stateKey };
      });
    },

    duplicateEntityKeyframe: (stateKey, threshold) => {
      mutateWithHistory(set, get, (draft, state) => {
        const entity = activeEntityOrThrow(draft);
        const stateEntry = entity.states[stateKey];
        if (!stateEntry) {
          throw new Error(`State ${stateKey} does not exist`);
        }

        const existingSprite = stateEntry.anim[String(threshold)];
        if (existingSprite === undefined) {
          throw new Error(`Keyframe ${threshold} does not exist`);
        }

        let nextThreshold = threshold + 1;
        while (stateEntry.anim[String(nextThreshold)] !== undefined) {
          nextThreshold += 1;
        }

        if (stateEntry.anim[String(nextThreshold)] !== undefined) {
          const interactionIssues = addInteractionIssue(
            state.interactionIssues,
            `${entity.entityName}.states.${stateKey}.anim.${nextThreshold}`,
            `Duplicate threshold ${nextThreshold}`,
          );
          set(() => ({ interactionIssues }));
          return;
        }

        stateEntry.anim[String(nextThreshold)] = existingSprite;
        draft.selection = { kind: 'entity-keyframe', stateKey, threshold: nextThreshold };
      });
    },

    updateEntityKeyframeThreshold: (stateKey, previousThreshold, nextThreshold) => {
      mutateWithHistory(set, get, (draft, state) => {
        const entity = activeEntityOrThrow(draft);
        const stateEntry = entity.states[stateKey];
        if (!stateEntry) {
          throw new Error(`State ${stateKey} does not exist`);
        }

        const previousKey = String(previousThreshold);
        const nextKey = String(nextThreshold);
        const sprite = stateEntry.anim[previousKey];
        if (sprite === undefined) {
          throw new Error(`Keyframe ${previousThreshold} does not exist`);
        }

        if (previousKey !== nextKey && stateEntry.anim[nextKey] !== undefined) {
          const interactionIssues = addInteractionIssue(
            state.interactionIssues,
            `${entity.entityName}.states.${stateKey}.anim.${nextThreshold}`,
            `Duplicate threshold ${nextThreshold}`,
          );
          set(() => ({ interactionIssues }));
          return;
        }

        delete stateEntry.anim[previousKey];
        stateEntry.anim[nextKey] = sprite;
        draft.selection = { kind: 'entity-keyframe', stateKey, threshold: nextThreshold };
      });
    },

    updateEntityKeyframeSprite: (stateKey, threshold, sprite) => {
      mutateWithHistory(set, get, (draft) => {
        const entity = activeEntityOrThrow(draft);
        const stateEntry = entity.states[stateKey];
        if (!stateEntry) {
          throw new Error(`State ${stateKey} does not exist`);
        }
        if (stateEntry.anim[String(threshold)] === undefined) {
          throw new Error(`Keyframe ${threshold} does not exist`);
        }
        stateEntry.anim[String(threshold)] = sprite;
      });
    },

    loadWeapons: (weapons) => {
      const { weapons: validWeapons, issues } = validateWeaponsFile(weapons);
      if (!validWeapons) {
        const first = issues[0];
        throw new Error(`Invalid weapons file at ${first?.path ?? 'unknown'}: ${first?.message ?? 'unknown'}`);
      }

      mutateWithHistory(set, get, (draft) => {
        draft.weapons = cloneDeep(validWeapons);
        const weaponNames = Object.keys(validWeapons);
        if (weaponNames.length === 0) {
          throw new Error('Weapons file cannot be empty');
        }
        draft.activeWeaponName = weaponNames[0];
        draft.activeWeaponChainIndex = 0;
      });
    },

    selectWeapon: (weaponName, chainIndex) => {
      set((state) => {
        const chains = state.weapons[weaponName];
        if (!chains) {
          throw new Error(`Unknown weapon ${weaponName}`);
        }
        if (!chains[chainIndex]) {
          throw new Error(`Weapon ${weaponName} has no chain at index ${chainIndex}`);
        }
        return {
          activeWeaponName: weaponName,
          activeWeaponChainIndex: chainIndex,
          selection: { kind: 'none' as const },
        };
      });
    },

    createWeaponChain: (weaponName) => {
      mutateWithHistory(set, get, (draft) => {
        const chains = draft.weapons[weaponName];
        if (!chains) {
          throw new Error(`Unknown weapon ${weaponName}`);
        }
        chains.push(cloneDeep(DEFAULT_CHAIN));
        draft.activeWeaponName = weaponName;
        draft.activeWeaponChainIndex = chains.length - 1;
      });
    },

    duplicateWeaponChain: (weaponName, chainIndex) => {
      mutateWithHistory(set, get, (draft) => {
        const chains = draft.weapons[weaponName];
        if (!chains) {
          throw new Error(`Unknown weapon ${weaponName}`);
        }
        const source = chains[chainIndex];
        if (!source) {
          throw new Error(`Weapon ${weaponName} has no chain at index ${chainIndex}`);
        }
        chains.splice(chainIndex + 1, 0, cloneDeep(source));
        draft.activeWeaponName = weaponName;
        draft.activeWeaponChainIndex = chainIndex + 1;
      });
    },

    deleteWeaponChain: (weaponName, chainIndex) => {
      mutateWithHistory(set, get, (draft) => {
        const chains = draft.weapons[weaponName];
        if (!chains) {
          throw new Error(`Unknown weapon ${weaponName}`);
        }
        if (chains.length === 1) {
          throw new Error(`Cannot delete the last chain for ${weaponName}`);
        }
        chains.splice(chainIndex, 1);
        draft.activeWeaponName = weaponName;
        draft.activeWeaponChainIndex = Math.max(0, Math.min(chainIndex, chains.length - 1));
      });
    },

    updateWeaponChainField: (fieldPath, value) => {
      mutateWithHistory(set, get, (draft) => {
        const { chain } = activeWeaponChainOrThrow(draft);
        setAtPath(chain as unknown as Record<string, unknown>, fieldPath, value);
      });
    },

    addWeaponFrame: (threshold, frame) => {
      mutateWithHistory(set, get, (draft, state) => {
        const { name, chain } = activeWeaponChainOrThrow(draft);
        if (!chain.frames) {
          chain.frames = {};
        }
        const key = String(threshold);
        if (chain.frames[key] !== undefined) {
          const interactionIssues = addInteractionIssue(
            state.interactionIssues,
            `${name}[${draft.activeWeaponChainIndex}].frames.${key}`,
            `Duplicate threshold ${threshold}`,
          );
          set(() => ({ interactionIssues }));
          return;
        }

        chain.frames[key] = {
          sprite: 0,
          bbox: null,
          ...frame,
        };
        draft.selection = { kind: 'weapon-frame', threshold };
      });
    },

    updateWeaponFrameThreshold: (previousThreshold, nextThreshold) => {
      mutateWithHistory(set, get, (draft, state) => {
        const { name, chain } = activeWeaponChainOrThrow(draft);
        if (!chain.frames) {
          throw new Error('Cannot update threshold when chain has no frames map');
        }

        const previousKey = String(previousThreshold);
        const nextKey = String(nextThreshold);
        const frame = chain.frames[previousKey];
        if (!frame) {
          throw new Error(`Frame ${previousThreshold} does not exist`);
        }

        if (previousKey !== nextKey && chain.frames[nextKey] !== undefined) {
          const interactionIssues = addInteractionIssue(
            state.interactionIssues,
            `${name}[${draft.activeWeaponChainIndex}].frames.${nextKey}`,
            `Duplicate threshold ${nextThreshold}`,
          );
          set(() => ({ interactionIssues }));
          return;
        }

        delete chain.frames[previousKey];
        chain.frames[nextKey] = frame;
        draft.selection = { kind: 'weapon-frame', threshold: nextThreshold };
      });
    },

    updateWeaponFrameField: (threshold, fieldPath, value) => {
      mutateWithHistory(set, get, (draft) => {
        const { chain } = activeWeaponChainOrThrow(draft);
        if (!chain.frames) {
          throw new Error('Cannot update frame field when chain has no frames map');
        }
        const frame = chain.frames[String(threshold)];
        if (!frame) {
          throw new Error(`Frame ${threshold} does not exist`);
        }
        setAtPath(frame as unknown as Record<string, unknown>, fieldPath, value);
      });
    },

    removeWeaponFrame: (threshold) => {
      mutateWithHistory(set, get, (draft) => {
        const { chain } = activeWeaponChainOrThrow(draft);
        if (!chain.frames) {
          throw new Error('Cannot remove frame when chain has no frames map');
        }
        delete chain.frames[String(threshold)];
        draft.selection = { kind: 'none' };
      });
    },

    duplicateWeaponFrame: (threshold) => {
      mutateWithHistory(set, get, (draft) => {
        const { chain } = activeWeaponChainOrThrow(draft);
        if (!chain.frames) {
          throw new Error('Cannot duplicate frame when chain has no frames map');
        }
        const source = chain.frames[String(threshold)];
        if (!source) {
          throw new Error(`Frame ${threshold} does not exist`);
        }

        let nextThreshold = threshold + 1;
        while (chain.frames[String(nextThreshold)] !== undefined) {
          nextThreshold += 1;
        }

        chain.frames[String(nextThreshold)] = cloneDeep(source);
        draft.selection = { kind: 'weapon-frame', threshold: nextThreshold };
      });
    },

    toggleEntityPlayback: () => {
      set((state) => ({
        entityPlayback: {
          ...state.entityPlayback,
          playing: !state.entityPlayback.playing,
        },
      }));
    },

    stepEntityCounter: (delta) => {
      set((state) => ({
        entityPlayback: {
          ...state.entityPlayback,
          counter: Math.max(0, state.entityPlayback.counter + delta),
        },
      }));
    },

    setEntityCounter: (counter) => {
      set((state) => ({
        entityPlayback: {
          ...state.entityPlayback,
          counter: Math.max(0, counter),
        },
      }));
    },

    setEntitySpeed: (speed) => {
      set((state) => ({
        entityPlayback: {
          ...state.entityPlayback,
          speed,
        },
      }));
    },

    toggleWeaponPlayback: () => {
      set((state) => ({
        weaponPlayback: {
          ...state.weaponPlayback,
          playing: !state.weaponPlayback.playing,
        },
      }));
    },

    stepWeaponAttackTimer: (delta) => {
      set((state) => ({
        weaponPlayback: {
          ...state.weaponPlayback,
          attackTimer: Math.max(0, state.weaponPlayback.attackTimer + delta),
        },
      }));
    },

    setWeaponAttackTimer: (timer) => {
      set((state) => ({
        weaponPlayback: {
          ...state.weaponPlayback,
          attackTimer: Math.max(0, timer),
        },
      }));
    },

    setWeaponSpeed: (speed) => {
      set((state) => ({
        weaponPlayback: {
          ...state.weaponPlayback,
          speed,
        },
      }));
    },

    toggleFacing: () => {
      set((state) => {
        const nextFacing: FacingMode =
          state.canvasOptions.facing === 'right'
            ? 'left'
            : state.canvasOptions.facing === 'left'
              ? 'split'
              : 'right';
        return {
          canvasOptions: {
            ...state.canvasOptions,
            facing: nextFacing,
          },
        };
      });
    },

    setFacing: (facing) => {
      set((state) => ({ canvasOptions: { ...state.canvasOptions, facing } }));
    },

    toggleGrid: () => {
      set((state) => {
        const next: GridMode =
          state.canvasOptions.grid === 'off'
            ? '1px'
            : state.canvasOptions.grid === '1px'
              ? '8px'
              : 'off';
        return { canvasOptions: { ...state.canvasOptions, grid: next } };
      });
    },

    setGrid: (grid) => {
      set((state) => ({ canvasOptions: { ...state.canvasOptions, grid } }));
    },

    setOnion: (onion) => {
      set((state) => ({ canvasOptions: { ...state.canvasOptions, onion } }));
    },

    setZoom: (zoom) => {
      set((state) => ({ canvasOptions: { ...state.canvasOptions, zoom } }));
    },

    setBackground: (background) => {
      set((state) => ({ canvasOptions: { ...state.canvasOptions, background } }));
    },

    undo: () => {
      set((state) => {
        const previous = state.history.past[state.history.past.length - 1];
        if (!previous) {
          return state;
        }
        const current = snapshotFromState(state);
        const past = state.history.past.slice(0, -1);
        const future = [current, ...state.history.future].slice(0, HISTORY_LIMIT);

        const issues = computeIssues({
          entityProfiles: previous.entityProfiles,
          weapons: previous.weapons,
          interactionIssues: state.interactionIssues,
        });

        return {
          ...state,
          ...cloneDeep(previous),
          history: {
            past,
            future,
          },
          issues,
        };
      });
    },

    redo: () => {
      set((state) => {
        const next = state.history.future[0];
        if (!next) {
          return state;
        }

        const current = snapshotFromState(state);
        const past = [...state.history.past, current].slice(-HISTORY_LIMIT);
        const future = state.history.future.slice(1);

        const issues = computeIssues({
          entityProfiles: next.entityProfiles,
          weapons: next.weapons,
          interactionIssues: state.interactionIssues,
        });

        return {
          ...state,
          ...cloneDeep(next),
          history: {
            past,
            future,
          },
          issues,
        };
      });
    },

    importBundle: (bundle) => {
      if (bundle.version !== 1) {
        throw new Error(`Unsupported bundle version ${bundle.version}`);
      }

      const weaponValidation = validateWeaponsFile(bundle.weapons);
      if (!weaponValidation.weapons) {
        const first = weaponValidation.issues[0];
        throw new Error(
          `Bundle weapons invalid at ${first?.path ?? 'unknown'}: ${first?.message ?? 'unknown'}`,
        );
      }

      if (bundle.entityProfiles.length === 0) {
        throw new Error('Bundle must contain at least one entity profile');
      }

      for (const entity of bundle.entityProfiles) {
        const validation = validateEntityProfile(entity);
        if (!validation.profile) {
          const first = validation.issues[0];
          throw new Error(
            `Bundle entity invalid at ${first?.path ?? 'unknown'}: ${first?.message ?? 'unknown'}`,
          );
        }
      }

      mutateWithHistory(set, get, (draft) => {
        draft.entityProfiles = cloneDeep(bundle.entityProfiles);
        draft.weapons = cloneDeep(bundle.weapons);
        draft.activeEntityId = bundle.entityProfiles[0].id;
        draft.activeWeaponName = Object.keys(bundle.weapons)[0] ?? draft.activeWeaponName;
        draft.activeWeaponChainIndex = 0;
      });
    },

    exportBundlePayload: () => {
      const state = get();
      return {
        version: 1,
        entityProfiles: cloneDeep(state.entityProfiles),
        weapons: cloneDeep(state.weapons),
        metadata: {
          exportedAt: new Date().toISOString(),
          source: state.mode,
        },
      };
    },

    markSaved: () => set(() => ({ dirty: false })),
    canSave: () => {
      const state = get();
      if (hasBlockingIssues(state.issues)) {
        return {
          ok: false,
          reason: 'Blocking validation issues must be fixed before saving',
        };
      }
      return { ok: true };
    },
  };

  initialState.issues = computeIssues({
    entityProfiles: initialState.entityProfiles,
    weapons: initialState.weapons,
    interactionIssues: initialState.interactionIssues,
  });

  return initialState;
});

export function useActiveEntity(): EntityProfile {
  return useEditorStore((state) => {
    const entity = state.entityProfiles.find((item) => item.id === state.activeEntityId);
    if (!entity) {
      throw new Error(`Active entity id "${state.activeEntityId}" does not exist`);
    }
    return entity;
  });
}
