/**
 * Standalone procedural platformer map generator.
 *
 * Generates tile-based 2D platformer layouts with a guaranteed traversable
 * route, physics-accurate jump validation, and optional decoration platforms.
 *
 * Physics model (discrete, per-frame):
 *   1. x += vx
 *   2. y += vy
 *   3. vy += gravity
 *
 * Tile key:
 *   0 = air, 1 = solid, 2 = one-way platform,
 *   3 = spikes, 4 = lava, 5 = accent
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// ─── Tile Constants ────────────────────────────────────────────────────

const T_AIR    = 0;
const T_SOLID  = 1;
const T_ONEWAY = 2;
const T_SPIKE  = 3;
const T_LAVA   = 4;
const T_ACCENT = 5;

const DEFAULT_TILE_KEY = {
  0: 'air', 1: 'solid', 2: 'oneway', 3: 'spikes', 4: 'lava', 5: 'accent',
};

// ─── Seeded RNG ────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Grid Helpers ──────────────────────────────────────────────────────

function makeGrid(w, h, fill = T_AIR) {
  return Array.from({ length: h }, () => new Array(w).fill(fill));
}

function gSet(g, c, r, v) {
  if (r >= 0 && r < g.length && c >= 0 && c < g[0].length) g[r][c] = v;
}

function gRect(g, c, r, w, h, v) {
  for (let dr = 0; dr < h; dr++)
    for (let dc = 0; dc < w; dc++)
      gSet(g, c + dc, r + dr, v);
}

// ─── Exported: Physics Solvers ─────────────────────────────────────────

export function solveJumpSpeedForHeight({ gravity, targetHeightTiles, tileSizePx }) {
  // Discrete apex height: h = v*(v+g)/(2g)
  // Solve: v² + gv - 2gh = 0
  const hPx = targetHeightTiles * tileSizePx;
  const disc = gravity * gravity + 8 * gravity * hPx;
  return (-gravity + Math.sqrt(disc)) / 2;
}

export function getJumpProfile({ gravity, jumpSpeed, tileSizePx, landingOffsetPx = 0 }) {
  const rawApex = jumpSpeed / gravity;
  const apexFrames = Math.round(rawApex);

  // Simulate to find actual flight frames (return to start height)
  let y = 0, vy = -jumpSpeed;
  let flightFrames = 0;
  for (let f = 0; f < 500; f++) {
    y += vy;
    vy += gravity;
    flightFrames = f + 1;
    if (f > 0 && y >= 0) break;
  }

  const maxH = jumpSpeed * (jumpSpeed + gravity) / (2 * gravity);
  return {
    apexFrames,
    flightFrames,
    maxJumpHeightPx: maxH,
    maxJumpHeightTiles: maxH / tileSizePx,
  };
}

export function solveForwardSpeedForDistance({ gravity, jumpSpeed, distanceTiles, tileSizePx, landingOffsetPx = 0 }) {
  const dPx = distanceTiles * tileSizePx - landingOffsetPx;
  const profile = getJumpProfile({ gravity, jumpSpeed, tileSizePx });
  return dPx / profile.flightFrames;
}

// ─── Internal: Arc Simulation ──────────────────────────────────────────

function simArc(sx, sy, vx, vy, g, max = 300) {
  const pts = [];
  let x = sx, y = sy, cvy = vy;
  for (let f = 0; f < max; f++) {
    x += vx;
    y += cvy;
    cvy += g;
    pts.push({ x, y, vy: cvy, f: f + 1 });
  }
  return pts;
}

// ─── Internal: Transition Search ───────────────────────────────────────

/**
 * Search the full takeoff window on `from` anchor for a jump/drop to `to`.
 * Returns { ok, takeoffLeftX, landingX, frames } or { ok: false }.
 *
 * Anchor shape: { x (left col), y (surface row), w (width in tiles) }
 * Surface row y means the solid tile is at row y; player feet sit at y * ts.
 */
