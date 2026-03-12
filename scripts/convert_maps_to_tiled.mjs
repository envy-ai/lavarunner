#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const TILED_FLIP_MASK =
  FLIPPED_HORIZONTALLY_FLAG |
  FLIPPED_VERTICALLY_FLAG |
  FLIPPED_DIAGONALLY_FLAG;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_MAPS_PATH = path.join(repoRoot, 'assets', 'maps.json');
const MAPDATA_PATH = path.join(repoRoot, 'assets', 'data', 'mapdata.json');
const NPCS_PATH = path.join(repoRoot, 'assets', 'data', 'npcs.json');
const TARGET_DIR = path.join(repoRoot, 'assets', 'maps_tiled');
const TARGET_MANIFEST_PATH = path.join(TARGET_DIR, 'manifest.json');
const TARGET_BACKUP_ROOT = path.join(repoRoot, 'assets', 'maps_tiled_backups');

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

function encodeTiledGid(encodedTile, firstgid = 1) {
  if (!Number.isInteger(firstgid) || firstgid <= 0) {
    throw new Error(`Invalid firstgid "${firstgid}" while encoding map tiles.`);
  }

  const tile = decodePixelboxTile(encodedTile);
  let gid = firstgid + tile.sprite;
  if (tile.flipH) gid |= FLIPPED_HORIZONTALLY_FLAG;
  if (tile.flipV) gid |= FLIPPED_VERTICALLY_FLAG;
  if (tile.flipR) gid |= FLIPPED_DIAGONALLY_FLAG;
  return gid >>> 0;
}

function getTilesetName(sheetPath) {
  if (!sheetPath) return '';
  return path.basename(sheetPath);
}

