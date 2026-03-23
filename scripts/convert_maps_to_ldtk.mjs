#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractLdtkCompatMeta } from './lib/ldtk_compat_meta.mjs';
import {
  buildEntityTilesetRect,
  getLdtkEntitySpecByLegacySpriteId,
  LDTK_ENTITY_SPECS,
} from './lib/ldtk_entity_specs.mjs';
import {
  SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER,
  SPRITE_EDITOR_DEFAULT_SPRITES,
  SPRITE_EDITOR_DEFAULT_WEAPON_ATTACK_SPRITES,
  SPRITE_EDITOR_WEAPON_ATTACK_STATE_IDENTIFIER,
} from '../src/entity/sprite_editor_definitions.js';

const TILEMAP_CHARSET = "#$%&'()*+,-~/0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}. !";
const TILEMAP_CHAR_LOOKUP = (() => {
  const table = Object.create(null);
  for (let i = 0; i < TILEMAP_CHARSET.length; i += 1) {
    table[TILEMAP_CHARSET[i]] = i;
  }
  return table;
})();
const TILEMAP_BASE = TILEMAP_CHARSET.length;
const TILEMAP_NULL = TILEMAP_BASE * TILEMAP_BASE - 1;
const TILEMAP_RLE_MARKER = 2 ** 13;
const TILE_SIZE = 8;
const VIEWPORT_TILES_X = 16;
const VIEWPORT_TILES_Y = 16;
const LDTK_JSON_VERSION = '1.5.3';
const LDTK_APP_BUILD_ID = 0;
const DEFAULT_LEVEL_BG_COLOR = '#000000';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_MAPS_PATH = path.join(repoRoot, 'assets', 'maps.json');
const MAPDATA_PATH = path.join(repoRoot, 'assets', 'data', 'mapdata.json');
const NPCS_PATH = path.join(repoRoot, 'assets', 'data', 'npcs.json');
const TARGET_LDTK_PATH = path.join(repoRoot, 'assets', 'maps.ldtk');
const TARGET_LDTK_META_PATH = path.join(repoRoot, 'assets', 'maps.ldtk.meta.json');
const TARGET_BACKUP_ROOT = path.join(repoRoot, 'assets', 'maps_ldtk_backups');
const SPRITE_EDITOR_TICK_MS = 1000 / 60;
const LEGACY_MULTI_TILE_SPRITE_ROW_WIDTH = 16;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function decodeMapData(serialized) {
  if (typeof serialized !== 'string') {
    throw new Error('Malformed map tile data: expected a string payload.');
  }

  const result = [];
  for (let i = 0; i < serialized.length; i += 2) {
    const charA = serialized[i];
    const charB = serialized[i + 1];
    if (charB === undefined) {
      throw new Error('Malformed map tile data: odd-length encoding.');
    }

    const valueA = TILEMAP_CHAR_LOOKUP[charA];
    const valueB = TILEMAP_CHAR_LOOKUP[charB];
    if (valueA === undefined || valueB === undefined) {
      throw new Error(`Malformed map tile data: unsupported character "${charA}${charB}".`);
    }

    const encoded = valueA * TILEMAP_BASE + valueB;
    if (encoded === TILEMAP_NULL) {
      result.push(null);
      continue;
    }

    if (encoded > TILEMAP_RLE_MARKER) {
      const repetitions = encoded - TILEMAP_RLE_MARKER;
      const lastValue = result[result.length - 1];
      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        result.push(lastValue);
      }
      continue;
    }

    result.push(encoded);
  }

  return result;
}

function decodePixelboxTile(encodedTile) {
  if (!Number.isInteger(encodedTile)) {
    throw new Error(`Invalid encoded tile value "${encodedTile}".`);
  }

  return {
    sprite: encodedTile & 255,
    flipH: ((encodedTile >> 8) & 1) === 1,
    flipV: ((encodedTile >> 9) & 1) === 1,
    flipR: ((encodedTile >> 10) & 1) === 1,
  };
}

function decodePixelboxMap(pixelboxMap) {
  if (!Number.isInteger(pixelboxMap.w) || !Number.isInteger(pixelboxMap.h)) {
    throw new Error(`Map "${pixelboxMap.name || '<unnamed>'}" has invalid dimensions.`);
  }

  const decoded = decodeMapData(pixelboxMap.data);
  const expectedLength = pixelboxMap.w * pixelboxMap.h;
  if (decoded.length !== expectedLength) {
    throw new Error(
      `Map "${pixelboxMap.name || '<unnamed>'}" decode length mismatch. ` +
      `Expected ${expectedLength}, got ${decoded.length}.`,
    );
  }

  return decoded;
}

function parseMapName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Encountered map without a valid name.');
  }

  const slash = name.lastIndexOf('/');
  if (slash < 0) {
    return {
      region: null,
      layer: name,
      hasRegion: false,
    };
  }

  return {
    region: name.slice(0, slash),
    layer: name.slice(slash + 1),
    hasRegion: true,
  };
}

function parseCoord(coord, mapName) {
  const match = /^(-?\d+),(-?\d+)$/.exec(coord);
  if (!match) {
    throw new Error(`Metadata coord "${coord}" on "${mapName}" is invalid; expected "x,y".`);
  }

  return {
    tx: Number.parseInt(match[1], 10),
    ty: Number.parseInt(match[2], 10),
  };
}

function mergeEntityMetadata(mapName, mapData, npcData) {
  const metadataByCoord = new Map();

  const mapEntities = mapData[mapName]?.entities;
  if (mapEntities !== undefined) {
    if (!isPlainObject(mapEntities)) {
      throw new Error(`assets/data/mapdata.json has invalid entities block for "${mapName}".`);
    }

    for (const [coord, metadata] of Object.entries(mapEntities)) {
      parseCoord(coord, mapName);
      if (!isPlainObject(metadata)) {
        throw new Error(`mapdata entity metadata for "${mapName}" at "${coord}" must be an object.`);
      }
      metadataByCoord.set(coord, { ...metadata });
    }
  }

  const mapNpcs = npcData[mapName];
  if (mapNpcs !== undefined) {
    if (!isPlainObject(mapNpcs)) {
      throw new Error(`assets/data/npcs.json has invalid map entry for "${mapName}".`);
    }

    for (const [coord, metadata] of Object.entries(mapNpcs)) {
      parseCoord(coord, mapName);
      if (!isPlainObject(metadata)) {
        throw new Error(`npc metadata for "${mapName}" at "${coord}" must be an object.`);
      }

      const existing = metadataByCoord.get(coord) || {};
      metadataByCoord.set(coord, { ...existing, ...metadata });
    }
  }

  return metadataByCoord;
}

function computeParallaxFactor(layerTiles, mainTiles, viewTiles) {
  if (!Number.isFinite(layerTiles) || !Number.isFinite(mainTiles) || !Number.isFinite(viewTiles)) {
    throw new Error('computeParallaxFactor received non-numeric values.');
  }

  const denominator = mainTiles - viewTiles;
  if (denominator <= 0) {
    return 1;
  }

  return (layerTiles - viewTiles) / denominator;
}

function buildTilesetImagePath(sheetPath) {
  if (!sheetPath) {
    throw new Error('Cannot build tileset image path for an empty sheet path.');
  }

  if (sheetPath.startsWith('tiles/')) {
    return `maps_tiled/${sheetPath}.png`;
  }

  return `${sheetPath}.png`;
}

function sanitizeIdentifier(value, fallback = 'Layer') {
  const sanitized = value
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');

  if (sanitized.length === 0) {
    return fallback;
  }

  if (!/^[A-Za-z_]/.test(sanitized)) {
    return `${fallback}_${sanitized}`;
  }

  return sanitized;
}

