import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_IHDR = Buffer.from('IHDR', 'ascii');
const PNG_IDAT = Buffer.from('IDAT', 'ascii');
const PNG_IEND = Buffer.from('IEND', 'ascii');
const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let shift = 0; shift < 8; shift += 1) {
      if ((value & 1) === 1) {
        value = 0xedb88320 ^ (value >>> 1);
      } else {
        value >>>= 1;
      }
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(typeBuffer, dataBuffer) {
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(dataBuffer.length, 0);

  const crcBuffer = Buffer.concat([typeBuffer, dataBuffer]);
  const crcValue = crc32(crcBuffer);
  const crcOut = Buffer.alloc(4);
  crcOut.writeUInt32BE(crcValue, 0);

  return Buffer.concat([lengthBuffer, typeBuffer, dataBuffer, crcOut]);
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new Error('rng must be a function that returns numbers in the range [0, 1).');
  }
}

function validateTiles(tiles) {
  if (!Array.isArray(tiles) || tiles.length === 0) {
    throw new Error('tiles must be a non-empty 2D array.');
  }

  const width = Array.isArray(tiles[0]) ? tiles[0].length : 0;
  if (width === 0) {
    throw new Error('tiles must contain non-empty rows.');
  }

  for (let y = 0; y < tiles.length; y += 1) {
    if (!Array.isArray(tiles[y]) || tiles[y].length !== width) {
      throw new Error(`tiles row ${y} does not match the expected width ${width}.`);
    }
    for (let x = 0; x < width; x += 1) {
      if (!Number.isInteger(tiles[y][x]) || tiles[y][x] < 0) {
        throw new Error(`tiles[${y}][${x}] must be a non-negative integer tile id.`);
      }
    }
  }

  return {
    width,
    height: tiles.length,
  };
}

function randomUnit(rng) {
  const value = rng();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('rng must return finite numbers in the range [0, 1).');
  }
  return value;
}

function randomIntInclusive(rng, min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error(`Invalid random integer range [${min}, ${max}].`);
  }
  return Math.floor(randomUnit(rng) * (max - min + 1)) + min;
}

function normalizeColor(color, label) {
  if (!Array.isArray(color) || (color.length !== 3 && color.length !== 4)) {
    throw new Error(`${label} must be an array of 3 or 4 channel values.`);
  }

  const normalized = color.length === 3
    ? [...color, 255]
    : [...color];

  for (let index = 0; index < normalized.length; index += 1) {
    if (!Number.isInteger(normalized[index]) || normalized[index] < 0 || normalized[index] > 255) {
      throw new Error(`${label}[${index}] must be an integer between 0 and 255.`);
    }
  }

  return normalized;
}

function collectTileIds(tiles) {
  const tileIds = new Set();
  for (const row of tiles) {
    for (const tileId of row) {
      tileIds.add(tileId);
    }
  }
  return Array.from(tileIds).sort((left, right) => left - right);
}

export function createRandomDarkTilePalette({
  tiles,
  rng = Math.random,
  backgroundColor = [255, 255, 255, 255],
  minChannel = 16,
  maxChannel = 96,
}) {
  validateTiles(tiles);
  assertRng(rng);
  assertPositiveInteger(maxChannel, 'maxChannel');
  assertPositiveInteger(minChannel, 'minChannel');
  if (minChannel > maxChannel) {
    throw new Error(`minChannel ${minChannel} cannot be greater than maxChannel ${maxChannel}.`);
  }

  const palette = Object.create(null);
  palette[0] = normalizeColor(backgroundColor, 'backgroundColor');

  for (const tileId of collectTileIds(tiles)) {
    if (tileId === 0) {
      continue;
    }

    palette[tileId] = [
      randomIntInclusive(rng, minChannel, maxChannel),
      randomIntInclusive(rng, minChannel, maxChannel),
      randomIntInclusive(rng, minChannel, maxChannel),
      255,
    ];
  }

  return palette;
}

function resolvePalette({
  tiles,
  rng,
  backgroundColor,
  colorByTileId,
}) {
  const randomPalette = createRandomDarkTilePalette({
    tiles,
    rng,
    backgroundColor,
  });

  if (colorByTileId === null || colorByTileId === undefined) {
    return randomPalette;
  }

  if (!colorByTileId || typeof colorByTileId !== 'object' || Array.isArray(colorByTileId)) {
    throw new Error('colorByTileId must be an object keyed by tile id.');
  }

  const palette = Object.create(null);
  for (const tileId of collectTileIds(tiles)) {
    const explicitColor = colorByTileId[tileId];
    palette[tileId] = explicitColor === undefined
      ? randomPalette[tileId]
      : normalizeColor(explicitColor, `colorByTileId[${tileId}]`);
  }

  if (palette[0] === undefined) {
    palette[0] = normalizeColor(backgroundColor, 'backgroundColor');
  }

  return palette;
}