function tryTransition(aFrom, aTo, phys) {
  const { ts, g, fs, js, pw, ph } = phys;

  const fromSurf = aFrom.y * ts;   // feet position on source
  const toSurf   = aTo.y * ts;     // feet position on target

  // Takeoff window: anywhere the player can stand on source
  const takeL = aFrom.x * ts;
  const takeR = (aFrom.x + aFrom.w) * ts - pw;

  // Landing window on target
  const landL = aTo.x * ts;
  const landR = (aTo.x + aTo.w) * ts - pw;

  if (takeR < takeL || landR < landL) return { ok: false };

  // Decide initial vy: jump if target is at or above source, drop otherwise
  const isJump = toSurf <= fromSurf + ts;
  const vy0 = isJump ? -js : 0;

  const step = ts * 0.5;
  for (let tx = takeL; tx <= takeR + 0.01; tx += step) {
    const startY = fromSurf - ph;   // player top-left
    const arc = simArc(tx, startY, fs, vy0, g);

    for (const p of arc) {
      const bot = p.y + ph;

      // Only consider landing when falling (or dropping)
      if (p.vy <= 0 && isJump) continue;

      // Did player bottom cross target surface?
      if (bot >= toSurf && bot <= toSurf + ts * 1.5) {
        // Horizontal overlap check (center of player within landing zone)
        const cx = p.x + pw / 2;
        if (cx >= landL && cx <= landR + pw / 2) {
          return { ok: true, takeoffLeftX: tx, landingX: p.x, frames: p.f };
        }
      }

      // Bail if fell way below target
      if (bot > toSurf + ts * 10) break;
    }
  }

  return { ok: false };
}

// ─── Segment Archetypes ────────────────────────────────────────────────
// Each: (grid, col, row, remaining, phys, rng) →
//   { exitCol, exitRow, exitW, segAnchors[], type, ...meta } | null
// `col` is the first column of the segment (right after previous anchor).
// `row` is the surface row the player is currently on.

function segFlatRun(g, col, row, rem, phys, rng) {
  const w = Math.min(6 + Math.floor(rng() * 11), rem);
  if (w < 4) return null;
  gRect(g, col, row, w, 2, T_SOLID);
  for (let c = col; c < col + w; c++) if (rng() < 0.12) gSet(g, c, row, T_ACCENT);
  return {
    exitCol: col + w, exitRow: row, exitW: w,
    segAnchors: [{ x: col, y: row, w }],
    type: 'flat_run',
  };
}

function segGapJump(g, col, row, rem, phys, rng) {
  const preW  = 3 + Math.floor(rng() * 2);
  const gap   = 2 + Math.floor(rng() * 3);
  const postW = 3 + Math.floor(rng() * 2);
  const tw = preW + gap + postW;
  if (tw > rem) return null;
  gRect(g, col, row, preW, 2, T_SOLID);
  // gap stays air
  gRect(g, col + preW + gap, row, postW, 2, T_SOLID);
  return {
    exitCol: col + tw, exitRow: row, exitW: postW,
    segAnchors: [
      { x: col, y: row, w: preW },
      { x: col + preW + gap, y: row, w: postW },
    ],
    type: 'gap_jump',
  };
}

function segSpikeTrench(g, col, row, rem, phys, rng) {
  const preW  = 3 + Math.floor(rng() * 2);
  const pit   = 3 + Math.floor(rng() * 3);
  const postW = 3 + Math.floor(rng() * 2);
  const tw = preW + pit + postW;
  if (tw > rem) return null;
  gRect(g, col, row, preW, 2, T_SOLID);
  for (let c = col + preW; c < col + preW + pit; c++) {
    gSet(g, c, row, T_AIR);
    gSet(g, c, row + 1, T_SPIKE);
  }
  gRect(g, col + preW + pit, row, postW, 2, T_SOLID);
  return {
    exitCol: col + tw, exitRow: row, exitW: postW,
    segAnchors: [
      { x: col, y: row, w: preW },
      { x: col + preW + pit, y: row, w: postW },
    ],
    type: 'spike_trench',
  };
}

function segLavaPit(g, col, row, rem, phys, rng) {
  const preW  = 3 + Math.floor(rng() * 2);
  const pit   = 4 + Math.floor(rng() * 5);
  const postW = 3 + Math.floor(rng() * 2);
  const tw = preW + pit + postW;
  if (tw > rem) return null;
  gRect(g, col, row, preW, 2, T_SOLID);
  for (let c = col + preW; c < col + preW + pit; c++) {
    gSet(g, c, row, T_AIR);
    gSet(g, c, row + 1, T_LAVA);
  }
  gRect(g, col + preW + pit, row, postW, 2, T_SOLID);
  return {
    exitCol: col + tw, exitRow: row, exitW: postW,
    segAnchors: [
      { x: col, y: row, w: preW },
      { x: col + preW + pit, y: row, w: postW },
    ],
    type: 'lava_pit',
  };
}

