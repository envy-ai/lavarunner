import { describe, expect, it } from 'vitest';
import { validateEntityProfile, validateWeaponsFile } from './validation';

describe('validation', () => {
  it('flags missing threshold 0 in entity states', () => {
    const result = validateEntityProfile({
      id: 'a',
      entityName: 'Player',
      spriteSheetPath: 'sprites/player_default',
      bbox: { x1: 0, y1: 0, x2: 7, y2: 7 },
      states: {
        stand: {
          anim: { '1': 0 },
          reset: 0,
        },
      },
    });

    expect(result.issues.some((issue) => issue.path.includes('states.stand.anim'))).toBe(true);
  });

  it('accepts valid weapon schema and warns on optional fields', () => {
    const result = validateWeaponsFile({
      Sword: [
        {
          power: 2,
          anim_duration: 8,
          sfx: 'slash',
          knockback: { x: 1, y: -1 },
          origin: { x: 0, y: 0 },
          frames: {
            '0': {
              sprite: [0, 1, 1],
              bbox: null,
            },
          },
        },
      ],
    });

    expect(result.weapons).not.toBeNull();
    expect(result.issues.some((issue) => issue.path.endsWith('.cancel'))).toBe(true);
  });

  it('rejects invalid sprite array form', () => {
    const result = validateWeaponsFile({
      Sword: [
        {
          power: 2,
          anim_duration: 8,
          sfx: 'slash',
          knockback: { x: 1, y: -1 },
          origin: { x: 0, y: 0 },
          frames: {
            '0': {
              sprite: [0, 0, 1],
              bbox: null,
            },
          },
        },
      ],
    });

    expect(result.issues.some((issue) => issue.path.includes('.sprite'))).toBe(true);
  });
});