function timestampForFilename() {
  const date = new Date();
  const pad = (value) => value.toString().padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '_',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

async function backupExistingProject() {
  try {
    const stats = await fs.stat(TARGET_LDTK_PATH);
    if (!stats.isFile()) {
      throw new Error(`${TARGET_LDTK_PATH} exists but is not a file.`);
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  await fs.mkdir(TARGET_BACKUP_ROOT, { recursive: true });
  const backupPath = path.join(TARGET_BACKUP_ROOT, `maps_${timestampForFilename()}.ldtk`);
  await fs.copyFile(TARGET_LDTK_PATH, backupPath);
  return backupPath;
}

async function readExistingProjectData() {
  let raw;
  try {
    raw = await fs.readFile(TARGET_LDTK_PATH, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        layoutByIdentifier: new Map(),
        project: null,
      };
    }
    throw new Error(`Failed to read existing LDtk project (${TARGET_LDTK_PATH}): ${error.message}`);
  }

  let project;
  try {
    project = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse existing LDtk project (${TARGET_LDTK_PATH}): ${error.message}`);
  }

  if (!isPlainObject(project)) {
    throw new Error(`Existing LDtk project (${TARGET_LDTK_PATH}) must be a JSON object.`);
  }
  if (!Array.isArray(project.levels)) {
    throw new Error(`Existing LDtk project (${TARGET_LDTK_PATH}) is missing its levels array.`);
  }

  const layoutByIdentifier = new Map();
  for (const level of project.levels) {
    if (!isPlainObject(level)) {
      throw new Error(`Existing LDtk project (${TARGET_LDTK_PATH}) contains an invalid level entry.`);
    }

    const identifier = typeof level.identifier === 'string' && level.identifier.length > 0
      ? level.identifier
      : null;
    if (!identifier) {
      throw new Error(`Existing LDtk project (${TARGET_LDTK_PATH}) has a level without a valid identifier.`);
    }
    if (layoutByIdentifier.has(identifier)) {
      throw new Error(`Existing LDtk project (${TARGET_LDTK_PATH}) has duplicate level identifier "${identifier}".`);
    }
    if (!Number.isInteger(level.worldX) || !Number.isInteger(level.worldY)) {
      throw new Error(`Existing LDtk level "${identifier}" is missing integer worldX/worldY coordinates.`);
    }
    if (!Number.isInteger(level.worldDepth)) {
      throw new Error(`Existing LDtk level "${identifier}" is missing integer worldDepth.`);
    }

    layoutByIdentifier.set(identifier, {
      worldDepth: level.worldDepth,
      worldX: level.worldX,
      worldY: level.worldY,
    });
  }

  return {
    layoutByIdentifier,
    project,
  };
}

async function readJson(filePath, description) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ${description} (${filePath}): ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${description} (${filePath}): ${error.message}`);
  }
}

async function validateMapTilesExist(mapBank) {
  const requiredSheets = new Set();
  for (const map of mapBank.maps) {
    const sheetPath = map.sheet || '';
    if (sheetPath.length > 0) {
      requiredSheets.add(sheetPath);
    }
  }

  for (const sheetPath of requiredSheets) {
    const imagePath = path.join(repoRoot, 'assets', buildTilesetImagePath(sheetPath));
    try {
      const stat = await fs.stat(imagePath);
      if (!stat.isFile()) {
        throw new Error('not a file');
      }
    } catch (error) {
      throw new Error(`Missing required tilesheet image "${imagePath}".`);
    }
  }
}

function buildMapGroups(mapBank) {
  const grouped = new Map();
  const standalone = new Map();

  for (const map of mapBank.maps) {
    const parsed = parseMapName(map.name);
    if (!parsed.hasRegion) {
      if (standalone.has(map.name)) {
        throw new Error(`Duplicate standalone map "${map.name}".`);
      }
      standalone.set(map.name, map);
      continue;
    }

    if (!grouped.has(parsed.region)) {
      grouped.set(parsed.region, {
        region: parsed.region,
        mapsByLayer: new Map(),
      });
    }

    const group = grouped.get(parsed.region);
    if (group.mapsByLayer.has(parsed.layer)) {
      throw new Error(`Duplicate map layer "${map.name}" in assets/maps.json.`);
    }
    group.mapsByLayer.set(parsed.layer, map);
  }

  for (const group of grouped.values()) {
    if (!group.mapsByLayer.has('main')) {
      const layers = Array.from(group.mapsByLayer.keys()).sort().join(', ');
      throw new Error(`Region "${group.region}" is missing a main layer. Found: ${layers}`);
    }

    for (const layerName of group.mapsByLayer.keys()) {
      if (layerName === 'main' || layerName === 'fg' || layerName === 'entities') {
        continue;
      }
      if (/^bg\.\d+$/.test(layerName)) {
        continue;
      }
      throw new Error(`Unsupported map layer "${group.region}/${layerName}" in assets/maps.json.`);
    }
  }

  return {
    grouped,
    standalone,
  };
}

function makeIidFactory() {
  let next = 1;
  return () => {
    const tail = next.toString(16).padStart(12, '0');
    next += 1;
    return `00000000-0000-4000-8000-${tail}`;
  };
}

function makeUidFactory(start = 1) {
  let next = start;
  const allocate = () => next++;
  allocate.peek = () => next;
  return allocate;
}

function fieldTypeDetails(type) {
  switch (type) {
    case 'Int':
      return {
        displayType: 'Int',
        internalType: 'F_Int',
      };
    case 'Float':
      return {
        displayType: 'Float',
        internalType: 'F_Float',
      };
    case 'Bool':
      return {
        displayType: 'Bool',
        internalType: 'F_Bool',
      };
    case 'String':
      return {
        displayType: 'String',
        internalType: 'F_String',
      };
    case 'Multilines':
      return {
        displayType: 'Multilines',
        internalType: 'F_Text',
      };
    default:
      throw new Error(`Unsupported LDtk field type "${type}".`);
  };
}

function numericColorToHex(value, context) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new Error(`${context} must be an integer between 0 and 16777215.`);
  }

  return `#${value.toString(16).padStart(6, '0')}`;
}

function resolveLevelBgColor(mapData, mapName) {
  const { bgcolor } = readMapMetadata(mapData, mapName);
  return bgcolor === null
    ? DEFAULT_LEVEL_BG_COLOR
    : numericColorToHex(bgcolor, `Map metadata bgcolor for "${mapName}"`);
}

async function readPngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < header.length) {
      throw new Error('file is too small to be a valid PNG.');
    }

    const signature = header.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
      throw new Error('file does not start with a PNG signature.');
    }

    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    await handle.close();
  }
}

function collectLayerIdentifiers(grouped, standalone) {
  const identifiers = new Set(['main', 'fg', 'entities']);

  for (const group of grouped.values()) {
    for (const layerName of group.mapsByLayer.keys()) {
      if (/^bg\.\d+$/.test(layerName)) {
        identifiers.add(layerName.replace('.', '_'));
      }
    }
  }

  return Array.from(identifiers);
}

function createFieldDef(uid, identifier, type, options = {}) {
  const details = fieldTypeDetails(type);
  return {
    __type: details.displayType,
    uid,
    identifier,
    type: details.internalType,
    canBeNull: options.canBeNull ?? true,
    isArray: false,
    allowOutOfLevelRef: false,
    allowedRefTags: [],
    allowedRefs: 'OnlySame',
    allowedRefsEntityUid: null,
    autoChainRef: false,
    acceptFileTypes: null,
    arrayMaxLength: null,
    arrayMinLength: null,
    defaultOverride: null,
    doc: options.doc ?? null,
    editorAlwaysShow: options.editorAlwaysShow ?? false,
    editorCutLongValues: true,
    editorDisplayColor: null,
    editorDisplayMode: options.editorDisplayMode ?? 'Hidden',
    editorDisplayPos: 'Above',
    editorDisplayScale: 1,
    editorLinkStyle: 'StraightArrow',
    editorShowInWorld: false,
    editorTextPrefix: '',
    editorTextSuffix: '',
    exportToToc: false,
    max: null,
    min: null,
    regex: null,
    searchable: false,
    symmetricalRef: false,
    textLanguageMode: null,
    tilesetUid: null,
    useForSmartColor: false,
  };
}

function createFieldInstance(def, value) {
  const realEditorValues = createRealEditorValues(def, value);
  return {
    __identifier: def.identifier,
    __tile: null,
    __type: def.__type,
    __value: value,
    defUid: def.uid,
    realEditorValues,
  };
}

function createRealEditorValues(def, value) {
  if (value === null || value === undefined) {
    return [];
  }

  switch (def.__type) {
    case 'Int':
      if (!Number.isInteger(value)) {
        throw new Error(`Field "${def.identifier}" expected an integer editor value, got ${typeof value}.`);
      }
      return [
        {
          id: 'V_Int',
          params: [value],
        },
      ];
    case 'String':
    case 'Multilines':
      if (typeof value !== 'string') {
        throw new Error(`Field "${def.identifier}" expected a string editor value, got ${typeof value}.`);
      }
      return [
        {
          id: 'V_String',
          params: [value],
        },
      ];
    default:
      throw new Error(
        `Field "${def.identifier}" uses unsupported LDtk editor value type "${def.__type}". ` +
        'Add a serializer before emitting this field type.',
      );
  }
}

function createTilesetDef(uid, sheetPath, imageInfo) {
  if (!imageInfo) {
    throw new Error(`Missing image info for tileset "${sheetPath}".`);
  }

  return {
    __cHei: imageInfo.cHei,
    __cWid: imageInfo.cWid,
    cachedPixelData: null,
    customData: [],
    embedAtlas: null,
    enumTags: [],
    identifier: sanitizeIdentifier(sheetPath, 'Tileset'),
    padding: 0,
    pxHei: imageInfo.pxHei,
    pxWid: imageInfo.pxWid,
    relPath: buildTilesetImagePath(sheetPath),
    savedSelections: [],
    spacing: 0,
    tags: [],
    tileGridSize: TILE_SIZE,
    uid,
  };
}

function ticksToSpriteEditorDurationMs(ticks) {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error(`Sprite editor duration ticks must be a non-negative integer, got "${ticks}".`);
  }

  return Math.max(1, Math.round(ticks * SPRITE_EDITOR_TICK_MS));
}

