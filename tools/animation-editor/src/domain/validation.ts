import { z } from 'zod';
import type {
  EntityProfile,
  ValidationIssue,
  WeaponChain,
  WeaponFrame,
  WeaponsFile,
} from './types';
import { makeIssueId } from './utils';

const bboxSchema = z
  .object({
    x1: z.number().int(),
    y1: z.number().int(),
    x2: z.number().int(),
    y2: z.number().int(),
  })
  .strict();

const spriteArraySchema = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

const spriteSchema = z.union([z.number().int(), spriteArraySchema, z.null()]);

const weaponFrameSchema = z
  .object({
    sprite: spriteSchema,
    bbox: bboxSchema.nullable(),
    xm: z.number().optional(),
    ym: z.number().optional(),
  })
  .passthrough();

const weaponChainSchema = z
  .object({
    power: z.number(),
    anim_duration: z.number().int().positive(),
    cancel: z.number().int().optional(),
    sfx: z.string(),
    knockback: z.object({ x: z.number(), y: z.number() }).strict(),
    origin: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    stopMove: z.boolean().optional(),
    eval: z.string().optional(),
    frames: z.record(weaponFrameSchema).optional(),
  })
  .passthrough();

const entityStateSchema = z
  .object({
    anim: z.record(z.number().int()),
    reset: z.number().int(),
  })
  .strict();

const entityProfileSchema = z
  .object({
    id: z.string().min(1),
    entityName: z.string().min(1),
    spriteSheetPath: z.string().min(1),
    bbox: bboxSchema,
    states: z.record(entityStateSchema),
  })
  .strict();

const weaponsFileSchema = z.record(z.array(weaponChainSchema));

function addIssue(
  issues: ValidationIssue[],
  severity: 'error' | 'warning',
  path: string,
  message: string,
): void {
  const blocking = severity === 'error';
  issues.push({
    id: makeIssueId(severity, path),
    severity,
    path,
    message,
    blocking,
  });
}

function validateBboxValue(path: string, value: unknown, issues: ValidationIssue[]): void {
  const parsed = bboxSchema.safeParse(value);
  if (!parsed.success) {
    addIssue(issues, 'error', path, 'Invalid bbox object');
    return;
  }
  const bbox = parsed.data;
  if (bbox.x1 > bbox.x2) {
    addIssue(issues, 'error', `${path}.x1`, 'x1 must be <= x2');
  }
  if (bbox.y1 > bbox.y2) {
    addIssue(issues, 'error', `${path}.y1`, 'y1 must be <= y2');
  }
}

function collectThresholdKeyIssues(
  path: string,
  map: Record<string, unknown>,
  issues: ValidationIssue[],
): number[] {
  const thresholds: number[] = [];
  const seen = new Set<number>();

  for (const key of Object.keys(map)) {
    const value = Number(key);
    if (!Number.isInteger(value) || value < 0) {
      addIssue(issues, 'error', `${path}.${key}`, 'Threshold key must be an integer >= 0');
      continue;
    }
    if (seen.has(value)) {
      addIssue(issues, 'error', `${path}.${key}`, `Duplicate threshold ${value}`);
      continue;
    }
    seen.add(value);
    thresholds.push(value);
  }

  thresholds.sort((a, b) => a - b);
  if (!seen.has(0)) {
    addIssue(issues, 'error', path, 'Threshold map must contain a 0 key');
  }

  return thresholds;
}

function validateSprite(path: string, sprite: unknown, issues: ValidationIssue[]): void {
  const parsed = spriteSchema.safeParse(sprite);
  if (!parsed.success) {
    addIssue(issues, 'error', path, 'Sprite must be an integer, [start,width,height], or null');
    return;
  }

  if (typeof parsed.data === 'number') {
    if (parsed.data < 0) {
      addIssue(issues, 'error', path, 'Sprite integer must be >= 0');
    }
    return;
  }

  if (parsed.data === null) {
    return;
  }

  const [start, width, height] = parsed.data;
  if (start < 0) {
    addIssue(issues, 'error', `${path}[0]`, 'Sprite block start must be >= 0');
  }
  if (width <= 0) {
    addIssue(issues, 'error', `${path}[1]`, 'Sprite block width must be > 0');
  }
  if (height <= 0) {
    addIssue(issues, 'error', `${path}[2]`, 'Sprite block height must be > 0');
  }
}

