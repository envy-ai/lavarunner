import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  generatePlatformerMap,
  getJumpProfile,
  solveForwardSpeedForDistance,
  solveJumpSpeedForHeight,
  validatePlatformerMap,
} from '../src/procgen/platformer_map_generator.mjs';
import { writeTileMapToPng } from '../src/procgen/platformer_map_png.mjs';

const TEST_PARAMS = Object.freeze({
  width: 300,
  height: 20,
  tileSizePx: 8,
  gravity: 0.15,
  playerWidthPx: 8,
  playerHeightPx: 8,
});

function approxEqual(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

function createSeededRng(seed) {
  let state = seed >>> 0;
  return function seededRng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function countTiles(tiles, tileId) {
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

function getAnchorTopYSpan(routeMetadata) {
  const topYs = routeMetadata.anchors.map((anchor) => anchor.topY);
  return Math.max(...topYs) - Math.min(...topYs);
}

function isMeaningfulVerticalSegment(segment) {
  if (segment.type === 'climb_tower') {
    return (segment.totalRiseTiles ?? 0) >= 2 || (segment.backtrackStepCount ?? 0) > 0;
  }
  if (segment.type === 'drop_shaft') {
    return (segment.totalDropTiles ?? 0) >= 2;
  }
  if (segment.type === 'precision_platform_run') {
    return Math.max(...segment.platformTopYs) - Math.min(...segment.platformTopYs) >= 2;
  }
  if (segment.type === 'floating_bridge') {
    return Math.max(...segment.platformTopYs) - Math.min(...segment.platformTopYs) >= 1;
  }
  if (segment.type === 'pillar_field') {
    return Math.max(...segment.pillarTopYs) - Math.min(...segment.pillarTopYs) >= 1;
  }
  if (segment.type === 'raised_ledge') {
    return (segment.riseTiles ?? 0) >= 1;
  }
  if (segment.type === 'pit') {
    return (segment.dropTiles ?? 0) >= 2;
  }
  return false;
}

function createEmptyTiles(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(0));
}

function paintSolidAnchor(tiles, xStart, xEnd, topY, tileId = 1) {
  for (let x = xStart; x <= xEnd; x += 1) {
    for (let y = topY; y < tiles.length; y += 1) {
      tiles[y][x] = tileId;
    }
  }
}

function paintSolidRect(tiles, xStart, xEnd, yStart, yEnd, tileId = 1) {
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x <= xEnd; x += 1) {
      tiles[y][x] = tileId;
    }
  }
}

function buildImpossibleFixture() {
  const width = 30;
  const height = 20;
  const tiles = Array.from({ length: height }, () => Array(width).fill(0));
  const topY = 16;

  for (let x = 0; x <= 5; x += 1) {
    for (let y = topY; y < height; y += 1) {
      tiles[y][x] = 1;
    }
  }

  for (let x = 20; x < width; x += 1) {
    for (let y = topY; y < height; y += 1) {
      tiles[y][x] = 1;
    }
  }

  for (let x = 6; x < 20; x += 1) {
    tiles[height - 1][x] = 4;
    tiles[height - 2][x] = 4;
  }

  return {
    tiles,
    routeMetadata: {
      anchors: [
        { id: 0, xStart: 0, xEnd: 5, topY, supportType: 'solid' },
        { id: 1, xStart: 20, xEnd: 29, topY, supportType: 'solid' },
      ],
      segments: [],
      archetypes: [],
      startAnchorId: 0,
      endAnchorId: 1,
    },
  };
}