function createSpriteEditorBoxFromBbox(bbox, boxTypeUid, spriteIdentifier, uidFactory, bboxLabel = 'bodyBbox') {
  if (!isPlainObject(bbox)) {
    throw new Error(`Sprite editor seed "${spriteIdentifier}" is missing a valid ${bboxLabel} object.`);
  }

  for (const key of ['x1', 'y1', 'x2', 'y2']) {
    if (!Number.isInteger(bbox[key])) {
      throw new Error(`Sprite editor seed "${spriteIdentifier}" ${bboxLabel}.${key} must be an integer.`);
    }
  }
  if (bbox.x2 < bbox.x1 || bbox.y2 < bbox.y1) {
    throw new Error(`Sprite editor seed "${spriteIdentifier}" has an invalid inclusive ${bboxLabel}.`);
  }

  return {
    boxTypeUid,
    h: bbox.y2 - bbox.y1 + 1,
    uid: uidFactory(),
    w: bbox.x2 - bbox.x1 + 1,
    x: bbox.x1,
    y: bbox.y1,
  };
}

function createSpriteEditorBoxType(uidFactory, identifier, color) {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new Error('Sprite editor box type requires a non-empty identifier.');
  }
  if (typeof color !== 'string' || color.length === 0) {
    throw new Error(`Sprite editor box type "${identifier}" requires a non-empty color.`);
  }

  return {
    builtin: false,
    color,
    identifier,
    uid: uidFactory(),
  };
}

function createBodySpriteEditorBoxType(uidFactory) {
  return createSpriteEditorBoxType(uidFactory, 'body', '#ff5a5a');
}

function createAttackSpriteEditorBoxType(uidFactory) {
  return createSpriteEditorBoxType(uidFactory, SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER, '#ffd166');
}

function createDefaultSpriteEditorSprite(spriteDefinition, tilesetUid, uidFactory) {
  if (!isPlainObject(spriteDefinition)) {
    throw new Error('Sprite editor seed definition must be an object.');
  }
  if (typeof spriteDefinition.identifier !== 'string' || spriteDefinition.identifier.length === 0) {
    throw new Error('Sprite editor seed definition is missing a valid identifier.');
  }
  if (!Array.isArray(spriteDefinition.states) || spriteDefinition.states.length === 0) {
    throw new Error(`Sprite editor seed "${spriteDefinition.identifier}" is missing its states array.`);
  }

  const bodyBoxType = createBodySpriteEditorBoxType(uidFactory);
  const states = spriteDefinition.states.map((state) => {
    const thresholds = Object.keys(state.anim)
      .map((value) => Number.parseInt(value, 10))
      .sort((a, b) => a - b);

    const frames = thresholds.map((threshold, index) => {
      const nextThreshold = thresholds[index + 1] ?? null;
      const durationTicks = nextThreshold !== null
        ? nextThreshold - threshold
        : (state.reset > threshold ? state.reset - threshold : 1);
      const tileId = state.anim[threshold];

      if (!Number.isInteger(tileId) || tileId < 0) {
        throw new Error(
          `Default sprite editor state "${state.identifier}" uses an invalid tile id "${tileId}".`,
        );
      }

      return {
        boxes: [createSpriteEditorBoxFromBbox(spriteDefinition.bodyBbox, bodyBoxType.uid, spriteDefinition.identifier, uidFactory)],
        durationMs: ticksToSpriteEditorDurationMs(durationTicks),
        tiles: [
          {
            flipX: false,
            flipY: false,
            tileId,
            tilesetUid,
            uid: uidFactory(),
            x: 0,
            y: 0,
          },
        ],
        uid: uidFactory(),
      };
    });

    return {
      frames,
      identifier: state.identifier,
      loop: state.reset > 0,
      loopToMs: 0,
      originX: 0,
      originY: 0,
      uid: uidFactory(),
    };
  });

  return {
    boxTypes: [bodyBoxType],
    canvasHei: TILE_SIZE,
    canvasWid: TILE_SIZE,
    identifier: spriteDefinition.identifier,
    states,
    uid: uidFactory(),
  };
}