export function encodeRgbaToPngBuffer({ width, height, rgbaBuffer }) {
  assertPositiveInteger(width, 'width');
  assertPositiveInteger(height, 'height');
  if (!Buffer.isBuffer(rgbaBuffer)) {
    throw new Error('rgbaBuffer must be a Buffer.');
  }

  const expectedLength = width * height * 4;
  if (rgbaBuffer.length !== expectedLength) {
    throw new Error(
      `rgbaBuffer length ${rgbaBuffer.length} does not match expected RGBA byte count ${expectedLength}.`,
    );
  }

  const bytesPerRow = width * 4;
  const raw = Buffer.alloc(height * (bytesPerRow + 1));

  for (let y = 0; y < height; y += 1) {
    const rawRowOffset = y * (bytesPerRow + 1);
    const sourceOffset = y * bytesPerRow;
    raw[rawRowOffset] = 0;
    rgbaBuffer.copy(raw, rawRowOffset + 1, sourceOffset, sourceOffset + bytesPerRow);
  }

  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk(PNG_IHDR, ihdr),
    createChunk(PNG_IDAT, compressed),
    createChunk(PNG_IEND, Buffer.alloc(0)),
  ]);
}

export function renderTileMapToPngBuffer({
  tiles,
  blockSizePx = 4,
  backgroundColor = [255, 255, 255, 255],
  colorByTileId = null,
  rng = Math.random,
}) {
  const grid = validateTiles(tiles);
  assertPositiveInteger(blockSizePx, 'blockSizePx');
  assertRng(rng);
  const normalizedBackground = normalizeColor(backgroundColor, 'backgroundColor');
  const palette = resolvePalette({
    tiles,
    rng,
    backgroundColor: normalizedBackground,
    colorByTileId,
  });

  const width = grid.width * blockSizePx;
  const height = grid.height * blockSizePx;
  const rgbaBuffer = Buffer.alloc(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < rgbaBuffer.length; pixelIndex += 4) {
    rgbaBuffer[pixelIndex] = normalizedBackground[0];
    rgbaBuffer[pixelIndex + 1] = normalizedBackground[1];
    rgbaBuffer[pixelIndex + 2] = normalizedBackground[2];
    rgbaBuffer[pixelIndex + 3] = normalizedBackground[3];
  }

  for (let tileY = 0; tileY < grid.height; tileY += 1) {
    for (let tileX = 0; tileX < grid.width; tileX += 1) {
      const tileId = tiles[tileY][tileX];
      const color = palette[tileId] ?? normalizedBackground;

      for (let localY = 0; localY < blockSizePx; localY += 1) {
        const pixelY = tileY * blockSizePx + localY;
        for (let localX = 0; localX < blockSizePx; localX += 1) {
          const pixelX = tileX * blockSizePx + localX;
          const offset = (pixelY * width + pixelX) * 4;
          rgbaBuffer[offset] = color[0];
          rgbaBuffer[offset + 1] = color[1];
          rgbaBuffer[offset + 2] = color[2];
          rgbaBuffer[offset + 3] = color[3];
        }
      }
    }
  }

  return {
    width,
    height,
    blockSizePx,
    colorByTileId: palette,
    buffer: encodeRgbaToPngBuffer({
      width,
      height,
      rgbaBuffer,
    }),
  };
}

export async function writeTileMapToPng({
  tiles,
  outputPath,
  blockSizePx = 4,
  backgroundColor = [255, 255, 255, 255],
  colorByTileId = null,
  rng = Math.random,
}) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new Error('outputPath must be a non-empty string.');
  }

  const rendered = renderTileMapToPngBuffer({
    tiles,
    blockSizePx,
    backgroundColor,
    colorByTileId,
    rng,
  });

  await fs.writeFile(outputPath, rendered.buffer);
  return {
    outputPath,
    width: rendered.width,
    height: rendered.height,
    blockSizePx: rendered.blockSizePx,
    colorByTileId: rendered.colorByTileId,
  };
}
