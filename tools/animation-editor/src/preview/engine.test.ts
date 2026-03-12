import { describe, expect, it } from 'vitest';
import {
  mirrorBboxRightToLeft,
  nextStateCounter,
  overlaps,
  resolveEntitySprite,
  resolveFacingBbox,
  resolveWeaponFrame,
  resolveWeaponRealBbox,
} from './engine';
import type { WeaponChain } from '../domain/types';

describe('preview engine', () => {
  it('resolves entity sprite by latest threshold <= counter', () => {
    const sprite = resolveEntitySprite('move', 7, {
      move: {
        anim: {
          '0': 3,
          '4': 2,
          '8': 1,
        },
      },
    });
    expect(sprite).toBe(2);
  });

  it('matches reset counter semantics', () => {
    expect(nextStateCounter(11, 12)).toBe(0);
    expect(nextStateCounter(0, 0)).toBe(0);
    expect(nextStateCounter(3, -1)).toBe(4);
  });

  it('mirrors bbox right-to-left using runtime equation', () => {
    const mirrored = mirrorBboxRightToLeft({ x1: 2, y1: 1, x2: 6, y2: 7 }, 8);
    expect(mirrored).toEqual({ x1: 1, y1: 1, x2: 6, y2: 7 });
  });

  it('resolves weapon frame from attack timer thresholds', () => {
    const chain: WeaponChain = {
      power: 1,
      anim_duration: 8,
      sfx: 'slash',
      knockback: { x: 1, y: 0 },
      origin: { x: 0, y: 0 },
      frames: {
        '0': { sprite: 1, bbox: null },
        '3': { sprite: 2, bbox: { x1: 0, y1: 0, x2: 1, y2: 1 } },
      },
    };

    const resolved = resolveWeaponFrame(chain, 4);
    expect(resolved.threshold).toBe(3);
    expect(resolved.frame?.sprite).toBe(2);
  });

  it('resolves world weapon bbox and overlap parity', () => {
    const chain: WeaponChain = {
      power: 1,
      anim_duration: 8,
      sfx: 'slash',
      knockback: { x: 1, y: 0 },
      origin: { x: 2, y: 1 },
      frames: {
        '0': { sprite: 1, bbox: { x1: 0, y1: 0, x2: 2, y2: 2 } },
      },
    };

    const facingBbox = resolveFacingBbox(chain.frames?.['0'].bbox ?? null, 'right');
    const world = resolveWeaponRealBbox({
      playerX: 10,
      playerY: 10,
      facing: 'right',
      chain,
      weaponBbox: facingBbox,
    });

    expect(world).toEqual({ x1: 14, y1: 13, x2: 16, y2: 15 });
    expect(overlaps(world!, { x1: 15, y1: 14, x2: 20, y2: 18 })).toBe(true);
  });
});
