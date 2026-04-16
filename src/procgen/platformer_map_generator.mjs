const TILE_IDS = Object.freeze({
  AIR: 0,
  SOLID: 1,
  PLATFORM: 2,
  SPIKE: 3,
  LAVA: 4,
  ACCENT: 5,
});

export const DEFAULT_PLATFORMER_TILE_KEY = Object.freeze({
  0: Object.freeze({
    id: 0,
    name: 'air',
    description: 'Empty traversable space.',
  }),
  1: Object.freeze({
    id: 1,
    name: 'solid_ground',
    description: 'Solid terrain used for floors, walls, and cliffs.',
  }),
  2: Object.freeze({
    id: 2,
    name: 'one_way_platform',
    description: 'One-way platform that can be landed on from above.',
  }),
  3: Object.freeze({
    id: 3,
    name: 'spikes',
    description: 'Lethal spike hazard.',
  }),
  4: Object.freeze({
    id: 4,
    name: 'lava',
    description: 'Lethal pit fill.',
  }),
  5: Object.freeze({
    id: 5,
    name: 'accent_block',
    description: 'Alternate solid block used for pillars and standout ledges.',
  }),
});

const SEGMENT_TYPES = Object.freeze({
  FLAT_RUN: 'flat_run',
  SPIKE_TRENCH: 'spike_trench',
  STAIR_UP: 'stair_up',
  RAISED_LEDGE: 'raised_ledge',
  CLIMB_TOWER: 'climb_tower',
  PRECISION_PLATFORM_RUN: 'precision_platform_run',
  LOW_CEILING_PASSAGE: 'low_ceiling_passage',
  STAIR_DOWN: 'stair_down',
  DROP_SHAFT: 'drop_shaft',
  PIT: 'pit',
  FLOATING_BRIDGE: 'floating_bridge',
  PILLAR_FIELD: 'pillar_field',
  FINISH_RUN: 'finish_run',
});

const DEFAULT_VARIATION = Object.freeze({
  aerialDensity: 0.7,
  precisionBias: 0.75,
  optionalPlatformDensity: 0.45,
  placementJitter: 0.6,
});

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertPositiveNumber(value, name) {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`${name} must be greater than 0.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeNumber(value, name) {
  assertFiniteNumber(value, name);
  if (value < 0) {
    throw new Error(`${name} must be non-negative.`);
  }
}

function assertUnitInterval(value, name) {
  assertFiniteNumber(value, name);
  if (value < 0 || value > 1) {
    throw new Error(`${name} must be in the range [0, 1].`);
  }
}

function assertRng(rng) {
  if (typeof rng !== 'function') {
    throw new Error('rng must be a function that returns a number in the range [0, 1).');
  }
}

function cloneTileKey() {
  return {
    0: { ...DEFAULT_PLATFORMER_TILE_KEY[0] },
    1: { ...DEFAULT_PLATFORMER_TILE_KEY[1] },
    2: { ...DEFAULT_PLATFORMER_TILE_KEY[2] },
    3: { ...DEFAULT_PLATFORMER_TILE_KEY[3] },
    4: { ...DEFAULT_PLATFORMER_TILE_KEY[4] },
    5: { ...DEFAULT_PLATFORMER_TILE_KEY[5] },
  };
}

function normalizeVariation(variation = {}) {
  if (variation === null || typeof variation !== 'object' || Array.isArray(variation)) {
    throw new Error('variation must be an object when provided.');
  }

  const normalized = {
    aerialDensity: variation.aerialDensity ?? DEFAULT_VARIATION.aerialDensity,
    precisionBias: variation.precisionBias ?? DEFAULT_VARIATION.precisionBias,
    optionalPlatformDensity: variation.optionalPlatformDensity ?? DEFAULT_VARIATION.optionalPlatformDensity,
    placementJitter: variation.placementJitter ?? DEFAULT_VARIATION.placementJitter,
  };

  assertUnitInterval(normalized.aerialDensity, 'variation.aerialDensity');
  assertUnitInterval(normalized.precisionBias, 'variation.precisionBias');
  assertUnitInterval(normalized.optionalPlatformDensity, 'variation.optionalPlatformDensity');
  assertUnitInterval(normalized.placementJitter, 'variation.placementJitter');

  return normalized;
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

function randomChoice(rng, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('randomChoice requires a non-empty array.');
  }
  return values[randomIntInclusive(rng, 0, values.length - 1)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function apexHeightForFrames(jumpSpeed, gravity, apexFrames) {
  return apexFrames * jumpSpeed - gravity * apexFrames * (apexFrames - 1) / 2;
}

function simulateLandingFrames({ gravity, jumpSpeed, landingOffsetPx, maxFrames = 2048 }) {
  let y = 0;
  let ym = -jumpSpeed;

  for (let frame = 1; frame <= maxFrames; frame += 1) {
    const previousY = y;
    y += ym;
    ym += gravity;
    if (frame > 1 && previousY < landingOffsetPx && y >= landingOffsetPx) {
      return frame;
    }
  }

  throw new Error(
    `Jump profile never intersected landing offset ${landingOffsetPx}px within ${maxFrames} frames.`,
  );
}

function validateSharedPhysicsInputs({ gravity, tileSizePx, jumpSpeed = null, forwardSpeed = null }) {
  assertPositiveNumber(gravity, 'gravity');
  assertPositiveNumber(tileSizePx, 'tileSizePx');
  if (jumpSpeed !== null) {
    assertPositiveNumber(jumpSpeed, 'jumpSpeed');
  }
  if (forwardSpeed !== null) {
    assertPositiveNumber(forwardSpeed, 'forwardSpeed');
  }
}

export function solveJumpSpeedForHeight({ gravity, targetHeightTiles, tileSizePx }) {
  validateSharedPhysicsInputs({ gravity, tileSizePx });
  assertPositiveNumber(targetHeightTiles, 'targetHeightTiles');

  const targetHeightPx = targetHeightTiles * tileSizePx;
  const maxApexFrames = Math.max(64, Math.ceil((targetHeightPx / gravity) * 2));
  let best = null;

  for (let apexFrames = 1; apexFrames <= maxApexFrames; apexFrames += 1) {
    const jumpSpeed = (
      targetHeightPx +
      gravity * apexFrames * (apexFrames - 1) / 2
    ) / apexFrames;
    const lowerBound = (apexFrames - 1) * gravity;
    const upperBound = apexFrames * gravity;

    if (jumpSpeed <= lowerBound || jumpSpeed > upperBound) {
      continue;
    }

    const achievedHeightPx = apexHeightForFrames(jumpSpeed, gravity, apexFrames);
    const error = Math.abs(achievedHeightPx - targetHeightPx);

    if (
      best === null ||
      error < best.error ||
      (error === best.error && jumpSpeed < best.jumpSpeed)
    ) {
      best = {
        jumpSpeed,
        apexFrames,
        achievedHeightPx,
        error,
      };
    }
  }

  if (best === null) {
    throw new Error(
      `No discrete jump solution found for ${targetHeightTiles} tiles with gravity ${gravity}.`,
    );
  }

  return {
    jumpSpeed: best.jumpSpeed,
    apexFrames: best.apexFrames,
    achievedHeightPx: best.achievedHeightPx,
    achievedHeightTiles: best.achievedHeightPx / tileSizePx,
  };
}

export function getJumpProfile({ gravity, jumpSpeed, tileSizePx, landingOffsetPx = 0 }) {
  validateSharedPhysicsInputs({ gravity, jumpSpeed, tileSizePx });
  assertFiniteNumber(landingOffsetPx, 'landingOffsetPx');

  const apexFrames = Math.max(1, Math.ceil(jumpSpeed / gravity));
  const apexHeightPx = apexHeightForFrames(jumpSpeed, gravity, apexFrames);
  const flightFrames = simulateLandingFrames({
    gravity,
    jumpSpeed,
    landingOffsetPx,
  });

  return {
    apexFrames,
    flightFrames,
    apexHeightPx,
    apexHeightTiles: apexHeightPx / tileSizePx,
  };
}

export function solveForwardSpeedForDistance({
  gravity,
  jumpSpeed,
  distanceTiles,
  tileSizePx,
  landingOffsetPx = 0,
}) {
  validateSharedPhysicsInputs({ gravity, jumpSpeed, tileSizePx });
  assertPositiveNumber(distanceTiles, 'distanceTiles');
  assertFiniteNumber(landingOffsetPx, 'landingOffsetPx');

  const distancePx = distanceTiles * tileSizePx;
  const { flightFrames } = getJumpProfile({
    gravity,
    jumpSpeed,
    tileSizePx,
    landingOffsetPx,
  });

  return {
    forwardSpeed: distancePx / flightFrames,
    flightFrames,
    distancePx,
  };
}

function buildMovementProfile({
  gravity,
  jumpSpeed,
  forwardSpeed,
  tileSizePx,
  playerWidthPx,
  playerHeightPx,
}) {
  const jumpProfile = getJumpProfile({
    gravity,
    jumpSpeed,
    tileSizePx,
  });
  const playerWidthTiles = Math.max(1, Math.ceil(playerWidthPx / tileSizePx));
  const playerHeightTiles = Math.max(1, Math.ceil(playerHeightPx / tileSizePx));
  const landingWidthTiles = Math.max(2, playerWidthTiles + 1);
  const narrowPlatformWidthTiles = Math.max(2, playerWidthTiles + 1);
  const mediumPlatformWidthTiles = narrowPlatformWidthTiles + 1;
  const widePlatformWidthTiles = mediumPlatformWidthTiles + 1;
  const sameHeightMaxDistanceTiles = (forwardSpeed * jumpProfile.flightFrames) / tileSizePx;
  const sameHeightMaxGapTiles = Math.floor(sameHeightMaxDistanceTiles);
  const safeGapTiles = Math.max(
    1,
    Math.min(sameHeightMaxGapTiles - 1, Math.floor(sameHeightMaxDistanceTiles * 0.8)),
  );

  if (sameHeightMaxGapTiles < 1) {
    throw new Error(
      `forwardSpeed ${forwardSpeed} is too small for a useful jump envelope at gravity ${gravity}.`,
    );
  }

  const riseTable = [];
  const maxRiseTiles = Math.max(1, Math.floor(jumpProfile.apexHeightTiles));

  for (let riseTiles = 0; riseTiles <= maxRiseTiles; riseTiles += 1) {
    const landingOffsetPx = -riseTiles * tileSizePx;
    let profile = null;

    try {
      profile = getJumpProfile({
        gravity,
        jumpSpeed,
        tileSizePx,
        landingOffsetPx,
      });
    } catch (error) {
      continue;
    }

    const maxDistanceTiles = (forwardSpeed * profile.flightFrames) / tileSizePx;
    const safeDistanceTiles = Math.max(1, Math.floor(maxDistanceTiles * 0.8));
    riseTable.push({
      riseTiles,
      flightFrames: profile.flightFrames,
      exactDistanceTiles: maxDistanceTiles,
      maxDistanceTiles,
      safeDistanceTiles,
    });
  }

  const safeRiseTiles = riseTable
    .filter((entry) => entry.riseTiles > 0 && entry.safeDistanceTiles >= 1)
    .map((entry) => entry.riseTiles)
    .at(-1) ?? 0;

  return {
    gravity,
    jumpSpeed,
    forwardSpeed,
    tileSizePx,
    playerWidthPx,
    playerHeightPx,
    playerWidthTiles,
    playerHeightTiles,
    landingWidthTiles,
    narrowPlatformWidthTiles,
    mediumPlatformWidthTiles,
    widePlatformWidthTiles,
    jumpProfile,
    sameHeightMaxDistanceTiles,
    sameHeightMaxGapTiles,
    safeGapTiles,
    safeSpikeSpanTiles: Math.max(1, safeGapTiles - 1),
    maxRiseTiles,
    safeRiseTiles,
    riseTable,
  };
}

function createTileGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(TILE_IDS.AIR));
}

function cloneTiles(tiles) {
  return tiles.map((row) => [...row]);
}

function validateTileGrid(tiles) {
  if (!Array.isArray(tiles) || tiles.length === 0) {
    throw new Error('tiles must be a non-empty 2D array.');
  }

  const width = Array.isArray(tiles[0]) ? tiles[0].length : 0;
  if (width === 0) {
    throw new Error('tiles must contain non-empty rows.');
  }

  for (let y = 0; y < tiles.length; y += 1) {
    if (!Array.isArray(tiles[y]) || tiles[y].length !== width) {
      throw new Error(`tiles row ${y} does not match the map width ${width}.`);
    }
    for (let x = 0; x < width; x += 1) {
      if (!Number.isInteger(tiles[y][x])) {
        throw new Error(`tiles[${y}][${x}] must be an integer tile id.`);
      }
    }
  }

  return {
    width,
    height: tiles.length,
  };
}

function assertInBounds(tiles, x, y, label) {
  if (x < 0 || x >= tiles[0].length || y < 0 || y >= tiles.length) {
    throw new Error(`${label} (${x}, ${y}) is outside the map bounds.`);
  }
}

function setTile(tiles, x, y, tileId, label = 'Tile write') {
  assertInBounds(tiles, x, y, label);
  tiles[y][x] = tileId;
}

function fillColumnsToBottom(tiles, xStart, xEnd, topY, topTileId = TILE_IDS.SOLID, fillTileId = TILE_IDS.SOLID) {
  for (let x = xStart; x <= xEnd; x += 1) {
    setTile(tiles, x, topY, topTileId, 'Solid support');
    for (let y = topY + 1; y < tiles.length; y += 1) {
      setTile(tiles, x, y, fillTileId, 'Solid support');
    }
  }
}

function paintPlatform(tiles, xStart, xEnd, topY) {
  for (let x = xStart; x <= xEnd; x += 1) {
    setTile(tiles, x, topY, TILE_IDS.PLATFORM, 'Platform support');
  }
}

function paintLava(tiles, xStart, xEnd, depth = 2) {
  const startY = Math.max(tiles.length - depth, 0);
  for (let x = xStart; x <= xEnd; x += 1) {
    for (let y = startY; y < tiles.length; y += 1) {
      setTile(tiles, x, y, TILE_IDS.LAVA, 'Lava fill');
    }
  }
}

function paintSpikeStrip(tiles, xStart, xEnd, topY) {
  for (let x = xStart; x <= xEnd; x += 1) {
    setTile(tiles, x, topY, TILE_IDS.SPIKE, 'Spike strip');
    for (let y = topY + 1; y < tiles.length; y += 1) {
      if (tiles[y][x] === TILE_IDS.AIR) {
        setTile(tiles, x, y, TILE_IDS.SOLID, 'Spike strip support');
      }
    }
  }
}

function paintCeiling(tiles, xStart, xEnd, topY) {
  for (let x = xStart; x <= xEnd; x += 1) {
    setTile(tiles, x, topY, TILE_IDS.SOLID, 'Ceiling block');
  }
}

function paintAnchorSpec(tiles, {
  xStart,
  xEnd,
  topY,
  supportType,
  tileId = TILE_IDS.SOLID,
  fillTileId = null,
}) {
  if (supportType === 'solid') {
    fillColumnsToBottom(
      tiles,
      xStart,
      xEnd,
      topY,
      tileId,
      fillTileId ?? tileId,
    );
    return;
  }

  if (supportType === 'platform') {
    paintPlatform(tiles, xStart, xEnd, topY);
    return;
  }

  throw new Error(`Unsupported supportType "${supportType}".`);
}

function isSolidTile(tileId) {
  return tileId === TILE_IDS.SOLID || tileId === TILE_IDS.ACCENT;
}

function isStandableTile(tileId) {
  return isSolidTile(tileId) || tileId === TILE_IDS.PLATFORM;
}

function isHazardTile(tileId) {
  return tileId === TILE_IDS.SPIKE || tileId === TILE_IDS.LAVA;
}

function isTopSurfaceTile(tiles, tx, ty) {
  const tileId = getTile(tiles, tx, ty);
  if (tileId === TILE_IDS.PLATFORM) {
    return true;
  }
  if (!isSolidTile(tileId)) {
    return false;
  }

  const aboveTileId = getTile(tiles, tx, ty - 1);
  return !isStandableTile(aboveTileId);
}

function getTile(tiles, tx, ty) {
  if (ty < 0 || ty >= tiles.length || tx < 0 || tx >= tiles[0].length) {
    return null;
  }
  return tiles[ty][tx];
}

function getOverlappedTileRange(position, size, tileSizePx) {
  return {
    start: Math.floor(position / tileSizePx),
    end: Math.floor((position + size - 1) / tileSizePx),
  };
}

function bboxTouchesHazard(tiles, x, y, widthPx, heightPx, tileSizePx) {
  const xRange = getOverlappedTileRange(x, widthPx, tileSizePx);
  const yRange = getOverlappedTileRange(y, heightPx, tileSizePx);

  for (let ty = yRange.start; ty <= yRange.end; ty += 1) {
    for (let tx = xRange.start; tx <= xRange.end; tx += 1) {
      const tileId = getTile(tiles, tx, ty);
      if (tileId !== null && isHazardTile(tileId)) {
        return true;
      }
    }
  }

  return false;
}

function bboxHitsSolid(tiles, x, y, widthPx, heightPx, tileSizePx) {
  const xRange = getOverlappedTileRange(x, widthPx, tileSizePx);
  const yRange = getOverlappedTileRange(y, heightPx, tileSizePx);

  for (let ty = yRange.start; ty <= yRange.end; ty += 1) {
    for (let tx = xRange.start; tx <= xRange.end; tx += 1) {
      const tileId = getTile(tiles, tx, ty);
      if (tileId !== null && isSolidTile(tileId)) {
        return true;
      }
    }
  }

  return false;
}

function hasSupportBelow(tiles, x, y, widthPx, heightPx, tileSizePx) {
  const probeY = y + heightPx;
  const xRange = getOverlappedTileRange(x, widthPx, tileSizePx);
  const supportTy = Math.floor(probeY / tileSizePx);

  for (let tx = xRange.start; tx <= xRange.end; tx += 1) {
    const tileId = getTile(tiles, tx, supportTy);
    if (tileId !== null && isStandableTile(tileId)) {
      return true;
    }
  }

  return false;
}

function anchorWidthTiles(anchor) {
  return anchor.xEnd - anchor.xStart + 1;
}

function computeAnchorExitLeftX(anchor, playerWidthPx, tileSizePx) {
  return (anchor.xEnd + 1) * tileSizePx - playerWidthPx;
}

function computeAnchorEntryLeftX(anchor, tileSizePx) {
  return anchor.xStart * tileSizePx;
}

function standYForAnchor(anchor, playerHeightPx, tileSizePx) {
  return anchor.topY * tileSizePx - playerHeightPx;
}

function landingMatchesAnchor(anchor, x, y, playerWidthPx, playerHeightPx, tileSizePx) {
  if (y !== standYForAnchor(anchor, playerHeightPx, tileSizePx)) {
    return false;
  }

  const xRange = getOverlappedTileRange(x, playerWidthPx, tileSizePx);
  return xRange.end >= anchor.xStart && xRange.start <= anchor.xEnd;
}

function detectLanding({
  tiles,
  previousY,
  nextY,
  x,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
}) {
  const previousBottom = previousY + playerHeightPx - 1;
  const nextBottom = nextY + playerHeightPx - 1;

  if (nextBottom <= previousBottom) {
    return null;
  }

  const xRange = getOverlappedTileRange(x, playerWidthPx, tileSizePx);
  const startTy = Math.floor((previousBottom + 1) / tileSizePx);
  const endTy = Math.floor((nextBottom + 1) / tileSizePx);

  for (let ty = startTy; ty <= endTy; ty += 1) {
    const tileTopY = ty * tileSizePx;
    if (!(previousBottom < tileTopY && nextBottom >= tileTopY - 1)) {
      continue;
    }

    for (let tx = xRange.start; tx <= xRange.end; tx += 1) {
      const tileId = getTile(tiles, tx, ty);
      if (tileId !== null && isStandableTile(tileId) && isTopSurfaceTile(tiles, tx, ty)) {
        return {
          tx,
          ty,
          standY: tileTopY - playerHeightPx,
        };
      }
    }
  }

  return null;
}

function simulateWalkAcrossAnchor({
  tiles,
  anchor,
  fromLeftX,
  toLeftX,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
}) {
  const standY = standYForAnchor(anchor, playerHeightPx, tileSizePx);
  const direction = Math.sign(toLeftX - fromLeftX);
  let leftX = fromLeftX;
  let steps = 0;
  const maxSteps = Math.abs(toLeftX - fromLeftX) + 1;
  const epsilon = 1e-6;

  while (true) {
    if (bboxTouchesHazard(tiles, leftX, standY, playerWidthPx, playerHeightPx, tileSizePx)) {
      throw new Error(`Anchor ${anchor.id} walk path intersects a hazard at x=${leftX}.`);
    }
    if (bboxHitsSolid(tiles, leftX, standY, playerWidthPx, playerHeightPx, tileSizePx)) {
      throw new Error(`Anchor ${anchor.id} walk path clips solid terrain at x=${leftX}.`);
    }
    if (!hasSupportBelow(tiles, leftX, standY, playerWidthPx, playerHeightPx, tileSizePx)) {
      throw new Error(`Anchor ${anchor.id} walk path loses floor support at x=${leftX}.`);
    }

    if (
      direction === 0 ||
      (direction > 0 && leftX >= toLeftX - epsilon) ||
      (direction < 0 && leftX <= toLeftX + epsilon)
    ) {
      return {
        leftX: toLeftX,
        standY,
        steps,
      };
    }

    if (steps > maxSteps) {
      throw new Error(`Anchor ${anchor.id} walk path exceeded the expected number of steps.`);
    }

    if (direction > 0) {
      leftX = Math.min(leftX + direction, toLeftX);
    } else {
      leftX = Math.max(leftX + direction, toLeftX);
    }
    steps += 1;
  }
}

function simulateArcToAnchor({
  tiles,
  fromAnchor,
  toAnchor,
  gravity,
  forwardSpeed,
  initialVerticalSpeed,
  startLeftX,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
  transitionType,
}) {
  let leftX = startLeftX;
  let topY = standYForAnchor(fromAnchor, playerHeightPx, tileSizePx);
  let verticalSpeed = initialVerticalSpeed;

  if (bboxHitsSolid(tiles, leftX, topY, playerWidthPx, playerHeightPx, tileSizePx)) {
    throw new Error(`${transitionType} from anchor ${fromAnchor.id} starts inside solid terrain.`);
  }

  for (let frame = 1; frame <= 2048; frame += 1) {
    const previousY = topY;

    leftX += forwardSpeed;
    topY += verticalSpeed;

    if (leftX < 0 || leftX + playerWidthPx > tiles[0].length * tileSizePx) {
      throw new Error(
        `${transitionType} from anchor ${fromAnchor.id} to ${toAnchor.id} left the map bounds at frame ${frame}.`,
      );
    }
    if (topY > tiles.length * tileSizePx) {
      throw new Error(
        `${transitionType} from anchor ${fromAnchor.id} to ${toAnchor.id} fell below the map at frame ${frame}.`,
      );
    }
    if (bboxTouchesHazard(tiles, leftX, topY, playerWidthPx, playerHeightPx, tileSizePx)) {
      throw new Error(
        `${transitionType} from anchor ${fromAnchor.id} to ${toAnchor.id} hit a hazard at frame ${frame}.`,
      );
    }

    const landing = detectLanding({
      tiles,
      previousY,
      nextY: topY,
      x: leftX,
      playerWidthPx,
      playerHeightPx,
      tileSizePx,
    });

    if (landing !== null) {
      if (!landingMatchesAnchor(toAnchor, leftX, landing.standY, playerWidthPx, playerHeightPx, tileSizePx)) {
        throw new Error(
          `${transitionType} from anchor ${fromAnchor.id} landed on tile (${landing.tx}, ${landing.ty}) instead of anchor ${toAnchor.id}.`,
        );
      }
      if (bboxHitsSolid(tiles, leftX, landing.standY, playerWidthPx, playerHeightPx, tileSizePx)) {
        throw new Error(
          `${transitionType} landing on anchor ${toAnchor.id} clips solid terrain at frame ${frame}.`,
        );
      }
      if (bboxTouchesHazard(tiles, leftX, landing.standY, playerWidthPx, playerHeightPx, tileSizePx)) {
        throw new Error(
          `${transitionType} landing on anchor ${toAnchor.id} overlaps a hazard at frame ${frame}.`,
        );
      }

      return {
        fromAnchorId: fromAnchor.id,
        toAnchorId: toAnchor.id,
        type: transitionType,
        frame,
        leftX,
        standY: landing.standY,
      };
    }

    if (bboxHitsSolid(tiles, leftX, topY, playerWidthPx, playerHeightPx, tileSizePx)) {
      throw new Error(
        `${transitionType} from anchor ${fromAnchor.id} to ${toAnchor.id} hit solid terrain at frame ${frame}.`,
      );
    }

    verticalSpeed += gravity;
  }

  throw new Error(`${transitionType} from anchor ${fromAnchor.id} to ${toAnchor.id} never landed.`);
}

function findReachableTransition({
  tiles,
  fromAnchor,
  toAnchor,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
  transitionType,
  currentLeftX = computeAnchorEntryLeftX(fromAnchor, tileSizePx),
}) {
  const entryLeftX = Math.ceil(computeAnchorEntryLeftX(fromAnchor, tileSizePx));
  const exitLeftX = Math.floor(computeAnchorExitLeftX(fromAnchor, playerWidthPx, tileSizePx));
  const transitionLabel = transitionType === 'drop' ? 'Drop' : 'Jump';

  if (exitLeftX < entryLeftX) {
    throw new Error(
      `Anchor ${fromAnchor.id} has no integer takeoff positions for playerWidthPx=${playerWidthPx}.`,
    );
  }

  let lastError = null;

  for (let takeoffLeftX = exitLeftX; takeoffLeftX >= entryLeftX; takeoffLeftX -= 1) {
    try {
      const walkResult = simulateWalkAcrossAnchor({
        tiles,
        anchor: fromAnchor,
        fromLeftX: currentLeftX,
        toLeftX: takeoffLeftX,
        playerWidthPx,
        playerHeightPx,
        tileSizePx,
      });

      const arcResult = simulateArcToAnchor({
        tiles,
        fromAnchor,
        toAnchor,
        gravity,
        forwardSpeed,
        initialVerticalSpeed: transitionType === 'drop' ? 0 : -jumpSpeed,
        startLeftX: takeoffLeftX,
        playerWidthPx,
        playerHeightPx,
        tileSizePx,
        transitionType,
      });

      return {
        ...arcResult,
        transitionLabel,
        walkFromLeftX: currentLeftX,
        walkToLeftX: takeoffLeftX,
        walkStepsBeforeTakeoff: walkResult.steps,
        takeoffLeftX,
        takeoffStandY: standYForAnchor(fromAnchor, playerHeightPx, tileSizePx),
      };
    } catch (error) {
      lastError = error;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${transitionLabel} from anchor ${fromAnchor.id} to ${toAnchor.id} had no reachable takeoff window. Last error: ${errorMessage}`,
  );
}