function buildTilesetImagePath(sheetPath) {
  if (!sheetPath) {
    throw new Error('Cannot build tileset image path for an empty sheet path.');
  }

  if (sheetPath.startsWith('tiles/')) {
    // Maps live in assets/maps_tiled/, so this resolves to assets/maps_tiled/tiles/...
    return `${sheetPath}.png`;
  }

  // Non-map sheets (for example "boxes") remain in assets/.
  return `../${sheetPath}.png`;
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

function toTiledProperty(name, value, mapName, coord) {
  const context = `${mapName}${coord ? ` @ ${coord}` : ''}.${name}`;

  if (Number.isInteger(value)) {
    return { name, type: 'int', value };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Metadata value for ${context} must be a finite number.`);
    }
    return { name, type: 'float', value };
  }

  if (typeof value === 'boolean') {
    return { name, type: 'bool', value };
  }

  if (typeof value === 'string') {
    return { name, type: 'string', value };
  }

  if (isPlainObject(value) || Array.isArray(value)) {
    if (name === 'dialog') {
      return { name, type: 'string', value: JSON.stringify(value, null, 2) };
    }
    return { name, type: 'string', value: JSON.stringify(value) };
  }

  if (value === null) {
    throw new Error(`Metadata value for ${context} cannot be null. Use an explicit string or omit the key.`);
  }

  throw new Error(`Metadata value for ${context} has unsupported type "${typeof value}".`);
}

function toTiledProperties(metadata, mapName, coord) {
  if (!isPlainObject(metadata)) {
    throw new Error(`Metadata for "${mapName}" at "${coord}" must be an object.`);
  }

  const properties = [];
  for (const [key, value] of Object.entries(metadata)) {
    properties.push(toTiledProperty(key, value, mapName, coord));
  }

  properties.sort((a, b) => a.name.localeCompare(b.name));
  return properties;
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

function makeEmptyLayerData(width, height) {
  const total = width * height;
  const data = new Array(total);
  data.fill(0);
  return data;
}

function hasAnyNonEmptyTile(decoded) {
  for (const value of decoded) {
    if (value !== null) {
      return true;
    }
  }
  return false;
}

function encodeLayerDataFromMap(sourceMap, targetWidth, targetHeight, firstgid, mapNameForErrors) {
  const decoded = decodePixelboxMap(sourceMap);

  if (sourceMap.w > targetWidth || sourceMap.h > targetHeight) {
    throw new Error(
      `Layer "${sourceMap.name}" (${sourceMap.w}x${sourceMap.h}) exceeds main map bounds ` +
      `(${targetWidth}x${targetHeight}) for "${mapNameForErrors}".`,
    );
  }

  if (firstgid === null && hasAnyNonEmptyTile(decoded)) {
    throw new Error(`Layer "${sourceMap.name}" in "${mapNameForErrors}" has tiles but no sheet path.`);
  }

  const targetData = makeEmptyLayerData(targetWidth, targetHeight);
  for (let index = 0; index < decoded.length; index += 1) {
    const encodedTile = decoded[index];
    if (encodedTile === null) {
      continue;
    }

    const x = index % sourceMap.w;
    const y = Math.floor(index / sourceMap.w);
    const targetIndex = y * targetWidth + x;
    targetData[targetIndex] = encodeTiledGid(encodedTile, firstgid);
  }

  return targetData;
}

function buildEntityObjects(mainMap, entitiesMap, mapData, npcData, entitiesFirstgid) {
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

  if (!Number.isInteger(entitiesFirstgid) || entitiesFirstgid <= 0) {
    throw new Error(`Map "${mapName}" requires a valid firstgid for entities.`);
  }

  const decoded = decodePixelboxMap(entitiesMap);
  const objects = [];
  const usedCoords = new Set();
  let nextObjectId = 1;

  for (let index = 0; index < decoded.length; index += 1) {
    const encodedTile = decoded[index];
    if (encodedTile === null) {
      continue;
    }

    const tx = index % mainMap.w;
    const ty = Math.floor(index / mainMap.w);
    const coord = `${tx},${ty}`;
    const gid = encodeTiledGid(encodedTile, entitiesFirstgid) >>> 0;
    const tileId = gid & ~TILED_FLIP_MASK;
    if (tileId <= 0) {
      throw new Error(`Invalid entity gid "${gid}" at "${mapName}" coord "${coord}".`);
    }

    const object = {
      gid,
      height: TILE_SIZE,
      id: nextObjectId,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: TILE_SIZE,
      x: tx * TILE_SIZE,
      y: (ty + 1) * TILE_SIZE,
    };

    if (metadataByCoord.has(coord)) {
      object.properties = toTiledProperties(metadataByCoord.get(coord), mapName, coord);
      usedCoords.add(coord);
    }

    objects.push(object);
    nextObjectId += 1;
  }

  for (const coord of metadataByCoord.keys()) {
    if (!usedCoords.has(coord)) {
      throw new Error(
        `Metadata defined for "${mapName}" at "${coord}" but no entity exists there in "${entitiesMap.name}".`,
      );
    }
  }

  return objects;
}

function slugifyMapName(mapName, existing) {
  const base = mapName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\//g, '__')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');

  let candidate = base || 'map';
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
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

async function backupExistingMapsDir() {
  try {
    const stats = await fs.stat(TARGET_DIR);
    if (!stats.isDirectory()) {
      throw new Error(`${TARGET_DIR} exists but is not a directory.`);
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  await fs.mkdir(TARGET_BACKUP_ROOT, { recursive: true });
  const backupDir = path.join(TARGET_BACKUP_ROOT, `maps_tiled_${timestampForFilename()}`);
  await fs.cp(TARGET_DIR, backupDir, { recursive: true });
  return backupDir;
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

async function clearGeneratedMapsPreservingTilesDir() {
  await fs.mkdir(TARGET_DIR, { recursive: true });
  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'tiles') {
      continue;
    }

    const entryPath = path.join(TARGET_DIR, entry.name);
    if (entry.isDirectory()) {
      await fs.rm(entryPath, { recursive: true, force: true });
    } else {
      await fs.rm(entryPath, { force: true });
    }
  }
}

async function validateMapTilesExistInTargetDir(mapBank) {
  const requiredSheets = new Set();
  for (const map of mapBank.maps) {
    const sheetPath = map.sheet || '';
    if (sheetPath.startsWith('tiles/')) {
      requiredSheets.add(sheetPath);
    }
  }

  for (const sheetPath of requiredSheets) {
    const tilesPath = path.join(TARGET_DIR, `${sheetPath}.png`);
    try {
      const stat = await fs.stat(tilesPath);
      if (!stat.isFile()) {
        throw new Error('not a file');
      }
    } catch (error) {
      throw new Error(
        `Missing required tilesheet image "${tilesPath}". ` +
        'Move map tiles under assets/maps_tiled/tiles before converting maps.',
      );
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

function ensureTileset(tilesets, tilesetFirstgidBySheet, sheetPath) {
  if (!sheetPath) {
    return null;
  }

  if (tilesetFirstgidBySheet.has(sheetPath)) {
    return tilesetFirstgidBySheet.get(sheetPath);
  }

  const firstgid = 1 + tilesets.length * 256;
  tilesetFirstgidBySheet.set(sheetPath, firstgid);
  tilesets.push({
    firstgid,
    name: getTilesetName(sheetPath),
    image: buildTilesetImagePath(sheetPath),
    imagewidth: 128,
    imageheight: 128,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    tilecount: 256,
    columns: 16,
  });
  return firstgid;
}

function buildRegionCombinedMap(group, mapData, npcData) {
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
      layerName,
      map,
    });
  }
  backgrounds.sort((a, b) => a.index - b.index);

  const tilesets = [];
  const tilesetFirstgidBySheet = new Map();
  const layers = [];
  const layerMetaByName = new Map();

  let nextLayerId = 1;
  const mainWidth = mainMap.w;
  const mainHeight = mainMap.h;

  const pushTileLayer = ({ sourceMap, parallaxx, parallaxy }) => {
    const firstgid = ensureTileset(tilesets, tilesetFirstgidBySheet, sourceMap.sheet || '');
    const data = encodeLayerDataFromMap(sourceMap, mainWidth, mainHeight, firstgid, mainMap.name);

    layers.push({
      data,
      height: mainHeight,
      id: nextLayerId,
      name: sourceMap.name,
      opacity: 1,
      parallaxx,
      parallaxy,
      type: 'tilelayer',
      visible: true,
      width: mainWidth,
      x: 0,
      y: 0,
    });

    layerMetaByName.set(sourceMap.name, {
      tilelayer: sourceMap.name,
      parallaxx,
      parallaxy,
      width: sourceMap.w,
      height: sourceMap.h,
      sheet: sourceMap.sheet || '',
    });

    nextLayerId += 1;
  };

  for (const bg of backgrounds) {
    const parallaxx = computeParallaxFactor(bg.map.w, mainWidth, VIEWPORT_TILES_X);
    const parallaxy = computeParallaxFactor(bg.map.h, mainHeight, VIEWPORT_TILES_Y);
    pushTileLayer({ sourceMap: bg.map, parallaxx, parallaxy });
  }

  pushTileLayer({ sourceMap: mainMap, parallaxx: 1, parallaxy: 1 });

  if (fgMap) {
    pushTileLayer({ sourceMap: fgMap, parallaxx: 1, parallaxy: 1 });
  }

  const entitiesFirstgid = entitiesMap
    ? ensureTileset(tilesets, tilesetFirstgidBySheet, entitiesMap.sheet || '')
    : null;
  const entityObjects = buildEntityObjects(mainMap, entitiesMap, mapData, npcData, entitiesFirstgid);
  layers.push({
    draworder: 'topdown',
    id: nextLayerId,
    name: 'entities',
    objects: entityObjects,
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  });
  nextLayerId += 1;

  return {
    tiled: {
      compressionlevel: -1,
      height: mainHeight,
      infinite: false,
      layers,
      nextlayerid: nextLayerId,
      nextobjectid: entityObjects.length + 1,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.10.2',
      tileheight: TILE_SIZE,
      tilesets,
      tilewidth: TILE_SIZE,
      type: 'map',
      version: '1.10',
      width: mainWidth,
    },
    layerMetaByName,
  };
}

function buildStandaloneMap(pixelboxMap) {
  const tilesets = [];
  const tilesetFirstgidBySheet = new Map();
  const firstgid = ensureTileset(tilesets, tilesetFirstgidBySheet, pixelboxMap.sheet || '');
  const data = encodeLayerDataFromMap(pixelboxMap, pixelboxMap.w, pixelboxMap.h, firstgid, pixelboxMap.name);

  const tiled = {
    compressionlevel: -1,
    height: pixelboxMap.h,
    infinite: false,
    layers: [
      {
        data,
        height: pixelboxMap.h,
        id: 1,
        name: pixelboxMap.name,
        opacity: 1,
        parallaxx: 1,
        parallaxy: 1,
        type: 'tilelayer',
        visible: true,
        width: pixelboxMap.w,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: TILE_SIZE,
    tilesets,
    tilewidth: TILE_SIZE,
    type: 'map',
    version: '1.10',
    width: pixelboxMap.w,
  };

  return {
    tiled,
    layerMetaByName: new Map([
      [
        pixelboxMap.name,
        {
          tilelayer: pixelboxMap.name,
          parallaxx: 1,
          parallaxy: 1,
          width: pixelboxMap.w,
          height: pixelboxMap.h,
          sheet: pixelboxMap.sheet || '',
        },
      ],
    ]),
  };
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

  const mapsByName = new Map();
  for (const map of mapBank.maps) {
    if (!map || typeof map !== 'object') {
      throw new Error('Encountered invalid map entry.');
    }
    if (typeof map.name !== 'string' || map.name.length === 0) {
      throw new Error('Encountered map without a valid "name".');
    }
    if (mapsByName.has(map.name)) {
      throw new Error(`Duplicate map name "${map.name}" in assets/maps.json.`);
    }
    mapsByName.set(map.name, map);
  }

  const backupDir = await backupExistingMapsDir();
  if (backupDir) {
    console.log(`Backed up existing maps_tiled to ${backupDir}`);
  }

  await clearGeneratedMapsPreservingTilesDir();
  await validateMapTilesExistInTargetDir(mapBank);

  const usedNames = new Set();
  const manifest = {
    _type: 'tiled-map-manifest',
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    maps: [],
  };

  const { grouped, standalone } = buildMapGroups(mapBank);

  const regionOutputs = new Map();
  for (const group of grouped.values()) {
    const slug = slugifyMapName(group.region, usedNames);
    const filename = `${slug}.json`;

    const built = buildRegionCombinedMap(group, mapData, npcData);
    await fs.writeFile(path.join(TARGET_DIR, filename), `${JSON.stringify(built.tiled, null, 2)}\n`, 'utf8');

    regionOutputs.set(group.region, {
      filename,
      layerMetaByName: built.layerMetaByName,
    });
  }

  const standaloneOutputs = new Map();
  for (const [name, map] of standalone.entries()) {
    const slug = slugifyMapName(name, usedNames);
    const filename = `${slug}.json`;

    const built = buildStandaloneMap(map);
    await fs.writeFile(path.join(TARGET_DIR, filename), `${JSON.stringify(built.tiled, null, 2)}\n`, 'utf8');

    standaloneOutputs.set(name, {
      filename,
      layerMetaByName: built.layerMetaByName,
    });
  }

  for (const map of mapBank.maps) {
    const parsed = parseMapName(map.name);

    if (parsed.hasRegion && parsed.layer === 'entities') {
      continue;
    }

    if (!parsed.hasRegion) {
      const out = standaloneOutputs.get(map.name);
      if (!out) {
        throw new Error(`Missing generated standalone output for "${map.name}".`);
      }
      const meta = out.layerMetaByName.get(map.name);
      if (!meta) {
        throw new Error(`Missing layer metadata for standalone map "${map.name}".`);
      }

      manifest.maps.push({
        name: map.name,
        file: out.filename,
        sheet: map.sheet || '',
        width: map.w,
        height: map.h,
        tilelayer: meta.tilelayer,
        parallaxx: meta.parallaxx,
        parallaxy: meta.parallaxy,
      });
      continue;
    }

    const out = regionOutputs.get(parsed.region);
    if (!out) {
      throw new Error(`Missing generated output for region "${parsed.region}".`);
    }
    const meta = out.layerMetaByName.get(map.name);
    if (!meta) {
      throw new Error(`Missing layer metadata for map "${map.name}" in region "${parsed.region}".`);
    }

    manifest.maps.push({
      name: map.name,
      file: out.filename,
      sheet: map.sheet || '',
      width: map.w,
      height: map.h,
      tilelayer: meta.tilelayer,
      parallaxx: meta.parallaxx,
      parallaxy: meta.parallaxy,
    });
  }

  await fs.writeFile(TARGET_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Converted ${manifest.maps.length} maps into ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