function segStairClimb(g, col, row, rem, phys, rng) {
  // Use physics to determine step dimensions
  // Simulate a 1-tile-up jump to find the landing horizontal distance
  const { ts, g: grav, fs, js } = phys;
  const targetYPx = -ts; // 1 tile above start (negative = up)
  const arc = simArc(0, 0, fs, -js, grav);
  let landDist = -1;
  for (const p of arc) {
    // On descent, find first frame where y crosses targetYPx from above
    if (p.vy > 0 && p.y <= targetYPx + ts * 0.5 && p.y >= targetYPx - ts * 0.5) {
      landDist = p.x;
      break;
    }
  }
  if (landDist < 0) return null; // can't reach 1-tile-up

  const stepRun = Math.max(3, Math.ceil(landDist / ts) + 1); // tiles per step, + margin
  const steps = 2 + Math.floor(rng() * 3); // 2-4 steps
  const totalRise = steps;
  const totalW = steps * stepRun + 3; // + landing pad

  if (totalW > rem || row - totalRise < 2) return null;
  if (totalRise > phys.maxH - 1) return null;

  let cx = col, cy = row;
  for (let s = 0; s < steps; s++) {
    cy -= 1;
    gRect(g, cx, cy, stepRun, row - cy + 1, T_SOLID);
    cx += stepRun;
  }
  // Landing pad at top
  gRect(g, cx, cy, 3, 2, T_SOLID);

  return {
    exitCol: cx + 3, exitRow: cy, exitW: 3,
    segAnchors: [{ x: cx, y: cy, w: 3 }],
    type: 'stair_climb',
    totalRiseTiles: totalRise,
  };
}

function segStairDescent(g, col, row, rem, phys, rng) {
  const steps = 2 + Math.floor(rng() * 3);
  const stepW = 3;
  const totalDrop = steps;
  const totalW = steps * stepW + 3;
  if (totalW > rem || row + totalDrop >= (phys.groundSurface ?? phys.gridH - 3)) return null;

  let cx = col, cy = row;
  for (let s = 0; s < steps; s++) {
    cy += 1;
    gRect(g, cx, cy, stepW, 2, T_SOLID);
    cx += stepW;
  }
  gRect(g, cx, cy, 3, 2, T_SOLID);

  return {
    exitCol: cx + 3, exitRow: cy, exitW: 3,
    segAnchors: [{ x: cx, y: cy, w: 3 }],
    type: 'stair_descent',
    totalDropTiles: totalDrop,
  };
}

function segPlatformAscent(g, col, row, rem, phys, rng) {
  const count = 3 + Math.floor(rng() * 3);
  const platW = 2 + Math.floor(rng() * 2);
  const risePer = 1;
  const gapBase = 2 + Math.floor(rng() * 2);
  const totalRise = count * risePer;
  if (row - totalRise < 2 || totalRise > phys.maxH - 1) return null;

  let cx = col, cy = row;
  const anchors = [];
  for (let i = 0; i < count; i++) {
    cx += gapBase;
    cy -= risePer;
    if (cx + platW > col + rem || cy < 1) return null;
    for (let c = cx; c < cx + platW; c++) gSet(g, c, cy, T_ONEWAY);
    anchors.push({ x: cx, y: cy, w: platW });
    cx += platW;
  }
  // Solid landing at top
  const land = 3 + Math.floor(rng() * 3);
  cx += 2;
  if (cx + land > col + rem) return null;
  gRect(g, cx, cy, land, 2, T_SOLID);
  anchors.push({ x: cx, y: cy, w: land });

  return {
    exitCol: cx + land, exitRow: cy, exitW: land,
    segAnchors: anchors,
    type: 'platform_ascent',
    totalRiseTiles: totalRise,
  };
}

function segPrecisionPlatforms(g, col, row, rem, phys, rng) {
  const count = 3 + Math.floor(rng() * 4);
  const platW = 1 + Math.floor(rng() * 2);
  const gapBase = 2 + Math.floor(rng() * 2);

  let cx = col, cy = row;
  const anchors = [];
  for (let i = 0; i < count; i++) {
    cx += gapBase + Math.floor(rng() * 2);
    const dy = Math.floor(rng() * 3) - 1;
    cy = Math.max(2, Math.min((phys.groundSurface ?? phys.gridH - 3) - 1, cy + dy));
    if (cx + platW > col + rem) return null;
    for (let c = cx; c < cx + platW; c++) gSet(g, c, cy, T_ONEWAY);
    anchors.push({ x: cx, y: cy, w: platW });
    cx += platW;
  }
  const land = 3 + Math.floor(rng() * 2);
  cx += 2;
  if (cx + land > col + rem) return null;
  gRect(g, cx, row, land, 2, T_SOLID);
  anchors.push({ x: cx, y: row, w: land });

  return {
    exitCol: cx + land, exitRow: row, exitW: land,
    segAnchors: anchors,
    type: 'precision_platforms',
  };
}

