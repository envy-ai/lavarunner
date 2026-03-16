const BASE_TILE_SIZE = 8;

function freezeFieldSpec(fieldSpec) {
  return Object.freeze({
    identifier: fieldSpec.identifier,
    type: fieldSpec.type,
    canBeNull: fieldSpec.canBeNull !== false,
    doc: fieldSpec.doc ?? null,
  });
}

function freezeEntitySpec(entitySpec) {
  return Object.freeze({
    identifier: entitySpec.identifier,
    legacySpriteId: entitySpec.legacySpriteId,
    color: entitySpec.color ?? '#FFFFFF',
    doc: entitySpec.doc ?? null,
    maxCount: Number.isInteger(entitySpec.maxCount) ? entitySpec.maxCount : 0,
    fieldSpecs: Object.freeze((entitySpec.fieldSpecs || []).map(freezeFieldSpec)),
  });
}

export const LDTK_ENTITY_SPECS = Object.freeze([
  {
    identifier: 'PlayerSpawn',
    legacySpriteId: 0,
    color: '#FFF1B8',
    doc: 'Legacy player spawn placement.',
    maxCount: 1,
  },
  {
    identifier: 'Coin',
    legacySpriteId: 16,
    color: '#FFE27A',
    doc: 'Collectible coin pickup.',
  },
  {
    identifier: 'DoorOpen',
    legacySpriteId: 17,
    color: '#7FD6FF',
    doc: 'Open door that can transition to another map.',
    fieldSpecs: [
      { identifier: 'map', type: 'String', canBeNull: false, doc: 'Destination map name.' },
      { identifier: 'x', type: 'Int', doc: 'Optional destination tile X.' },
      { identifier: 'y', type: 'Int', doc: 'Optional destination tile Y.' },
    ],
  },
  {
    identifier: 'DoorClosed',
    legacySpriteId: 18,
    color: '#4DA7D1',
    doc: 'Locked door that opens with a key before transitioning.',
    fieldSpecs: [
      { identifier: 'map', type: 'String', canBeNull: false, doc: 'Destination map name.' },
      { identifier: 'x', type: 'Int', doc: 'Optional destination tile X.' },
      { identifier: 'y', type: 'Int', doc: 'Optional destination tile Y.' },
    ],
  },
  {
    identifier: 'Chest',
    legacySpriteId: 19,
    color: '#E3A85B',
    doc: 'Chest pickup containing item counts.',
    fieldSpecs: [
      { identifier: 'contents', type: 'Multilines', canBeNull: false, doc: 'JSON object of item rewards.' },
      { identifier: 'sprite', type: 'Int', doc: 'Optional custom player reward sprite.' },
    ],
  },
  {
    identifier: 'WeaponPickup',
    legacySpriteId: 20,
    color: '#FFAD70',
    doc: 'Weapon pickup with a custom display sprite.',
    fieldSpecs: [
      { identifier: 'sprite', type: 'Int', canBeNull: false, doc: 'Display sprite for the pickup.' },
      { identifier: 'weapon', type: 'String', canBeNull: false, doc: 'Weapon identifier to grant.' },
    ],
  },
  {
    identifier: 'Npc',
    legacySpriteId: 32,
    color: '#B9F1A2',
    doc: 'NPC with dialog metadata.',
    fieldSpecs: [
      { identifier: 'sprite', type: 'Int', canBeNull: false, doc: 'NPC display sprite.' },
      { identifier: 'dialog', type: 'Multilines', canBeNull: false, doc: 'JSON array of dialog entries.' },
    ],
  },
  {
    identifier: 'Exit',
    legacySpriteId: 34,
    color: '#FF8F8F',
    doc: 'Trigger script that loads another map.',
    fieldSpecs: [
      { identifier: 'map', type: 'String', canBeNull: false, doc: 'Destination map name.' },
      { identifier: 'x', type: 'Int', doc: 'Optional destination tile X.' },
      { identifier: 'y', type: 'Int', doc: 'Optional destination tile Y.' },
    ],
  },
  {
    identifier: 'ItemPickup',
    legacySpriteId: 35,
    color: '#C0C8FF',
    doc: 'Item pickup with a custom display sprite.',
    fieldSpecs: [
      { identifier: 'sprite', type: 'Int', canBeNull: false, doc: 'Display sprite for the pickup.' },
      { identifier: 'item', type: 'String', canBeNull: false, doc: 'Item identifier to grant.' },
    ],
  },
  {
    identifier: 'LegacySprite48',
    legacySpriteId: 48,
    color: '#B4B4B4',
    doc: 'Legacy placement using sprite 48. Runtime currently ignores this entity type.',
  },
  {
    identifier: 'MogusEnemy',
    legacySpriteId: 112,
    color: '#FF7A7A',
    doc: 'Mogus enemy spawn.',
  },
  {
    identifier: 'FireballEnemy',
    legacySpriteId: 113,
    color: '#FF5C3B',
    doc: 'Fireball enemy spawn.',
  },
  {
    identifier: 'Volcano',
    legacySpriteId: 114,
    color: '#FF934D',
    doc: 'Volcano hazard spawn.',
  },
  {
    identifier: 'LegacySprite115',
    legacySpriteId: 115,
    color: '#9A9A9A',
    doc: 'Legacy placement using sprite 115. Runtime currently ignores this entity type.',
  },
  {
    identifier: 'BeeEnemy',
    legacySpriteId: 116,
    color: '#FFD35C',
    doc: 'Bee enemy spawn.',
  },
  {
    identifier: 'InkyEnemy',
    legacySpriteId: 117,
    color: '#8FD0FF',
    doc: 'Inky enemy spawn.',
  },
].map(freezeEntitySpec));

export const LDTK_ENTITY_SPEC_BY_IDENTIFIER = new Map(
  LDTK_ENTITY_SPECS.map((spec) => [spec.identifier, spec]),
);

export const LDTK_ENTITY_SPEC_BY_LEGACY_SPRITE_ID = new Map(
  LDTK_ENTITY_SPECS.map((spec) => [spec.legacySpriteId, spec]),
);

export function getLdtkEntitySpecByIdentifier(identifier) {
  return LDTK_ENTITY_SPEC_BY_IDENTIFIER.get(identifier) || null;
}

export function getLdtkEntitySpecByLegacySpriteId(spriteId) {
  return LDTK_ENTITY_SPEC_BY_LEGACY_SPRITE_ID.get(spriteId) || null;
}

export function getLegacySpriteIdForLdtkEntity(identifier) {
  const spec = getLdtkEntitySpecByIdentifier(identifier);
  return spec ? spec.legacySpriteId : null;
}

export function buildEntityTilesetRect(tilesetUid, legacySpriteId) {
  if (!Number.isInteger(tilesetUid) || tilesetUid <= 0) {
    throw new Error(`Invalid entities tileset UID "${tilesetUid}".`);
  }
  if (!Number.isInteger(legacySpriteId) || legacySpriteId < 0) {
    throw new Error(`Invalid legacy sprite id "${legacySpriteId}".`);
  }

  return {
    tilesetUid,
    x: (legacySpriteId % 16) * BASE_TILE_SIZE,
    y: Math.floor(legacySpriteId / 16) * BASE_TILE_SIZE,
    w: BASE_TILE_SIZE,
    h: BASE_TILE_SIZE,
  };
}
