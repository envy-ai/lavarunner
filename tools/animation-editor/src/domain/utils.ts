import type { Bbox } from './types';

export function parseThreshold(key: string): number {
  const parsed = Number(key);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid threshold key "${key}": expected integer`);
  }
  if (parsed < 0) {
    throw new Error(`Invalid threshold key "${key}": expected >= 0`);
  }
  return parsed;
}

export function sortedThresholdKeys(map: Record<string, unknown>): number[] {
  return Object.keys(map)
    .map((key) => parseThreshold(key))
    .sort((a, b) => a - b);
}

export function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bboxWidth(bbox: Bbox): number {
  return bbox.x2 - bbox.x1 + 1;
}

export function bboxHeight(bbox: Bbox): number {
  return bbox.y2 - bbox.y1 + 1;
}

export function clampToInteger(value: number): number {
  return Number.isInteger(value) ? value : Math.round(value);
}

export function makeIssueId(prefix: string, path: string): string {
  return `${prefix}:${path}`;
}