function segFloatingBridge(g, col, row, rem, phys, rng) {
  const count = 2 + Math.floor(rng() * 3);
  const platW = 2 + Math.floor(rng() * 3);
  const gapBase = 2 + Math.floor(rng() * 2);

  let cx = col;
  const anchors = [];
  for (let i = 0; i < count; i++) {
    cx += gapBase;
    const dy = Math.floor(rng() * 3) - 1;
    const cy = Math.max(2, Math.min((phys.groundSurface ?? phys.gridH - 3) - 1, row + dy));
    if (cx + platW > col + rem) return null;
    for (let c = cx; c < cx + platW; c++) gSet(g, c, cy, T_ONEWAY);
    anchors.push({ x: cx, y: cy, w: platW });
    cx += platW;
  }
  const land = 3 + Math.floor(rng() * 2);
  cx += 2;
  if (cx + land > col + rem) return null;
  gRect(g, cx, row, land, 2, T_SOLID);
  anchors.push({ x: cx, y: row, w: land });

  return {
    exitCol: cx + land, exitRow: row, exitW: land,
    segAnchors: anchors,
    type: 'floating_bridge',
  };
}

function segPillarField(g, col, row, rem, phys, rng) {
  const count = 3 + Math.floor(rng() * 4);
  const pillarW = 2 + Math.floor(rng() * 2);
  const gapBase = 2 + Math.floor(rng() * 2);

  let cx = col;
  const anchors = [];
  for (let i = 0; i < count; i++) {
    cx += gapBase;
    const pillarH = 3 + Math.floor(rng() * 5);
    const topY = row - pillarH + 1;
    if (topY < 1 || cx + pillarW > col + rem) return null;
    gRect(g, cx, topY, pillarW, pillarH + 1, T_SOLID);
    if (rng() < 0.4)
      for (let c = cx; c < cx + pillarW; c++) gSet(g, c, topY, T_ONEWAY);
    anchors.push({ x: cx, y: topY, w: pillarW });
    cx += pillarW;
  }
  const land = 3 + Math.floor(rng() * 2);
  cx += 2;
  if (cx + land > col + rem) return null;
  gRect(g, cx, row, land, 2, T_SOLID);
  anchors.push({ x: cx, y: row, w: land });

  return {
    exitCol: cx + land, exitRow: row, exitW: land,
    segAnchors: anchors,
    type: 'pillar_field',
  };
}

function segDropShaft(g, col, row, rem, phys, rng) {
  const dropH = 3 + Math.floor(rng() * 4);
  if (row + dropH >= (phys.groundSurface ?? phys.gridH - 3)) return null;

  const preW  = 3 + Math.floor(rng() * 2);
  const postW = 4 + Math.floor(rng() * 3);
  const tw = preW + 3 + postW;
  if (tw > rem) return null;

  gRect(g, col, row, preW, 2, T_SOLID);
  const newY = row + dropH;
  gRect(g, col + preW, newY, postW + 3, 2, T_SOLID);

  return {
    exitCol: col + tw, exitRow: newY, exitW: postW,
    segAnchors: [
      { x: col, y: row, w: preW },
      { x: col + preW, y: newY, w: postW },
    ],
    type: 'drop_shaft',
    totalDropTiles: dropH,
  };
}