function validateEntityRules(entity: EntityProfile, issues: ValidationIssue[]): void {
  validateBboxValue(`${entity.entityName}.bbox`, entity.bbox, issues);

  if (
    entity.bbox.x1 < 0 ||
    entity.bbox.y1 < 0 ||
    entity.bbox.x2 > 7 ||
    entity.bbox.y2 > 7
  ) {
    addIssue(
      issues,
      'warning',
      `${entity.entityName}.bbox`,
      'Body bbox extends outside nominal 8x8 tile extents',
    );
  }

  for (const [stateKey, state] of Object.entries(entity.states)) {
    const path = `${entity.entityName}.states.${stateKey}.anim`;
    const thresholds = collectThresholdKeyIssues(path, state.anim, issues);
    if (![-1, 0].includes(state.reset) && state.reset <= 0) {
      addIssue(
        issues,
        'error',
        `${entity.entityName}.states.${stateKey}.reset`,
        'Reset must be -1, 0, or > 0',
      );
    }
    const maxThreshold = thresholds.length > 0 ? thresholds[thresholds.length - 1] : 0;
    if (state.reset > 0 && state.reset <= maxThreshold) {
      addIssue(
        issues,
        'warning',
        `${entity.entityName}.states.${stateKey}.reset`,
        'Reset may loop before the last keyframe is reached',
      );
    }
  }
}

function validateWeaponFrameRules(
  weaponName: string,
  chainIndex: number,
  threshold: string,
  frame: WeaponFrame,
  issues: ValidationIssue[],
): void {
  const basePath = `${weaponName}[${chainIndex}].frames.${threshold}`;
  validateSprite(`${basePath}.sprite`, frame.sprite, issues);
  if (frame.bbox !== null) {
    validateBboxValue(`${basePath}.bbox`, frame.bbox, issues);
  }
}

function validateWeaponChainRules(
  weaponName: string,
  chainIndex: number,
  chain: WeaponChain,
  issues: ValidationIssue[],
): void {
  const chainPath = `${weaponName}[${chainIndex}]`;

  if (chain.cancel === undefined) {
    addIssue(
      issues,
      'warning',
      `${chainPath}.cancel`,
      'Cancel is missing; runtime defaults to anim_duration + 1',
    );
  }

  if (chain.eval !== undefined) {
    addIssue(issues, 'warning', `${chainPath}.eval`, 'eval strings are saved but never executed in preview');
  }

  if (chain.frames) {
    const thresholds = collectThresholdKeyIssues(`${chainPath}.frames`, chain.frames, issues);
    for (const threshold of thresholds) {
      const frame = chain.frames[String(threshold)];
      if (!frame) {
        addIssue(issues, 'error', `${chainPath}.frames.${threshold}`, 'Missing frame payload');
        continue;
      }
      validateWeaponFrameRules(weaponName, chainIndex, String(threshold), frame, issues);
    }
  }
}

export function validateEntityProfile(value: unknown): { profile: EntityProfile | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const parsed = entityProfileSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'entity';
      addIssue(issues, 'error', path, issue.message);
    }
    return { profile: null, issues };
  }

  const profile = parsed.data;
  validateEntityRules(profile, issues);
  return { profile, issues };
}

export function validateWeaponsFile(value: unknown): { weapons: WeaponsFile | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const parsed = weaponsFileSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'weapons';
      addIssue(issues, 'error', path, issue.message);
    }
    return { weapons: null, issues };
  }

  const weapons = parsed.data;
  for (const [weaponName, chains] of Object.entries(weapons)) {
    chains.forEach((chain, chainIndex) => validateWeaponChainRules(weaponName, chainIndex, chain, issues));
  }

  return { weapons, issues };
}

export function collectAllIssues(
  entities: EntityProfile[],
  weapons: WeaponsFile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const entity of entities) {
    const result = validateEntityProfile(entity);
    issues.push(...result.issues);
  }

  const weaponResult = validateWeaponsFile(weapons);
  issues.push(...weaponResult.issues);

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.blocking);
}