function createSpriteEditorTilesFromLegacySpriteSpec(spriteSpec, tilesetUid, spriteIdentifier, uidFactory) {
  if (spriteSpec === null) {
    return [];
  }
  if (Number.isInteger(spriteSpec)) {
    return [
      {
        flipX: false,
        flipY: false,
        tileId: spriteSpec,
        tilesetUid,
        uid: uidFactory(),
        x: 0,
        y: 0,
      },
    ];
  }
  if (!Array.isArray(spriteSpec) || spriteSpec.length !== 3) {
    throw new Error(
      `Weapon attack sprite editor seed "${spriteIdentifier}" must use a null, integer, or [tileId, width, height] sprite spec.`,
    );
  }

  const [tileId, width, height] = spriteSpec;
  if (!Number.isInteger(tileId) || tileId < 0 || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Weapon attack sprite editor seed "${spriteIdentifier}" has an invalid multi-tile sprite spec.`);
  }

  const tiles = [];
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      tiles.push({
        flipX: false,
        flipY: false,
        tileId: tileId + x + y * LEGACY_MULTI_TILE_SPRITE_ROW_WIDTH,
        tilesetUid,
        uid: uidFactory(),
        x: x * TILE_SIZE,
        y: y * TILE_SIZE,
      });
    }
  }
  return tiles;
}

function getSpriteEditorCanvasSizeFromFrames(frames, spriteIdentifier) {
  let canvasWid = TILE_SIZE;
  let canvasHei = TILE_SIZE;

  for (const frame of frames) {
    if (!isPlainObject(frame) || !Array.isArray(frame.tiles)) {
      throw new Error(`Sprite editor seed "${spriteIdentifier}" has an invalid frame while computing canvas size.`);
    }

    for (const tile of frame.tiles) {
      if (!isPlainObject(tile) || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
        throw new Error(`Sprite editor seed "${spriteIdentifier}" has an invalid tile while computing canvas size.`);
      }
      canvasWid = Math.max(canvasWid, tile.x + TILE_SIZE);
      canvasHei = Math.max(canvasHei, tile.y + TILE_SIZE);
    }
  }

  return { canvasWid, canvasHei };
}

function createDefaultWeaponAttackSpriteEditorSprite(spriteDefinition, tilesetUid, uidFactory) {
  if (!isPlainObject(spriteDefinition)) {
    throw new Error('Weapon attack sprite editor seed definition must be an object.');
  }
  if (typeof spriteDefinition.identifier !== 'string' || spriteDefinition.identifier.length === 0) {
    throw new Error('Weapon attack sprite editor seed definition is missing a valid identifier.');
  }
  if (!Number.isInteger(spriteDefinition.animDuration) || spriteDefinition.animDuration <= 0) {
    throw new Error(`Weapon attack sprite editor seed "${spriteDefinition.identifier}" requires a positive animDuration.`);
  }
  if (!isPlainObject(spriteDefinition.frames)) {
    throw new Error(`Weapon attack sprite editor seed "${spriteDefinition.identifier}" is missing its frames map.`);
  }

  const attackBoxType = createAttackSpriteEditorBoxType(uidFactory);
  const thresholds = Object.keys(spriteDefinition.frames)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b);
  if (thresholds.length === 0 || thresholds[0] !== 0) {
    throw new Error(`Weapon attack sprite editor seed "${spriteDefinition.identifier}" requires a 0-frame threshold.`);
  }

  const frames = thresholds.map((threshold, index) => {
    const frameDefinition = spriteDefinition.frames[threshold];
    if (!isPlainObject(frameDefinition)) {
      throw new Error(
        `Weapon attack sprite editor seed "${spriteDefinition.identifier}" threshold "${threshold}" must be an object.`,
      );
    }

    const nextThreshold = thresholds[index + 1] ?? spriteDefinition.animDuration;
    const durationTicks = nextThreshold - threshold;
    if (!Number.isInteger(durationTicks) || durationTicks <= 0) {
      throw new Error(
        `Weapon attack sprite editor seed "${spriteDefinition.identifier}" threshold "${threshold}" has invalid duration.`,
      );
    }
    if (!('attackBbox' in frameDefinition)) {
      throw new Error(
        `Weapon attack sprite editor seed "${spriteDefinition.identifier}" threshold "${threshold}" is missing attackBbox.`,
      );
    }

    return {
      boxes: frameDefinition.attackBbox === null
        ? []
        : [createSpriteEditorBoxFromBbox(
          frameDefinition.attackBbox,
          attackBoxType.uid,
          spriteDefinition.identifier,
          uidFactory,
          'attackBbox',
        )],
      durationMs: ticksToSpriteEditorDurationMs(durationTicks),
      tiles: createSpriteEditorTilesFromLegacySpriteSpec(
        frameDefinition.sprite ?? null,
        tilesetUid,
        spriteDefinition.identifier,
        uidFactory,
      ),
      uid: uidFactory(),
    };
  });

  const { canvasWid, canvasHei } = getSpriteEditorCanvasSizeFromFrames(frames, spriteDefinition.identifier);
  return {
    boxTypes: [attackBoxType],
    canvasHei,
    canvasWid,
    identifier: spriteDefinition.identifier,
    states: [
      {
        frames,
        identifier: SPRITE_EDITOR_WEAPON_ATTACK_STATE_IDENTIFIER,
        loop: false,
        loopToMs: 0,
        originX: 0,
        originY: 0,
        uid: uidFactory(),
      },
    ],
    uid: uidFactory(),
  };
}

function backfillSpriteEditorBodyBoxes(sprite, spriteDefinition, uidFactory) {
  if (!isPlainObject(sprite)) {
    throw new Error('Sprite editor sprite backfill target must be an object.');
  }
  if (!isPlainObject(spriteDefinition)) {
    throw new Error('Sprite editor sprite backfill definition must be an object.');
  }
  if (!Array.isArray(sprite.boxTypes) || !Array.isArray(sprite.states)) {
    throw new Error(`Sprite editor sprite "${sprite.identifier || '<unnamed>'}" is missing boxTypes/states arrays.`);
  }

  let bodyBoxType = sprite.boxTypes.find((boxType) => boxType?.identifier === 'body') || null;
  if (bodyBoxType !== null && !Number.isInteger(bodyBoxType.uid)) {
    throw new Error(`Sprite editor sprite "${sprite.identifier || '<unnamed>'}" has an invalid body box type uid.`);
  }
  if (bodyBoxType === null) {
    bodyBoxType = createBodySpriteEditorBoxType(uidFactory);
    sprite.boxTypes.push(bodyBoxType);
  }

  for (const state of sprite.states) {
    if (!isPlainObject(state) || !Array.isArray(state.frames)) {
      throw new Error(`Sprite editor sprite "${sprite.identifier || '<unnamed>'}" has an invalid state.`);
    }

    for (const frame of state.frames) {
      if (!isPlainObject(frame) || !Array.isArray(frame.boxes)) {
        throw new Error(`Sprite editor sprite "${sprite.identifier || '<unnamed>'}" has an invalid frame.`);
      }

      const hasBodyBox = frame.boxes.some((box) => isPlainObject(box) && box.boxTypeUid === bodyBoxType.uid);
      if (hasBodyBox) {
        continue;
      }

      frame.boxes.push(
        createSpriteEditorBoxFromBbox(
          spriteDefinition.bodyBbox,
          bodyBoxType.uid,
          spriteDefinition.identifier,
          uidFactory,
        ),
      );
    }
  }
}

function clonePlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function remapSpriteEditorProject(spriteEditorProject, existingTilesetUidMap, uidFactory) {
  if (!isPlainObject(spriteEditorProject)) {
    throw new Error('Existing spriteEditor payload must be an object.');
  }
  if (!Array.isArray(spriteEditorProject.sprites)) {
    throw new Error('Existing spriteEditor payload must contain a sprites array.');
  }

  return {
    sprites: spriteEditorProject.sprites.map((sprite, spriteIndex) => {
      if (!isPlainObject(sprite)) {
        throw new Error(`spriteEditor sprite ${spriteIndex} must be an object.`);
      }
      if (!Array.isArray(sprite.boxTypes) || !Array.isArray(sprite.states)) {
        throw new Error(`spriteEditor sprite "${sprite.identifier || spriteIndex}" is missing boxTypes/states arrays.`);
      }

      const boxTypeUidMap = new Map();
      const remappedBoxTypes = sprite.boxTypes.map((boxType, boxTypeIndex) => {
        if (!isPlainObject(boxType) || !Number.isInteger(boxType.uid)) {
          throw new Error(
            `spriteEditor sprite "${sprite.identifier || spriteIndex}" has an invalid box type at index ${boxTypeIndex}.`,
          );
        }

        const nextUid = uidFactory();
        boxTypeUidMap.set(boxType.uid, nextUid);
        return {
          ...clonePlainJson(boxType),
          uid: nextUid,
        };
      });

      const remappedStates = sprite.states.map((state, stateIndex) => {
        if (!isPlainObject(state) || !Array.isArray(state.frames)) {
          throw new Error(
            `spriteEditor sprite "${sprite.identifier || spriteIndex}" has an invalid state at index ${stateIndex}.`,
          );
        }

        const remappedFrames = state.frames.map((frame, frameIndex) => {
          if (!isPlainObject(frame) || !Array.isArray(frame.boxes) || !Array.isArray(frame.tiles)) {
            throw new Error(
              `spriteEditor state "${state.identifier || stateIndex}" has an invalid frame at index ${frameIndex}.`,
            );
          }

          const remappedBoxes = frame.boxes.map((box, boxIndex) => {
            if (!isPlainObject(box) || !Number.isInteger(box.boxTypeUid)) {
              throw new Error(
                `spriteEditor frame ${frameIndex} has an invalid box at index ${boxIndex}.`,
              );
            }

            const remappedBoxTypeUid = boxTypeUidMap.get(box.boxTypeUid);
            if (!remappedBoxTypeUid) {
              throw new Error(
                `spriteEditor box ${boxIndex} references missing box type UID ${box.boxTypeUid}.`,
              );
            }

            return {
              ...clonePlainJson(box),
              boxTypeUid: remappedBoxTypeUid,
              uid: uidFactory(),
            };
          });

          const remappedTiles = frame.tiles.map((tile, tileIndex) => {
            if (!isPlainObject(tile) || !Number.isInteger(tile.tilesetUid)) {
              throw new Error(
                `spriteEditor frame ${frameIndex} has an invalid tile at index ${tileIndex}.`,
              );
            }

            const remappedTilesetUid = existingTilesetUidMap.get(tile.tilesetUid);
            if (!remappedTilesetUid) {
              throw new Error(
                `spriteEditor tile ${tileIndex} references missing tileset UID ${tile.tilesetUid}.`,
              );
            }

            return {
              ...clonePlainJson(tile),
              tilesetUid: remappedTilesetUid,
              uid: uidFactory(),
            };
          });

          return {
            ...clonePlainJson(frame),
            boxes: remappedBoxes,
            tiles: remappedTiles,
            uid: uidFactory(),
          };
        });

        return {
          ...clonePlainJson(state),
          frames: remappedFrames,
          uid: uidFactory(),
        };
      });

      return {
        ...clonePlainJson(sprite),
        boxTypes: remappedBoxTypes,
        states: remappedStates,
        uid: uidFactory(),
      };
    }),
  };
}

function ensureExtraTileset(project, tilesetInfoBySheet, relPathToTileset, uidFactory, sheetPath) {
  const relPath = buildTilesetImagePath(sheetPath);
  const existing = relPathToTileset.get(relPath);
  if (existing) {
    return existing;
  }

  const imageInfo = tilesetInfoBySheet.get(sheetPath);
  if (!imageInfo) {
    throw new Error(`Missing image info for sprite editor tileset "${sheetPath}".`);
  }

  const tileset = createTilesetDef(uidFactory(), sheetPath, imageInfo);
  project.defs.tilesets.push(tileset);
  relPathToTileset.set(relPath, tileset);
  return tileset;
}

function applySpriteEditorAugmentations(project, existingProject, tilesetInfoBySheet, uidFactory) {
  if (!isPlainObject(project) || !isPlainObject(project.defs) || !Array.isArray(project.defs.tilesets)) {
    throw new Error('Generated LDtk project is missing defs.tilesets.');
  }

  const relPathToTileset = new Map();
  for (const tileset of project.defs.tilesets) {
    if (!isPlainObject(tileset) || typeof tileset.relPath !== 'string' || !Number.isInteger(tileset.uid)) {
      throw new Error('Generated LDtk project contains an invalid tileset definition.');
    }
    if (relPathToTileset.has(tileset.relPath)) {
      throw new Error(`Generated LDtk project has duplicate tileset relPath "${tileset.relPath}".`);
    }
    relPathToTileset.set(tileset.relPath, tileset);
  }

  const existingTilesetUidMap = new Map();
  let remappedSpriteEditor = { sprites: [] };

  if (existingProject !== null) {
    if (!isPlainObject(existingProject)) {
      throw new Error('Existing LDtk project payload must be an object.');
    }

    const existingTilesets = existingProject.defs?.tilesets;
    if (existingProject.spriteEditor !== undefined && existingProject.spriteEditor !== null && !Array.isArray(existingTilesets)) {
      throw new Error('Existing LDtk project has spriteEditor data but no defs.tilesets array.');
    }

    if (Array.isArray(existingTilesets)) {
      const seenExistingRelPaths = new Set();
      const seenExistingUids = new Set();
      for (const tileset of existingTilesets) {
        if (!isPlainObject(tileset) || !Number.isInteger(tileset.uid)) {
          throw new Error('Existing LDtk project contains an invalid tileset definition.');
        }
        if (seenExistingUids.has(tileset.uid)) {
          throw new Error(`Existing LDtk project has duplicate tileset UID ${tileset.uid}.`);
        }
        seenExistingUids.add(tileset.uid);
        if (typeof tileset.relPath !== 'string' || tileset.relPath.length === 0) {
          throw new Error(`Existing tileset UID ${tileset.uid} is missing a relPath.`);
        }
        if (seenExistingRelPaths.has(tileset.relPath)) {
          throw new Error(`Existing LDtk project has duplicate tileset relPath "${tileset.relPath}".`);
        }
        seenExistingRelPaths.add(tileset.relPath);

        const baseTileset = relPathToTileset.get(tileset.relPath);
        if (baseTileset) {
          existingTilesetUidMap.set(tileset.uid, baseTileset.uid);
          continue;
        }

        const preservedTileset = {
          ...clonePlainJson(tileset),
          uid: uidFactory(),
        };
        project.defs.tilesets.push(preservedTileset);
        relPathToTileset.set(preservedTileset.relPath, preservedTileset);
        existingTilesetUidMap.set(tileset.uid, preservedTileset.uid);
      }
    }

    if (existingProject.spriteEditor !== undefined && existingProject.spriteEditor !== null) {
      remappedSpriteEditor = remapSpriteEditorProject(existingProject.spriteEditor, existingTilesetUidMap, uidFactory);
    }
  }

  const seededIdentifiers = new Set(remappedSpriteEditor.sprites.map((sprite) => sprite.identifier));
  for (const spriteDefinition of SPRITE_EDITOR_DEFAULT_SPRITES) {
    if (seededIdentifiers.has(spriteDefinition.identifier)) {
      continue;
    }

    const spriteTileset = ensureExtraTileset(
      project,
      tilesetInfoBySheet,
      relPathToTileset,
      uidFactory,
      spriteDefinition.sheetPath,
    );
    remappedSpriteEditor.sprites.push(createDefaultSpriteEditorSprite(spriteDefinition, spriteTileset.uid, uidFactory));
    seededIdentifiers.add(spriteDefinition.identifier);
  }

  for (const spriteDefinition of SPRITE_EDITOR_DEFAULT_WEAPON_ATTACK_SPRITES) {
    if (seededIdentifiers.has(spriteDefinition.identifier)) {
      continue;
    }

    const spriteTileset = ensureExtraTileset(
      project,
      tilesetInfoBySheet,
      relPathToTileset,
      uidFactory,
      spriteDefinition.sheetPath,
    );
    remappedSpriteEditor.sprites.push(
      createDefaultWeaponAttackSpriteEditorSprite(spriteDefinition, spriteTileset.uid, uidFactory),
    );
    seededIdentifiers.add(spriteDefinition.identifier);
  }

  const spriteDefinitionsByIdentifier = new Map(
    SPRITE_EDITOR_DEFAULT_SPRITES.map((spriteDefinition) => [spriteDefinition.identifier, spriteDefinition]),
  );
  for (const sprite of remappedSpriteEditor.sprites) {
    const spriteDefinition = spriteDefinitionsByIdentifier.get(sprite.identifier);
    if (!spriteDefinition) {
      continue;
    }
    backfillSpriteEditorBodyBoxes(sprite, spriteDefinition, uidFactory);
  }

  project.spriteEditor = remappedSpriteEditor;
}

function createLayerDef(uid, identifier, type) {
  return {
    __type: type,
    autoSourceLayerDefUid: null,
    autoRuleGroups: [],
    canSelectWhenInactive: true,
    displayOpacity: 1,
    excludedTags: [],
    gridSize: TILE_SIZE,
    guideGridHei: TILE_SIZE,
    guideGridWid: TILE_SIZE,
    hideFieldsWhenInactive: false,
    hideInList: false,
    identifier,
    inactiveOpacity: 0.6,
    intGridValues: [],
    intGridValuesGroups: [],
    parallaxFactorX: 0,
    parallaxFactorY: 0,
    parallaxScaling: true,
    pxOffsetX: 0,
    pxOffsetY: 0,
    renderInWorldView: identifier === 'main',
    requiredTags: [],
    tilePivotX: 0,
    tilePivotY: 0,
    tilesetDefUid: null,
    type,
    uiFilterTags: [],
    uid,
    useAsyncRender: false,
  };
}

function createTypedEntityDef(uid, spec, fieldDefs, entitiesTilesetUid) {
  const tileRect = buildEntityTilesetRect(entitiesTilesetUid, spec.legacySpriteId);
  return {
    allowOutOfBounds: false,
    color: spec.color,
    doc: spec.doc,
    exportToToc: false,
    fieldDefs,
    fillOpacity: 0,
    height: TILE_SIZE,
    hollow: false,
    identifier: spec.identifier,
    keepAspectRatio: false,
    limitBehavior: 'DiscardOldOnes',
    limitScope: 'PerLayer',
    lineOpacity: 0,
    maxCount: spec.maxCount,
    maxHeight: null,
    maxWidth: null,
    minHeight: null,
    minWidth: null,
    nineSliceBorders: [],
    pivotX: 0,
    pivotY: 0,
    renderMode: 'Tile',
    resizableX: false,
    resizableY: false,
    showName: false,
    tags: [],
    tileOpacity: 1,
    tileRect,
    tileRenderMode: 'Stretch',
    tilesetId: entitiesTilesetUid,
    uiTileRect: null,
    uid,
    width: TILE_SIZE,
  };
}

function normalizeAtlasEntries(mapName, atlas) {
  if (atlas === undefined) {
    return [];
  }

  if (!Array.isArray(atlas)) {
    throw new Error(`Map metadata atlas for "${mapName}" must be an array.`);
  }

  return atlas.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Atlas entry ${index} for "${mapName}" must be an object.`);
    }

    const sprite = entry.sprite;
    const x = entry.x;
    const y = entry.y;
    if (typeof sprite !== 'string' || sprite.length === 0) {
      throw new Error(`Atlas entry ${index} for "${mapName}" is missing a valid sprite name.`);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Atlas entry ${index} for "${mapName}" must provide finite x/y coordinates.`);
    }

    return { sprite, x, y };
  });
}

function readMapMetadata(mapData, mapName) {
  const raw = mapData[mapName];
  if (raw === undefined) {
    return {
      atlas: [],
      bgcolor: null,
    };
  }
  if (!isPlainObject(raw)) {
    throw new Error(`Map metadata for "${mapName}" must be an object.`);
  }

  const atlas = normalizeAtlasEntries(mapName, raw.atlas);
  const rawBgColor = raw.bgcolor;
  const bgcolor = rawBgColor === undefined || rawBgColor === null
    ? null
    : (Number.isInteger(rawBgColor) ? rawBgColor : (() => {
      throw new Error(`Map metadata bgcolor for "${mapName}" must be an integer.`);
    })());

  return {
    atlas,
    bgcolor,
  };
}

function logicalLayerIdentifier(layerName) {
  if (layerName === 'main') {
    return 'main';
  }
  if (layerName === 'fg') {
    return 'fg';
  }
  if (layerName === 'entities') {
    return 'entities';
  }
  return layerName.replace('.', '_');
}

function buildGridTiles(sourceMap, targetWidth, targetHeight) {
  const decoded = decodePixelboxMap(sourceMap);
  if (sourceMap.w > targetWidth || sourceMap.h > targetHeight) {
    throw new Error(
      `Layer "${sourceMap.name}" (${sourceMap.w}x${sourceMap.h}) exceeds target level bounds ` +
      `(${targetWidth}x${targetHeight}).`,
    );
  }

  const tiles = [];
  for (let index = 0; index < decoded.length; index += 1) {
    const encodedTile = decoded[index];
    if (encodedTile === null) {
      continue;
    }

    const tile = decodePixelboxTile(encodedTile);
    if (tile.flipR) {
      throw new Error(
        `Layer "${sourceMap.name}" uses flipR on sprite ${tile.sprite}, which LDtk tile layers cannot represent.`,
      );
    }

    const x = index % sourceMap.w;
    const y = Math.floor(index / sourceMap.w);
    tiles.push({
      a: 1,
      d: [y * targetWidth + x],
      f: (tile.flipH ? 1 : 0) | (tile.flipV ? 2 : 0),
      px: [x * TILE_SIZE, y * TILE_SIZE],
      src: [(tile.sprite % 16) * TILE_SIZE, Math.floor(tile.sprite / 16) * TILE_SIZE],
      t: tile.sprite,
    });
  }

  return tiles;
}

function serializeEntityMetadataValue(fieldSpec, value, mapName, coord) {
  const context = `${mapName}${coord ? ` @ ${coord}` : ''}.${fieldSpec.identifier}`;

  if (value === null || value === undefined) {
    if (fieldSpec.canBeNull) {
      return null;
    }
    throw new Error(`Metadata value for ${context} is required.`);
  }

  switch (fieldSpec.type) {
    case 'Int':
      if (!Number.isInteger(value)) {
        throw new Error(`Metadata value for ${context} must be an integer.`);
      }
      return value;
    case 'Float':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Metadata value for ${context} must be a finite number.`);
      }
      return value;
    case 'Bool':
      if (typeof value !== 'boolean') {
        throw new Error(`Metadata value for ${context} must be a boolean.`);
      }
      return value;
    case 'String':
      if (typeof value !== 'string') {
        throw new Error(`Metadata value for ${context} must be a string.`);
      }
      if (!fieldSpec.canBeNull && value.length === 0) {
        throw new Error(`Metadata value for ${context} cannot be empty.`);
      }
      return value;
    case 'Multilines':
      if (typeof value === 'string') {
        if (!fieldSpec.canBeNull && value.length === 0) {
          throw new Error(`Metadata value for ${context} cannot be empty.`);
        }
        return value;
      }
      if (Array.isArray(value) || isPlainObject(value)) {
        return fieldSpec.identifier === 'dialog'
          ? JSON.stringify(value, null, 2)
          : JSON.stringify(value);
      }
      throw new Error(
        `Metadata value for ${context} must be a string, object, or array for LDtk Multilines fields.`,
      );
    default:
      throw new Error(`Unsupported LDtk field type "${fieldSpec.type}" for ${context}.`);
  }
}