function segClimbTower(g, col, row, rem, phys, rng) {
  const shelves = 4 + Math.floor(rng() * 4);
  const shelfW = 2 + Math.floor(rng() * 2);
  const totalRise = shelves;
  if (row - totalRise < 2) return null;

  let cx = col, cy = row;
  const anchors = [];
  let backtrackSteps = 0;
  for (let i = 0; i < shelves; i++) {
    cy -= 1;
    const dx = 1 + Math.floor(rng() * 2);
    cx += dx;
    if (cx + shelfW > col + rem || cy < 1) return null;

    // Optional left-extend for backtracking
    const ext = rng() < 0.3 ? 1 + Math.floor(rng() * 2) : 0;
    if (ext > 0) {
      for (let c = Math.max(0, cx - ext); c < cx; c++) gSet(g, c, cy, T_ONEWAY);
      backtrackSteps += ext;
    }
    for (let c = cx; c < cx + shelfW; c++) gSet(g, c, cy, T_ONEWAY);
    anchors.push({ x: Math.max(0, cx - ext), y: cy, w: shelfW + ext });
    cx += shelfW;
  }
  const land = 3 + Math.floor(rng() * 3);
  cx += 2;
  if (cx + land > col + rem) return null;
  gRect(g, cx, cy, land, 2, T_SOLID);
  anchors.push({ x: cx, y: cy, w: land });

  return {
    exitCol: cx + land, exitRow: cy, exitW: land,
    segAnchors: anchors,
    type: 'climb_tower',
    totalRiseTiles: totalRise,
    backtrackStepCount: backtrackSteps,
  };
}

// ─── Segment Registry ──────────────────────────────────────────────────

const SEGMENTS = [
  { fn: segFlatRun,            w: 15, name: 'flat_run' },
  { fn: segGapJump,            w: 10, name: 'gap_jump' },
  { fn: segSpikeTrench,        w: 8,  name: 'spike_trench' },
  { fn: segLavaPit,            w: 8,  name: 'lava_pit' },
  { fn: segStairClimb,         w: 8,  name: 'stair_climb' },
  { fn: segStairDescent,       w: 8,  name: 'stair_descent' },
  { fn: segPlatformAscent,     w: 7,  name: 'platform_ascent' },
  { fn: segPrecisionPlatforms, w: 7,  name: 'precision_platforms' },
  { fn: segFloatingBridge,     w: 7,  name: 'floating_bridge' },
  { fn: segPillarField,        w: 5,  name: 'pillar_field' },
  { fn: segDropShaft,          w: 5,  name: 'drop_shaft' },
  { fn: segClimbTower,         w: 4,  name: 'climb_tower' },
];

function pickSegment(segments, recent, curRow, midRow, rng, variation) {
  const aer = variation?.aerialDensity ?? 0.7;

  // Adjust weights: reduce recently-used types, bias vertical direction
  const weighted = segments.map(s => {
    let wt = s.w;
    // Penalise repeats
    const recency = recent.filter(r => r === s.name).length;
    wt *= Math.max(0.2, 1 - recency * 0.3);

    // Bias aerial segments based on aerialDensity
    const isAerial = ['platform_ascent', 'precision_platforms', 'floating_bridge',
                       'climb_tower', 'pillar_field'].includes(s.name);
    if (isAerial) wt *= (0.5 + aer);

    // Bias vertical direction: if near top, prefer descent; near bottom, prefer ascent
    const isUp = ['stair_climb', 'platform_ascent', 'climb_tower'].includes(s.name);
    const isDown = ['stair_descent', 'drop_shaft'].includes(s.name);
    if (curRow < midRow && isUp) wt *= 0.4;
    if (curRow > midRow + 2 && isDown) wt *= 0.4;
    if (curRow > midRow + 2 && isUp) wt *= 1.5;
    if (curRow < midRow && isDown) wt *= 1.5;

    return { ...s, wt };
  });

  const total = weighted.reduce((s, x) => s + x.wt, 0);
  let r = rng() * total;
  for (const s of weighted) {
    r -= s.wt;
    if (r <= 0) return s;
  }
  return weighted[weighted.length - 1];
}

// ─── Route Builder ─────────────────────────────────────────────────────

