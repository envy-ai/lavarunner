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

function encodeTiledGid(encodedTile) {
  const tile = decodePixelboxTile(encodedTile);
  const sprite = tile.sprite;
  const flipH = tile.flipH;
  const flipV = tile.flipV;
  const flipR = tile.flipR;

  // Tiled GID is 1-based index into tileset.
  let gid = sprite + 1;
  if (flipH) gid |= FLIPPED_HORIZONTALLY_FLAG;
  if (flipV) gid |= FLIPPED_VERTICALLY_FLAG;

  // Pixelbox "flipR" maps most closely to Tiled diagonal flag.
  if (flipR) gid |= FLIPPED_DIAGONALLY_FLAG;

  return gid >>> 0;
}

function getTilesetName(sheetPath) {
  if (!sheetPath) return '';
  return path.basename(sheetPath);
}

function parseMapName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Encountered map without a valid name.');
  }

  const slash = name.lastIndexOf('/');
  if (slash < 0) {
    return {
      region: '',
      layer: name,
    };
  }

  return {
    region: name.slice(0, slash),
    layer: name.slice(slash + 1),
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

function encodeTileLayerData(decoded, mapName) {
  const layerData = [];
  for (const tile of decoded) {
    layerData.push(tile === null ? 0 : encodeTiledGid(tile));
  }
  if (layerData.length === 0) {
    throw new Error(`Map "${mapName}" produced no tile layer data.`);
  }
  return layerData;
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

function buildEntityObjects(mainMap, entitiesMap, mapData, npcData) {
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
    const gid = encodeTiledGid(encodedTile) >>> 0;
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

function makeTiledMap(pixelboxMap, { includeEntitiesLayer = false, entityObjects = [] } = {}) {
  const decoded = decodePixelboxMap(pixelboxMap);
  const layerData = encodeTileLayerData(decoded, pixelboxMap.name || '<unnamed>');

  const tilesets = [];
  const sheetPath = pixelboxMap.sheet || '';
  if (sheetPath) {
    tilesets.push({
      firstgid: 1,
      name: getTilesetName(sheetPath),
      image: `${sheetPath}.png`,
      imagewidth: 128,
      imageheight: 128,
      tilewidth: TILE_SIZE,
      tileheight: TILE_SIZE,
      tilecount: 256,
      columns: 16,
    });
  }

  const layers = [
    {
      data: layerData,
      height: pixelboxMap.h,
      id: 1,
      name: pixelboxMap.name,
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: pixelboxMap.w,
      x: 0,
      y: 0,
    },
  ];

  if (includeEntitiesLayer) {
    layers.push({
      draworder: 'topdown',
      id: 2,
      name: 'entities',
      objects: entityObjects,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    });
  }

  const nextLayerId = includeEntitiesLayer ? 3 : 2;
  const nextObjectId = entityObjects.length + 1;

  return {
    compressionlevel: -1,
    height: pixelboxMap.h,
    infinite: false,
    layers,
    nextlayerid: nextLayerId,
    nextobjectid: nextObjectId,
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

  for (const map of mapBank.maps) {
    const parsedName = parseMapName(map.name);
    if (parsedName.layer === 'entities') {
      const mainName = parsedName.region ? `${parsedName.region}/main` : 'main';
      if (!mapsByName.has(mainName)) {
        throw new Error(`Found "${map.name}" but no matching "${mainName}" map.`);
      }
    }
  }

  const backupDir = await backupExistingMapsDir();
  if (backupDir) {
    console.log(`Backed up existing maps_tiled to ${backupDir}`);
  }

  await fs.rm(TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(TARGET_DIR, { recursive: true });

  const usedNames = new Set();
  const manifest = {
    _type: 'tiled-map-manifest',
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    maps: [],
  };

  for (const map of mapBank.maps) {
    const parsedName = parseMapName(map.name);
    if (parsedName.layer === 'entities') {
      continue;
    }

    const isMainMap = parsedName.layer === 'main';
    const entitiesMapName = parsedName.region ? `${parsedName.region}/entities` : null;
    const entitiesMap = isMainMap && entitiesMapName ? mapsByName.get(entitiesMapName) || null : null;
    const entityObjects = isMainMap ? buildEntityObjects(map, entitiesMap, mapData, npcData) : [];

    const slug = slugifyMapName(map.name, usedNames);
    const filename = `${slug}.json`;
    const tiled = makeTiledMap(map, {
      includeEntitiesLayer: isMainMap,
      entityObjects,
    });

    await fs.writeFile(
      path.join(TARGET_DIR, filename),
      `${JSON.stringify(tiled, null, 2)}\n`,
      'utf8',
    );

    manifest.maps.push({
      name: map.name,
      file: filename,
      sheet: map.sheet || '',
      width: map.w,
      height: map.h,
    });
  }

  await fs.writeFile(TARGET_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Converted ${manifest.maps.length} maps into ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