function buildEntityInstances({
  entitiesMap,
  mainMap,
  mapData,
  npcData,
  entityDefsByLegacySpriteId,
  entitiesTilesetUid,
  iidFactory,
  worldX,
  worldY,
}) {
  const mapName = mainMap.name || '<unnamed>';
  const metadataByCoord = mergeEntityMetadata(mapName, mapData, npcData);

  if (!entitiesMap) {
    if (metadataByCoord.size > 0) {
      throw new Error(`Metadata exists for "${mapName}" but "${mainMap.name.replace('/main', '/entities')}" does not.`);
    }
    return [];
  }

  if (mainMap.w !== entitiesMap.w || mainMap.h !== entitiesMap.h) {
    throw new Error(
      `Map "${mapName}" and "${entitiesMap.name}" dimensions do not match ` +
      `(${mainMap.w}x${mainMap.h} vs ${entitiesMap.w}x${entitiesMap.h}).`,
    );
  }

  const decoded = decodePixelboxMap(entitiesMap);
  const usedCoords = new Set();
  const entityInstances = [];

  for (let index = 0; index < decoded.length; index += 1) {
    const encodedTile = decoded[index];
    if (encodedTile === null) {
      continue;
    }

    const tile = decodePixelboxTile(encodedTile);
    if (tile.flipH || tile.flipV || tile.flipR) {
      throw new Error(`Entity map "${entitiesMap.name}" uses unsupported tile flipping at index ${index}.`);
    }

    const tx = index % mainMap.w;
    const ty = Math.floor(index / mainMap.w);
    const coord = `${tx},${ty}`;
    const metadata = metadataByCoord.get(coord) || {};
    usedCoords.add(coord);

    const entitySpec = getLdtkEntitySpecByLegacySpriteId(tile.sprite);
    if (!entitySpec) {
      throw new Error(`Entity map "${entitiesMap.name}" uses unsupported sprite ${tile.sprite} at "${coord}".`);
    }

    const entityDefData = entityDefsByLegacySpriteId.get(tile.sprite) || null;
    if (!entityDefData) {
      throw new Error(`Missing typed LDtk entity definition for legacy sprite ${tile.sprite}.`);
    }

    for (const fieldSpec of entitySpec.fieldSpecs) {
      if (!fieldSpec.canBeNull && !Object.prototype.hasOwnProperty.call(metadata, fieldSpec.identifier)) {
        throw new Error(
          `Entity metadata "${fieldSpec.identifier}" on "${mapName}" at "${coord}" is required for ${entitySpec.identifier}.`,
        );
      }
    }

    const fields = [];
    const metadataKeys = Object.keys(metadata).sort();
    for (const key of metadataKeys) {
      if (!entityDefData.fieldDefsByIdentifier.has(key)) {
        throw new Error(
          `Entity metadata "${key}" on "${mapName}" at "${coord}" has no LDtk field definition for ${entitySpec.identifier}.`,
        );
      }
    }

    for (const fieldSpec of entitySpec.fieldSpecs) {
      if (!Object.prototype.hasOwnProperty.call(metadata, fieldSpec.identifier)) {
        continue;
      }

      const fieldDef = entityDefData.fieldDefsByIdentifier.get(fieldSpec.identifier);
      fields.push(createFieldInstance(
        fieldDef,
        serializeEntityMetadataValue(fieldSpec, metadata[fieldSpec.identifier], mapName, coord),
      ));
    }

    const px = [tx * TILE_SIZE, ty * TILE_SIZE];
    entityInstances.push({
      __grid: [tx, ty],
      __identifier: entitySpec.identifier,
      __pivot: [0, 0],
      __smartColor: entitySpec.color,
      __tags: [],
      __tile: buildEntityTilesetRect(entitiesTilesetUid, entitySpec.legacySpriteId),
      __worldX: worldX + px[0],
      __worldY: worldY + px[1],
      defUid: entityDefData.entityDef.uid,
      fieldInstances: fields,
      height: TILE_SIZE,
      iid: iidFactory(),
      px,
      width: TILE_SIZE,
    });
  }

  for (const coord of metadataByCoord.keys()) {
    if (!usedCoords.has(coord)) {
      throw new Error(
        `Metadata defined for "${mapName}" at "${coord}" but no entity exists there in "${entitiesMap.name}".`,
      );
    }
  }

  return entityInstances;
}