function buildRoute(tiles, width, height, phys, rng, variation) {
  // Ground surface: the lowest row the route can use.
  // Leave 3 rows below for the visual ground fill.
  const groundSurface = height - 5;
  phys.groundSurface = groundSurface;

  const startW = 4;
  const anchors = [{ x: 0, y: groundSurface, w: startW }];
  const transitions = [];
  const segments = [];
  const archetypes = new Set();

  let lastAnchor = anchors[0];
  let col = startW;
  const recent = [];
  const midRow = Math.floor(groundSurface / 2);
  const maxAttempts = 64;
  let attempts = 0;

  while (col < width - 10 && attempts < maxAttempts) {
    const seg = pickSegment(SEGMENTS, recent, lastAnchor.y, midRow, rng, variation);
    const result = seg.fn(tiles, col, lastAnchor.y, width - col, phys, rng);
    if (!result) { attempts++; continue; }

    // Reject if any anchor goes below the ground surface
    const belowGround = result.segAnchors.some(a => a.y > groundSurface);
    if (belowGround) { attempts++; continue; }

    // Validate all transitions within this segment
    let valid = true;
    const newTrans = [];
    let prev = lastAnchor;

    for (const anc of result.segAnchors) {
      const isWalk = anc.y === prev.y && anc.x === prev.x + prev.w;
      if (isWalk) {
        newTrans.push({ from: prev, to: anc, type: 'walk' });
      } else {
        const t = tryTransition(prev, anc, phys);
        if (!t.ok) { valid = false; break; }
        newTrans.push({
          from: prev, to: anc,
          type: anc.y < prev.y ? 'jump' : 'drop',
          takeoffLeftX: t.takeoffLeftX,
          landingX: t.landingX,
          frames: t.frames,
        });
      }
      prev = anc;
    }

    if (!valid) { attempts++; continue; }

    // Commit segment
    anchors.push(...result.segAnchors);
    transitions.push(...newTrans);
    segments.push({
      type: result.type,
      anchors: result.segAnchors,
      startCol: col,
      width: result.exitCol - col,
      ...(result.totalRiseTiles != null ? { totalRiseTiles: result.totalRiseTiles } : {}),
      ...(result.totalDropTiles != null ? { totalDropTiles: result.totalDropTiles } : {}),
      ...(result.backtrackStepCount != null ? { backtrackStepCount: result.backtrackStepCount } : {}),
    });
    archetypes.add(result.type);
    recent.push(result.type);
    if (recent.length > 6) recent.shift();

    lastAnchor = result.segAnchors[result.segAnchors.length - 1];
    col = result.exitCol;
    attempts = 0;
  }

  // Fill remaining with ground-level run to the end
  if (col < width) {
    gRect(tiles, col, lastAnchor.y, width - col, 2, T_SOLID);
    const end = { x: col, y: lastAnchor.y, w: width - col };
    anchors.push(end);
    transitions.push({ from: lastAnchor, to: end, type: 'walk' });
  }

  // Find the lowest row any anchor reaches, then fill solid ground below it.
  // This ensures the visual ground layer is always below the route.
  const lowestRow = anchors.reduce((m, a) => Math.max(m, a.y), 0);
  const groundFillStart = lowestRow + 2; // 2 rows of solid below lowest surface
  if (groundFillStart < height) {
    gRect(tiles, 0, groundFillStart, width, height - groundFillStart, T_SOLID);
  }

  return { anchors, transitions, segments, archetypes: [...archetypes] };
}

// ─── Optional Platforms ────────────────────────────────────────────────

function addOptionalPlatforms(tiles, anchors, phys, rng, density) {
  const placed = [];
  const { ts, g, fs, js, pw, ph, gridH, maxH } = phys;

  for (let attempt = 0; attempt < Math.floor(anchors.length * 6 * density); attempt++) {
    const baseAnchor = anchors[Math.floor(rng() * anchors.length)];
    if (baseAnchor.w < 2) continue;

    // Place a small one-way platform nearby
    const offsetX = Math.floor(rng() * 20) - 5;
    const offsetY = Math.floor(rng() * 5) - 2;
    const platX = baseAnchor.x + offsetX;
    const platY = baseAnchor.y + offsetY;
    const platW = 1 + Math.floor(rng() * 3);

    if (platX < 0 || platX + platW >= tiles[0].length) continue;
    if (platY < 1 || platY >= gridH - 1) continue;
    // Must be within jump range
    if (Math.abs(offsetY) > maxH - 1) continue;
    // Don't overwrite existing tiles
    let blocked = false;
    for (let c = platX; c < platX + platW; c++) {
      if (tiles[platY][c] !== T_AIR) { blocked = true; break; }
    }
    if (blocked) continue;

    // Place it
    for (let c = platX; c < platX + platW; c++) gSet(tiles, c, platY, T_ONEWAY);

    // Validate that it doesn't overlap any route anchor
    const overlapsAnchor = anchors.some(a =>
      platY === a.y && platX + platW > a.x && platX < a.x + a.w
    );
    if (overlapsAnchor) {
      // Undo
      for (let c = platX; c < platX + platW; c++) gSet(tiles, c, platY, T_AIR);
      continue;
    }

    placed.push({ x: platX, y: platY, w: platW });
  }

  return placed;
}

// ─── Post-processing: Platform Cleanup Near Ground ─────────────────────
// Platforms (T_ONEWAY) that sit right on top of solid become solid themselves.
// Platforms with only 1 air gap beneath are removed (they serve no purpose).
// Platforms with 2+ air gaps beneath are kept.

