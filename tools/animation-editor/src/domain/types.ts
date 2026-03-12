export type FacingMode = 'right' | 'left' | 'split';

export type GridMode = 'off' | '1px' | '8px';

export type BackgroundMode = 'checker' | 'dark' | 'light';

export type Severity = 'error' | 'warning';

export interface Bbox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type SpriteValue = number | [number, number, number] | null;

export type StateAnimMap = Record<string, number>;

export interface EntityState {
  anim: StateAnimMap;
  reset: number;
}

export interface EntityProfile {
  id: string;
  entityName: string;
  spriteSheetPath: string;
  bbox: Bbox;
  states: Record<string, EntityState>;
}

export interface WeaponFrame {
  sprite: SpriteValue;
  bbox: Bbox | null;
  xm?: number;
  ym?: number;
  [unknownKey: string]: unknown;
}

export interface WeaponChain {
  power: number;
  anim_duration: number;
  cancel?: number;
  sfx: string;
  knockback: { x: number; y: number };
  origin: { x: number; y: number };
  stopMove?: boolean;
  eval?: string;
  frames?: Record<string, WeaponFrame>;
  [unknownKey: string]: unknown;
}

export type WeaponsFile = Record<string, WeaponChain[]>;

export interface ValidationIssue {
  id: string;
  severity: Severity;
  path: string;
  message: string;
  blocking: boolean;
}

export interface PortableBundle {
  version: 1;
  entityProfiles: EntityProfile[];
  weapons: WeaponsFile;
  metadata: {
    exportedAt: string;
    source: 'portable' | 'repository';
  };
}

export interface WeaponFrameResolution {
  threshold: number | null;
  frame: WeaponFrame | null;
}

export interface PlaybackState {
  playing: boolean;
  speed: 0.25 | 0.5 | 1 | 2;
  counter: number;
}

export interface RepositoryHandles {
  rootName: string;
  weaponsPath: string;
  entitiesPath: string;
  weaponsFileHandle: FileSystemFileHandle;
  entitiesDirectoryHandle: FileSystemDirectoryHandle;
}