function buildCompatMapMetadataEntry(mapName, layerId, sourceMap, parallaxx, parallaxy, mapData) {
  const metadata = readMapMetadata(mapData, mapName);
  const entry = {
    layerId,
    name: mapName,
    sheet: sourceMap.sheet || '',
    sourceWidth: sourceMap.w,
    sourceHeight: sourceMap.h,
    parallaxx,
    parallaxy,
    atlas: metadata.atlas,
  };

  if (metadata.bgcolor !== null) {
    entry.bgcolor = metadata.bgcolor;
  }

  return entry;
}

function createTileLayerInstance({
  sourceMap,
  targetWidth,
  targetHeight,
  layerId,
  layerDefUid,
  levelUid,
  tilesetUid = null,
  tilesetRelPath = null,
  iidFactory,
}) {
  return {
    __cHei: targetHeight,
    __cWid: targetWidth,
    __gridSize: TILE_SIZE,
    __identifier: layerId,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: tilesetUid,
    __tilesetRelPath: tilesetRelPath,
    __type: 'Tiles',
    autoLayerTiles: [],
    entityInstances: [],
    gridTiles: buildGridTiles(sourceMap, targetWidth, targetHeight),
    iid: iidFactory(),
    intGridCsv: [],
    layerDefUid,
    levelId: levelUid,
    optionalRules: [],
    overrideTilesetUid: tilesetUid,
    pxOffsetX: 0,
    pxOffsetY: 0,
    seed: 0,
    visible: true,
  };
}

function createEntityLayerInstance({
  targetWidth,
  targetHeight,
  layerDefUid,
  levelUid,
  entityInstances,
  iidFactory,
}) {
  return {
    __cHei: targetHeight,
    __cWid: targetWidth,
    __gridSize: TILE_SIZE,
    __identifier: 'entities',
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __type: 'Entities',
    autoLayerTiles: [],
    entityInstances,
    gridTiles: [],
    iid: iidFactory(),
    intGridCsv: [],
    layerDefUid,
    levelId: levelUid,
    optionalRules: [],
    pxOffsetX: 0,
    pxOffsetY: 0,
    seed: 0,
    visible: true,
  };
}

function createLevel({
  bgColor,
  fieldInstances,
  identifier,
  iidFactory,
  layerInstances,
  pxHei,
  pxWid,
  uid,
  worldDepth,
  worldX,
  worldY,
}) {
  return {
    __bgColor: bgColor,
    __bgPos: null,
    __neighbours: [],
    __smartColor: bgColor,
    bgColor,
    bgPivotX: 0.5,
    bgPivotY: 0.5,
    bgPos: null,
    bgRelPath: null,
    externalRelPath: null,
    fieldInstances,
    identifier,
    iid: iidFactory(),
    layerInstances,
    pxHei,
    pxWid,
    uid,
    useAutoIdentifier: false,
    worldDepth,
    worldX,
    worldY,
  };
}