function validateRouteMetadata(routeMetadata) {
  if (!routeMetadata || typeof routeMetadata !== 'object' || Array.isArray(routeMetadata)) {
    throw new Error('routeMetadata must be an object.');
  }
  if (!Array.isArray(routeMetadata.anchors) || routeMetadata.anchors.length === 0) {
    throw new Error('routeMetadata.anchors must contain at least one anchor.');
  }
  if (!Number.isInteger(routeMetadata.startAnchorId) || !Number.isInteger(routeMetadata.endAnchorId)) {
    throw new Error('routeMetadata.startAnchorId and routeMetadata.endAnchorId must be integers.');
  }
}

function validateAnchorGeometry(anchor, tiles, playerWidthPx, tileSizePx) {
  if (!Number.isInteger(anchor.id) || anchor.id < 0) {
    throw new Error('Every anchor must have a non-negative integer id.');
  }
  if (!Number.isInteger(anchor.xStart) || !Number.isInteger(anchor.xEnd) || anchor.xStart > anchor.xEnd) {
    throw new Error(`Anchor ${anchor.id} has invalid x bounds.`);
  }
  if (!Number.isInteger(anchor.topY) || anchor.topY < 0 || anchor.topY >= tiles.length) {
    throw new Error(`Anchor ${anchor.id} has invalid topY ${anchor.topY}.`);
  }
  if (!['solid', 'platform'].includes(anchor.supportType)) {
    throw new Error(`Anchor ${anchor.id} has unsupported supportType "${anchor.supportType}".`);
  }
  if (anchor.xStart < 0 || anchor.xEnd >= tiles[0].length) {
    throw new Error(`Anchor ${anchor.id} lies outside the map width.`);
  }
  if (anchorWidthTiles(anchor) < 1) {
    throw new Error(`Anchor ${anchor.id} must span at least one tile.`);
  }

  const entryLeftX = computeAnchorEntryLeftX(anchor, tileSizePx);
  const exitLeftX = computeAnchorExitLeftX(anchor, playerWidthPx, tileSizePx);
  if (exitLeftX < entryLeftX) {
    throw new Error(
      `Anchor ${anchor.id} is too narrow for playerWidthPx=${playerWidthPx}.`,
    );
  }

  for (let x = anchor.xStart; x <= anchor.xEnd; x += 1) {
    const tileId = getTile(tiles, x, anchor.topY);
    if (anchor.supportType === 'solid' && !isSolidTile(tileId)) {
      throw new Error(
        `Anchor ${anchor.id} expects solid support at (${x}, ${anchor.topY}), found tile ${tileId}.`,
      );
    }
    if (anchor.supportType === 'platform' && tileId !== TILE_IDS.PLATFORM) {
      throw new Error(
        `Anchor ${anchor.id} expects one-way platform support at (${x}, ${anchor.topY}), found tile ${tileId}.`,
      );
    }
  }
}