function cleanPlatformsNearGround(tiles) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] !== T_ONEWAY) continue;
      // Count air tiles directly below this platform tile
      let airGaps = 0;
      let rr = r + 1;
      while (rr < rows && tiles[rr][c] === T_AIR) {
        airGaps++;
        rr++;
      }
      // If we hit the bottom edge without finding solid, leave as-is
      if (rr >= rows) continue;
      if (airGaps === 0) {
        // Platform directly on solid → replace with solid
        tiles[r][c] = T_SOLID;
      } else if (airGaps === 1) {
        // Only 1 air gap → pointless platform, remove it
        tiles[r][c] = T_AIR;
      }
      // airGaps >= 2: keep the platform
    }
  }
}

// ─── Exported: Generator ───────────────────────────────────────────────

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
  variation,
} = {}) {
  const profile = getJumpProfile({ gravity, jumpSpeed, tileSizePx });

  // Internal physics bag (short names for hot loops)
  const phys = {
    ts: tileSizePx,
    g: gravity,
    fs: forwardSpeed,
    js: jumpSpeed,
    pw: playerWidthPx,
    ph: playerHeightPx,
    maxH: profile.maxJumpHeightTiles,
    gridH: height,
  };

  const var_ = {
    aerialDensity: 0.7,
    precisionBias: 0.75,
    optionalPlatformDensity: 0.45,
    placementJitter: 0.6,
    ...variation,
  };

  const tiles = makeGrid(width, height);

  const route = buildRoute(tiles, width, height, phys, rng, var_);

  // Optional platforms
  const optionalPlatforms = addOptionalPlatforms(
    tiles, route.anchors, phys, rng, var_.optionalPlatformDensity
  );

  // Post-processing: clean up platforms too close to ground
  cleanPlatformsNearGround(tiles);

  return {
    tiles,
    tileKey: DEFAULT_TILE_KEY,
    movementProfile: {
      ...profile,
      forwardSpeed,
      jumpSpeed,
      gravity,
      tileSizePx,
    },
    routeMetadata: {
      ...route,
      optionalPlatforms,
      validation: null, // filled below
    },
  };
}

// ─── Exported: Validator ───────────────────────────────────────────────

export function validatePlatformerMap({
  tiles, routeMetadata, tileSizePx, gravity, forwardSpeed,
  jumpSpeed, playerWidthPx, playerHeightPx,
}) {
  const phys = {
    ts: tileSizePx, g: gravity, fs: forwardSpeed, js: jumpSpeed,
    pw: playerWidthPx, ph: playerHeightPx,
    maxH: 0, gridH: tiles.length,
  };

  const anchors = routeMetadata.anchors;
  const diagnostics = [];

  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1];
    const to = anchors[i];
    const isWalk = to.y === from.y && to.x === from.x + from.w;

    if (isWalk) {
      diagnostics.push({ from: i - 1, to: i, type: 'walk', ok: true });
    } else {
      const t = tryTransition(from, to, phys);
      diagnostics.push({
        from: i - 1, to: i,
        type: to.y < from.y ? 'jump' : 'drop',
        ok: t.ok,
        takeoffLeftX: t.ok ? t.takeoffLeftX : null,
        landingX: t.ok ? t.landingX : null,
      });
    }
  }

  const allOk = diagnostics.every(d => d.ok);
  return { ok: allOk, transitions: diagnostics };
}

// ─── Exported: PNG Helpers ─────────────────────────────────────────────

export function createRandomDarkTilePalette({ tiles, rng = Math.random, backgroundColor = [255, 255, 255, 255] }) {
  const ids = new Set();
  for (const row of tiles) for (const t of row) if (t !== 0) ids.add(t);
  const palette = { 0: backgroundColor };
  for (const id of ids) {
    palette[id] = [
      Math.floor(rng() * 180),
      Math.floor(rng() * 180),
      Math.floor(rng() * 180),
      255,
    ];
  }
  return palette;
}

// Minimal CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typ = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typ, data])), 0);
  return Buffer.concat([len, typ, data, crcBuf]);
}