function buildGroupedLevel({
  group,
  mapData,
  npcData,
  levelIdentifier,
  levelUid,
  worldDepth,
  worldX,
  worldY,
  iidFactory,
  defs,
}) {
  const mainMap = group.mapsByLayer.get('main');
  const entitiesMap = group.mapsByLayer.get('entities') || null;
  const fgMap = group.mapsByLayer.get('fg') || null;

  const backgrounds = [];
  for (const [layerName, map] of group.mapsByLayer.entries()) {
    const match = /^bg\.(\d+)$/.exec(layerName);
    if (!match) {
      continue;
    }
    backgrounds.push({
      index: Number.parseInt(match[1], 10),
      layerId: logicalLayerIdentifier(layerName),
      map,
    });
  }
  backgrounds.sort((a, b) => a.index - b.index);

  const targetWidth = mainMap.w;
  const targetHeight = mainMap.h;
  const compatMaps = [];
  const layerInstances = [];
  const levelBgColor = resolveLevelBgColor(mapData, mainMap.name);

  for (const background of backgrounds) {
    const tileset = background.map.sheet ? defs.tilesetsBySheet.get(background.map.sheet) : null;
    if (background.map.sheet && !tileset) {
      throw new Error(`Background layer "${background.map.name}" is missing a tileset definition.`);
    }

    const parallaxx = computeParallaxFactor(background.map.w, mainMap.w, VIEWPORT_TILES_X);
    const parallaxy = computeParallaxFactor(background.map.h, mainMap.h, VIEWPORT_TILES_Y);
    compatMaps.push(buildCompatMapMetadataEntry(background.map.name, background.layerId, background.map, parallaxx, parallaxy, mapData));
    layerInstances.push(createTileLayerInstance({
      sourceMap: background.map,
      targetWidth,
      targetHeight,
      layerId: background.layerId,
      layerDefUid: defs.layerDefsByIdentifier.get(background.layerId).uid,
      levelUid,
      tilesetUid: tileset ? tileset.uid : null,
      tilesetRelPath: tileset ? tileset.relPath : null,
      iidFactory,
    }));
  }

  {
    const tileset = mainMap.sheet ? defs.tilesetsBySheet.get(mainMap.sheet) : null;
    if (mainMap.sheet && !tileset) {
      throw new Error(`Main layer "${mainMap.name}" is missing a tileset definition.`);
    }

    compatMaps.push(buildCompatMapMetadataEntry(mainMap.name, 'main', mainMap, 1, 1, mapData));
    layerInstances.push(createTileLayerInstance({
      sourceMap: mainMap,
      targetWidth,
      targetHeight,
      layerId: 'main',
      layerDefUid: defs.layerDefsByIdentifier.get('main').uid,
      levelUid,
      tilesetUid: tileset ? tileset.uid : null,
      tilesetRelPath: tileset ? tileset.relPath : null,
      iidFactory,
    }));
  }

  if (fgMap) {
    const tileset = fgMap.sheet ? defs.tilesetsBySheet.get(fgMap.sheet) : null;
    if (fgMap.sheet && !tileset) {
      throw new Error(`Foreground layer "${fgMap.name}" is missing a tileset definition.`);
    }

    compatMaps.push(buildCompatMapMetadataEntry(fgMap.name, 'fg', fgMap, 1, 1, mapData));
    layerInstances.push(createTileLayerInstance({
      sourceMap: fgMap,
      targetWidth,
      targetHeight,
      layerId: 'fg',
      layerDefUid: defs.layerDefsByIdentifier.get('fg').uid,
      levelUid,
      tilesetUid: tileset ? tileset.uid : null,
      tilesetRelPath: tileset ? tileset.relPath : null,
      iidFactory,
    }));
  }

  const entitiesTileset = defs.tilesetsBySheet.get('tiles/entities');
  const entityInstances = buildEntityInstances({
    entitiesMap,
    mainMap,
    mapData,
    npcData,
    entityDefsByLegacySpriteId: defs.entityDefsByLegacySpriteId,
    entitiesTilesetUid: entitiesTileset.uid,
    iidFactory,
    worldX,
    worldY,
  });
  layerInstances.push(createEntityLayerInstance({
    targetWidth,
    targetHeight,
    layerDefUid: defs.layerDefsByIdentifier.get('entities').uid,
    levelUid,
    entityInstances,
    iidFactory,
  }));

  return createLevel({
    bgColor: levelBgColor,
    fieldInstances: [
      createFieldInstance(defs.levelFieldDefs.compatMapsJson, JSON.stringify(compatMaps, null, 2)),
    ],
    identifier: levelIdentifier,
    iidFactory,
    layerInstances: layerInstances.reverse(),
    pxHei: targetHeight * TILE_SIZE,
    pxWid: targetWidth * TILE_SIZE,
    uid: levelUid,
    worldDepth,
    worldX,
    worldY,
  });
}

function buildStandaloneLevel({
  pixelboxMap,
  mapData,
  levelIdentifier,
  levelUid,
  worldDepth,
  worldX,
  worldY,
  iidFactory,
  defs,
}) {
  const targetWidth = pixelboxMap.w;
  const targetHeight = pixelboxMap.h;
  const layerId = 'main';
  const tileset = pixelboxMap.sheet ? defs.tilesetsBySheet.get(pixelboxMap.sheet) : null;
  if (pixelboxMap.sheet && !tileset) {
    throw new Error(`Standalone map "${pixelboxMap.name}" is missing a tileset definition.`);
  }

  const compatMaps = [
    buildCompatMapMetadataEntry(pixelboxMap.name, layerId, pixelboxMap, 1, 1, mapData),
  ];
  const levelBgColor = resolveLevelBgColor(mapData, pixelboxMap.name);

  return createLevel({
    bgColor: levelBgColor,
    fieldInstances: [
      createFieldInstance(defs.levelFieldDefs.compatMapsJson, JSON.stringify(compatMaps, null, 2)),
    ],
    identifier: levelIdentifier,
    iidFactory,
    layerInstances: [
      createEntityLayerInstance({
        targetWidth,
        targetHeight,
        layerDefUid: defs.layerDefsByIdentifier.get('entities').uid,
        levelUid,
        entityInstances: [],
        iidFactory,
      }),
      createTileLayerInstance({
        sourceMap: pixelboxMap,
        targetWidth,
        targetHeight,
        layerId,
        layerDefUid: defs.layerDefsByIdentifier.get(layerId).uid,
        levelUid,
        tilesetUid: tileset ? tileset.uid : null,
        tilesetRelPath: tileset ? tileset.relPath : null,
        iidFactory,
      }),
    ],
    pxHei: targetHeight * TILE_SIZE,
    pxWid: targetWidth * TILE_SIZE,
    uid: levelUid,
    worldDepth,
    worldX,
    worldY,
  });
}

function buildDefs(mapBank, grouped, standalone, uidFactory, tilesetInfoBySheet) {
  const sheets = new Set();
  for (const map of mapBank.maps) {
    if (map.sheet) {
      sheets.add(map.sheet);
    }
  }

  const tilesets = [];
  const normalizedTilesetsBySheet = new Map();
  for (const sheetPath of Array.from(sheets).sort()) {
    const imageInfo = tilesetInfoBySheet.get(sheetPath);
    if (!imageInfo) {
      throw new Error(`Missing tileset image metadata for "${sheetPath}".`);
    }

    const tileset = createTilesetDef(uidFactory(), sheetPath, imageInfo);
    tilesets.push(tileset);
    normalizedTilesetsBySheet.set(sheetPath, tileset);
  }

  const entitiesTileset = normalizedTilesetsBySheet.get('tiles/entities');
  if (!entitiesTileset) {
    throw new Error('Missing required "tiles/entities" tileset definition.');
  }

  const layerDefs = collectLayerIdentifiers(grouped, standalone)
    .sort()
    .map((identifier) => createLayerDef(uidFactory(), identifier, identifier === 'entities' ? 'Entities' : 'Tiles'));
  const layerDefsByIdentifier = new Map(layerDefs.map((layerDef) => [layerDef.identifier, layerDef]));

  const levelFieldDefs = {
    compatMapsJson: createFieldDef(uidFactory(), 'CompatMapsJson', 'Multilines'),
  };

  const entityDefs = [];
  const entityDefsByLegacySpriteId = new Map();
  for (const entitySpec of LDTK_ENTITY_SPECS) {
    const fieldDefs = entitySpec.fieldSpecs.map((fieldSpec) => createFieldDef(
      uidFactory(),
      fieldSpec.identifier,
      fieldSpec.type,
      {
        canBeNull: fieldSpec.canBeNull,
        doc: fieldSpec.doc,
        editorAlwaysShow: fieldSpec.canBeNull === false,
        editorDisplayMode: 'NameAndValue',
      },
    ));
    const entityDef = createTypedEntityDef(uidFactory(), entitySpec, fieldDefs, entitiesTileset.uid);
    entityDefs.push(entityDef);
    entityDefsByLegacySpriteId.set(entitySpec.legacySpriteId, {
      entityDef,
      fieldDefsByIdentifier: new Map(fieldDefs.map((fieldDef) => [fieldDef.identifier, fieldDef])),
    });
  }

  return {
    entityDefs,
    entityDefsByLegacySpriteId,
    layerDefs,
    layerDefsByIdentifier,
    levelFieldDefs,
    tilesets,
    tilesetsBySheet: normalizedTilesetsBySheet,
  };
}