function deriveTransitions(routeMetadata, anchors) {
  if (!Array.isArray(routeMetadata.transitions) || routeMetadata.transitions.length === 0) {
    return anchors.slice(0, -1).map((anchor, index) => ({
      fromAnchorId: anchor.id,
      toAnchorId: anchors[index + 1].id,
      type: 'jump',
    }));
  }

  if (routeMetadata.transitions.length !== anchors.length - 1) {
    throw new Error(
      `routeMetadata.transitions must contain ${anchors.length - 1} entries, got ${routeMetadata.transitions.length}.`,
    );
  }

  return routeMetadata.transitions.map((transition, index) => {
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
      throw new Error(`routeMetadata.transitions[${index}] must be an object.`);
    }
    if (!Number.isInteger(transition.fromAnchorId) || !Number.isInteger(transition.toAnchorId)) {
      throw new Error(`routeMetadata.transitions[${index}] must use integer anchor ids.`);
    }
    if (!['jump', 'drop'].includes(transition.type)) {
      throw new Error(
        `routeMetadata.transitions[${index}] has unsupported type "${transition.type}".`,
      );
    }
    return {
      fromAnchorId: transition.fromAnchorId,
      toAnchorId: transition.toAnchorId,
      type: transition.type,
    };
  });
}

export function validatePlatformerMap({
  tiles,
  routeMetadata,
  tileSizePx,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
}) {
  validateSharedPhysicsInputs({
    gravity,
    tileSizePx,
    jumpSpeed,
    forwardSpeed,
  });
  assertPositiveNumber(playerWidthPx, 'playerWidthPx');
  assertPositiveNumber(playerHeightPx, 'playerHeightPx');
  const grid = validateTileGrid(tiles);
  validateRouteMetadata(routeMetadata);

  const anchors = [...routeMetadata.anchors];
  anchors.sort((left, right) => left.id - right.id);
  const transitions = deriveTransitions(routeMetadata, anchors);

  if (anchors[0].id !== routeMetadata.startAnchorId) {
    throw new Error(
      `routeMetadata.startAnchorId=${routeMetadata.startAnchorId} does not match the first anchor id ${anchors[0].id}.`,
    );
  }
  if (anchors.at(-1).id !== routeMetadata.endAnchorId) {
    throw new Error(
      `routeMetadata.endAnchorId=${routeMetadata.endAnchorId} does not match the last anchor id ${anchors.at(-1).id}.`,
    );
  }

  if (anchors[0].xStart !== 0) {
    throw new Error('The first anchor must begin at the left edge of the map.');
  }
  if (anchors.at(-1).xEnd !== grid.width - 1) {
    throw new Error('The last anchor must reach the right edge of the map.');
  }

  for (const anchor of anchors) {
    validateAnchorGeometry(anchor, tiles, playerWidthPx, tileSizePx);
  }

  let currentLeftX = computeAnchorEntryLeftX(anchors[0], tileSizePx);
  const diagnostics = {
    anchorCount: anchors.length,
    transitionCount: transitions.length,
    jumpCount: transitions.filter((transition) => transition.type === 'jump').length,
    dropCount: transitions.filter((transition) => transition.type === 'drop').length,
    anchorWalks: [],
    transitions: [],
  };

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];

    if (index === anchors.length - 1) {
      const exitLeftX = computeAnchorExitLeftX(anchor, playerWidthPx, tileSizePx);
      const walkResult = simulateWalkAcrossAnchor({
        tiles,
        anchor,
        fromLeftX: currentLeftX,
        toLeftX: exitLeftX,
        playerWidthPx,
        playerHeightPx,
        tileSizePx,
      });
      diagnostics.anchorWalks.push({
        anchorId: anchor.id,
        fromLeftX: currentLeftX,
        toLeftX: exitLeftX,
        steps: walkResult.steps,
      });
      currentLeftX = walkResult.leftX;
      continue;
    }

    const nextAnchor = anchors[index + 1];
    const transition = transitions[index];
    if (transition.fromAnchorId !== anchor.id || transition.toAnchorId !== nextAnchor.id) {
      throw new Error(
        `Transition ${index} does not connect anchor ${anchor.id} to anchor ${nextAnchor.id}.`,
      );
    }

    const result = findReachableTransition({
      tiles,
      fromAnchor: anchor,
      toAnchor: nextAnchor,
      gravity,
      forwardSpeed,
      jumpSpeed,
      playerWidthPx,
      playerHeightPx,
      tileSizePx,
      transitionType: transition.type,
      currentLeftX,
    });

    diagnostics.anchorWalks.push({
      anchorId: anchor.id,
      fromLeftX: currentLeftX,
      toLeftX: result.takeoffLeftX,
      steps: result.walkStepsBeforeTakeoff,
    });
    diagnostics.transitions.push(result);
    currentLeftX = result.leftX;
  }

  return diagnostics;
}

function createRouteMetadata() {
  return {
    anchors: [],
    transitions: [],
    segments: [],
    archetypes: [],
    optionalPlatforms: [],
    startAnchorId: null,
    endAnchorId: null,
  };
}

function addTransition(routeMetadata, fromAnchorId, toAnchorId, type) {
  routeMetadata.transitions.push({
    fromAnchorId,
    toAnchorId,
    type,
  });
}

function addArchetype(routeMetadata, type) {
  if (!routeMetadata.archetypes.includes(type)) {
    routeMetadata.archetypes.push(type);
  }
}

function addSegment(routeMetadata, type, xStart, xEnd, anchorIds, details = {}) {
  routeMetadata.segments.push({
    type,
    xStart,
    xEnd,
    anchorIds: [...anchorIds],
    ...details,
  });
  addArchetype(routeMetadata, type);
}

function commitTransitionToAnchor(state, fromAnchor, toAnchor, type, tiles = state.tiles) {
  const result = findReachableTransition({
    tiles,
    fromAnchor,
    toAnchor,
    gravity: state.movementProfile.gravity,
    forwardSpeed: state.movementProfile.forwardSpeed,
    jumpSpeed: state.movementProfile.jumpSpeed,
    playerWidthPx: state.movementProfile.playerWidthPx,
    playerHeightPx: state.movementProfile.playerHeightPx,
    tileSizePx: state.movementProfile.tileSizePx,
    transitionType: type,
    currentLeftX: state.currentLeftX,
  });
  addTransition(state.routeMetadata, fromAnchor.id, toAnchor.id, type);
  state.currentLeftX = result.leftX;
  return result;
}

function addAnchor(state, {
  xStart,
  xEnd,
  topY,
  supportType,
  tileId = TILE_IDS.SOLID,
  fillTileId = null,
}) {
  if (supportType === 'solid') {
    fillColumnsToBottom(
      state.tiles,
      xStart,
      xEnd,
      topY,
      tileId,
      fillTileId ?? tileId,
    );
  } else if (supportType === 'platform') {
    paintPlatform(state.tiles, xStart, xEnd, topY);
  } else {
    throw new Error(`Unsupported supportType "${supportType}".`);
  }

  const anchor = {
    id: state.routeMetadata.anchors.length,
    xStart,
    xEnd,
    topY,
    supportType,
  };
  state.routeMetadata.anchors.push(anchor);
  state.currentAnchor = anchor;
  return anchor;
}

function extendCurrentAnchor(state, length, {
  topTileId = TILE_IDS.SOLID,
  fillTileId = TILE_IDS.SOLID,
} = {}) {
  const anchor = state.currentAnchor;
  if (anchor.supportType !== 'solid') {
    throw new Error(`Cannot extend non-solid anchor ${anchor.id}.`);
  }

  const xStart = anchor.xEnd + 1;
  const xEnd = xStart + length - 1;
  fillColumnsToBottom(state.tiles, xStart, xEnd, anchor.topY, topTileId, fillTileId);
  anchor.xEnd = xEnd;

  return {
    xStart,
    xEnd,
    anchor,
  };
}

function remainingColumnsBeforeFinish(state) {
  return state.width - state.finalRunLength - state.currentAnchor.xEnd - 1;
}

function ensureRemainingColumns(state, minColumns, segmentType) {
  if (remainingColumnsBeforeFinish(state) < minColumns) {
    throw new Error(
      `Not enough space to place ${segmentType}. Remaining columns before finish: ${remainingColumnsBeforeFinish(state)}.`,
    );
  }
}

function getMaxRisePerStep(state) {
  return Math.max(1, Math.min(3, state.movementProfile.safeRiseTiles || 1));
}

function getMaxDropPerStep(state) {
  return Math.max(1, Math.min(3, state.verticalCapacityTiles));
}

function getVerticalBoundsForSource(state, sourceTopY, {
  maxRiseTiles = getMaxRisePerStep(state),
  maxDropTiles = getMaxDropPerStep(state),
} = {}) {
  return {
    topYMin: clamp(sourceTopY - maxRiseTiles, state.minTopY, state.maxTopY),
    topYMax: clamp(sourceTopY + maxDropTiles, state.minTopY, state.maxTopY),
  };
}

function pickRiseEntry(profile, minRiseTiles, maxRiseTiles) {
  const choices = profile.riseTable.filter((entry) => (
    entry.riseTiles >= minRiseTiles &&
    entry.riseTiles <= maxRiseTiles &&
    entry.safeDistanceTiles >= 1
  ));

  if (choices.length === 0) {
    throw new Error(
      `No reachable rise entries between ${minRiseTiles} and ${maxRiseTiles} tiles.`,
    );
  }

  return choices;
}

function getRiseEntryByTiles(profile, riseTiles) {
  const entry = profile.riseTable.find((candidate) => candidate.riseTiles === riseTiles);
  if (!entry) {
    throw new Error(`Missing rise-table entry for ${riseTiles} tiles.`);
  }
  return entry;
}

function buildTransitionMetrics({
  fromTopY,
  toTopY,
  gravity,
  jumpSpeed,
  forwardSpeed,
  tileSizePx,
}) {
  const landingOffsetPx = (toTopY - fromTopY) * tileSizePx;
  const jumpProfile = getJumpProfile({
    gravity,
    jumpSpeed,
    tileSizePx,
    landingOffsetPx,
  });
  const exactDistanceTiles = (forwardSpeed * jumpProfile.flightFrames) / tileSizePx;

  return {
    landingOffsetPx,
    riseTiles: fromTopY - toTopY,
    flightFrames: jumpProfile.flightFrames,
    exactDistanceTiles,
    safeDistanceTiles: Math.max(1, Math.floor(exactDistanceTiles * 0.8)),
  };
}

function comparePlacementCandidates(left, right) {
  return (
    left.xStart - right.xStart ||
    left.topY - right.topY ||
    left.widthTiles - right.widthTiles
  );
}

function summarizePlacementCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const xStarts = candidates.map((candidate) => candidate.xStart);
  const xEnds = candidates.map((candidate) => candidate.xEnd);
  const widths = candidates.map((candidate) => candidate.widthTiles);
  const topYs = candidates.map((candidate) => candidate.topY);

  return {
    count: candidates.length,
    minXStart: Math.min(...xStarts),
    maxXStart: Math.max(...xStarts),
    minXEnd: Math.min(...xEnds),
    maxXEnd: Math.max(...xEnds),
    minWidthTiles: Math.min(...widths),
    maxWidthTiles: Math.max(...widths),
    minTopY: Math.min(...topYs),
    maxTopY: Math.max(...topYs),
  };
}

