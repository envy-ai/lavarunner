import { getLegacySpriteIdForLdtkEntity } from './ldtk_entity_specs.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseFieldInstances(context, fieldInstances) {
  if (!Array.isArray(fieldInstances)) {
    return {};
  }

  const parsed = {};
  for (const field of fieldInstances) {
    if (!isPlainObject(field)) {
      throw new Error(`${context} has an invalid LDtk field instance.`);
    }

    const key = typeof field.__identifier === 'string' && field.__identifier.length > 0
      ? field.__identifier
      : field.identifier;
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`${context} has an LDtk field instance without a valid identifier.`);
    }

    const value = Object.prototype.hasOwnProperty.call(field, '__value')
      ? field.__value
      : field.value;
    parsed[key] = value;
  }

  return parsed;
}

function parseCompatMapsField(level) {
  const levelName = typeof level?.identifier === 'string' ? level.identifier : '<unnamed>';
  const context = `LDtk level "${levelName}"`;
  const fields = parseFieldInstances(context, level?.fieldInstances);
  const raw = fields.CompatMapsJson;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`${context} is missing the CompatMapsJson level field.`);
  }

  let compatMaps;
  try {
    compatMaps = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} has invalid CompatMapsJson: ${error.message}`);
  }

  if (!Array.isArray(compatMaps)) {
    throw new Error(`${context} CompatMapsJson must decode to an array.`);
  }

  return compatMaps;
}

export function extractLdtkCompatMeta(ldtkProject) {
  if (!isPlainObject(ldtkProject) || !Array.isArray(ldtkProject.levels)) {
    throw new Error('LDtk project is missing its levels array.');
  }

  const levels = {};
  for (const level of ldtkProject.levels) {
    if (!isPlainObject(level)) {
      throw new Error('LDtk project contains an invalid level entry.');
    }

    const levelIid = typeof level.iid === 'string' && level.iid.length > 0 ? level.iid : null;
    if (!levelIid) {
      throw new Error(`LDtk level "${level.identifier || '<unnamed>'}" is missing its iid.`);
    }

    const entityMetaByIid = {};
    const entityMetaByCoord = {};
    const layers = Array.isArray(level.layerInstances) ? level.layerInstances : [];
    for (const layer of layers) {
      if (!isPlainObject(layer) || layer.__type !== 'Entities') {
        continue;
      }

      const entities = Array.isArray(layer.entityInstances) ? layer.entityInstances : [];
      for (const entity of entities) {
        if (!isPlainObject(entity)) {
          throw new Error(`LDtk level "${level.identifier || '<unnamed>'}" has an invalid entity instance.`);
        }

        const entityIid = typeof entity.iid === 'string' && entity.iid.length > 0 ? entity.iid : null;
        if (!entityIid) {
          throw new Error(`LDtk level "${level.identifier || '<unnamed>'}" has an entity without an iid.`);
        }

        const context = `LDtk entity "${entityIid}" in level "${level.identifier || '<unnamed>'}"`;
        const fields = parseFieldInstances(context, entity.fieldInstances);
        const identifier = typeof entity.__identifier === 'string' ? entity.__identifier : null;
        const inferredSprite = identifier ? getLegacySpriteIdForLdtkEntity(identifier) : null;
        const sprite = Number.isInteger(fields.CompatSpriteId) && fields.CompatSpriteId >= 0
          ? fields.CompatSpriteId
          : inferredSprite;
        if (!Number.isInteger(sprite) || sprite < 0) {
          throw new Error(`${context} is missing a valid CompatSpriteId field.`);
        }

        delete fields.CompatSpriteId;
        const properties = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== null && value !== undefined) {
            properties[key] = value;
          }
        }

        const coord = Array.isArray(entity.__grid)
          && Number.isInteger(entity.__grid[0])
          && Number.isInteger(entity.__grid[1])
          ? `${entity.__grid[0]},${entity.__grid[1]}`
          : null;
        if (!coord) {
          throw new Error(`${context} is missing valid grid coordinates.`);
        }
        if (entityMetaByCoord[coord]) {
          throw new Error(`${context} duplicates coord "${coord}" in its level sidecar data.`);
        }

        const entityMeta = {
          sprite,
          properties,
        };

        entityMetaByIid[entityIid] = entityMeta;
        entityMetaByCoord[coord] = entityMeta;
      }
    }

    levels[levelIid] = {
      identifier: typeof level.identifier === 'string' ? level.identifier : null,
      compatMaps: parseCompatMapsField(level),
      entitiesByIid: entityMetaByIid,
      entitiesByCoord: entityMetaByCoord,
    };
  }

  return {
    version: 1,
    projectIid: typeof ldtkProject.iid === 'string' ? ldtkProject.iid : null,
    levels,
  };
}
