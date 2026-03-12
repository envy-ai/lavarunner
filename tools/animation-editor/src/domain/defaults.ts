import type { EntityProfile, WeaponChain } from './types';

export const TILE_SIZE = 8;

export const DEFAULT_ENTITY: EntityProfile = {
  id: 'entity-1',
  entityName: 'New Entity',
  spriteSheetPath: 'sprites/player_default',
  bbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
  states: {
    stand: {
      anim: { '0': 0 },
      reset: 0,
    },
  },
};

export const DEFAULT_CHAIN: WeaponChain = {
  power: 1,
  anim_duration: 8,
  sfx: 'slash',
  knockback: { x: 1, y: -1 },
  origin: { x: 0, y: 0 },
  stopMove: false,
  frames: {
    '0': {
      sprite: 0,
      bbox: null,
    },
  },
};

export const PLAYER_BODY_BBOX = { x1: 2, y1: 1, x2: 6, y2: 7 };

export const PLAYER_WEAPON_ORIGIN_RIGHT = { x: 6, y: 4 };
export const PLAYER_WEAPON_ORIGIN_LEFT = { x: 1, y: 4 };

export const BBOX_PRESETS = {
  fullTile: { x1: 0, y1: 0, x2: 7, y2: 7 },
  centerSix: { x1: 1, y1: 1, x2: 6, y2: 6 },
  playerDefault: { x1: 2, y1: 1, x2: 6, y2: 7 },
} as const;