function buildTakeoffWindowFixture({
  gravity,
  forwardSpeed,
  jumpSpeed,
  tileSizePx,
  playerWidthPx,
  playerHeightPx,
}) {
  const width = 20;
  const height = 20;
  const sourceAnchor = {
    id: 0,
    xStart: 0,
    xEnd: 11,
    topY: 16,
    supportType: 'solid',
  };
  const exitLeftX = (sourceAnchor.xEnd + 1) * tileSizePx - playerWidthPx;

  for (let targetTopY = 15; targetTopY <= 16; targetTopY += 1) {
    for (let targetXStart = 13; targetXStart <= 17; targetXStart += 1) {
      const targetAnchor = {
        id: 1,
        xStart: targetXStart,
        xEnd: width - 1,
        topY: targetTopY,
        supportType: 'solid',
      };

      for (let obstacleYStart = 11; obstacleYStart <= 14; obstacleYStart += 1) {
        for (let obstacleHeight = 1; obstacleHeight <= 2; obstacleHeight += 1) {
          for (let obstacleXStart = 11; obstacleXStart <= 16; obstacleXStart += 1) {
            for (let obstacleWidth = 1; obstacleWidth <= 3; obstacleWidth += 1) {
              const tiles = createEmptyTiles(width, height);
              paintSolidAnchor(tiles, sourceAnchor.xStart, sourceAnchor.xEnd, sourceAnchor.topY);
              paintSolidAnchor(tiles, targetAnchor.xStart, targetAnchor.xEnd, targetAnchor.topY);
              paintSolidRect(
                tiles,
                obstacleXStart,
                Math.min(width - 1, obstacleXStart + obstacleWidth - 1),
                obstacleYStart,
                Math.min(height - 1, obstacleYStart + obstacleHeight - 1),
              );

              const routeMetadata = {
                anchors: [sourceAnchor, targetAnchor],
                transitions: [{ fromAnchorId: 0, toAnchorId: 1, type: 'jump' }],
                segments: [],
                archetypes: [],
                optionalPlatforms: [],
                startAnchorId: 0,
                endAnchorId: 1,
              };

              try {
                const validation = validatePlatformerMap({
                  tiles,
                  routeMetadata,
                  tileSizePx,
                  gravity,
                  forwardSpeed,
                  jumpSpeed,
                  playerWidthPx,
                  playerHeightPx,
                });
                if (validation.transitions[0].takeoffLeftX < exitLeftX) {
                  return {
                    tiles,
                    routeMetadata,
                    validation,
                  };
                }
              } catch (error) {
                continue;
              }
            }
          }
        }
      }
    }
  }

  throw new Error('Failed to build a takeoff-window fixture that requires an earlier jump.');
}

function summarizeArchetypes(routeMetadata) {
  return routeMetadata.segments.map((segment) => segment.type);
}

async function writeArtifact(summary) {
  await fs.mkdir('tmp', { recursive: true });
  await fs.writeFile(
    'tmp/platformer_map_generator_smoke.json',
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
}

async function readPngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    assert.equal(bytesRead, 24, 'PNG header should be readable.');
    assert.equal(
      header.subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
      'PNG signature should be present.',
    );
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    await handle.close();
  }
}

