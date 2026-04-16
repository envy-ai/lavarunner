export const PLAYER_SPRITE_SHEET_PATH = 'sprites/player_default';
export const ENEMY_SPRITE_SHEET_PATH = 'sprites/enemies';
export const GOODIE_SPRITE_SHEET_PATH = 'sprites/goodies';
export const WEAPON_SPRITE_SHEET_PATH = 'sprites/weapons';
export const SPRITE_EDITOR_BODY_BOX_IDENTIFIER = 'body';
export const SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER = 'attack';
export const SPRITE_EDITOR_WEAPON_ATTACK_STATE_IDENTIFIER = 'attack';
export const SPRITE_EDITOR_PLACEMENT_SPRITE_STATE_IDENTIFIER = 'stand';
export const LDTK_PLACEMENT_SPRITE_METADATA_KEY = '__ldtkPlacementSpriteId';

export const SPRITE_EDITOR_IDENTIFIERS = Object.freeze({
  PLAYER_DEFAULT: 'player_default',
  BEE_ENEMY: 'bee_enemy',
  FIREBALL_ENEMY: 'fireball_enemy',
  INKY_ENEMY: 'inky_enemy',
  INKY_PROJECTILE: 'inky_projectile',
  LAVA_BUBBLE_ENEMY: 'lava_bubble_enemy',
  MOGUS_ENEMY: 'mogus_enemy',
  CHEST_GOODIE: 'chest_goodie',
  COIN_GOODIE: 'coin_goodie',
  DOOR_GOODIE: 'door_goodie',
  GRENADE_PROJECTILE: 'grenade_projectile',
  ITEM_GOODIE: 'item_goodie',
  NPC_GOODIE: 'npc_goodie',
  VOLCANO_GOODIE: 'volcano_goodie',
  WEAPON_GOODIE: 'weapon_goodie',
});

export function buildSpriteEditorTilesetRelPath(sheetPath) {
  if (typeof sheetPath !== 'string' || sheetPath.length === 0) {
    throw new Error('Sprite editor sheet path must be a non-empty string.');
  }

  return `${sheetPath}.png`;
}

export function buildWeaponAttackSpriteEditorIdentifier(weaponName, chainIndex) {
  if (typeof weaponName !== 'string' || weaponName.length === 0) {
    throw new Error('Weapon attack sprite editor identifier requires a non-empty weapon name.');
  }
  if (!Number.isInteger(chainIndex) || chainIndex < 0) {
    throw new Error('Weapon attack sprite editor identifier requires a non-negative integer chain index.');
  }

  const normalizedWeaponName = weaponName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (normalizedWeaponName.length === 0) {
    throw new Error(`Weapon attack sprite editor identifier could not normalize weapon name "${weaponName}".`);
  }

  return `weapon_attack_${normalizedWeaponName}_${chainIndex}`;
}