function selectPlacementCandidate(rng, candidates, {
  placementJitter,
  preferNarrower = false,
  preferWider = false,
  preferHigher = false,
  preferLower = false,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('selectPlacementCandidate requires at least one candidate.');
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const sorted = [...candidates].sort(comparePlacementCandidates);
  const minWidth = Math.min(...sorted.map((candidate) => candidate.widthTiles));
  const maxWidth = Math.max(...sorted.map((candidate) => candidate.widthTiles));
  const minTopY = Math.min(...sorted.map((candidate) => candidate.topY));
  const maxTopY = Math.max(...sorted.map((candidate) => candidate.topY));
  const minXStart = sorted[0].xStart;
  const maxXStart = sorted.at(-1).xStart;
  const widthSpan = Math.max(1, maxWidth - minWidth);
  const topSpan = Math.max(1, maxTopY - minTopY);
  const xSpan = Math.max(1, maxXStart - minXStart);

  let bestCandidate = null;
  let bestScore = -Infinity;

  for (const candidate of sorted) {
    let score = randomUnit(rng) * 0.5;
    const xPosition = (candidate.xStart - minXStart) / xSpan;
    const centerPreference = 1 - Math.abs(xPosition - 0.5) * 2;
    const edgePreference = Math.abs(xPosition - 0.5) * 2;
    score += centerPreference * (1 - placementJitter);
    score += edgePreference * placementJitter;

    if (preferNarrower) {
      score += (maxWidth - candidate.widthTiles) / widthSpan;
    }
    if (preferWider) {
      score += (candidate.widthTiles - minWidth) / widthSpan;
    }
    if (preferHigher) {
      score += (maxTopY - candidate.topY) / topSpan;
    }
    if (preferLower) {
      score += (candidate.topY - minTopY) / topSpan;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function validateAnchorChain({
  tiles,
  anchors,
  transitionTypes,
  currentLeftX,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
}) {
  if (!Array.isArray(anchors) || anchors.length < 2) {
    throw new Error('validateAnchorChain requires at least two anchors.');
  }
  if (!Array.isArray(transitionTypes) || transitionTypes.length !== anchors.length - 1) {
    throw new Error('validateAnchorChain requires one transition type per anchor hop.');
  }

  let runningLeftX = currentLeftX;
  const transitions = [];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const result = findReachableTransition({
      tiles,
      fromAnchor: anchors[index],
      toAnchor: anchors[index + 1],
      gravity,
      forwardSpeed,
      jumpSpeed,
      playerWidthPx,
      playerHeightPx,
      tileSizePx,
      transitionType: transitionTypes[index],
      currentLeftX: runningLeftX,
    });
    transitions.push(result);
    runningLeftX = result.leftX;
  }

  return {
    transitions,
    finalLeftX: runningLeftX,
  };
}

function enumerateReachableAnchorPlacements({
  tiles,
  sourceAnchor,
  currentLeftX,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
  tileSizePx,
  supportType,
  widthTilesMin,
  widthTilesMax,
  topYMin,
  topYMax,
  xStartMin = null,
  xStartMax = null,
  tileId = TILE_IDS.SOLID,
  fillTileId = null,
}) {
  if (!Number.isInteger(widthTilesMin) || !Number.isInteger(widthTilesMax) || widthTilesMin < 1 || widthTilesMax < widthTilesMin) {
    throw new Error(`Invalid width range [${widthTilesMin}, ${widthTilesMax}].`);
  }
  if (!Number.isInteger(topYMin) || !Number.isInteger(topYMax) || topYMax < topYMin) {
    throw new Error(`Invalid topY range [${topYMin}, ${topYMax}].`);
  }
  if (!['solid', 'platform'].includes(supportType)) {
    throw new Error(`Unsupported supportType "${supportType}".`);
  }

  const mapWidth = tiles[0].length;
  const candidates = [];

  for (let topY = topYMin; topY <= topYMax; topY += 1) {
    let transitionMetrics = null;
    try {
      transitionMetrics = buildTransitionMetrics({
        fromTopY: sourceAnchor.topY,
        toTopY: topY,
        gravity,
        jumpSpeed,
        forwardSpeed,
        tileSizePx,
      });
    } catch (error) {
      continue;
    }

    for (let widthTiles = widthTilesMin; widthTiles <= widthTilesMax; widthTiles += 1) {
      const candidateXStartMin = xStartMin ?? (sourceAnchor.xEnd + 2);
      const candidateXStartMax = xStartMax ?? Math.min(
        mapWidth - widthTiles,
        sourceAnchor.xEnd + Math.ceil(transitionMetrics.exactDistanceTiles) + widthTiles + 2,
      );
      const effectiveXStartMax = Math.min(
        candidateXStartMax,
        sourceAnchor.xEnd + Math.ceil(transitionMetrics.exactDistanceTiles) + widthTiles + 2,
      );

      if (effectiveXStartMax < candidateXStartMin) {
        continue;
      }

      for (let xStart = candidateXStartMin; xStart <= effectiveXStartMax; xStart += 1) {
        const xEnd = xStart + widthTiles - 1;
        if (xEnd >= mapWidth || xEnd <= sourceAnchor.xEnd) {
          continue;
        }

        const anchor = {
          id: -1,
          xStart,
          xEnd,
          topY,
          supportType,
        };
        const previewTiles = cloneTiles(tiles);
        paintAnchorSpec(previewTiles, {
          ...anchor,
          tileId,
          fillTileId,
        });

        const transitionType = topY > sourceAnchor.topY ? 'drop' : 'jump';

        try {
          const transition = findReachableTransition({
            tiles: previewTiles,
            fromAnchor: sourceAnchor,
            toAnchor: anchor,
            gravity,
            forwardSpeed,
            jumpSpeed,
            playerWidthPx,
            playerHeightPx,
            tileSizePx,
            transitionType,
            currentLeftX,
          });

          candidates.push({
            anchor,
            xStart,
            xEnd,
            topY,
            supportType,
            widthTiles,
            transitionType,
            transition,
            transitionMetrics,
            tileId,
            fillTileId,
          });
        } catch (error) {
          continue;
        }
      }
    }
  }

  candidates.sort(comparePlacementCandidates);
  return candidates;
}

function appendFlatRun(state, {
  minLength = 10,
  maxLength = 18,
  type = SEGMENT_TYPES.FLAT_RUN,
}) {
  ensureRemainingColumns(state, minLength, type);
  const remaining = remainingColumnsBeforeFinish(state);
  const length = randomIntInclusive(
    state.rng,
    minLength,
    Math.min(maxLength, remaining),
  );
  const extension = extendCurrentAnchor(state, length);
  addSegment(
    state.routeMetadata,
    type,
    extension.xStart,
    extension.xEnd,
    [state.currentAnchor.id],
    {
      topY: state.currentAnchor.topY,
    },
  );
}

function appendSpikeTrench(state) {
  ensureRemainingColumns(
    state,
    state.movementProfile.safeSpikeSpanTiles + state.movementProfile.landingWidthTiles + 2,
    SEGMENT_TYPES.SPIKE_TRENCH,
  );

  const spikeWidth = randomIntInclusive(
    state.rng,
    1,
    Math.min(4, state.movementProfile.safeSpikeSpanTiles),
  );
  const landingWidth = state.movementProfile.landingWidthTiles + randomIntInclusive(state.rng, 2, 4);
  const trenchStart = state.currentAnchor.xEnd + 1;
  const trenchEnd = trenchStart + spikeWidth - 1;
  const landingStart = trenchEnd + 1;
  const landingEnd = landingStart + landingWidth - 1;
  const previousAnchorId = state.currentAnchor.id;

  paintSpikeStrip(state.tiles, trenchStart, trenchEnd, state.currentAnchor.topY);
  const landingAnchor = addAnchor(state, {
    xStart: landingStart,
    xEnd: landingEnd,
    topY: state.currentAnchor.topY,
    supportType: 'solid',
  });
  const transition = commitTransitionToAnchor(
    state,
    { ...state.routeMetadata.anchors[previousAnchorId] },
    landingAnchor,
    'jump',
  );

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.SPIKE_TRENCH,
    trenchStart,
    landingEnd,
    [previousAnchorId, landingAnchor.id],
    {
      spikeWidth,
      topY: landingAnchor.topY,
      takeoffLeftX: transition.takeoffLeftX,
    },
  );
}

function appendPit(state) {
  ensureRemainingColumns(
    state,
    state.movementProfile.safeGapTiles + state.movementProfile.landingWidthTiles + 2,
    SEGMENT_TYPES.PIT,
  );

  const gapWidth = randomIntInclusive(
    state.rng,
    2,
    Math.min(4, state.movementProfile.safeGapTiles),
  );
  const landingWidth = state.movementProfile.landingWidthTiles + randomIntInclusive(state.rng, 2, 4);
  const gapStart = state.currentAnchor.xEnd + 1;
  const gapEnd = gapStart + gapWidth - 1;
  const minDropTiles = state.currentAnchor.topY <= state.minTopY + 1 ? 1 : 0;
  const landingTopY = clamp(
    state.currentAnchor.topY + randomIntInclusive(
      state.rng,
      minDropTiles,
      Math.min(3, getMaxDropPerStep(state)),
    ),
    state.minTopY,
    state.maxTopY,
  );
  const landingStart = gapEnd + 1;
  const landingEnd = landingStart + landingWidth - 1;

  paintLava(state.tiles, gapStart, gapEnd, 2);
  const previousAnchorId = state.currentAnchor.id;
  const landingAnchor = addAnchor(state, {
    xStart: landingStart,
    xEnd: landingEnd,
    topY: landingTopY,
    supportType: 'solid',
  });
  const transition = commitTransitionToAnchor(
    state,
    { ...state.routeMetadata.anchors[previousAnchorId] },
    landingAnchor,
    'jump',
  );

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.PIT,
    gapStart,
    landingEnd,
    [previousAnchorId, landingAnchor.id],
    {
      gapWidth,
      landingTopY,
      dropTiles: landingTopY - state.routeMetadata.anchors[previousAnchorId].topY,
      takeoffLeftX: transition.takeoffLeftX,
    },
  );
}

function appendRaisedLedge(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const riseChoices = pickRiseEntry(
    state.movementProfile,
    1,
    Math.min(3, state.movementProfile.safeRiseTiles || 1),
  );
  const maxXEnd = state.width - state.finalRunLength - 1;
  const candidateGroups = [];

  for (const riseEntry of riseChoices) {
    const landingTopY = clamp(
      previousAnchor.topY - riseEntry.riseTiles,
      state.minTopY,
      state.maxTopY,
    );
    const candidates = enumerateReachableAnchorPlacements({
      tiles: state.tiles,
      sourceAnchor: previousAnchor,
      currentLeftX: previousLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.landingWidthTiles,
      widthTilesMax: state.movementProfile.landingWidthTiles + 3,
      topYMin: landingTopY,
      topYMax: landingTopY,
      xStartMin: previousAnchor.xEnd + 2,
      xStartMax: maxXEnd - state.movementProfile.landingWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    }).map((candidate) => ({
      ...candidate,
      riseTiles: riseEntry.riseTiles,
    }));
    if (candidates.length > 0) {
      candidateGroups.push({
        riseTiles: riseEntry.riseTiles,
        candidates,
      });
    }
  }

  const allCandidates = candidateGroups.flatMap((group) => group.candidates);
  if (allCandidates.length === 0) {
    throw new Error('Raised ledge builder could not find any reachable ledge placements.');
  }

  const selected = selectPlacementCandidate(state.rng, allCandidates, {
    placementJitter: state.variation.placementJitter,
    preferHigher: true,
    preferWider: true,
  });
  const gapStart = previousAnchor.xEnd + 1;
  const gapEnd = selected.xStart - 1;
  ensureRemainingColumns(
    state,
    selected.xEnd - previousAnchor.xEnd,
    SEGMENT_TYPES.RAISED_LEDGE,
  );

  if (gapEnd >= gapStart) {
    paintLava(state.tiles, gapStart, gapEnd, 2);
  }

  const landingAnchor = addAnchor(state, {
    xStart: selected.xStart,
    xEnd: selected.xEnd,
    topY: selected.topY,
    supportType: 'solid',
    tileId: TILE_IDS.ACCENT,
    fillTileId: TILE_IDS.ACCENT,
  });
  state.currentLeftX = previousLeftX;
  const transition = commitTransitionToAnchor(state, previousAnchor, landingAnchor, 'jump');

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.RAISED_LEDGE,
    gapStart,
    landingAnchor.xEnd,
    [previousAnchor.id, landingAnchor.id],
    {
      riseTiles: selected.riseTiles,
      gapWidth: selected.xStart - previousAnchor.xEnd - 1,
      landingWidthTiles: selected.widthTiles,
      placementWindow: summarizePlacementCandidates(allCandidates),
      selectedPlacement: {
        xStart: selected.xStart,
        xEnd: selected.xEnd,
        topY: selected.topY,
        takeoffLeftX: transition.takeoffLeftX,
      },
    },
  );
}

