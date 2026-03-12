import type {
  Bbox,
  EntityProfile,
  PortableBundle,
  WeaponChain,
  WeaponFrame,
  WeaponsFile,
} from './types';

const CHAIN_KEY_ORDER = [
  'power',
  'anim_duration',
  'cancel',
  'sfx',
  'knockback',
  'origin',
  'stopMove',
  'eval',
  'frames',
];

const FRAME_KEY_ORDER = ['sprite', 'bbox', 'xm', 'ym'];

function orderedKeys(keys: string[], preferredOrder: string[]): string[] {
  const preferred = preferredOrder.filter((key) => keys.includes(key));
  const unknown = keys.filter((key) => !preferredOrder.includes(key)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...unknown];
}

function sortNumericStringKeys<T>(record: Record<string, T>): Record<string, T> {
  const keys = Object.keys(record).sort((a, b) => Number(a) - Number(b));
  const result: Record<string, T> = {};
  for (const key of keys) {
    result[key] = record[key];
  }
  return result;
}

function sortBbox(bbox: Bbox): Bbox {
  return {
    x1: bbox.x1,
    y1: bbox.y1,
    x2: bbox.x2,
    y2: bbox.y2,
  };
}

function sortWeaponFrame(frame: WeaponFrame): WeaponFrame {
  const result: WeaponFrame = {
    sprite: frame.sprite,
    bbox: frame.bbox ? sortBbox(frame.bbox) : null,
  };

  if (frame.xm !== undefined) {
    result.xm = frame.xm;
  }
  if (frame.ym !== undefined) {
    result.ym = frame.ym;
  }

  for (const key of orderedKeys(Object.keys(frame), FRAME_KEY_ORDER)) {
    if (!FRAME_KEY_ORDER.includes(key)) {
      result[key] = frame[key];
    }
  }
  return result;
}

function sortWeaponChain(chain: WeaponChain): WeaponChain {
  const result: WeaponChain = {
    power: chain.power,
    anim_duration: chain.anim_duration,
    sfx: chain.sfx,
    knockback: { x: chain.knockback.x, y: chain.knockback.y },
    origin: { x: chain.origin.x, y: chain.origin.y },
  };

  if (chain.cancel !== undefined) {
    result.cancel = chain.cancel;
  }
  if (chain.stopMove !== undefined) {
    result.stopMove = chain.stopMove;
  }
  if (chain.eval !== undefined) {
    result.eval = chain.eval;
  }
  if (chain.frames) {
    const sortedFrames: Record<string, WeaponFrame> = {};
    for (const [threshold, frame] of Object.entries(sortNumericStringKeys(chain.frames))) {
      sortedFrames[threshold] = sortWeaponFrame(frame);
    }
    result.frames = sortedFrames;
  }

  for (const key of orderedKeys(Object.keys(chain), CHAIN_KEY_ORDER)) {
    if (!CHAIN_KEY_ORDER.includes(key)) {
      result[key] = chain[key];
    }
  }

  return result;
}

export function sortWeaponsFile(weapons: WeaponsFile): WeaponsFile {
  const weaponNames = Object.keys(weapons).sort((a, b) => a.localeCompare(b));
  const result: WeaponsFile = {};
  for (const weaponName of weaponNames) {
    result[weaponName] = weapons[weaponName].map((chain) => sortWeaponChain(chain));
  }
  return result;
}

export function sortEntityProfile(profile: EntityProfile): EntityProfile {
  const states: EntityProfile['states'] = {};
  for (const stateKey of Object.keys(profile.states).sort((a, b) => a.localeCompare(b))) {
    states[stateKey] = {
      reset: profile.states[stateKey].reset,
      anim: sortNumericStringKeys(profile.states[stateKey].anim),
    };
  }

  return {
    id: profile.id,
    entityName: profile.entityName,
    spriteSheetPath: profile.spriteSheetPath,
    bbox: sortBbox(profile.bbox),
    states,
  };
}

export function generateEntityConstructorSnippets(profile: EntityProfile): {
  bboxSnippet: string;
  statesSnippet: string;
} {
  const sorted = sortEntityProfile(profile);
  const bboxSnippet = `this.bbox = ${JSON.stringify(sorted.bbox, null, 2)};`;
  const statesSnippet = `this.states = ${JSON.stringify(sorted.states, null, 2)};`;
  return { bboxSnippet, statesSnippet };
}

export function serializeEntityProfile(profile: EntityProfile): string {
  return JSON.stringify(sortEntityProfile(profile), null, 2);
}

export function serializeWeaponsFile(weapons: WeaponsFile): string {
  return JSON.stringify(sortWeaponsFile(weapons), null, 2);
}

export function serializeBundle(bundle: PortableBundle): string {
  const sortedBundle: PortableBundle = {
    ...bundle,
    entityProfiles: bundle.entityProfiles.map(sortEntityProfile),
    weapons: sortWeaponsFile(bundle.weapons),
  };
  return JSON.stringify(sortedBundle, null, 2);
}