async function main() {
  const jumpSolve = solveJumpSpeedForHeight({
    gravity: TEST_PARAMS.gravity,
    targetHeightTiles: 4.2,
    tileSizePx: TEST_PARAMS.tileSizePx,
  });
  approxEqual(jumpSolve.jumpSpeed, 3.1, 1e-9, 'jumpSpeed');
  assert.equal(jumpSolve.apexFrames, 21, 'apexFrames');
  approxEqual(jumpSolve.achievedHeightTiles, 4.2, 1e-9, 'achievedHeightTiles');

  const jumpProfile = getJumpProfile({
    gravity: TEST_PARAMS.gravity,
    jumpSpeed: jumpSolve.jumpSpeed,
    tileSizePx: TEST_PARAMS.tileSizePx,
  });
  assert.equal(jumpProfile.flightFrames, 43, 'flightFrames');

  const speedSolve = solveForwardSpeedForDistance({
    gravity: TEST_PARAMS.gravity,
    jumpSpeed: jumpSolve.jumpSpeed,
    distanceTiles: 5,
    tileSizePx: TEST_PARAMS.tileSizePx,
  });
  approxEqual(speedSolve.forwardSpeed, 0.9302325581395349, 1e-12, 'forwardSpeed');

  const takeoffWindowFixture = buildTakeoffWindowFixture({
    gravity: TEST_PARAMS.gravity,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    tileSizePx: TEST_PARAMS.tileSizePx,
    playerWidthPx: TEST_PARAMS.playerWidthPx,
    playerHeightPx: TEST_PARAMS.playerHeightPx,
  });
  const takeoffWindowExitLeftX = (
    (takeoffWindowFixture.routeMetadata.anchors[0].xEnd + 1) * TEST_PARAMS.tileSizePx -
    TEST_PARAMS.playerWidthPx
  );
  assert.ok(
    takeoffWindowFixture.validation.transitions[0].takeoffLeftX < takeoffWindowExitLeftX,
    'Validator should search earlier takeoff positions when the right-edge jump fails.',
  );

  const seed = 123456789;
  const firstResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(seed),
  });
  const secondResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(seed),
  });

  assert.deepEqual(firstResult.tiles, secondResult.tiles, 'Seeded generation should be deterministic.');
  assert.deepEqual(
    firstResult.routeMetadata.segments,
    secondResult.routeMetadata.segments,
    'Seeded generation should keep the same route metadata.',
  );
  assert.deepEqual(
    firstResult.routeMetadata.optionalPlatforms,
    secondResult.routeMetadata.optionalPlatforms,
    'Seeded generation should keep the same optional platform metadata.',
  );

  assert.equal(firstResult.tiles.length, 20, 'Generated map should have 20 rows.');
  assert.equal(firstResult.tiles[0].length, 300, 'Generated map should have 300 columns.');
  assert.ok(countTiles(firstResult.tiles, 3) > 0, 'Generated map should contain spikes.');
  assert.ok(countTiles(firstResult.tiles, 4) > 0, 'Generated map should contain lava.');
  assert.ok(countTiles(firstResult.tiles, 2) >= 12, 'Generated map should contain a meaningful number of air platforms.');
  assert.ok(
    firstResult.routeMetadata.archetypes.length >= 5,
    `Expected at least 5 archetypes, got ${firstResult.routeMetadata.archetypes.length}.`,
  );
  assert.ok(
    firstResult.routeMetadata.archetypes.includes('precision_platform_run'),
    'Generated map should include a precision_platform_run segment.',
  );
  assert.ok(
    firstResult.routeMetadata.archetypes.includes('climb_tower'),
    'Generated map should include a climb_tower segment.',
  );
  assert.ok(
    firstResult.routeMetadata.archetypes.includes('floating_bridge'),
    'Generated map should include a floating_bridge segment.',
  );
  assert.ok(
    firstResult.routeMetadata.archetypes.includes('pillar_field'),
    'Generated map should include a pillar_field segment.',
  );
  const firstPreludeEndIndex = firstResult.routeMetadata.segments.findIndex(
    (segment) => segment.type === 'pillar_field',
  );
  const firstLateSegments = firstResult.routeMetadata.segments.slice(firstPreludeEndIndex + 1, -1);
  assert.ok(
    firstLateSegments.filter(isMeaningfulVerticalSegment).length >= 1,
    'The later section of the default map should still contain meaningful vertical set-pieces.',
  );
  assert.ok(
    firstLateSegments.slice(-3).some(isMeaningfulVerticalSegment),
    'The final pre-finish stretch should retain some vertical variation.',
  );

  const validation = validatePlatformerMap({
    tiles: firstResult.tiles,
    routeMetadata: firstResult.routeMetadata,
    tileSizePx: TEST_PARAMS.tileSizePx,
    gravity: TEST_PARAMS.gravity,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    playerWidthPx: TEST_PARAMS.playerWidthPx,
    playerHeightPx: TEST_PARAMS.playerHeightPx,
  });
  assert.equal(
    validation.anchorCount,
    firstResult.routeMetadata.anchors.length,
    'Validator should traverse every anchor.',
  );
  assert.ok(validation.jumpCount > 0, 'Validator should verify at least one jump.');
  assert.ok(
    validation.transitions.every((transition) => typeof transition.takeoffLeftX === 'number'),
    'Validator diagnostics should record the chosen takeoff position for every transition.',
  );

  const lowVariation = {
    aerialDensity: 0.2,
    precisionBias: 0.2,
    optionalPlatformDensity: 0,
    placementJitter: 0.2,
  };
  const highVariation = {
    aerialDensity: 1,
    precisionBias: 1,
    optionalPlatformDensity: 1,
    placementJitter: 1,
  };
  const lowVariationResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(20260414),
    variation: lowVariation,
  });
  const highVariationSeed = 20260414;
  const highVariationResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(highVariationSeed),
    variation: highVariation,
  });
  const repeatedHighVariationResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(highVariationSeed),
    variation: highVariation,
  });
  const differentSeedHighVariationResult = generatePlatformerMap({
    ...TEST_PARAMS,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    rng: createSeededRng(highVariationSeed + 1),
    variation: highVariation,
  });

  assert.deepEqual(
    highVariationResult.tiles,
    repeatedHighVariationResult.tiles,
    'High-variation generation should remain deterministic for a fixed seed.',
  );
  assert.deepEqual(
    highVariationResult.routeMetadata,
    repeatedHighVariationResult.routeMetadata,
    'High-variation route metadata should remain deterministic for a fixed seed.',
  );
  assert.notDeepEqual(
    highVariationResult.routeMetadata.segments,
    differentSeedHighVariationResult.routeMetadata.segments,
    'Different seeds should produce different platform placements.',
  );
  assert.ok(
    countTiles(highVariationResult.tiles, 2) > countTiles(lowVariationResult.tiles, 2),
    'High-variation generation should place more airborne platform tiles than a conservative baseline.',
  );
  assert.ok(
    getAnchorTopYSpan(highVariationResult.routeMetadata) >= 6,
    `High-variation generation should span at least 6 tiles vertically, got ${getAnchorTopYSpan(highVariationResult.routeMetadata)}.`,
  );
  assert.ok(
    highVariationResult.routeMetadata.optionalPlatforms.length > 0,
    'High optionalPlatformDensity should add optional non-route platforms.',
  );

  const highVariationValidation = validatePlatformerMap({
    tiles: highVariationResult.tiles,
    routeMetadata: highVariationResult.routeMetadata,
    tileSizePx: TEST_PARAMS.tileSizePx,
    gravity: TEST_PARAMS.gravity,
    forwardSpeed: speedSolve.forwardSpeed,
    jumpSpeed: jumpSolve.jumpSpeed,
    playerWidthPx: TEST_PARAMS.playerWidthPx,
    playerHeightPx: TEST_PARAMS.playerHeightPx,
  });
  assert.equal(
    highVariationValidation.anchorCount,
    highVariationResult.routeMetadata.anchors.length,
    'Optional platforms must not break the validated main route.',
  );

  const precisionSegment = highVariationResult.routeMetadata.segments.find(
    (segment) => segment.type === 'precision_platform_run',
  );
  const lowVariationClimbSegment = lowVariationResult.routeMetadata.segments.find(
    (segment) => segment.type === 'climb_tower',
  );
  const highVariationClimbSegment = highVariationResult.routeMetadata.segments.find(
    (segment) => segment.type === 'climb_tower',
  );
  assert.ok(lowVariationClimbSegment, 'Expected a climb_tower segment in the low-variation map.');
  assert.ok(highVariationClimbSegment, 'Expected a climb_tower segment in the high-variation map.');
  assert.ok(
    highVariationClimbSegment.totalRiseTiles > lowVariationClimbSegment.totalRiseTiles,
    'High variation should produce a taller climb_tower than the conservative baseline.',
  );
  const highVariationPreludeEndIndex = highVariationResult.routeMetadata.segments.findIndex(
    (segment) => segment.type === 'pillar_field',
  );
  const highVariationLateSegments = highVariationResult.routeMetadata.segments.slice(
    highVariationPreludeEndIndex + 1,
    -1,
  );
  assert.ok(
    highVariationLateSegments.filter(isMeaningfulVerticalSegment).length >= 2,
    'High variation should keep multiple meaningful vertical set-pieces in the later section.',
  );
  assert.ok(
    highVariationLateSegments.slice(-3).some(isMeaningfulVerticalSegment),
    'High variation should keep vertical set-pieces near the finish instead of flattening out.',
  );
  assert.ok(precisionSegment, 'Expected a precision_platform_run segment in the high-variation map.');
  assert.ok(
    precisionSegment.placementWindows.length > 0,
    'Precision platform runs should expose placement-window metadata.',
  );
  assert.ok(
    new Set(precisionSegment.platformWidths).size > 1 ||
    new Set(precisionSegment.platformTopYs).size > 1,
    'Precision platform runs should vary platform widths or heights.',
  );

  const floatingBridgeSegment = highVariationResult.routeMetadata.segments.find(
    (segment) => segment.type === 'floating_bridge',
  );
  assert.ok(floatingBridgeSegment, 'Expected a floating_bridge segment in the high-variation map.');
  assert.ok(
    floatingBridgeSegment.placementWindows.length > 0,
    'Floating bridges should expose placement-window metadata.',
  );
  assert.ok(
    new Set(floatingBridgeSegment.platformWidths).size > 1 ||
    new Set(floatingBridgeSegment.platformTopYs).size > 1,
    'Floating bridges should vary platform widths or heights.',
  );

  for (const platform of highVariationResult.routeMetadata.optionalPlatforms) {
    assert.equal(highVariationResult.tiles[platform.topY][platform.xStart], 2, 'Optional platforms should use tile id 2.');
    assert.equal(highVariationResult.tiles[platform.topY][platform.xEnd], 2, 'Optional platforms should use tile id 2.');
    assert.ok(
      !highVariationResult.routeMetadata.anchors.some((anchor) => (
        anchor.topY === platform.topY &&
        !(platform.xEnd < anchor.xStart || platform.xStart > anchor.xEnd)
      )),
      'Optional platforms must not overlap guaranteed-route anchors.',
    );
  }

  const pngInfo = await writeTileMapToPng({
    tiles: firstResult.tiles,
    outputPath: 'tmp/platformer_map_generator_smoke.png',
    blockSizePx: 4,
    rng: createSeededRng(987654321),
  });
  const pngDimensions = await readPngDimensions(pngInfo.outputPath);
  assert.equal(pngDimensions.width, TEST_PARAMS.width * 4, 'PNG width should scale with blockSizePx.');
  assert.equal(pngDimensions.height, TEST_PARAMS.height * 4, 'PNG height should scale with blockSizePx.');
  assert.deepEqual(pngInfo.colorByTileId[0], [255, 255, 255, 255], 'Air should render as white.');
  for (const [tileId, color] of Object.entries(pngInfo.colorByTileId)) {
    if (tileId === '0') {
      continue;
    }
    assert.ok(
      color[0] <= 96 && color[1] <= 96 && color[2] <= 96,
      `Tile ${tileId} should receive a dark color.`,
    );
  }

  const impossibleFixture = buildImpossibleFixture();
  assert.throws(
    () => validatePlatformerMap({
      tiles: impossibleFixture.tiles,
      routeMetadata: impossibleFixture.routeMetadata,
      tileSizePx: TEST_PARAMS.tileSizePx,
      gravity: TEST_PARAMS.gravity,
      forwardSpeed: speedSolve.forwardSpeed,
      jumpSpeed: jumpSolve.jumpSpeed,
      playerWidthPx: TEST_PARAMS.playerWidthPx,
      playerHeightPx: TEST_PARAMS.playerHeightPx,
    }),
    /never landed|hit a hazard|landed on tile/,
    'Validator should reject an impossible wide-gap fixture.',
  );

  const summary = {
    jumpSolve,
    jumpProfile,
    speedSolve,
    generated: {
      width: firstResult.tiles[0].length,
      height: firstResult.tiles.length,
      spikeTiles: countTiles(firstResult.tiles, 3),
      lavaTiles: countTiles(firstResult.tiles, 4),
      platformTiles: countTiles(firstResult.tiles, 2),
      optionalPlatformCount: firstResult.routeMetadata.optionalPlatforms.length,
      archetypes: firstResult.routeMetadata.archetypes,
      segmentTypes: summarizeArchetypes(firstResult.routeMetadata),
      anchorCount: firstResult.routeMetadata.anchors.length,
      jumpCount: validation.jumpCount,
      takeoffWindowFixtureTakeoffLeftX: takeoffWindowFixture.validation.transitions[0].takeoffLeftX,
      highVariation: {
        platformTiles: countTiles(highVariationResult.tiles, 2),
        optionalPlatformCount: highVariationResult.routeMetadata.optionalPlatforms.length,
        anchorTopYSpan: getAnchorTopYSpan(highVariationResult.routeMetadata),
        climbTowerRiseTiles: highVariationClimbSegment.totalRiseTiles,
        climbTowerBacktrackSteps: highVariationClimbSegment.backtrackStepCount,
        lateVerticalSegmentCount: highVariationLateSegments.filter(isMeaningfulVerticalSegment).length,
        segmentTypes: summarizeArchetypes(highVariationResult.routeMetadata),
      },
      png: {
        outputPath: pngInfo.outputPath,
        width: pngDimensions.width,
        height: pngDimensions.height,
        colorByTileId: pngInfo.colorByTileId,
      },
    },
  };

  await writeArtifact(summary);
}

main().then(() => {
  console.log('platformer_map_generator smoke test passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
