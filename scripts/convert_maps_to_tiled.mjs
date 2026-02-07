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

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SOURCE_MAPS_PATH = path.join(repoRoot, 'assets', 'maps.json');
const TARGET_DIR = path.join(repoRoot, 'assets', 'maps_tiled');
const TARGET_MANIFEST_PATH = path.join(TARGET_DIR, 'manifest.json');

function decodeMapData(serialized) {
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

function encodeTiledGid(encodedTile) {
  const sprite = encodedTile & 255;
  const flipH = ((encodedTile >> 8) & 1) === 1;
  const flipV = ((encodedTile >> 9) & 1) === 1;
  const flipR = ((encodedTile >> 10) & 1) === 1;

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

function makeTiledMap(pixelboxMap) {
  if (!Number.isInteger(pixelboxMap.w) || !Number.isInteger(pixelboxMap.h)) {
    throw new Error(`Map "${pixelboxMap.name || '<unnamed>'}" has invalid dimensions.`);
  }
  if (typeof pixelboxMap.data !== 'string') {
    throw new Error(`Map "${pixelboxMap.name || '<unnamed>'}" has invalid data payload.`);
  }

  const decoded = decodeMapData(pixelboxMap.data);
  const expectedLength = pixelboxMap.w * pixelboxMap.h;
  if (decoded.length !== expectedLength) {
    throw new Error(
      `Map "${pixelboxMap.name || '<unnamed>'}" decode length mismatch. ` +
      `Expected ${expectedLength}, got ${decoded.length}.`,
    );
  }

  const layerData = [];
  for (const tile of decoded) {
    layerData.push(tile === null ? 0 : encodeTiledGid(tile));
  }

  const tilesets = [];
  const sheetPath = pixelboxMap.sheet || '';
  if (sheetPath) {
    tilesets.push({
      firstgid: 1,
      name: getTilesetName(sheetPath),
      image: `${sheetPath}.png`,
      imagewidth: 128,
      imageheight: 128,
      tilewidth: 8,
      tileheight: 8,
      tilecount: 256,
      columns: 16,
    });
  }

  return {
    compressionlevel: -1,
    height: pixelboxMap.h,
    infinite: false,
    layers: [
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
    ],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 8,
    tilesets,
    tilewidth: 8,
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

async function main() {
  const raw = await fs.readFile(SOURCE_MAPS_PATH, 'utf8');
  const mapBank = JSON.parse(raw);
  if (!mapBank || mapBank._type !== 'maps' || !Array.isArray(mapBank.maps)) {
    throw new Error('assets/maps.json is not in expected Pixelbox map bank format.');
  }

  await fs.rm(TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(TARGET_DIR, { recursive: true });

  const usedNames = new Set();
  const manifest = {
    _type: 'tiled-map-manifest',
    tilewidth: 8,
    tileheight: 8,
    maps: [],
  };

  for (const map of mapBank.maps) {
    if (!map || typeof map !== 'object') {
      throw new Error('Encountered invalid map entry.');
    }
    if (typeof map.name !== 'string' || map.name.length === 0) {
      throw new Error('Encountered map without a valid "name".');
    }

    const slug = slugifyMapName(map.name, usedNames);
    const filename = `${slug}.json`;
    const tiled = makeTiledMap(map);

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