export const SPRITE_EDITOR_DEFAULT_SPRITES = Object.freeze([
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.PLAYER_DEFAULT,
    sheetPath: PLAYER_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'stand', anim: { 0: 0 }, reset: 0 },
      { identifier: 'move', anim: { 0: 3, 4: 2, 8: 1 }, reset: 12 },
      { identifier: 'jump', anim: { 0: 1 }, reset: 0 },
      { identifier: 'fall', anim: { 0: 3, 12: 4 }, reset: -1 },
      { identifier: 'ouch', anim: { 0: 5 }, reset: -1 },
      { identifier: 'slide', anim: { 0: 1 }, reset: -1 },
      { identifier: 'knockback', anim: { 0: 3 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.BEE_ENEMY,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'move', anim: { 0: 48 }, reset: 200 },
      { identifier: 'knockback', anim: { 0: 48 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.FIREBALL_ENEMY,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 1, y1: 1, x2: 6, y2: 6 },
    states: [
      { identifier: 'move', anim: { 0: 16, 12: 17 }, reset: 24 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.INKY_ENEMY,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'move', anim: { 0: 64, 4: 65, 8: 66 }, reset: 12 },
      { identifier: 'knockback', anim: { 0: 64, 4: 65, 8: 66 }, reset: 12 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.INKY_PROJECTILE,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 3, y1: 3, x2: 5, y2: 5 },
    states: [
      { identifier: 'move', anim: { 0: 80 }, reset: -1 },
      { identifier: 'knockback', anim: { 0: 80 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.LAVA_BUBBLE_ENEMY,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 3, y1: 2, x2: 4, y2: 3 },
    states: [
      { identifier: 'move', anim: { 0: 32 }, reset: 30 },
      { identifier: 'ouch', anim: { 0: 32 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.MOGUS_ENEMY,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'move', anim: { 0: 0, 8: 1 }, reset: 16 },
      { identifier: 'knockback', anim: { 0: 0 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.CHEST_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'closed', anim: { 0: 4 }, reset: -1 },
      { identifier: 'open', anim: { 0: 5 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.COIN_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 2, x2: 5, y2: 7 },
    states: [
      { identifier: 'stand', anim: { 0: 0, 6: 1, 12: 2, 18: 3 }, reset: 24 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.DOOR_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 1, y1: 1, x2: 6, y2: 7 },
    states: [
      { identifier: 'closed', anim: { 0: 8 }, reset: -1 },
      { identifier: 'open', anim: { 0: 7 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.GRENADE_PROJECTILE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 3, y1: 3, x2: 4, y2: 5 },
    states: [
      { identifier: 'stand', anim: { 0: 10 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.ITEM_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 2, x2: 6, y2: 6 },
    states: [
      { identifier: 'stand', anim: { 0: 6 }, reset: 80 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.NPC_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: -6, y1: 1, x2: 13, y2: 7 },
    states: [
      { identifier: 'stand', anim: { 0: 32 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.VOLCANO_GOODIE,
    sheetPath: ENEMY_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 1, y1: 4, x2: 6, y2: 7 },
    states: [
      { identifier: 'stand', anim: { 0: 33 }, reset: -1 },
    ],
  },
  {
    identifier: SPRITE_EDITOR_IDENTIFIERS.WEAPON_GOODIE,
    sheetPath: GOODIE_SPRITE_SHEET_PATH,
    bodyBbox: { x1: 2, y1: 2, x2: 6, y2: 6 },
    states: [
      { identifier: 'stand', anim: { 0: 6 }, reset: 80 },
    ],
  },
]);

export const SPRITE_EDITOR_DEFAULT_WEAPON_ATTACK_SPRITES = Object.freeze([
  {
    identifier: buildWeaponAttackSpriteEditorIdentifier('Dagger', 0),
    weaponName: 'Dagger',
    chainIndex: 0,
    sheetPath: WEAPON_SPRITE_SHEET_PATH,
    animDuration: 15,
    frames: {
      0: {
        sprite: 0,
        attackBbox: { x1: 0, y1: 5, x2: 2, y2: 5 },
      },
      3: {
        sprite: 1,
        attackBbox: { x1: 0, y1: 5, x2: 5, y2: 5 },
      },
      12: {
        sprite: 0,
        attackBbox: { x1: 0, y1: 5, x2: 2, y2: 5 },
      },
    },
  },
  {
    identifier: buildWeaponAttackSpriteEditorIdentifier('Sword', 0),
    weaponName: 'Sword',
    chainIndex: 0,
    sheetPath: WEAPON_SPRITE_SHEET_PATH,
    animDuration: 35,
    frames: {
      0: {
        sprite: [2, 2, 2],
        attackBbox: { x1: 0, y1: 0, x2: 7, y2: 8 },
      },
      3: {
        sprite: [4, 2, 2],
        attackBbox: { x1: 0, y1: 2, x2: 10, y2: 14 },
      },
      6: {
        sprite: [6, 2, 2],
        attackBbox: { x1: 0, y1: 9, x2: 9, y2: 15 },
      },
      9: {
        sprite: null,
        attackBbox: null,
      },
    },
  },
  {
    identifier: buildWeaponAttackSpriteEditorIdentifier('Sword', 1),
    weaponName: 'Sword',
    chainIndex: 1,
    sheetPath: WEAPON_SPRITE_SHEET_PATH,
    animDuration: 35,
    frames: {
      0: {
        sprite: [8, 2, 2],
        attackBbox: { x1: 0, y1: 9, x2: 9, y2: 15 },
      },
      2: {
        sprite: [10, 2, 2],
        attackBbox: { x1: 0, y1: 0, x2: 10, y2: 14 },
      },
      10: {
        sprite: null,
        attackBbox: null,
      },
    },
  },
  {
    identifier: buildWeaponAttackSpriteEditorIdentifier('Sword', 2),
    weaponName: 'Sword',
    chainIndex: 2,
    sheetPath: WEAPON_SPRITE_SHEET_PATH,
    animDuration: 35,
    frames: {
      0: {
        sprite: 12,
        attackBbox: { x1: 0, y1: 4, x2: 3, y2: 4 },
      },
      3: {
        sprite: [13, 2, 1],
        attackBbox: { x1: 0, y1: 4, x2: 10, y2: 4 },
      },
      10: {
        sprite: [29, 2, 1],
        attackBbox: { x1: 0, y1: 4, x2: 10, y2: 4 },
      },
      15: {
        sprite: null,
        attackBbox: null,
      },
    },
  },
]);