function appendClimbTower(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const maxSegmentXEnd = state.width - state.finalRunLength - 1;
  const verticalPush = Math.max(state.variation.aerialDensity, state.variation.precisionBias);
  const perStepRiseCap = Math.max(
    1,
    Math.min(getMaxRisePerStep(state), 1 + Math.floor(verticalPush * 2)),
  );
  const maxTowerSteps = Math.max(
    2,
    Math.min(5, 2 + Math.floor(verticalPush * 3), 2 + Math.floor(state.verticalCapacityTiles / 4)),
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const towerStepCount = randomIntInclusive(
      state.rng,
      Math.min(2, maxTowerSteps),
      maxTowerSteps,
    );
    const scratchTiles = cloneTiles(state.tiles);
    const plannedSteps = [];
    const placementWindows = [];
    let scratchSourceAnchor = previousAnchor;
    let scratchLeftX = previousLeftX;
    let failed = false;

    for (let stepIndex = 0; stepIndex < towerStepCount; stepIndex += 1) {
      const remainingSteps = towerStepCount - stepIndex - 1;
      const reserveColumns = (
        remainingSteps * (state.movementProfile.narrowPlatformWidthTiles + 3) +
        state.movementProfile.widePlatformWidthTiles + 6
      );
      const supportType = stepIndex === towerStepCount - 1 && randomUnit(state.rng) < 0.35
        ? 'solid'
        : 'platform';
      const xStartMax = maxSegmentXEnd - reserveColumns;
      const topYMin = clamp(
        scratchSourceAnchor.topY - perStepRiseCap,
        state.minTopY,
        state.maxTopY,
      );
      const topYMax = clamp(
        scratchSourceAnchor.topY - (stepIndex === 0 ? 1 : 0),
        state.minTopY,
        state.maxTopY,
      );
      const candidates = enumerateReachableAnchorPlacements({
        tiles: scratchTiles,
        sourceAnchor: scratchSourceAnchor,
        currentLeftX: scratchLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
        supportType,
        widthTilesMin: state.movementProfile.narrowPlatformWidthTiles,
        widthTilesMax: verticalPush >= 0.7
          ? state.movementProfile.widePlatformWidthTiles + 1
          : state.movementProfile.mediumPlatformWidthTiles,
        topYMin,
        topYMax,
        xStartMin: Math.max(
          previousAnchor.xStart,
          scratchSourceAnchor.xStart - (state.movementProfile.widePlatformWidthTiles + 1),
        ),
        xStartMax,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });

      if (candidates.length === 0) {
        failed = true;
        break;
      }

      placementWindows.push(summarizePlacementCandidates(candidates));
      let selectableCandidates = candidates;
      const backtrackingCandidates = candidates.filter((candidate) => candidate.xStart < scratchSourceAnchor.xStart);
      if (
        stepIndex > 0 &&
        backtrackingCandidates.length > 0 &&
        verticalPush >= 0.7 &&
        randomUnit(state.rng) < 0.65
      ) {
        selectableCandidates = backtrackingCandidates;
      }
      const selected = selectPlacementCandidate(state.rng, selectableCandidates, {
        placementJitter: state.variation.placementJitter,
        preferNarrower: true,
        preferHigher: true,
      });
      paintAnchorSpec(scratchTiles, {
        ...selected.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      plannedSteps.push({
        ...selected,
        supportType,
        isBacktrackStep: selected.xStart < scratchSourceAnchor.xStart,
      });
      scratchSourceAnchor = selected.anchor;
      scratchLeftX = selected.transition.leftX;
    }

    if (failed) {
      continue;
    }

    const landingCandidates = enumerateReachableAnchorPlacements({
      tiles: scratchTiles,
      sourceAnchor: scratchSourceAnchor,
      currentLeftX: scratchLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.mediumPlatformWidthTiles,
      widthTilesMax: state.movementProfile.widePlatformWidthTiles + 1,
      topYMin: clamp(
        scratchSourceAnchor.topY - Math.max(0, perStepRiseCap - 1),
        state.minTopY,
        state.maxTopY,
      ),
      topYMax: scratchSourceAnchor.topY,
      xStartMin: scratchSourceAnchor.xEnd + 2,
      xStartMax: maxSegmentXEnd - state.movementProfile.mediumPlatformWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    const minSegmentRiseTiles = verticalPush >= 0.75 ? 2 : 1;
    const meaningfulLandingCandidates = landingCandidates.filter((candidate) => (
      previousAnchor.topY - candidate.topY >= minSegmentRiseTiles
    ));
    const selectableLandingCandidates = meaningfulLandingCandidates.length > 0
      ? meaningfulLandingCandidates
      : landingCandidates;

    if (selectableLandingCandidates.length === 0) {
      continue;
    }

    const landingSelection = selectPlacementCandidate(state.rng, selectableLandingCandidates, {
      placementJitter: state.variation.placementJitter,
      preferWider: true,
      preferHigher: true,
    });
    const fieldStart = previousAnchor.xEnd + 1;
    const segmentAnchors = [
      previousAnchor,
      ...plannedSteps.map((step) => step.anchor),
      landingSelection.anchor,
    ];
    const transitionTypes = [
      ...plannedSteps.map((step) => step.transitionType),
      landingSelection.transitionType,
    ];

    paintLava(scratchTiles, fieldStart, landingSelection.xEnd, 2);
    for (const step of plannedSteps) {
      paintAnchorSpec(scratchTiles, {
        ...step.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
    }
    paintAnchorSpec(scratchTiles, {
      ...landingSelection.anchor,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    let chainValidation = null;
    try {
      chainValidation = validateAnchorChain({
        tiles: scratchTiles,
        anchors: segmentAnchors,
        transitionTypes,
        currentLeftX: previousLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
      });
    } catch (error) {
      continue;
    }

    ensureRemainingColumns(
      state,
      landingSelection.xEnd - previousAnchor.xEnd,
      SEGMENT_TYPES.CLIMB_TOWER,
    );

    paintLava(state.tiles, fieldStart, landingSelection.xEnd, 2);
    state.currentLeftX = previousLeftX;

    const anchorIds = [previousAnchor.id];
    const realizedTransitions = [];
    let runningAnchor = previousAnchor;

    for (const step of plannedSteps) {
      const anchor = addAnchor(state, {
        xStart: step.xStart,
        xEnd: step.xEnd,
        topY: step.topY,
        supportType: step.supportType,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      const transition = commitTransitionToAnchor(state, runningAnchor, anchor, step.transitionType);
      realizedTransitions.push(transition);
      anchorIds.push(anchor.id);
      runningAnchor = anchor;
    }

    const landingAnchor = addAnchor(state, {
      xStart: landingSelection.xStart,
      xEnd: landingSelection.xEnd,
      topY: landingSelection.topY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    const landingTransition = commitTransitionToAnchor(
      state,
      runningAnchor,
      landingAnchor,
      landingSelection.transitionType,
    );
    realizedTransitions.push(landingTransition);
    anchorIds.push(landingAnchor.id);

    addSegment(
      state.routeMetadata,
      SEGMENT_TYPES.CLIMB_TOWER,
      fieldStart,
      landingAnchor.xEnd,
      anchorIds,
      {
        towerStepCount,
        totalRiseTiles: previousAnchor.topY - landingAnchor.topY,
        platformTopYs: plannedSteps.map((step) => step.topY),
        platformWidths: plannedSteps.map((step) => step.widthTiles),
        supportTypes: plannedSteps.map((step) => step.supportType),
        backtrackStepCount: plannedSteps.filter((step) => step.isBacktrackStep).length,
        placementWindows,
        landingPlacementWindow: summarizePlacementCandidates(selectableLandingCandidates),
        selectedTakeoffs: realizedTransitions.map((transition) => transition.takeoffLeftX),
        validationTakeoffs: chainValidation.transitions.map((transition) => transition.takeoffLeftX),
      },
    );
    return;
  }

  throw new Error('Climb tower builder failed to produce a validated vertical ascent.');
}

function appendDropShaft(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const maxSegmentXEnd = state.width - state.finalRunLength - 1;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const dropStepCount = randomIntInclusive(
      state.rng,
      2,
      Math.min(3, 2 + Math.floor(state.verticalCapacityTiles / 6)),
    );
    const scratchTiles = cloneTiles(state.tiles);
    const plannedDrops = [];
    const placementWindows = [];
    let scratchSourceAnchor = previousAnchor;
    let scratchLeftX = previousLeftX;
    let failed = false;

    for (let stepIndex = 0; stepIndex < dropStepCount; stepIndex += 1) {
      const remainingSteps = dropStepCount - stepIndex - 1;
      const reserveColumns = (
        remainingSteps * (state.movementProfile.landingWidthTiles + 3) +
        state.movementProfile.widePlatformWidthTiles + 6
      );
      const supportType = stepIndex === dropStepCount - 1 && randomUnit(state.rng) < 0.5
        ? 'solid'
        : 'platform';
      const xStartMax = maxSegmentXEnd - reserveColumns;
      const topYMin = clamp(
        scratchSourceAnchor.topY + 1,
        state.minTopY,
        state.maxTopY,
      );
      const topYMax = clamp(
        scratchSourceAnchor.topY + Math.min(4, getMaxDropPerStep(state) + 1),
        state.minTopY,
        state.maxTopY,
      );
      const candidates = enumerateReachableAnchorPlacements({
        tiles: scratchTiles,
        sourceAnchor: scratchSourceAnchor,
        currentLeftX: scratchLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
        supportType,
        widthTilesMin: state.movementProfile.narrowPlatformWidthTiles,
        widthTilesMax: state.movementProfile.mediumPlatformWidthTiles + 2,
        topYMin,
        topYMax,
        xStartMin: scratchSourceAnchor.xEnd + 1,
        xStartMax,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });

      if (candidates.length === 0) {
        failed = true;
        break;
      }

      placementWindows.push(summarizePlacementCandidates(candidates));
      const selected = selectPlacementCandidate(state.rng, candidates, {
        placementJitter: state.variation.placementJitter,
        preferNarrower: supportType === 'platform',
        preferLower: true,
      });
      paintAnchorSpec(scratchTiles, {
        ...selected.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      plannedDrops.push({
        ...selected,
        supportType,
      });
      scratchSourceAnchor = selected.anchor;
      scratchLeftX = selected.transition.leftX;
    }

    if (failed) {
      continue;
    }

    const landingCandidates = enumerateReachableAnchorPlacements({
      tiles: scratchTiles,
      sourceAnchor: scratchSourceAnchor,
      currentLeftX: scratchLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.mediumPlatformWidthTiles + 1,
      widthTilesMax: state.movementProfile.widePlatformWidthTiles + 2,
      topYMin: scratchSourceAnchor.topY,
      topYMax: clamp(scratchSourceAnchor.topY + Math.min(3, getMaxDropPerStep(state)), state.minTopY, state.maxTopY),
      xStartMin: scratchSourceAnchor.xEnd + 1,
      xStartMax: maxSegmentXEnd - state.movementProfile.widePlatformWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    const minSegmentDropTiles = state.variation.aerialDensity >= 0.75 ? 2 : 1;
    const meaningfulLandingCandidates = landingCandidates.filter((candidate) => (
      candidate.topY - previousAnchor.topY >= minSegmentDropTiles
    ));
    const selectableLandingCandidates = meaningfulLandingCandidates.length > 0
      ? meaningfulLandingCandidates
      : landingCandidates;

    if (selectableLandingCandidates.length === 0) {
      continue;
    }

    const landingSelection = selectPlacementCandidate(state.rng, selectableLandingCandidates, {
      placementJitter: state.variation.placementJitter,
      preferWider: true,
      preferLower: true,
    });
    const fieldStart = previousAnchor.xEnd + 1;
    const segmentAnchors = [
      previousAnchor,
      ...plannedDrops.map((drop) => drop.anchor),
      landingSelection.anchor,
    ];
    const transitionTypes = [
      ...plannedDrops.map((drop) => drop.transitionType),
      landingSelection.transitionType,
    ];

    paintLava(scratchTiles, fieldStart, landingSelection.xEnd, 2);
    for (const drop of plannedDrops) {
      paintAnchorSpec(scratchTiles, {
        ...drop.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
    }
    paintAnchorSpec(scratchTiles, {
      ...landingSelection.anchor,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    let chainValidation = null;
    try {
      chainValidation = validateAnchorChain({
        tiles: scratchTiles,
        anchors: segmentAnchors,
        transitionTypes,
        currentLeftX: previousLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
      });
    } catch (error) {
      continue;
    }

    ensureRemainingColumns(
      state,
      landingSelection.xEnd - previousAnchor.xEnd,
      SEGMENT_TYPES.DROP_SHAFT,
    );

    paintLava(state.tiles, fieldStart, landingSelection.xEnd, 2);
    state.currentLeftX = previousLeftX;

    const anchorIds = [previousAnchor.id];
    const realizedTransitions = [];
    let runningAnchor = previousAnchor;

    for (const drop of plannedDrops) {
      const anchor = addAnchor(state, {
        xStart: drop.xStart,
        xEnd: drop.xEnd,
        topY: drop.topY,
        supportType: drop.supportType,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      const transition = commitTransitionToAnchor(state, runningAnchor, anchor, drop.transitionType);
      realizedTransitions.push(transition);
      anchorIds.push(anchor.id);
      runningAnchor = anchor;
    }

    const landingAnchor = addAnchor(state, {
      xStart: landingSelection.xStart,
      xEnd: landingSelection.xEnd,
      topY: landingSelection.topY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    const landingTransition = commitTransitionToAnchor(
      state,
      runningAnchor,
      landingAnchor,
      landingSelection.transitionType,
    );
    realizedTransitions.push(landingTransition);
    anchorIds.push(landingAnchor.id);

    addSegment(
      state.routeMetadata,
      SEGMENT_TYPES.DROP_SHAFT,
      fieldStart,
      landingAnchor.xEnd,
      anchorIds,
      {
        dropStepCount,
        totalDropTiles: landingAnchor.topY - previousAnchor.topY,
        platformTopYs: plannedDrops.map((drop) => drop.topY),
        platformWidths: plannedDrops.map((drop) => drop.widthTiles),
        supportTypes: plannedDrops.map((drop) => drop.supportType),
        placementWindows,
        landingPlacementWindow: summarizePlacementCandidates(selectableLandingCandidates),
        selectedTakeoffs: realizedTransitions.map((transition) => transition.takeoffLeftX),
        validationTakeoffs: chainValidation.transitions.map((transition) => transition.takeoffLeftX),
      },
    );
    return;
  }

  throw new Error('Drop shaft builder failed to produce a validated descent.');
}

function appendPrecisionPlatformRun(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const maxSegmentXEnd = state.width - state.finalRunLength - 1;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const platformCount = randomIntInclusive(state.rng, 3, 6);
    const scratchTiles = cloneTiles(state.tiles);
    const plannedPlatforms = [];
    const placementWindows = [];
    let scratchSourceAnchor = previousAnchor;
    let scratchLeftX = previousLeftX;
    let failed = false;

    for (let platformIndex = 0; platformIndex < platformCount; platformIndex += 1) {
      const remainingPlatforms = platformCount - platformIndex - 1;
      const reserveColumns = (
        remainingPlatforms * (state.movementProfile.narrowPlatformWidthTiles + 2) +
        state.movementProfile.widePlatformWidthTiles + 4
      );
      const xStartMax = maxSegmentXEnd - reserveColumns;
      const candidates = enumerateReachableAnchorPlacements({
        tiles: scratchTiles,
        sourceAnchor: scratchSourceAnchor,
        currentLeftX: scratchLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
        supportType: 'platform',
        widthTilesMin: state.movementProfile.narrowPlatformWidthTiles,
        widthTilesMax: state.movementProfile.mediumPlatformWidthTiles,
        topYMin: clamp(scratchSourceAnchor.topY - getMaxRisePerStep(state), state.minTopY, state.maxTopY),
        topYMax: clamp(scratchSourceAnchor.topY + Math.min(2, getMaxDropPerStep(state)), state.minTopY, state.maxTopY),
        xStartMin: scratchSourceAnchor.xEnd + 2,
        xStartMax,
      });

      if (candidates.length === 0) {
        failed = true;
        break;
      }

      placementWindows.push(summarizePlacementCandidates(candidates));
      let selectableCandidates = candidates;
      if (plannedPlatforms.length > 0) {
        const previousPlatform = plannedPlatforms.at(-1);
        const variedCandidates = candidates.filter((candidate) => (
          candidate.topY !== previousPlatform.topY ||
          candidate.widthTiles !== previousPlatform.widthTiles
        ));
        if (variedCandidates.length > 0) {
          selectableCandidates = variedCandidates;
        }
      }
      const preferLower = scratchSourceAnchor.topY <= state.minTopY + 1;
      const selected = selectPlacementCandidate(state.rng, selectableCandidates, {
        placementJitter: state.variation.placementJitter,
        preferNarrower: state.variation.precisionBias >= 0.4,
        preferHigher: !preferLower && state.variation.precisionBias >= 0.6,
        preferLower,
      });
      paintAnchorSpec(scratchTiles, {
        ...selected.anchor,
      });
      plannedPlatforms.push(selected);
      scratchSourceAnchor = selected.anchor;
      scratchLeftX = selected.transition.leftX;
    }

    if (failed) {
      continue;
    }

    const landingCandidates = enumerateReachableAnchorPlacements({
      tiles: scratchTiles,
      sourceAnchor: scratchSourceAnchor,
      currentLeftX: scratchLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.mediumPlatformWidthTiles,
      widthTilesMax: state.movementProfile.widePlatformWidthTiles + 1,
      topYMin: clamp(scratchSourceAnchor.topY - 1, state.minTopY, state.maxTopY),
      topYMax: clamp(scratchSourceAnchor.topY + Math.min(2, getMaxDropPerStep(state)), state.minTopY, state.maxTopY),
      xStartMin: scratchSourceAnchor.xEnd + 2,
      xStartMax: maxSegmentXEnd - state.movementProfile.mediumPlatformWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    if (landingCandidates.length === 0) {
      continue;
    }

    const landingSelection = selectPlacementCandidate(state.rng, landingCandidates, {
      placementJitter: state.variation.placementJitter,
      preferWider: true,
      preferLower: true,
    });

    if (landingSelection.xEnd > maxSegmentXEnd) {
      continue;
    }

    const fieldStart = previousAnchor.xEnd + 1;
    const segmentAnchors = [
      previousAnchor,
      ...plannedPlatforms.map((platform) => platform.anchor),
      landingSelection.anchor,
    ];
    const transitionTypes = [
      ...plannedPlatforms.map((platform) => platform.transitionType),
      landingSelection.transitionType,
    ];

    paintLava(scratchTiles, fieldStart, landingSelection.xEnd, 2);
    for (const platform of plannedPlatforms) {
      paintAnchorSpec(scratchTiles, platform.anchor);
    }
    paintAnchorSpec(scratchTiles, {
      ...landingSelection.anchor,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    let chainValidation = null;
    try {
      chainValidation = validateAnchorChain({
        tiles: scratchTiles,
        anchors: segmentAnchors,
        transitionTypes,
        currentLeftX: previousLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
      });
    } catch (error) {
      continue;
    }

    ensureRemainingColumns(
      state,
      landingSelection.xEnd - previousAnchor.xEnd,
      SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    );

    paintLava(state.tiles, fieldStart, landingSelection.xEnd, 2);
    state.currentLeftX = previousLeftX;

    const anchorIds = [previousAnchor.id];
    const realizedTransitions = [];
    let runningAnchor = previousAnchor;

    for (const platform of plannedPlatforms) {
      const anchor = addAnchor(state, {
        xStart: platform.xStart,
        xEnd: platform.xEnd,
        topY: platform.topY,
        supportType: 'platform',
      });
      const transition = commitTransitionToAnchor(state, runningAnchor, anchor, platform.transitionType);
      realizedTransitions.push(transition);
      anchorIds.push(anchor.id);
      runningAnchor = anchor;
    }

    const landingAnchor = addAnchor(state, {
      xStart: landingSelection.xStart,
      xEnd: landingSelection.xEnd,
      topY: landingSelection.topY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    const landingTransition = commitTransitionToAnchor(
      state,
      runningAnchor,
      landingAnchor,
      landingSelection.transitionType,
    );
    realizedTransitions.push(landingTransition);
    anchorIds.push(landingAnchor.id);

    addSegment(
      state.routeMetadata,
      SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
      fieldStart,
      landingAnchor.xEnd,
      anchorIds,
      {
        platformCount,
        platformTopYs: plannedPlatforms.map((platform) => platform.topY),
        platformWidths: plannedPlatforms.map((platform) => platform.widthTiles),
        platformTransitionTypes: plannedPlatforms.map((platform) => platform.transitionType),
        placementWindows,
        landingPlacementWindow: summarizePlacementCandidates(landingCandidates),
        selectedTakeoffs: realizedTransitions.map((transition) => transition.takeoffLeftX),
        validationTakeoffs: chainValidation.transitions.map((transition) => transition.takeoffLeftX),
      },
    );
    return;
  }

  throw new Error('Precision platform run builder failed to produce a validated airborne chain.');
}

function appendStairUp(state) {
  const riseChoices = pickRiseEntry(state.movementProfile, 1, 1);
  const riseEntry = randomChoice(state.rng, riseChoices);
  const stepCount = randomIntInclusive(state.rng, 2, 3);
  const anchorIds = [state.currentAnchor.id];
  const segmentStart = state.currentAnchor.xEnd + 1;
  let segmentEnd = segmentStart - 1;

  ensureRemainingColumns(
    state,
    stepCount * (state.movementProfile.landingWidthTiles + 2),
    SEGMENT_TYPES.STAIR_UP,
  );

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const gapWidth = randomIntInclusive(
      state.rng,
      1,
      Math.min(2, riseEntry.safeDistanceTiles),
    );
    const platformWidth = state.movementProfile.landingWidthTiles + randomIntInclusive(state.rng, 0, 1);
    const gapStart = state.currentAnchor.xEnd + 1;
    const gapEnd = gapStart + gapWidth - 1;
    const nextTopY = clamp(state.currentAnchor.topY - 1, state.minTopY, state.maxTopY);
    const anchorStart = gapEnd + 1;
    const anchorEnd = anchorStart + platformWidth - 1;

    segmentEnd = anchorEnd;
    const nextAnchor = addAnchor(state, {
      xStart: anchorStart,
      xEnd: anchorEnd,
      topY: nextTopY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    addTransition(state.routeMetadata, anchorIds.at(-1), nextAnchor.id, 'jump');
    anchorIds.push(nextAnchor.id);
  }

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.STAIR_UP,
    segmentStart,
    segmentEnd,
    anchorIds,
    {
      stepCount,
    },
  );
}

function appendStairDown(state) {
  const stepCount = randomIntInclusive(state.rng, 2, 3);
  const anchorIds = [state.currentAnchor.id];
  const segmentStart = state.currentAnchor.xEnd + 1;
  let segmentEnd = segmentStart - 1;

  ensureRemainingColumns(
    state,
    stepCount * (state.movementProfile.landingWidthTiles + 2),
    SEGMENT_TYPES.STAIR_DOWN,
  );

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const gapWidth = randomIntInclusive(
      state.rng,
      1,
      Math.min(2, state.movementProfile.safeGapTiles),
    );
    const platformWidth = state.movementProfile.landingWidthTiles + randomIntInclusive(state.rng, 0, 1);
    const gapStart = state.currentAnchor.xEnd + 1;
    const gapEnd = gapStart + gapWidth - 1;
    const nextTopY = clamp(state.currentAnchor.topY + 1, state.minTopY, state.maxTopY);
    const anchorStart = gapEnd + 1;
    const anchorEnd = anchorStart + platformWidth - 1;

    segmentEnd = anchorEnd;
    const nextAnchor = addAnchor(state, {
      xStart: anchorStart,
      xEnd: anchorEnd,
      topY: nextTopY,
      supportType: 'solid',
    });
    addTransition(state.routeMetadata, anchorIds.at(-1), nextAnchor.id, 'drop');
    anchorIds.push(nextAnchor.id);
  }

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.STAIR_DOWN,
    segmentStart,
    segmentEnd,
    anchorIds,
    {
      stepCount,
    },
  );
}

function appendFloatingBridge(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const maxSegmentXEnd = state.width - state.finalRunLength - 1;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const bridgePlatformCount = randomIntInclusive(state.rng, 2, 4);
    const scratchTiles = cloneTiles(state.tiles);
    const plannedPlatforms = [];
    const placementWindows = [];
    const bridgeBandMinTopY = clamp(previousAnchor.topY - Math.min(3, getMaxRisePerStep(state)), state.minTopY, state.maxTopY);
    const bridgeBandMaxTopY = clamp(previousAnchor.topY + 1, state.minTopY, state.maxTopY);
    let scratchSourceAnchor = previousAnchor;
    let scratchLeftX = previousLeftX;
    let failed = false;

    for (let platformIndex = 0; platformIndex < bridgePlatformCount; platformIndex += 1) {
      const remainingPlatforms = bridgePlatformCount - platformIndex - 1;
      const reserveColumns = (
        remainingPlatforms * (state.movementProfile.mediumPlatformWidthTiles + 2) +
        state.movementProfile.widePlatformWidthTiles + 5
      );
      const xStartMax = maxSegmentXEnd - reserveColumns;
      const candidates = enumerateReachableAnchorPlacements({
        tiles: scratchTiles,
        sourceAnchor: scratchSourceAnchor,
        currentLeftX: scratchLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
        supportType: 'platform',
        widthTilesMin: state.movementProfile.mediumPlatformWidthTiles,
        widthTilesMax: state.movementProfile.widePlatformWidthTiles,
        topYMin: bridgeBandMinTopY,
        topYMax: bridgeBandMaxTopY,
        xStartMin: scratchSourceAnchor.xEnd + 2,
        xStartMax,
      });

      if (candidates.length === 0) {
        failed = true;
        break;
      }

      placementWindows.push(summarizePlacementCandidates(candidates));
      let selectableCandidates = candidates;
      if (plannedPlatforms.length > 0) {
        const previousPlatform = plannedPlatforms.at(-1);
        const variedCandidates = candidates.filter((candidate) => (
          candidate.topY !== previousPlatform.topY ||
          candidate.widthTiles !== previousPlatform.widthTiles
        ));
        if (variedCandidates.length > 0) {
          selectableCandidates = variedCandidates;
        }
      }
      const preferLower = scratchSourceAnchor.topY <= state.minTopY + 1;
      const selected = selectPlacementCandidate(state.rng, selectableCandidates, {
        placementJitter: state.variation.placementJitter,
        preferWider: true,
        preferHigher: !preferLower && state.variation.aerialDensity >= 0.5,
        preferLower,
      });
      paintAnchorSpec(scratchTiles, selected.anchor);
      plannedPlatforms.push(selected);
      scratchSourceAnchor = selected.anchor;
      scratchLeftX = selected.transition.leftX;
    }

    if (failed) {
      continue;
    }

    const landingCandidates = enumerateReachableAnchorPlacements({
      tiles: scratchTiles,
      sourceAnchor: scratchSourceAnchor,
      currentLeftX: scratchLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.widePlatformWidthTiles,
      widthTilesMax: state.movementProfile.widePlatformWidthTiles + 2,
      topYMin: bridgeBandMinTopY,
      topYMax: clamp(bridgeBandMaxTopY + 1, state.minTopY, state.maxTopY),
      xStartMin: scratchSourceAnchor.xEnd + 2,
      xStartMax: maxSegmentXEnd - state.movementProfile.widePlatformWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    if (landingCandidates.length === 0) {
      continue;
    }

    const landingSelection = selectPlacementCandidate(state.rng, landingCandidates, {
      placementJitter: state.variation.placementJitter,
      preferWider: true,
      preferLower: true,
    });

    const fieldStart = previousAnchor.xEnd + 1;
    const segmentAnchors = [
      previousAnchor,
      ...plannedPlatforms.map((platform) => platform.anchor),
      landingSelection.anchor,
    ];
    const transitionTypes = [
      ...plannedPlatforms.map((platform) => platform.transitionType),
      landingSelection.transitionType,
    ];

    paintLava(scratchTiles, fieldStart, landingSelection.xEnd, 2);
    for (const platform of plannedPlatforms) {
      paintAnchorSpec(scratchTiles, platform.anchor);
    }
    paintAnchorSpec(scratchTiles, {
      ...landingSelection.anchor,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    let chainValidation = null;
    try {
      chainValidation = validateAnchorChain({
        tiles: scratchTiles,
        anchors: segmentAnchors,
        transitionTypes,
        currentLeftX: previousLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
      });
    } catch (error) {
      continue;
    }

    ensureRemainingColumns(
      state,
      landingSelection.xEnd - previousAnchor.xEnd,
      SEGMENT_TYPES.FLOATING_BRIDGE,
    );

    paintLava(state.tiles, fieldStart, landingSelection.xEnd, 2);
    state.currentLeftX = previousLeftX;

    const anchorIds = [previousAnchor.id];
    const realizedTransitions = [];
    let runningAnchor = previousAnchor;

    for (const platform of plannedPlatforms) {
      const anchor = addAnchor(state, {
        xStart: platform.xStart,
        xEnd: platform.xEnd,
        topY: platform.topY,
        supportType: 'platform',
      });
      const transition = commitTransitionToAnchor(state, runningAnchor, anchor, platform.transitionType);
      realizedTransitions.push(transition);
      anchorIds.push(anchor.id);
      runningAnchor = anchor;
    }

    const landingAnchor = addAnchor(state, {
      xStart: landingSelection.xStart,
      xEnd: landingSelection.xEnd,
      topY: landingSelection.topY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    const landingTransition = commitTransitionToAnchor(
      state,
      runningAnchor,
      landingAnchor,
      landingSelection.transitionType,
    );
    realizedTransitions.push(landingTransition);
    anchorIds.push(landingAnchor.id);

    addSegment(
      state.routeMetadata,
      SEGMENT_TYPES.FLOATING_BRIDGE,
      fieldStart,
      landingAnchor.xEnd,
      anchorIds,
      {
        bridgePlatformCount,
        platformTopYs: plannedPlatforms.map((platform) => platform.topY),
        platformWidths: plannedPlatforms.map((platform) => platform.widthTiles),
        gapPattern: [
          ...plannedPlatforms.map((platform, index) => (
            platform.xStart - (index === 0 ? previousAnchor.xEnd : plannedPlatforms[index - 1].xEnd) - 1
          )),
          landingSelection.xStart - plannedPlatforms.at(-1).xEnd - 1,
        ],
        placementWindows,
        landingPlacementWindow: summarizePlacementCandidates(landingCandidates),
        selectedTakeoffs: realizedTransitions.map((transition) => transition.takeoffLeftX),
        validationTakeoffs: chainValidation.transitions.map((transition) => transition.takeoffLeftX),
      },
    );
    return;
  }

  throw new Error('Floating bridge builder failed to produce a validated airborne bridge.');
}

function appendLowCeilingPassage(state) {
  const minLength = Math.max(state.movementProfile.landingWidthTiles + 4, 8);
  ensureRemainingColumns(state, minLength, SEGMENT_TYPES.LOW_CEILING_PASSAGE);
  const remaining = remainingColumnsBeforeFinish(state);
  const length = randomIntInclusive(state.rng, minLength, Math.min(minLength + 4, remaining));
  const extension = extendCurrentAnchor(state, length);
  const ceilingGapTiles = state.movementProfile.playerHeightTiles + 2;
  const ceilingY = state.currentAnchor.topY - ceilingGapTiles;

  if (ceilingY < 0) {
    throw new Error(`Low ceiling passage would place ceiling above the map at y=${ceilingY}.`);
  }

  const ceilingStart = extension.xStart + 1;
  const ceilingEnd = Math.max(ceilingStart, extension.xEnd - 4);
  paintCeiling(state.tiles, ceilingStart, ceilingEnd, ceilingY);

  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.LOW_CEILING_PASSAGE,
    extension.xStart,
    extension.xEnd,
    [state.currentAnchor.id],
    {
      topY: state.currentAnchor.topY,
      ceilingY,
    },
  );
}

function appendPillarField(state) {
  const previousAnchor = state.currentAnchor;
  const previousLeftX = state.currentLeftX;
  const maxSegmentXEnd = state.width - state.finalRunLength - 1;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const pillarCount = randomIntInclusive(state.rng, 2, 5);
    const scratchTiles = cloneTiles(state.tiles);
    const plannedPillars = [];
    const placementWindows = [];
    let scratchSourceAnchor = previousAnchor;
    let scratchLeftX = previousLeftX;
    let failed = false;

    for (let pillarIndex = 0; pillarIndex < pillarCount; pillarIndex += 1) {
      const remainingPillars = pillarCount - pillarIndex - 1;
      const reserveColumns = (
        remainingPillars * (state.movementProfile.landingWidthTiles + 3) +
        state.movementProfile.widePlatformWidthTiles + 6
      );
      const supportType = randomUnit(state.rng) < 0.4 ? 'platform' : 'solid';
      const xStartMax = maxSegmentXEnd - reserveColumns;
      const candidates = enumerateReachableAnchorPlacements({
        tiles: scratchTiles,
        sourceAnchor: scratchSourceAnchor,
        currentLeftX: scratchLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
        supportType,
        widthTilesMin: state.movementProfile.landingWidthTiles,
        widthTilesMax: state.movementProfile.mediumPlatformWidthTiles + 1,
        topYMin: clamp(scratchSourceAnchor.topY - Math.min(2, getMaxRisePerStep(state)), state.minTopY, state.maxTopY),
        topYMax: clamp(scratchSourceAnchor.topY + Math.min(2, getMaxDropPerStep(state)), state.minTopY, state.maxTopY),
        xStartMin: scratchSourceAnchor.xEnd + 2,
        xStartMax,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });

      if (candidates.length === 0) {
        failed = true;
        break;
      }

      placementWindows.push(summarizePlacementCandidates(candidates));
      const preferLower = scratchSourceAnchor.topY <= state.minTopY + 1;
      const selected = selectPlacementCandidate(state.rng, candidates, {
        placementJitter: state.variation.placementJitter,
        preferWider: supportType === 'solid',
        preferHigher: !preferLower && pillarIndex === 0,
        preferLower,
      });
      paintAnchorSpec(scratchTiles, {
        ...selected.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      plannedPillars.push({
        ...selected,
        supportType,
      });
      scratchSourceAnchor = selected.anchor;
      scratchLeftX = selected.transition.leftX;
    }

    if (failed) {
      continue;
    }

    const landingCandidates = enumerateReachableAnchorPlacements({
      tiles: scratchTiles,
      sourceAnchor: scratchSourceAnchor,
      currentLeftX: scratchLeftX,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
      tileSizePx: state.movementProfile.tileSizePx,
      supportType: 'solid',
      widthTilesMin: state.movementProfile.mediumPlatformWidthTiles + 1,
      widthTilesMax: state.movementProfile.widePlatformWidthTiles + 2,
      topYMin: clamp(scratchSourceAnchor.topY - 1, state.minTopY, state.maxTopY),
      topYMax: clamp(scratchSourceAnchor.topY + Math.min(2, getMaxDropPerStep(state)), state.minTopY, state.maxTopY),
      xStartMin: scratchSourceAnchor.xEnd + 2,
      xStartMax: maxSegmentXEnd - state.movementProfile.widePlatformWidthTiles + 1,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    if (landingCandidates.length === 0) {
      continue;
    }

    const landingSelection = selectPlacementCandidate(state.rng, landingCandidates, {
      placementJitter: state.variation.placementJitter,
      preferWider: true,
      preferLower: true,
    });
    const fieldStart = previousAnchor.xEnd + 1;
    const segmentAnchors = [
      previousAnchor,
      ...plannedPillars.map((pillar) => pillar.anchor),
      landingSelection.anchor,
    ];
    const transitionTypes = [
      ...plannedPillars.map((pillar) => pillar.transitionType),
      landingSelection.transitionType,
    ];

    paintLava(scratchTiles, fieldStart, landingSelection.xEnd, 2);
    for (const pillar of plannedPillars) {
      paintAnchorSpec(scratchTiles, {
        ...pillar.anchor,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
    }
    paintAnchorSpec(scratchTiles, {
      ...landingSelection.anchor,
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });

    let chainValidation = null;
    try {
      chainValidation = validateAnchorChain({
        tiles: scratchTiles,
        anchors: segmentAnchors,
        transitionTypes,
        currentLeftX: previousLeftX,
        gravity: state.movementProfile.gravity,
        forwardSpeed: state.movementProfile.forwardSpeed,
        jumpSpeed: state.movementProfile.jumpSpeed,
        playerWidthPx: state.movementProfile.playerWidthPx,
        playerHeightPx: state.movementProfile.playerHeightPx,
        tileSizePx: state.movementProfile.tileSizePx,
      });
    } catch (error) {
      continue;
    }

    ensureRemainingColumns(
      state,
      landingSelection.xEnd - previousAnchor.xEnd,
      SEGMENT_TYPES.PILLAR_FIELD,
    );

    paintLava(state.tiles, fieldStart, landingSelection.xEnd, 2);
    state.currentLeftX = previousLeftX;

    const anchorIds = [previousAnchor.id];
    const realizedTransitions = [];
    let runningAnchor = previousAnchor;

    for (const pillar of plannedPillars) {
      const anchor = addAnchor(state, {
        xStart: pillar.xStart,
        xEnd: pillar.xEnd,
        topY: pillar.topY,
        supportType: pillar.supportType,
        tileId: TILE_IDS.ACCENT,
        fillTileId: TILE_IDS.ACCENT,
      });
      const transition = commitTransitionToAnchor(state, runningAnchor, anchor, pillar.transitionType);
      realizedTransitions.push(transition);
      anchorIds.push(anchor.id);
      runningAnchor = anchor;
    }

    const landingAnchor = addAnchor(state, {
      xStart: landingSelection.xStart,
      xEnd: landingSelection.xEnd,
      topY: landingSelection.topY,
      supportType: 'solid',
      tileId: TILE_IDS.ACCENT,
      fillTileId: TILE_IDS.ACCENT,
    });
    const landingTransition = commitTransitionToAnchor(
      state,
      runningAnchor,
      landingAnchor,
      landingSelection.transitionType,
    );
    realizedTransitions.push(landingTransition);
    anchorIds.push(landingAnchor.id);

    addSegment(
      state.routeMetadata,
      SEGMENT_TYPES.PILLAR_FIELD,
      fieldStart,
      landingAnchor.xEnd,
      anchorIds,
      {
        pillarCount,
        pillarSupportTypes: plannedPillars.map((pillar) => pillar.supportType),
        pillarTopYs: plannedPillars.map((pillar) => pillar.topY),
        pillarWidths: plannedPillars.map((pillar) => pillar.widthTiles),
        placementWindows,
        landingPlacementWindow: summarizePlacementCandidates(landingCandidates),
        selectedTakeoffs: realizedTransitions.map((transition) => transition.takeoffLeftX),
        validationTakeoffs: chainValidation.transitions.map((transition) => transition.takeoffLeftX),
      },
    );
    return;
  }

  throw new Error('Pillar field builder failed to produce a validated pillar chain.');
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function optionalPlatformOverlapsAnchors(candidate, anchors) {
  return anchors.some((anchor) => (
    candidate.topY === anchor.topY &&
    rangesOverlap(candidate.xStart, candidate.xEnd, anchor.xStart, anchor.xEnd)
  ));
}

function optionalPlatformOverlapsOptionalPlatforms(candidate, optionalPlatforms) {
  return optionalPlatforms.some((platform) => (
    candidate.topY === platform.topY &&
    rangesOverlap(candidate.xStart, candidate.xEnd, platform.xStart, platform.xEnd)
  ));
}

function platformCellsAreEmpty(tiles, candidate) {
  for (let x = candidate.xStart; x <= candidate.xEnd; x += 1) {
    if (getTile(tiles, x, candidate.topY) !== TILE_IDS.AIR) {
      return false;
    }
  }
  return true;
}

function buildOptionalPlatformCandidates(state, segment, segmentAnchors) {
  const candidates = [];
  const seenKeys = new Set();
  const minTopY = Math.min(...segmentAnchors.map((anchor) => anchor.topY));
  const maxTopY = Math.max(...segmentAnchors.map((anchor) => anchor.topY));
  const topYValues = new Set([
    clamp(minTopY - 2, state.minTopY, state.maxTopY),
    clamp(minTopY - 1, state.minTopY, state.maxTopY),
    clamp(maxTopY + 1, state.minTopY, state.maxTopY),
    clamp(maxTopY + 2, state.minTopY, state.maxTopY),
  ]);
  const xSeeds = new Set();

  for (const anchor of segmentAnchors) {
    const anchorCenter = Math.floor((anchor.xStart + anchor.xEnd) / 2);
    xSeeds.add(anchorCenter);
    xSeeds.add(anchor.xStart);
    xSeeds.add(anchor.xEnd);
    xSeeds.add(anchor.xStart - 2);
    xSeeds.add(anchor.xEnd + 2);
    topYValues.add(anchor.topY);
    topYValues.add(clamp(anchor.topY - 1, state.minTopY, state.maxTopY));
    topYValues.add(clamp(anchor.topY + 1, state.minTopY, state.maxTopY));
  }

  for (let index = 0; index < segmentAnchors.length - 1; index += 1) {
    const gapStart = segmentAnchors[index].xEnd + 1;
    const gapEnd = segmentAnchors[index + 1].xStart - 1;
    if (gapEnd >= gapStart) {
      xSeeds.add(Math.floor((gapStart + gapEnd) / 2));
    }
  }

  for (
    let widthTiles = state.movementProfile.narrowPlatformWidthTiles;
    widthTiles <= state.movementProfile.mediumPlatformWidthTiles;
    widthTiles += 1
  ) {
    for (const topY of topYValues) {
      for (const seed of xSeeds) {
        const xStart = clamp(
          seed - Math.floor(widthTiles / 2),
          segment.xStart,
          segment.xEnd - widthTiles + 1,
        );
        const xEnd = xStart + widthTiles - 1;
        if (xStart < segment.xStart || xEnd > segment.xEnd) {
          continue;
        }

        const key = `${xStart}:${xEnd}:${topY}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        candidates.push({
          id: null,
          xStart,
          xEnd,
          topY,
          widthTiles,
          sourceSegmentType: segment.type,
        });
      }
    }
  }

  candidates.sort(comparePlacementCandidates);
  return candidates;
}

function buildBacktrackDetourCandidates(state, segment, segmentAnchors) {
  const candidates = [];

  for (const anchor of segmentAnchors.slice(1)) {
    for (
      let widthTiles = state.movementProfile.mediumPlatformWidthTiles;
      widthTiles <= state.movementProfile.widePlatformWidthTiles + 1;
      widthTiles += 1
    ) {
      for (
        let riseTiles = 1;
        riseTiles <= Math.min(2, getMaxRisePerStep(state));
        riseTiles += 1
      ) {
        const topY = clamp(anchor.topY - riseTiles, state.minTopY, state.maxTopY);
        if (topY >= anchor.topY) {
          continue;
        }

        const xEndMin = Math.min(segment.xEnd, anchor.xEnd + 1);
        const xEndMax = Math.min(segment.xEnd, anchor.xEnd + 3);

        for (let xEnd = xEndMin; xEnd <= xEndMax; xEnd += 1) {
          const xStart = xEnd - widthTiles + 1;
          if (xStart < segment.xStart || xStart >= anchor.xStart) {
            continue;
          }
          candidates.push({
            id: null,
            xStart,
            xEnd,
            topY,
            widthTiles,
            sourceSegmentType: segment.type,
            detourKind: 'backtrack_left',
            accessAnchorId: anchor.id,
          });
        }
      }
    }
  }

  candidates.sort(comparePlacementCandidates);
  return candidates;
}

function tryCommitOptionalPlatform(state, segment, candidate) {
  if (
    !platformCellsAreEmpty(state.tiles, candidate) ||
    optionalPlatformOverlapsAnchors(candidate, state.routeMetadata.anchors) ||
    optionalPlatformOverlapsOptionalPlatforms(candidate, state.routeMetadata.optionalPlatforms)
  ) {
    return null;
  }

  const previewTiles = cloneTiles(state.tiles);
  paintPlatform(previewTiles, candidate.xStart, candidate.xEnd, candidate.topY);

  try {
    validatePlatformerMap({
      tiles: previewTiles,
      routeMetadata: state.routeMetadata,
      tileSizePx: state.movementProfile.tileSizePx,
      gravity: state.movementProfile.gravity,
      forwardSpeed: state.movementProfile.forwardSpeed,
      jumpSpeed: state.movementProfile.jumpSpeed,
      playerWidthPx: state.movementProfile.playerWidthPx,
      playerHeightPx: state.movementProfile.playerHeightPx,
    });
  } catch (error) {
    return null;
  }

  paintPlatform(state.tiles, candidate.xStart, candidate.xEnd, candidate.topY);
  const optionalPlatform = {
    id: state.routeMetadata.optionalPlatforms.length,
    xStart: candidate.xStart,
    xEnd: candidate.xEnd,
    topY: candidate.topY,
    sourceSegmentType: segment.type,
    detourKind: candidate.detourKind ?? 'perch',
    accessAnchorId: candidate.accessAnchorId ?? null,
  };
  state.routeMetadata.optionalPlatforms.push(optionalPlatform);
  segment.optionalPlatformIds.push(optionalPlatform.id);
  return optionalPlatform;
}

function tryForceBacktrackDetour(state, segment, segmentAnchors) {
  for (const anchor of [...segmentAnchors.slice(1)].reverse()) {
    for (
      let widthTiles = state.movementProfile.widePlatformWidthTiles + 1;
      widthTiles >= state.movementProfile.mediumPlatformWidthTiles;
      widthTiles -= 1
    ) {
      for (
        let riseTiles = Math.min(2, getMaxRisePerStep(state));
        riseTiles >= 1;
        riseTiles -= 1
      ) {
        const topY = clamp(anchor.topY - riseTiles, state.minTopY, state.maxTopY);
        if (topY >= anchor.topY) {
          continue;
        }

        for (let rightOffset = 1; rightOffset <= 2; rightOffset += 1) {
          const xEnd = Math.min(segment.xEnd, anchor.xEnd + rightOffset);
          const xStart = xEnd - widthTiles + 1;
          if (xStart < segment.xStart || xStart >= anchor.xStart) {
            continue;
          }

          const committed = tryCommitOptionalPlatform(state, segment, {
            xStart,
            xEnd,
            topY,
            widthTiles,
            sourceSegmentType: segment.type,
            detourKind: 'backtrack_left',
            accessAnchorId: anchor.id,
          });
          if (committed) {
            return committed;
          }
        }
      }
    }
  }

  return null;
}

function appendOptionalPlatforms(state) {
  const eligibleTypes = new Set([
    SEGMENT_TYPES.RAISED_LEDGE,
    SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    SEGMENT_TYPES.FLOATING_BRIDGE,
    SEGMENT_TYPES.PILLAR_FIELD,
  ]);
  const anchorById = new Map(
    state.routeMetadata.anchors.map((anchor) => [anchor.id, anchor]),
  );

  for (const segment of state.routeMetadata.segments) {
    if (!eligibleTypes.has(segment.type)) {
      continue;
    }

    segment.optionalPlatformIds = [];
    const segmentAnchors = segment.anchorIds.map((anchorId) => {
      const anchor = anchorById.get(anchorId);
      if (!anchor) {
        throw new Error(`Segment ${segment.type} referenced missing anchor ${anchorId}.`);
      }
      return anchor;
    });

    for (let slot = 0; slot < 2; slot += 1) {
      if (randomUnit(state.rng) > state.variation.optionalPlatformDensity) {
        continue;
      }

      const baseCandidates = buildOptionalPlatformCandidates(state, segment, segmentAnchors);
      const detourCandidates = buildBacktrackDetourCandidates(state, segment, segmentAnchors);
      const dedupedCandidates = [];
      const seenKeys = new Set();

      for (const candidate of [...detourCandidates, ...baseCandidates]) {
        const key = `${candidate.xStart}:${candidate.xEnd}:${candidate.topY}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        dedupedCandidates.push(candidate);
      }

      let remainingCandidates = dedupedCandidates.filter((candidate) => (
        platformCellsAreEmpty(state.tiles, candidate) &&
        !optionalPlatformOverlapsAnchors(candidate, state.routeMetadata.anchors) &&
        !optionalPlatformOverlapsOptionalPlatforms(candidate, state.routeMetadata.optionalPlatforms)
      ));

      while (remainingCandidates.length > 0) {
        let selectableCandidates = remainingCandidates;
        const backtrackCandidates = remainingCandidates.filter((candidate) => candidate.detourKind === 'backtrack_left');
        if (backtrackCandidates.length > 0 && randomUnit(state.rng) < 0.7) {
          selectableCandidates = backtrackCandidates;
        }
        const candidate = selectPlacementCandidate(state.rng, selectableCandidates, {
          placementJitter: state.variation.placementJitter,
          preferNarrower: state.variation.precisionBias >= 0.5,
          preferHigher: true,
        });
        remainingCandidates = remainingCandidates.filter((entry) => (
          !(entry.xStart === candidate.xStart && entry.xEnd === candidate.xEnd && entry.topY === candidate.topY)
        ));
        if (tryCommitOptionalPlatform(state, segment, candidate)) {
          break;
        }
      }
    }

    if (
      state.variation.optionalPlatformDensity > 0 &&
      !segment.optionalPlatformIds.some((platformId) => (
        state.routeMetadata.optionalPlatforms[platformId]?.detourKind === 'backtrack_left'
      )) &&
      randomUnit(state.rng) < state.variation.optionalPlatformDensity
    ) {
      tryForceBacktrackDetour(state, segment, segmentAnchors);
      for (const platformId of segment.optionalPlatformIds) {
        const platform = state.routeMetadata.optionalPlatforms[platformId];
        if (platform && platform.detourKind === 'backtrack_left') {
          break;
        }
      }
    }
  }
}

function appendFinishRun(state) {
  const remaining = state.width - state.currentAnchor.xEnd - 1;
  if (remaining <= 0) {
    return;
  }

  const extension = extendCurrentAnchor(state, remaining);
  addSegment(
    state.routeMetadata,
    SEGMENT_TYPES.FINISH_RUN,
    extension.xStart,
    extension.xEnd,
    [state.currentAnchor.id],
    {
      topY: state.currentAnchor.topY,
    },
  );
}

function createGenerationState({
  width,
  height,
  tileSizePx,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
  rng,
  variation,
}) {
  const movementProfile = buildMovementProfile({
    gravity,
    jumpSpeed,
    forwardSpeed,
    tileSizePx,
    playerWidthPx,
    playerHeightPx,
  });
  const tiles = createTileGrid(width, height);
  const routeMetadata = createRouteMetadata();
  const minTopY = Math.max(
    movementProfile.playerHeightTiles + Math.ceil(movementProfile.jumpProfile.apexHeightTiles),
    4,
  );
  const maxTopY = height - 3;
  if (maxTopY <= minTopY) {
    throw new Error(
      `height=${height} does not leave enough vertical room for this movement profile. minTopY=${minTopY}, maxTopY=${maxTopY}.`,
    );
  }
  const finalRunLength = Math.max(movementProfile.landingWidthTiles + 6, 14);
  const verticalCapacityTiles = maxTopY - minTopY;

  return {
    width,
    height,
    tiles,
    routeMetadata,
    movementProfile,
    minTopY,
    maxTopY,
    verticalCapacityTiles,
    finalRunLength,
    currentAnchor: null,
    currentLeftX: null,
    rng,
    variation,
  };
}

function appendStartArea(state) {
  const startTopY = clamp(
    state.maxTopY - Math.max(0, Math.floor(state.verticalCapacityTiles * 0.1)),
    state.minTopY,
    state.maxTopY,
  );
  const startLength = Math.max(state.movementProfile.landingWidthTiles + 6, 12);
  const startAnchor = addAnchor(state, {
    xStart: 0,
    xEnd: startLength - 1,
    topY: startTopY,
    supportType: 'solid',
  });
  state.routeMetadata.startAnchorId = startAnchor.id;
  state.currentLeftX = computeAnchorEntryLeftX(startAnchor, state.movementProfile.tileSizePx);
  addSegment(
    state.routeMetadata,
    'start_pad',
    startAnchor.xStart,
    startAnchor.xEnd,
    [startAnchor.id],
    {
      topY: startAnchor.topY,
    },
  );
}

function buildSegmentChoicePool(state) {
  const pool = [
    SEGMENT_TYPES.FLAT_RUN,
    SEGMENT_TYPES.FLAT_RUN,
    SEGMENT_TYPES.SPIKE_TRENCH,
    SEGMENT_TYPES.PIT,
    SEGMENT_TYPES.RAISED_LEDGE,
  ];

  const aerialRepeats = 2 + Math.round(state.variation.aerialDensity * 3);
  const precisionRepeats = 1 + Math.round(state.variation.precisionBias * 3);
  const verticalRepeats = 1 + Math.round(
    Math.min(1, state.verticalCapacityTiles / Math.max(6, state.height / 2)) * 3,
  );

  for (let index = 0; index < aerialRepeats; index += 1) {
    pool.push(SEGMENT_TYPES.FLOATING_BRIDGE);
    pool.push(SEGMENT_TYPES.PILLAR_FIELD);
  }

  for (let index = 0; index < precisionRepeats; index += 1) {
    pool.push(SEGMENT_TYPES.PRECISION_PLATFORM_RUN);
  }

  for (let index = 0; index < verticalRepeats; index += 1) {
    pool.push(SEGMENT_TYPES.CLIMB_TOWER);
  }

  if (state.variation.aerialDensity < 0.5) {
    pool.push(SEGMENT_TYPES.FLAT_RUN);
    pool.push(SEGMENT_TYPES.SPIKE_TRENCH);
  }

  return pool;
}

function isMeaningfulVerticalSegment(segment) {
  if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
    return false;
  }

  if (segment.type === SEGMENT_TYPES.CLIMB_TOWER) {
    return (segment.totalRiseTiles ?? 0) >= 2 || (segment.backtrackStepCount ?? 0) > 0;
  }
  if (segment.type === SEGMENT_TYPES.DROP_SHAFT) {
    return (segment.totalDropTiles ?? 0) >= 2;
  }
  if (segment.type === SEGMENT_TYPES.PRECISION_PLATFORM_RUN) {
    return Array.isArray(segment.platformTopYs) && (
      Math.max(...segment.platformTopYs) - Math.min(...segment.platformTopYs) >= 2
    );
  }
  if (segment.type === SEGMENT_TYPES.FLOATING_BRIDGE) {
    return Array.isArray(segment.platformTopYs) && (
      Math.max(...segment.platformTopYs) - Math.min(...segment.platformTopYs) >= 1
    );
  }
  if (segment.type === SEGMENT_TYPES.PILLAR_FIELD) {
    return Array.isArray(segment.pillarTopYs) && (
      Math.max(...segment.pillarTopYs) - Math.min(...segment.pillarTopYs) >= 1
    );
  }
  if (segment.type === SEGMENT_TYPES.RAISED_LEDGE) {
    return (segment.riseTiles ?? 0) >= 1;
  }
  if (segment.type === SEGMENT_TYPES.PIT) {
    return (segment.dropTiles ?? 0) >= 2;
  }
  return false;
}

function countTrailingNonVerticalSegments(segments) {
  let count = 0;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (isMeaningfulVerticalSegment(segments[index])) {
      break;
    }
    count += 1;
  }

  return count;
}

function buildLateVerticalPriorityPool(state) {
  const pool = [
    SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    SEGMENT_TYPES.FLOATING_BRIDGE,
    SEGMENT_TYPES.PILLAR_FIELD,
    SEGMENT_TYPES.RAISED_LEDGE,
  ];

  if (state.currentAnchor.topY - state.minTopY >= 2) {
    pool.push(SEGMENT_TYPES.CLIMB_TOWER);
    pool.push(SEGMENT_TYPES.CLIMB_TOWER);
  }

  if (state.maxTopY - state.currentAnchor.topY >= 2) {
    pool.push(SEGMENT_TYPES.PIT);
    pool.push(SEGMENT_TYPES.PIT);
  }

  return pool;
}

function pickForcedVerticalSegment(state, lateVerticalCount, lateVerticalTarget) {
  const canClimb = state.currentAnchor.topY - state.minTopY >= 2;
  const canDrop = state.maxTopY - state.currentAnchor.topY >= 2;
  const midTopY = (state.minTopY + state.maxTopY) / 2;
  const verticalDeficit = Math.max(0, lateVerticalTarget - lateVerticalCount);

  if (state.currentAnchor.topY <= state.minTopY + 1 && canDrop) {
    if (verticalDeficit >= 2) {
      return randomChoice(state.rng, [
        SEGMENT_TYPES.PIT,
        SEGMENT_TYPES.PIT,
        SEGMENT_TYPES.FLOATING_BRIDGE,
      ]);
    }
    return randomChoice(state.rng, [
      SEGMENT_TYPES.PIT,
      SEGMENT_TYPES.PIT,
      SEGMENT_TYPES.FLOATING_BRIDGE,
      SEGMENT_TYPES.PILLAR_FIELD,
      SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    ]);
  }
  if (state.currentAnchor.topY >= state.maxTopY - 1 && canClimb) {
    if (verticalDeficit >= 2) {
      return randomChoice(state.rng, [
        SEGMENT_TYPES.CLIMB_TOWER,
        SEGMENT_TYPES.CLIMB_TOWER,
        SEGMENT_TYPES.RAISED_LEDGE,
      ]);
    }
    return randomChoice(state.rng, [
      SEGMENT_TYPES.CLIMB_TOWER,
      SEGMENT_TYPES.CLIMB_TOWER,
      SEGMENT_TYPES.RAISED_LEDGE,
      SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    ]);
  }
  if (state.currentAnchor.topY < midTopY - 1 && canDrop && randomUnit(state.rng) < 0.7) {
    if (verticalDeficit >= 2) {
      return randomChoice(state.rng, [
        SEGMENT_TYPES.PIT,
        SEGMENT_TYPES.PIT,
        SEGMENT_TYPES.FLOATING_BRIDGE,
      ]);
    }
    return randomChoice(state.rng, [
      SEGMENT_TYPES.PIT,
      SEGMENT_TYPES.FLOATING_BRIDGE,
      SEGMENT_TYPES.PILLAR_FIELD,
      SEGMENT_TYPES.PRECISION_PLATFORM_RUN,
    ]);
  }
  if (state.currentAnchor.topY > midTopY + 1 && canClimb && randomUnit(state.rng) < 0.7) {
    if (verticalDeficit >= 2) {
      return randomChoice(state.rng, [
        SEGMENT_TYPES.CLIMB_TOWER,
        SEGMENT_TYPES.CLIMB_TOWER,
        SEGMENT_TYPES.RAISED_LEDGE,
      ]);
    }
    return randomChoice(state.rng, [
      SEGMENT_TYPES.CLIMB_TOWER,
      SEGMENT_TYPES.CLIMB_TOWER,
      SEGMENT_TYPES.RAISED_LEDGE,
    ]);
  }

  return randomChoice(state.rng, buildLateVerticalPriorityPool(state));
}

function buildAttempt(state) {
  appendStartArea(state);

  appendFlatRun(state, { minLength: 12, maxLength: 16 });
  appendSpikeTrench(state);
  appendFlatRun(state, { minLength: 6, maxLength: 10 });
  appendRaisedLedge(state);
  appendClimbTower(state);
  appendPrecisionPlatformRun(state);
  appendFlatRun(state, { minLength: 8, maxLength: 12 });
  appendPit(state);
  appendFloatingBridge(state);
  appendPillarField(state);

  const segmentChoicePool = buildSegmentChoicePool(state);
  const randomSectionStartIndex = state.routeMetadata.segments.length;
  const lateVerticalTarget = 2 + Math.round(state.variation.aerialDensity * 2);

  while (remainingColumnsBeforeFinish(state) > 28) {
    const lateSegments = state.routeMetadata.segments.slice(randomSectionStartIndex);
    const lateVerticalCount = lateSegments.filter(isMeaningfulVerticalSegment).length;
    const trailingNonVerticalCount = countTrailingNonVerticalSegments(lateSegments);
    const shouldForceVertical = (
      remainingColumnsBeforeFinish(state) > 40 &&
      (
        lateVerticalCount < lateVerticalTarget ||
        trailingNonVerticalCount >= 2
      )
    );
    const nextSegment = shouldForceVertical
      ? pickForcedVerticalSegment(state, lateVerticalCount, lateVerticalTarget)
      : randomChoice(state.rng, segmentChoicePool);

    if (nextSegment === SEGMENT_TYPES.FLAT_RUN) {
      appendFlatRun(state, { minLength: 8, maxLength: 14 });
    } else if (nextSegment === SEGMENT_TYPES.SPIKE_TRENCH) {
      appendSpikeTrench(state);
    } else if (nextSegment === SEGMENT_TYPES.PIT) {
      appendPit(state);
    } else if (nextSegment === SEGMENT_TYPES.RAISED_LEDGE) {
      appendRaisedLedge(state);
    } else if (nextSegment === SEGMENT_TYPES.CLIMB_TOWER) {
      appendClimbTower(state);
    } else if (nextSegment === SEGMENT_TYPES.PRECISION_PLATFORM_RUN) {
      appendPrecisionPlatformRun(state);
    } else if (nextSegment === SEGMENT_TYPES.FLOATING_BRIDGE) {
      appendFloatingBridge(state);
    } else if (nextSegment === SEGMENT_TYPES.PILLAR_FIELD) {
      appendPillarField(state);
    }
  }

  appendFinishRun(state);
  state.routeMetadata.endAnchorId = state.currentAnchor.id;
  appendOptionalPlatforms(state);
}

function countTileOccurrences(tiles, tileId) {
  let count = 0;
  for (const row of tiles) {
    for (const tile of row) {
      if (tile === tileId) {
        count += 1;
      }
    }
  }
  return count;
}

export function generatePlatformerMap({
  width = 300,
  height = 20,
  tileSizePx,
  gravity,
  forwardSpeed,
  jumpSpeed,
  playerWidthPx,
  playerHeightPx,
  rng = Math.random,
  maxAttempts = 64,
  variation = DEFAULT_VARIATION,
}) {
  assertPositiveInteger(width, 'width');
  assertPositiveInteger(height, 'height');
  assertPositiveInteger(maxAttempts, 'maxAttempts');
  assertRng(rng);
  const normalizedVariation = normalizeVariation(variation);
  validateSharedPhysicsInputs({
    gravity,
    tileSizePx,
    jumpSpeed,
    forwardSpeed,
  });
  assertPositiveNumber(playerWidthPx, 'playerWidthPx');
  assertPositiveNumber(playerHeightPx, 'playerHeightPx');

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const state = createGenerationState({
        width,
        height,
        tileSizePx,
        gravity,
        forwardSpeed,
        jumpSpeed,
        playerWidthPx,
        playerHeightPx,
        rng,
        variation: normalizedVariation,
      });

      buildAttempt(state);

      if (countTileOccurrences(state.tiles, TILE_IDS.SPIKE) === 0) {
        throw new Error('Generated map did not contain any spike hazards.');
      }
      if (countTileOccurrences(state.tiles, TILE_IDS.LAVA) === 0) {
        throw new Error('Generated map did not contain any pit fill hazards.');
      }

      const validation = validatePlatformerMap({
        tiles: state.tiles,
        routeMetadata: state.routeMetadata,
        tileSizePx,
        gravity,
        forwardSpeed,
        jumpSpeed,
        playerWidthPx,
        playerHeightPx,
      });

      return {
        tiles: state.tiles,
        tileKey: cloneTileKey(),
        movementProfile: {
          ...state.movementProfile,
          jumpProfile: { ...state.movementProfile.jumpProfile },
          riseTable: state.movementProfile.riseTable.map((entry) => ({ ...entry })),
        },
        routeMetadata: {
          ...state.routeMetadata,
          anchors: state.routeMetadata.anchors.map((anchor) => ({ ...anchor })),
          transitions: state.routeMetadata.transitions.map((transition) => ({ ...transition })),
          segments: state.routeMetadata.segments.map((segment) => ({
            ...segment,
            anchorIds: [...segment.anchorIds],
            optionalPlatformIds: Array.isArray(segment.optionalPlatformIds)
              ? [...segment.optionalPlatformIds]
              : [],
          })),
          optionalPlatforms: state.routeMetadata.optionalPlatforms.map((platform) => ({ ...platform })),
          archetypes: [...state.routeMetadata.archetypes],
          validation,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Platformer map generation failed after ${maxAttempts} attempts. Last error: ${errorMessage}`,
  );
}