function encodePng(w, h, pixels) {
  // pixels: Buffer of RGBA, w*h*4 bytes
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    pixels.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderTileMapToPngBuffer({
  tiles, blockSizePx = 4,
  backgroundColor = [255, 255, 255, 255],
  colorByTileId = null, rng = Math.random,
}) {
  const palette = colorByTileId ?? createRandomDarkTilePalette({ tiles, rng, backgroundColor });
  const w = tiles[0].length * blockSizePx;
  const h = tiles.length * blockSizePx;
  const buf = Buffer.alloc(w * h * 4);

  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[0].length; c++) {
      const color = palette[tiles[r][c]] ?? palette[0] ?? [255, 0, 255, 255];
      for (let dy = 0; dy < blockSizePx; dy++) {
        for (let dx = 0; dx < blockSizePx; dx++) {
          const px = (r * blockSizePx + dy) * w + (c * blockSizePx + dx);
          buf[px * 4]     = color[0];
          buf[px * 4 + 1] = color[1];
          buf[px * 4 + 2] = color[2];
          buf[px * 4 + 3] = color[3];
        }
      }
    }
  }

  return { buffer: encodePng(w, h, buf), palette };
}

export function writeTileMapToPng({
  tiles, outputPath, blockSizePx = 4,
  backgroundColor = [255, 255, 255, 255],
  colorByTileId = null, rng = Math.random,
}) {
  const { buffer, palette } = renderTileMapToPngBuffer({
    tiles, blockSizePx, backgroundColor, colorByTileId, rng,
  });
  writeFileSync(outputPath, buffer);
  return palette;
}

// ─── CLI: generate sample ──────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const seed = parseInt(process.argv[2], 10) || 42;
  const rng = mulberry32(seed);

  const gravity = 0.15;
  const tileSizePx = 8;
  const jumpSpeed = solveJumpSpeedForHeight({ gravity, targetHeightTiles: 4.2, tileSizePx });
  const profile = getJumpProfile({ gravity, jumpSpeed, tileSizePx });
  const forwardSpeed = solveForwardSpeedForDistance({
    gravity, jumpSpeed, distanceTiles: 5, tileSizePx,
  });

  console.log('=== Platformer Map Generator (fresh) ===');
  console.log(`Seed: ${seed}`);
  console.log(`jumpSpeed: ${jumpSpeed.toFixed(4)}  apexFrames: ${profile.apexFrames}  flightFrames: ${profile.flightFrames}`);
  console.log(`forwardSpeed: ${forwardSpeed.toFixed(4)}  maxJumpHeight: ${profile.maxJumpHeightTiles.toFixed(2)} tiles`);

  const result = generatePlatformerMap({
    width: 300,
    height: 20,
    tileSizePx,
    gravity,
    forwardSpeed,
    jumpSpeed,
    playerWidthPx: 6,
    playerHeightPx: 12,
    rng,
    variation: {
      aerialDensity: 0.7,
      precisionBias: 0.75,
      optionalPlatformDensity: 0.45,
      placementJitter: 0.6,
    },
  });

  // Validate
  const validation = validatePlatformerMap({
    tiles: result.tiles,
    routeMetadata: result.routeMetadata,
    tileSizePx,
    gravity,
    forwardSpeed,
    jumpSpeed,
    playerWidthPx: 6,
    playerHeightPx: 12,
  });
  result.routeMetadata.validation = validation;

  console.log(`\nRoute: ${result.routeMetadata.anchors.length} anchors, ${result.routeMetadata.segments.length} segments`);
  console.log(`Segment types: ${result.routeMetadata.archetypes.join(', ')}`);
  console.log(`Optional platforms: ${result.routeMetadata.optionalPlatforms.length}`);
  console.log(`Validation: ${validation.ok ? 'PASS' : 'FAIL'}`);
  if (!validation.ok) {
    for (const t of validation.transitions) {
      if (!t.ok) console.log(`  FAIL: anchor ${t.from} → ${t.to} (${t.type})`);
    }
  }

  // Text preview
  const CHARS = { 0: ' ', 1: '#', 2: '-', 3: '^', 4: '~', 5: '%' };
  const preview = result.tiles.map(row => row.map(t => CHARS[t] || '?').join('')).join('\n');
  console.log(`\nMap preview (${result.tiles[0].length}x${result.tiles.length}):\n${preview}`);

  // Write PNG
  const outPath = 'tmp/fresh_platformer_map.png';
  const palette = writeTileMapToPng({ tiles: result.tiles, outputPath: outPath, blockSizePx: 4, rng });
  console.log(`\nPNG written to ${outPath}`);
  console.log('Palette:', Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, `rgb(${v.join(',')})`])));

  // Write JSON
  const jsonPath = 'tmp/fresh_platformer_map.json';
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to ${jsonPath}`);
}
