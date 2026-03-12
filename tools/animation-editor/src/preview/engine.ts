import {
  PLAYER_WEAPON_ORIGIN_LEFT,
  PLAYER_WEAPON_ORIGIN_RIGHT,
  TILE_SIZE,
} from '../domain/defaults';
import type {
  Bbox,
  FacingMode,
  WeaponChain,
  WeaponFrame,
  WeaponFrameResolution,
} from '../domain/types';
import { sortedThresholdKeys } from '../domain/utils';

export function resolveEntitySprite(
  stateKey: string,
  counter: number,
  states: Record<string, { anim: Record<string, number> }>,
): number {
  const state = states[stateKey];
  if (!state) {
    throw new Error(`Unknown state "${stateKey}"`);
  }
  const anim = state.anim;
  if (!Object.prototype.hasOwnProperty.call(anim, '0')) {
    throw new Error(`State "${stateKey}" is missing required threshold 0`);
  }

  let sprite = anim['0'];
  for (const threshold of sortedThresholdKeys(anim)) {
    if (counter >= threshold) {
      sprite = anim[String(threshold)];
    } else {
      break;
    }
  }
  return sprite;
}

export function nextStateCounter(counter: number, reset: number): number {
  let next = counter + 1;
  if (reset >= 0 && next >= reset) {
    next = 0;
  }
  return next;
}

export function mirrorBboxRightToLeft(bbox: Bbox, tileSize = TILE_SIZE): Bbox {
  return {
    x1: tileSize - bbox.x2 - 1,
    y1: bbox.y1,
    x2: tileSize - bbox.x1,
    y2: bbox.y2,
  };
}

export function resolveWeaponFrame(chain: WeaponChain, attackTimer: number): WeaponFrameResolution {
  if (attackTimer <= 0 || !chain.frames) {
    return { threshold: null, frame: null };
  }

  const weaponFrame = chain.anim_duration - attackTimer - 1;
  const thresholds = sortedThresholdKeys(chain.frames);

  let activeThreshold: number | null = null;
  let activeFrame: WeaponFrame | null = null;
  for (const threshold of thresholds) {
    if (weaponFrame >= threshold) {
      activeThreshold = threshold;
      activeFrame = chain.frames[String(threshold)] ?? null;
    } else {
      break;
    }
  }

  return {
    threshold: activeThreshold,
    frame: activeFrame,
  };
}

export function resolveWeaponRealBbox(params: {
  playerX: number;
  playerY: number;
  facing: Extract<FacingMode, 'right' | 'left'>;
  chain: WeaponChain;
  weaponBbox: Bbox | null;
  playerOriginRight?: { x: number; y: number };
  playerOriginLeft?: { x: number; y: number };
}): Bbox | null {
  const {
    playerX,
    playerY,
    facing,
    chain,
    weaponBbox,
    playerOriginRight = PLAYER_WEAPON_ORIGIN_RIGHT,
    playerOriginLeft = PLAYER_WEAPON_ORIGIN_LEFT,
  } = params;

  if (!weaponBbox) {
    return null;
  }

  if (facing === 'right') {
    const dx = playerX + playerOriginRight.x - chain.origin.x;
    const dy = playerY + playerOriginRight.y - chain.origin.y;
    return {
      x1: weaponBbox.x1 + dx,
      y1: weaponBbox.y1 + dy,
      x2: weaponBbox.x2 + dx,
      y2: weaponBbox.y2 + dy,
    };
  }

  const dx = playerX + playerOriginLeft.x - 7 + chain.origin.x;
  const dy = playerY + playerOriginLeft.y - chain.origin.y;
  return {
    x1: weaponBbox.x1 + dx,
    y1: weaponBbox.y1 + dy,
    x2: weaponBbox.x2 + dx,
    y2: weaponBbox.y2 + dy,
  };
}

export function resolveWeaponSpritePosition(params: {
  playerX: number;
  playerY: number;
  facing: Extract<FacingMode, 'right' | 'left'>;
  chain: WeaponChain;
  playerOriginRight?: { x: number; y: number };
  playerOriginLeft?: { x: number; y: number };
}): { x: number; y: number; flipH: boolean } {
  const {
    playerX,
    playerY,
    facing,
    chain,
    playerOriginRight = PLAYER_WEAPON_ORIGIN_RIGHT,
    playerOriginLeft = PLAYER_WEAPON_ORIGIN_LEFT,
  } = params;

  if (facing === 'right') {
    return {
      x: playerX + playerOriginRight.x - chain.origin.x,
      y: playerY + playerOriginRight.y - chain.origin.y,
      flipH: false,
    };
  }

  // Keep parity with current runtime draw behavior in player.js.
  return {
    x: playerX + playerOriginLeft.x - 7 + chain.origin.x,
    y: playerY + playerOriginRight.y - chain.origin.y,
    flipH: true,
  };
}

export function resolveFacingBbox(
  bbox: Bbox | null,
  facing: Extract<FacingMode, 'right' | 'left'>,
  tileSize = TILE_SIZE,
): Bbox | null {
  if (!bbox) {
    return null;
  }
  return facing === 'right' ? bbox : mirrorBboxRightToLeft(bbox, tileSize);
}

export function overlaps(a: Bbox, b: Bbox): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}