function buildLdtkProject(mapBank, mapData, npcData, tilesetInfoBySheet, existingProjectData) {
  const { grouped, standalone } = buildMapGroups(mapBank);
  const uidFactory = makeUidFactory(1);
  const iidFactory = makeIidFactory();
  const dummyWorldIid = iidFactory();
  const defs = buildDefs(mapBank, grouped, standalone, uidFactory, tilesetInfoBySheet);
  const existingLevelLayoutByIdentifier = existingProjectData.layoutByIdentifier;

  const levels = [];
  const usedLevelIdentifiers = new Set();
  let layoutX = 0;
  let layoutY = 0;
  const layoutSpacing = 32;
  const maxRowWidth = 1024;

  for (const group of grouped.values()) {
    const levelIdentifierBase = sanitizeIdentifier(group.region, 'Level');
    let levelIdentifier = levelIdentifierBase;
    let suffix = 2;
    while (usedLevelIdentifiers.has(levelIdentifier)) {
      levelIdentifier = `${levelIdentifierBase}_${suffix++}`;
    }
    usedLevelIdentifiers.add(levelIdentifier);

    const mainMap = group.mapsByLayer.get('main');
    const levelUid = uidFactory();
    const existingLayout = existingLevelLayoutByIdentifier.get(levelIdentifier) || null;
    levels.push(buildGroupedLevel({
      group,
      mapData,
      npcData,
      levelIdentifier,
      levelUid,
      worldDepth: existingLayout ? existingLayout.worldDepth : 0,
      worldX: existingLayout ? existingLayout.worldX : layoutX,
      worldY: existingLayout ? existingLayout.worldY : layoutY,
      iidFactory,
      defs,
    }));

    layoutX += mainMap.w * TILE_SIZE + layoutSpacing;
    if (layoutX >= maxRowWidth) {
      layoutX = 0;
      layoutY += mainMap.h * TILE_SIZE + layoutSpacing;
    }
  }

  for (const map of standalone.values()) {
    const levelIdentifierBase = sanitizeIdentifier(map.name, 'Level');
    let levelIdentifier = levelIdentifierBase;
    let suffix = 2;
    while (usedLevelIdentifiers.has(levelIdentifier)) {
      levelIdentifier = `${levelIdentifierBase}_${suffix++}`;
    }
    usedLevelIdentifiers.add(levelIdentifier);

    const levelUid = uidFactory();
    const existingLayout = existingLevelLayoutByIdentifier.get(levelIdentifier) || null;
    levels.push(buildStandaloneLevel({
      pixelboxMap: map,
      mapData,
      levelIdentifier,
      levelUid,
      worldDepth: existingLayout ? existingLayout.worldDepth : 0,
      worldX: existingLayout ? existingLayout.worldX : layoutX,
      worldY: existingLayout ? existingLayout.worldY : layoutY,
      iidFactory,
      defs,
    }));

    layoutX += map.w * TILE_SIZE + layoutSpacing;
    if (layoutX >= maxRowWidth) {
      layoutX = 0;
      layoutY += map.h * TILE_SIZE + layoutSpacing;
    }
  }

  const defaultLevelWidth = levels.length > 0 ? levels[0].pxWid : TILE_SIZE * VIEWPORT_TILES_X;
  const defaultLevelHeight = levels.length > 0 ? levels[0].pxHei : TILE_SIZE * VIEWPORT_TILES_Y;
  const worldGridWidth = levels.reduce(
    (max, level) => Math.max(max, level.worldX + level.pxWid),
    defaultLevelWidth,
  );
  const worldGridHeight = levels.reduce(
    (max, level) => Math.max(max, level.worldY + level.pxHei),
    defaultLevelHeight,
  );

  const project = {
    __header__: {
      fileType: 'LDtk Project JSON',
      app: 'LDtk',
      doc: 'https://ldtk.io/json',
      schema: 'https://ldtk.io/files/JSON_SCHEMA.json',
      appAuthor: 'Deepnight',
      appVersion: LDTK_JSON_VERSION,
      url: 'https://ldtk.io',
    },
    appBuildId: LDTK_APP_BUILD_ID,
    backupLimit: 10,
    backupOnSave: false,
    bgColor: DEFAULT_LEVEL_BG_COLOR,
    customCommands: [],
    defaultEntityHeight: TILE_SIZE,
    defaultEntityWidth: TILE_SIZE,
    defaultGridSize: TILE_SIZE,
    defaultLevelBgColor: DEFAULT_LEVEL_BG_COLOR,
    defaultLevelHeight,
    defaultLevelWidth,
    defaultPivotX: 0,
    defaultPivotY: 0,
    defs: {
      entities: defs.entityDefs,
      enums: [],
      externalEnums: [],
      layers: defs.layerDefs,
      levelFields: [defs.levelFieldDefs.compatMapsJson],
      tilesets: defs.tilesets,
    },
    dummyWorldIid,
    externalLevels: false,
    exportLevelBg: false,
    exportTiled: false,
    flags: ['UseMultilinesType'],
    identifierStyle: 'Free',
    imageExportMode: 'None',
    iid: iidFactory(),
    jsonVersion: LDTK_JSON_VERSION,
    levelNamePattern: 'Level_%idx',
    levels,
    minifyJson: false,
    nextUid: uidFactory.peek(),
    simplifiedExport: false,
    toc: [],
    worldGridHeight,
    worldGridWidth,
    worldLayout: 'Free',
    worlds: [],
  };

  applySpriteEditorAugmentations(project, existingProjectData.project, tilesetInfoBySheet, uidFactory);
  project.nextUid = uidFactory.peek();
  return project;
}

async function loadTilesetInfoBySheet(mapBank) {
  const sheetPaths = new Set();
  for (const map of mapBank.maps) {
    const sheetPath = map.sheet || '';
    if (sheetPath.length > 0) {
      sheetPaths.add(sheetPath);
    }
  }
  for (const spriteDefinition of SPRITE_EDITOR_DEFAULT_SPRITES) {
    sheetPaths.add(spriteDefinition.sheetPath);
  }
  for (const spriteDefinition of SPRITE_EDITOR_DEFAULT_WEAPON_ATTACK_SPRITES) {
    sheetPaths.add(spriteDefinition.sheetPath);
  }

  const tilesetInfoBySheet = new Map();
  for (const sheetPath of Array.from(sheetPaths).sort()) {
    const imagePath = path.join(repoRoot, 'assets', buildTilesetImagePath(sheetPath));
    let stat;
    try {
      stat = await fs.stat(imagePath);
      if (!stat.isFile()) {
        throw new Error('not a file');
      }
    } catch (error) {
      throw new Error(`Missing required tilesheet image "${imagePath}".`);
    }

    let dimensions;
    try {
      dimensions = await readPngDimensions(imagePath);
    } catch (error) {
      throw new Error(`Failed to read tilesheet dimensions for "${imagePath}": ${error.message}`);
    }

    if (dimensions.width % TILE_SIZE !== 0 || dimensions.height % TILE_SIZE !== 0) {
      throw new Error(
        `Tilesheet "${imagePath}" dimensions ${dimensions.width}x${dimensions.height} are not divisible by ${TILE_SIZE}.`,
      );
    }

    tilesetInfoBySheet.set(sheetPath, {
      pxHei: dimensions.height,
      pxWid: dimensions.width,
      cHei: dimensions.height / TILE_SIZE,
      cWid: dimensions.width / TILE_SIZE,
    });
  }

  return tilesetInfoBySheet;
}

async function main() {
  const mapBank = await readJson(SOURCE_MAPS_PATH, 'Pixelbox map bank');
  const mapData = await readJson(MAPDATA_PATH, 'map metadata');
  const npcData = await readJson(NPCS_PATH, 'npc metadata');

  if (!mapBank || mapBank._type !== 'maps' || !Array.isArray(mapBank.maps)) {
    throw new Error('assets/maps.json is not in expected Pixelbox map bank format.');
  }
  if (!isPlainObject(mapData)) {
    throw new Error('assets/data/mapdata.json must be a JSON object.');
  }
  if (!isPlainObject(npcData)) {
    throw new Error('assets/data/npcs.json must be a JSON object.');
  }

  const existingProjectData = await readExistingProjectData();
  const backupPath = await backupExistingProject();
  if (backupPath) {
    console.log(`Backed up existing maps.ldtk to ${backupPath}`);
  }

  const tilesetInfoBySheet = await loadTilesetInfoBySheet(mapBank);
  const ldtkProject = buildLdtkProject(
    mapBank,
    mapData,
    npcData,
    tilesetInfoBySheet,
    existingProjectData,
  );
  const compatMeta = extractLdtkCompatMeta(ldtkProject);
  await fs.writeFile(TARGET_LDTK_PATH, `${JSON.stringify(ldtkProject, null, 2)}\n`, 'utf8');
  await fs.writeFile(TARGET_LDTK_META_PATH, `${JSON.stringify(compatMeta, null, 2)}\n`, 'utf8');
  console.log(`Converted ${mapBank.maps.length} legacy maps into ${TARGET_LDTK_PATH}`);
  console.log(`Wrote LDtk compat metadata to ${TARGET_LDTK_META_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
