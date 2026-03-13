import { createMiniTextCharsetCanvas, miniTextFontMetrics } from './minitext_bitmap_font.js';

const SCREEN_WIDTH = 128;
const SCREEN_HEIGHT = 128;
const TILE_SIZE = 8;
const TILED_FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const TILED_FLIPPED_VERTICALLY_FLAG = 0x40000000;
const TILED_FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const TILED_FLIP_MASK =
  TILED_FLIPPED_HORIZONTALLY_FLAG |
  TILED_FLIPPED_VERTICALLY_FLAG |
  TILED_FLIPPED_DIAGONALLY_FLAG;
const PhaserRuntime = window.Phaser;

if (!PhaserRuntime) {
  throw new Error('Phaser did not initialize. Ensure src/phaser.js loads before src/bootstrap.js.');
}

const KEY_BINDINGS = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  A: 'S',
  B: 'D',
  X: 'F',
  Y: 'A',
};

class ImageRef {
  constructor(img, path, x = 0, y = 0, w = img.width, h = img.height) {
    this.img = img;
    this.path = path;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.width = w;
    this.height = h;
    this._isSprite = true;
  }
}

class CompatTileMap {
  constructor(runtime) {
    this.runtime = runtime;
    this._isTileMap = true;
    this._name = '';
    this._tilesheetPath = '';
    this._bgcolor = null;
    this._atlas = [];
    this.tilesheet = null;
    this._parallaxX = 1;
    this._parallaxY = 1;
    this._sourceWidth = 0;
    this._sourceHeight = 0;
    this.width = 0;
    this.height = 0;
    this.items = [];
    this.objectLayers = {};
  }

  _init(width, height) {
    this.width = width;
    this.height = height;
    this._sourceWidth = width;
    this._sourceHeight = height;
    this._bgcolor = null;
    this._atlas = [];
    this.items = [];
    this.objectLayers = {};

    for (let x = 0; x < width; x += 1) {
      this.items.push(new Array(height).fill(null));
    }
  }

  set(x, y, sprite, flipH = false, flipV = false, flipR = false, flagA = false, flagB = false) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }

    const entry = {
      x,
      y,
      sprite: sprite | 0,
      flipH: Boolean(flipH),
      flipV: Boolean(flipV),
      flipR: Boolean(flipR),
      flagA: Boolean(flagA),
      flagB: Boolean(flagB),
    };
    this.items[x][y] = entry;
    return entry;
  }

  remove(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }

    this.items[x][y] = null;
    return null;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    return this.items[x][y];
  }

  find(sprite, flagA = null, flagB = null) {
    if (sprite === null) {
      return this._findNull();
    }

    const result = [];
    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        const entry = this.items[x][y];
        if (!entry || entry.sprite !== sprite) {
          continue;
        }

        const matchFlagA = flagA === null || entry.flagA === flagA;
        const matchFlagB = flagB === null || entry.flagB === flagB;
        if (matchFlagA && matchFlagB) {
          result.push(entry);
        }
      }
    }
    return result;
  }

  _findNull() {
    const result = [];
    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        if (this.items[x][y] === null) {
          result.push({ x, y });
        }
      }
    }
    return result;
  }

  draw(x = 0, y = 0) {
    this.runtime.drawMapToContext(this.runtime.screenCtx, this, x, y);
  }

  getObjectLayer(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`Map "${this._name}" requested object layer with an invalid name.`);
    }

    const layer = this.objectLayers[name];
    if (!layer) {
      return [];
    }

    return layer.slice();
  }

  parseObjectProperties(objectLayerName, objectId, properties) {
    if (!Array.isArray(properties)) {
      return {};
    }

    const parsed = {};
    for (const property of properties) {
      if (!property || typeof property !== 'object') {
        throw new Error(`Map "${this._name}" layer "${objectLayerName}" object ${objectId} has an invalid property.`);
      }

      const key = property.name;
      if (typeof key !== 'string' || key.length === 0) {
        throw new Error(`Map "${this._name}" layer "${objectLayerName}" object ${objectId} has a property without a valid name.`);
      }

      parsed[key] = property.value;
    }

    return parsed;
  }

  findTilesetForTileId(tilesets, tileId, mapName, layerName, objectId) {
    if (!Array.isArray(tilesets) || tilesets.length === 0) {
      throw new Error(`Map "${mapName}" layer "${layerName}" object ${objectId} has gid data but no tilesets.`);
    }

    let matched = null;
    for (const tileset of tilesets) {
      if (!tileset || !Number.isInteger(tileset.firstgid)) {
        continue;
      }
      if (tileId >= tileset.firstgid && (!matched || tileset.firstgid > matched.firstgid)) {
        matched = tileset;
      }
    }

    if (!matched) {
      throw new Error(
        `Map "${mapName}" layer "${layerName}" object ${objectId} references gid ${tileId} with no matching tileset.`,
      );
    }

    return matched;
  }

  normalizeObject(layer, object, tilesets) {
    if (!object || typeof object !== 'object') {
      throw new Error(`Map "${this._name}" layer "${layer.name}" has an invalid object entry.`);
    }

    if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) {
      throw new Error(`Map "${this._name}" layer "${layer.name}" has an object with invalid coordinates.`);
    }

    if (!Number.isInteger(object.id) || object.id <= 0) {
      throw new Error(`Map "${this._name}" layer "${layer.name}" has an object without a valid positive integer id.`);
    }

    let sprite = null;
    let flipH = false;
    let flipV = false;
    let flipR = false;
    if (object.gid !== undefined) {
      if (!Number.isInteger(object.gid)) {
        throw new Error(`Map "${this._name}" layer "${layer.name}" object ${object.id} has non-integer gid.`);
      }

      const gid = object.gid >>> 0;
      const tileId = gid & ~TILED_FLIP_MASK;
      if (tileId <= 0) {
        throw new Error(`Map "${this._name}" layer "${layer.name}" object ${object.id} has invalid gid ${gid}.`);
      }

      const tileset = this.findTilesetForTileId(tilesets, tileId, this._name, layer.name || '<unnamed>', object.id);
      sprite = tileId - tileset.firstgid;
      if (Number.isInteger(tileset.tilecount) && sprite >= tileset.tilecount) {
        throw new Error(
          `Map "${this._name}" layer "${layer.name}" object ${object.id} gid ${gid} is out of tileset bounds.`,
        );
      }

      flipH = (gid & TILED_FLIPPED_HORIZONTALLY_FLAG) !== 0;
      flipV = (gid & TILED_FLIPPED_VERTICALLY_FLAG) !== 0;
      flipR = (gid & TILED_FLIPPED_DIAGONALLY_FLAG) !== 0;
    }

    const entityY = object.gid !== undefined ? object.y - TILE_SIZE : object.y;
    return {
      id: object.id,
      name: typeof object.name === 'string' ? object.name : '',
      type: typeof object.type === 'string' ? object.type : '',
      className: typeof object.class === 'string' ? object.class : '',
      layer: layer.name,
      x: object.x,
      y: entityY,
      tx: Math.floor(object.x / TILE_SIZE),
      ty: Math.floor(entityY / TILE_SIZE),
      width: Number.isFinite(object.width) ? object.width : TILE_SIZE,
      height: Number.isFinite(object.height) ? object.height : TILE_SIZE,
      rotation: Number.isFinite(object.rotation) ? object.rotation : 0,
      visible: object.visible !== false,
      sprite,
      flipH,
      flipV,
      flipR,
      properties: this.parseObjectProperties(layer.name, object.id, object.properties),
    };
  }

  inferSheetPathFromTileset(tileset) {
    if (!tileset || typeof tileset !== 'object') {
      return null;
    }

    const imagePath = typeof tileset.image === 'string' ? tileset.image : '';
    if (imagePath.endsWith('.png')) {
      if (imagePath.startsWith('tiles/')) {
        return imagePath.slice(0, -4);
      }
      if (imagePath.startsWith('../')) {
        return imagePath.slice(3, -4);
      }
      return imagePath.slice(0, -4);
    }

    if (typeof tileset.name === 'string' && tileset.name.length > 0) {
      return tileset.name;
    }

    return null;
  }

  findTilesetForSheet(tilesets, expectedSheetPath, mapName, layerName) {
    if (!expectedSheetPath) {
      return null;
    }

    for (const tileset of tilesets) {
      const sheetPath = this.inferSheetPathFromTileset(tileset);
      if (sheetPath === expectedSheetPath) {
        return tileset;
      }
    }

    throw new Error(
      `Tiled map "${mapName}" layer "${layerName}" is missing tileset for sheet "${expectedSheetPath}".`,
    );
  }

  loadFromTiled(manifestEntry, tiledMap) {
    if (!manifestEntry || typeof manifestEntry !== 'object') {
      throw new Error('Tiled map manifest entry is missing or invalid.');
    }
    if (!tiledMap || typeof tiledMap !== 'object') {
      throw new Error(`Tiled map "${manifestEntry.name || '<unnamed>'}" payload is missing or invalid.`);
    }

    const width = tiledMap.width;
    const height = tiledMap.height;
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error(`Tiled map "${manifestEntry.name || '<unnamed>'}" has invalid dimensions.`);
    }

    const layers = Array.isArray(tiledMap.layers) ? tiledMap.layers : [];
    const tileLayerName = typeof manifestEntry.tilelayer === 'string' && manifestEntry.tilelayer.length > 0
      ? manifestEntry.tilelayer
      : null;
    const tileLayer = tileLayerName
      ? layers.find((layer) => layer && layer.type === 'tilelayer' && layer.name === tileLayerName)
      : layers.find((layer) => layer && layer.type === 'tilelayer');
    if (!tileLayer || !Array.isArray(tileLayer.data)) {
      const layerMessage = tileLayerName ? ` named "${tileLayerName}"` : '';
      throw new Error(`Tiled map "${manifestEntry.name || '<unnamed>'}" is missing a tilelayer${layerMessage} with data.`);
    }

    const expectedLength = width * height;
    if (tileLayer.data.length !== expectedLength) {
      throw new Error(
        `Tiled map "${manifestEntry.name || '<unnamed>'}" data length mismatch. ` +
        `Expected ${expectedLength}, got ${tileLayer.data.length}.`,
      );
    }

    this._init(width, height);
    this._name = manifestEntry.name || '';
    this._tilesheetPath = manifestEntry.sheet || '';
    this._sourceWidth = Number.isInteger(manifestEntry.width) ? manifestEntry.width : width;
    this._sourceHeight = Number.isInteger(manifestEntry.height) ? manifestEntry.height : height;
    this._parallaxX = Number.isFinite(tileLayer.parallaxx)
      ? tileLayer.parallaxx
      : (Number.isFinite(manifestEntry.parallaxx) ? manifestEntry.parallaxx : 1);
    this._parallaxY = Number.isFinite(tileLayer.parallaxy)
      ? tileLayer.parallaxy
      : (Number.isFinite(manifestEntry.parallaxy) ? manifestEntry.parallaxy : 1);
    this.tilesheet = this.runtime.resolveTilesheet(this._tilesheetPath);

    const tilesets = Array.isArray(tiledMap.tilesets) ? tiledMap.tilesets : [];
    const expectedTileset = this.findTilesetForSheet(
      tilesets,
      this._tilesheetPath,
      this._name,
      tileLayer.name || '<unnamed>',
    );
    const expectedFirstgid = expectedTileset && Number.isInteger(expectedTileset.firstgid)
      ? expectedTileset.firstgid
      : null;
    const expectedTilecount = expectedTileset && Number.isInteger(expectedTileset.tilecount)
      ? expectedTileset.tilecount
      : null;

    for (let index = 0; index < tileLayer.data.length; index += 1) {
      const rawGid = tileLayer.data[index];
      if (!Number.isInteger(rawGid)) {
        throw new Error(`Tiled map "${this._name}" has non-integer gid at index ${index}.`);
      }

      const gid = rawGid >>> 0;
      if (gid === 0) {
        continue;
      }

      if (!Number.isInteger(expectedFirstgid) || expectedFirstgid <= 0) {
        throw new Error(
          `Tiled map "${this._name}" layer "${tileLayer.name || '<unnamed>'}" has tile data but no valid tileset binding.`,
        );
      }

      const flipH = (gid & TILED_FLIPPED_HORIZONTALLY_FLAG) !== 0;
      const flipV = (gid & TILED_FLIPPED_VERTICALLY_FLAG) !== 0;
      const flipR = (gid & TILED_FLIPPED_DIAGONALLY_FLAG) !== 0;
      const tileId = gid & ~TILED_FLIP_MASK;
      const sprite = tileId - expectedFirstgid;

      if (sprite < 0) {
        throw new Error(`Tiled map "${this._name}" has invalid gid ${gid} at index ${index}.`);
      }
      if (Number.isInteger(expectedTilecount) && sprite >= expectedTilecount) {
        throw new Error(
          `Tiled map "${this._name}" has gid ${gid} out of tileset bounds at index ${index}.`,
        );
      }

      const x = index % width;
      const y = Math.floor(index / width);
      this.set(x, y, sprite, flipH, flipV, flipR, false, false);
    }

    for (const layer of layers) {
      if (!layer || layer.type !== 'objectgroup') {
        continue;
      }

      if (typeof layer.name !== 'string' || layer.name.length === 0) {
        throw new Error(`Tiled map "${this._name}" has an object layer without a valid name.`);
      }
      if (this.objectLayers[layer.name]) {
        throw new Error(`Tiled map "${this._name}" has duplicate object layer "${layer.name}".`);
      }
      if (!Array.isArray(layer.objects)) {
        throw new Error(`Tiled map "${this._name}" object layer "${layer.name}" is missing its objects array.`);
      }

      this.objectLayers[layer.name] = layer.objects.map((object) => this.normalizeObject(layer, object, tilesets));
    }

    return this;
  }

  parseFieldInstances(context, fieldInstances) {
    if (!Array.isArray(fieldInstances)) {
      return {};
    }

    const parsed = {};
    for (const field of fieldInstances) {
      if (!field || typeof field !== 'object') {
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

  cloneSharedObjectLayers(sharedObjectLayers) {
    if (!sharedObjectLayers || typeof sharedObjectLayers !== 'object') {
      return {};
    }

    const cloned = {};
    for (const [layerName, objects] of Object.entries(sharedObjectLayers)) {
      if (!Array.isArray(objects)) {
        throw new Error(`Map "${this._name || '<unnamed>'}" has an invalid shared object layer "${layerName}".`);
      }

      cloned[layerName] = objects.map((object) => ({
        ...object,
        properties: object && object.properties && typeof object.properties === 'object'
          ? { ...object.properties }
          : {},
      }));
    }
    return cloned;
  }

  normalizeAtlasMetadata(mapName, atlas) {
    if (atlas === undefined) {
      return [];
    }
    if (!Array.isArray(atlas)) {
      throw new Error(`LDtk map "${mapName}" atlas metadata must be an array.`);
    }

    return atlas.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`LDtk map "${mapName}" atlas entry ${index} must be an object.`);
      }

      const sprite = entry.sprite;
      const x = entry.x;
      const y = entry.y;
      if (typeof sprite !== 'string' || sprite.length === 0) {
        throw new Error(`LDtk map "${mapName}" atlas entry ${index} is missing a valid sprite.`);
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`LDtk map "${mapName}" atlas entry ${index} must provide finite x/y coordinates.`);
      }

      return { sprite, x, y };
    });
  }

  normalizeLdtkEntity(layer, entity, entityCompatMeta = null) {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`LDtk layer "${layer.__identifier || '<unnamed>'}" has an invalid entity instance.`);
    }

    const entityId = typeof entity.iid === 'string' ? entity.iid : '<unknown>';
    const fieldContext = `LDtk layer "${layer.__identifier || '<unnamed>'}" entity ${entityId}`;
    const fields = this.parseFieldInstances(fieldContext, entity.fieldInstances);
    if ((!Number.isInteger(fields.CompatSpriteId) || fields.CompatSpriteId < 0) && entityCompatMeta) {
      if (Number.isInteger(entityCompatMeta.sprite) && entityCompatMeta.sprite >= 0) {
        fields.CompatSpriteId = entityCompatMeta.sprite;
      }

      if (entityCompatMeta.properties && typeof entityCompatMeta.properties === 'object') {
        for (const [key, value] of Object.entries(entityCompatMeta.properties)) {
          if ((fields[key] === null || fields[key] === undefined) && value !== undefined) {
            fields[key] = value;
          }
        }
      }
    }

    const spriteField = fields.CompatSpriteId;
    if (!Number.isInteger(spriteField) || spriteField < 0) {
      throw new Error(`${fieldContext} is missing a valid CompatSpriteId field.`);
    }

    const px = Array.isArray(entity.px) ? entity.px : null;
    const x = px ? px[0] : entity.x;
    const y = px ? px[1] : entity.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`${fieldContext} has invalid x/y coordinates.`);
    }

    const tx = Array.isArray(entity.__grid) && Number.isInteger(entity.__grid[0])
      ? entity.__grid[0]
      : Math.floor(x / TILE_SIZE);
    const ty = Array.isArray(entity.__grid) && Number.isInteger(entity.__grid[1])
      ? entity.__grid[1]
      : Math.floor(y / TILE_SIZE);

    const properties = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'CompatSpriteId' || value === null || value === undefined) {
        continue;
      }
      properties[key] = value;
    }

    return {
      id: entityId,
      name: typeof entity.__identifier === 'string' ? entity.__identifier : '',
      type: typeof entity.__identifier === 'string' ? entity.__identifier : '',
      className: typeof entity.__identifier === 'string' ? entity.__identifier : '',
      layer: layer.__identifier,
      x,
      y,
      tx,
      ty,
      width: Number.isFinite(entity.width) ? entity.width : TILE_SIZE,
      height: Number.isFinite(entity.height) ? entity.height : TILE_SIZE,
      rotation: 0,
      visible: entity.visible !== false,
      sprite: spriteField,
      flipH: false,
      flipV: false,
      flipR: false,
      properties,
    };
  }

  loadFromLdtk(mapMeta, layerInstance, sharedObjectLayers) {
    if (!mapMeta || typeof mapMeta !== 'object') {
      throw new Error('LDtk compat map metadata is missing or invalid.');
    }
    if (!layerInstance || typeof layerInstance !== 'object') {
      throw new Error(`LDtk compat map "${mapMeta.name || '<unnamed>'}" is missing its layer instance.`);
    }

    const width = layerInstance.__cWid;
    const height = layerInstance.__cHei;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`LDtk compat map "${mapMeta.name || '<unnamed>'}" has invalid dimensions.`);
    }

    this._init(width, height);
    this._name = mapMeta.name || '';
    this._tilesheetPath = mapMeta.sheet || '';
    this._sourceWidth = Number.isInteger(mapMeta.sourceWidth) ? mapMeta.sourceWidth : width;
    this._sourceHeight = Number.isInteger(mapMeta.sourceHeight) ? mapMeta.sourceHeight : height;
    this._parallaxX = Number.isFinite(mapMeta.parallaxx) ? mapMeta.parallaxx : 1;
    this._parallaxY = Number.isFinite(mapMeta.parallaxy) ? mapMeta.parallaxy : 1;
    this._bgcolor = Number.isInteger(mapMeta.bgcolor) ? mapMeta.bgcolor : null;
    this._atlas = this.normalizeAtlasMetadata(this._name, mapMeta.atlas);
    this.tilesheet = this.runtime.resolveTilesheet(this._tilesheetPath);

    const gridTiles = Array.isArray(layerInstance.gridTiles) ? layerInstance.gridTiles : [];
    for (const tile of gridTiles) {
      if (!tile || typeof tile !== 'object') {
        throw new Error(`LDtk compat map "${this._name}" has an invalid tile entry.`);
      }
      if (!Number.isInteger(tile.t) || tile.t < 0) {
        throw new Error(`LDtk compat map "${this._name}" has an invalid sprite index in gridTiles.`);
      }
      if (!Array.isArray(tile.px) || tile.px.length !== 2 || !Number.isFinite(tile.px[0]) || !Number.isFinite(tile.px[1])) {
        throw new Error(`LDtk compat map "${this._name}" has a tile without valid px coordinates.`);
      }

      const x = tile.px[0] / TILE_SIZE;
      const y = tile.px[1] / TILE_SIZE;
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error(`LDtk compat map "${this._name}" has tile coordinates not aligned to the ${TILE_SIZE}px grid.`);
      }

      const flipFlags = Number.isInteger(tile.f) ? tile.f : 0;
      if ((flipFlags & ~3) !== 0) {
        throw new Error(`LDtk compat map "${this._name}" uses unsupported tile flip flags (${flipFlags}).`);
      }

      this.set(x, y, tile.t, (flipFlags & 1) !== 0, (flipFlags & 2) !== 0, false, false, false);
    }

    this.objectLayers = this.cloneSharedObjectLayers(sharedObjectLayers);
    return this;
  }
}

class PixelboxRuntime {
  constructor(scene) {
    this.scene = scene;
    this.warned = new Set();

    this.palette = [];
    this.penColor = 1;
    this.paperColor = 0;
    this.currentTilesheet = null;
    this.textCursor = { x: 0, y: 0 };
    const builtInCharset = createMiniTextCharsetCanvas();
    this.defaultCharset = this.createCharsetDefinition(
      builtInCharset,
      0,
      0,
      builtInCharset.width,
      builtInCharset.height,
    );
    this.charset = this.defaultCharset;

    this.assets = null;
    this.mapsByName = {};
    this.mapsList = [];
    this.tilesheets = {};
    this.ldtkCompatMeta = null;
    this.mainModule = null;
    this.fatalError = null;
    this.audioManifest = { bgm: {}, sfx: {} };
    this.currentBgm = null;
    this.pendingBgmIndex = null;
    this.audioUnlockHandler = null;
    this.activeSfx = new Set();

    this.keyboard = null;
    this.screenCanvas = null;
    this.screenCtx = null;
    this.screenTexture = null;
    this.screenImage = null;
  }

  preload() {
    const { load } = this.scene;

    const images = [
      ['__palette', 'assets/palette.png'],
      ['ui', 'assets/ui.png'],
      ['boxes', 'assets/boxes.png'],
      ['fonts/minitext', 'assets/fonts/minitext.png'],
      ['tilesheet', 'assets/tilesheet.png'],
      ['tiles/entities', 'assets/maps_tiled/tiles/entities.png'],
      ['tiles/cave/background', 'assets/maps_tiled/tiles/cave/background.png'],
      ['tiles/cave/foreground', 'assets/maps_tiled/tiles/cave/foreground.png'],
      ['tiles/cave/tiles', 'assets/maps_tiled/tiles/cave/tiles.png'],
      ['tiles/outdoor/background', 'assets/maps_tiled/tiles/outdoor/background.png'],
      ['tiles/outdoor/foreground', 'assets/maps_tiled/tiles/outdoor/foreground.png'],
      ['tiles/outdoor/tiles', 'assets/maps_tiled/tiles/outdoor/tiles.png'],
      ['sprites/enemies', 'assets/sprites/enemies.png'],
      ['sprites/goodies', 'assets/sprites/goodies.png'],
      ['sprites/player_default', 'assets/sprites/player_default.png'],
      ['sprites/weapons', 'assets/sprites/weapons.png'],
      ['atlas/bluefilter', 'assets/atlas/bluefilter.png'],
      ['atlas/cliff', 'assets/atlas/cliff.png'],
      ['atlas/ending', 'assets/atlas/ending.png'],
      ['atlas/forest1', 'assets/atlas/forest1.png'],
      ['atlas/forest2', 'assets/atlas/forest2.png'],
      ['atlas/forest3', 'assets/atlas/forest3.png'],
      ['atlas/forest4', 'assets/atlas/forest4.png'],
      ['atlas/forest5', 'assets/atlas/forest5.png'],
      ['atlas/forest6', 'assets/atlas/forest6.png'],
      ['atlas/lavacave1', 'assets/atlas/lavacave1.png'],
      ['atlas/lavacave2', 'assets/atlas/lavacave2.png'],
      ['atlas/lavacave3', 'assets/atlas/lavacave3.png'],
      ['atlas/ship', 'assets/atlas/ship.png'],
      ['atlas/space', 'assets/atlas/space.png'],
      ['atlas/wipe', 'assets/atlas/wipe.png'],
    ];

    for (const [key, path] of images) {
      load.image(key, path);
    }

    load.json('data/particles', 'assets/data/particles.json');
    load.json('data/tiletypes', 'assets/data/tiletypes.json');
    load.json('data/weapons', 'assets/data/weapons.json');
    load.json('patatracker', 'assets/patatracker.json');
    load.json('bleeper', 'assets/bleeper.json');
  }

  async create() {
    this.initializeScreen();
    this.initializePalette();
    this.initializeInput();
    this.initializeAssets();
    await this.initializeMaps();
    this.installGlobals();
    await this.loadAudioManifest();

    this.mainModule = await import('./main.js');
    if (!this.mainModule || typeof this.mainModule.update !== 'function') {
      throw new Error('Main module did not export an update() function.');
    }
  }

  step() {
    if (this.fatalError) {
      return;
    }

    if (!this.mainModule) {
      return;
    }

    try {
      this.updateGamepadState();
      this.mainModule.update();
      this.screenTexture.refresh();
    } catch (error) {
      this.fatalError = error;
      console.error('Fatal runtime error', error);
      throw error;
    }
  }

  initializeScreen() {
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = SCREEN_WIDTH;
    this.screenCanvas.height = SCREEN_HEIGHT;

    this.screenCtx = this.screenCanvas.getContext('2d', { alpha: false });
    this.screenCtx.imageSmoothingEnabled = false;

    this.screenTexture = this.scene.textures.addCanvas('__pixelbox_screen', this.screenCanvas);
    this.screenImage = this.scene.add.image(0, 0, '__pixelbox_screen').setOrigin(0, 0);

    this.scene.scale.on('resize', this.resizeScreen, this);
    this.resizeScreen({ width: this.scene.scale.width, height: this.scene.scale.height });
  }

  resizeScreen(size) {
    const width = size.width || this.scene.scale.width;
    const height = size.height || this.scene.scale.height;

    // Keep 1:1 aspect ratio to avoid horizontal/vertical stretch artifacts.
    const scaleX = width / SCREEN_WIDTH;
    const scaleY = height / SCREEN_HEIGHT;
    const uniformScale = Math.min(scaleX, scaleY);
    const scale = uniformScale >= 1 ? Math.floor(uniformScale) : uniformScale;
    const displayWidth = SCREEN_WIDTH * scale;
    const displayHeight = SCREEN_HEIGHT * scale;
    const offsetX = Math.floor((width - displayWidth) / 2);
    const offsetY = Math.floor((height - displayHeight) / 2);

    this.screenImage.setPosition(offsetX, offsetY);
    this.screenImage.setDisplaySize(displayWidth, displayHeight);
  }

  initializePalette() {
    const texture = this.scene.textures.get('__palette');
    if (!texture) {
      throw new Error('Palette image failed to load.');
    }
    const image = texture.getSourceImage();
    if (!image) {
      throw new Error('Palette source image is unavailable.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    this.palette = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha <= 1) {
        continue;
      }
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      this.palette.push(`rgb(${r}, ${g}, ${b})`);
    }

    if (this.palette.length === 0) {
      throw new Error('Palette image did not provide any visible colors.');
    }
  }

  initializeInput() {
    this.keyboard = this.scene.input.keyboard.addKeys(KEY_BINDINGS);
  }

  initializeAssets() {
    const data = this.scene.cache.json;
    const entitiesSheet = this.makeImageRef('tiles/entities', 'tiles/entities');
    const tilesheetFallback = this.makeImageRef('tilesheet', 'tilesheet');
    const miniTextFont = this.makeImageRef('fonts/minitext', 'fonts/minitext');

    const outdoorTiles = this.makeImageRef('tiles/outdoor/tiles', 'tiles/outdoor/tiles');
    const outdoorBackground = this.makeImageRef('tiles/outdoor/background', 'tiles/outdoor/background');
    const playerSheet = this.makeImageRef('sprites/player_default', 'sprites/player_default');
    const enemySheet = this.makeImageRef('sprites/enemies', 'sprites/enemies');
    const goodieSheet = this.makeImageRef('sprites/goodies', 'sprites/goodies');

    this.assets = {
      root: 'assets/',
      boxes: this.makeImageRef('boxes', 'boxes'),
      ui: this.makeImageRef('ui', 'ui'),
      tilesheet: tilesheetFallback,
      fonts: {
        minitext: miniTextFont,
      },
      data: {
        particles: data.get('data/particles'),
        tiletypes: data.get('data/tiletypes'),
        weapons: data.get('data/weapons'),
      },
      maps: null,
      patatracker: data.get('patatracker'),
      bleeper: data.get('bleeper'),
      atlas: {
        bluefilter: this.makeImageRef('atlas/bluefilter', 'atlas/bluefilter'),
        cliff: this.makeImageRef('atlas/cliff', 'atlas/cliff'),
        ending: this.makeImageRef('atlas/ending', 'atlas/ending'),
        forest1: this.makeImageRef('atlas/forest1', 'atlas/forest1'),
        forest2: this.makeImageRef('atlas/forest2', 'atlas/forest2'),
        forest3: this.makeImageRef('atlas/forest3', 'atlas/forest3'),
        forest4: this.makeImageRef('atlas/forest4', 'atlas/forest4'),
        forest5: this.makeImageRef('atlas/forest5', 'atlas/forest5'),
        forest6: this.makeImageRef('atlas/forest6', 'atlas/forest6'),
        lavacave1: this.makeImageRef('atlas/lavacave1', 'atlas/lavacave1'),
        lavacave2: this.makeImageRef('atlas/lavacave2', 'atlas/lavacave2'),
        lavacave3: this.makeImageRef('atlas/lavacave3', 'atlas/lavacave3'),
        ship: this.makeImageRef('atlas/ship', 'atlas/ship'),
        space: this.makeImageRef('atlas/space', 'atlas/space'),
        wipe: this.makeImageRef('atlas/wipe', 'atlas/wipe'),
      },
      sprites: {
        enemies: enemySheet,
        goodies: goodieSheet,
        player_default: playerSheet,
        weapons: this.makeImageRef('sprites/weapons', 'sprites/weapons'),
      },
      tiles: {
        entities: entitiesSheet,
        cave: {
          background: this.makeImageRef('tiles/cave/background', 'tiles/cave/background'),
          foreground: this.makeImageRef('tiles/cave/foreground', 'tiles/cave/foreground'),
          tiles: this.makeImageRef('tiles/cave/tiles', 'tiles/cave/tiles'),
        },
        outdoor: {
          background: outdoorBackground,
          foreground: this.makeImageRef('tiles/outdoor/foreground', 'tiles/outdoor/foreground'),
          tiles: outdoorTiles,
        },
      },
    };

    this.tilesheets = {
      boxes: this.assets.boxes,
      'tiles/entities': this.assets.tiles.entities,
      'tiles/cave/background': this.assets.tiles.cave.background,
      'tiles/cave/foreground': this.assets.tiles.cave.foreground,
      'tiles/cave/tiles': this.assets.tiles.cave.tiles,
      'tiles/outdoor/background': this.assets.tiles.outdoor.background,
      'tiles/outdoor/foreground': this.assets.tiles.outdoor.foreground,
      'tiles/outdoor/tiles': this.assets.tiles.outdoor.tiles,
    };

    // Default to editable PNG charset; code atlas remains available via setCharset(null).
    this.setCharset(this.assets.fonts.minitext);
  }

  parseLdtkFieldInstances(context, fieldInstances) {
    if (!Array.isArray(fieldInstances)) {
      return {};
    }

    const parsed = {};
    for (const field of fieldInstances) {
      if (!field || typeof field !== 'object') {
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

  parseCompatMapsField(level, levelCompatMeta = null) {
    const context = `LDtk level "${level?.identifier || '<unnamed>'}"`;
    if (levelCompatMeta && Array.isArray(levelCompatMeta.compatMaps)) {
      return levelCompatMeta.compatMaps;
    }

    const fields = this.parseLdtkFieldInstances(context, level?.fieldInstances);
    const raw = fields.CompatMapsJson;
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Error(`${context} is missing the CompatMapsJson level field.`);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${context} has invalid CompatMapsJson: ${error.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${context} CompatMapsJson must decode to an array.`);
    }

    const seenLayerIds = new Set();
    for (const mapMeta of parsed) {
      if (!mapMeta || typeof mapMeta !== 'object') {
        throw new Error(`${context} CompatMapsJson contains an invalid map entry.`);
      }
      if (typeof mapMeta.layerId !== 'string' || mapMeta.layerId.length === 0) {
        throw new Error(`${context} CompatMapsJson has an entry without a valid layerId.`);
      }
      if (seenLayerIds.has(mapMeta.layerId)) {
        throw new Error(`${context} CompatMapsJson has duplicate layerId "${mapMeta.layerId}".`);
      }
      seenLayerIds.add(mapMeta.layerId);

      if (typeof mapMeta.name !== 'string' || mapMeta.name.length === 0) {
        throw new Error(`${context} CompatMapsJson has an entry without a valid map name.`);
      }
      if (typeof mapMeta.sheet !== 'string') {
        throw new Error(`${context} CompatMapsJson entry "${mapMeta.name}" is missing its sheet path.`);
      }
    }

    return parsed;
  }

  buildSharedObjectLayers(level, levelCompatMeta = null) {
    const levelName = level?.identifier || '<unnamed>';
    const layers = Array.isArray(level?.layerInstances) ? level.layerInstances : [];
    const parser = new CompatTileMap(this);
    parser._name = levelName;
    const objectLayers = {};
    const entitiesByIid = levelCompatMeta && levelCompatMeta.entitiesByIid && typeof levelCompatMeta.entitiesByIid === 'object'
      ? levelCompatMeta.entitiesByIid
      : {};
    const entitiesByCoord = levelCompatMeta && levelCompatMeta.entitiesByCoord && typeof levelCompatMeta.entitiesByCoord === 'object'
      ? levelCompatMeta.entitiesByCoord
      : {};

    for (const layer of layers) {
      if (!layer || layer.__type !== 'Entities') {
        continue;
      }

      const layerName = layer.__identifier;
      if (typeof layerName !== 'string' || layerName.length === 0) {
        throw new Error(`LDtk level "${levelName}" has an Entities layer without a valid identifier.`);
      }
      if (objectLayers[layerName]) {
        throw new Error(`LDtk level "${levelName}" has duplicate Entities layer "${layerName}".`);
      }

      const entityInstances = Array.isArray(layer.entityInstances) ? layer.entityInstances : [];
      objectLayers[layerName] = entityInstances.map((entity) => {
        const entityId = entity && typeof entity.iid === 'string' ? entity.iid : null;
        let entityCompatMeta = entityId ? entitiesByIid[entityId] || null : null;
        if (!entityCompatMeta && entity && Array.isArray(entity.__grid)
            && Number.isInteger(entity.__grid[0]) && Number.isInteger(entity.__grid[1])) {
          entityCompatMeta = entitiesByCoord[`${entity.__grid[0]},${entity.__grid[1]}`] || null;
        }
        return parser.normalizeLdtkEntity(layer, entity, entityCompatMeta);
      });
    }

    return objectLayers;
  }

  createMapsFromLdtkLevel(level) {
    if (!level || typeof level !== 'object') {
      throw new Error('Encountered invalid level entry in assets/maps.ldtk.');
    }

    const levelName = typeof level.identifier === 'string' && level.identifier.length > 0
      ? level.identifier
      : '<unnamed>';
    const layerInstances = Array.isArray(level.layerInstances) ? level.layerInstances : [];
    const layerByIdentifier = new Map();
    for (const layer of layerInstances) {
      if (!layer || typeof layer !== 'object') {
        throw new Error(`LDtk level "${levelName}" has an invalid layer instance.`);
      }
      const layerId = layer.__identifier;
      if (typeof layerId !== 'string' || layerId.length === 0) {
        throw new Error(`LDtk level "${levelName}" has a layer instance without a valid identifier.`);
      }
      if (layerByIdentifier.has(layerId)) {
        throw new Error(`LDtk level "${levelName}" has duplicate layer identifier "${layerId}".`);
      }
      layerByIdentifier.set(layerId, layer);
    }

    const levelCompatMeta = this.ldtkCompatMeta
      && this.ldtkCompatMeta.levels
      && typeof level.iid === 'string'
      ? this.ldtkCompatMeta.levels[level.iid] || null
      : null;
    const sharedObjectLayers = this.buildSharedObjectLayers(level, levelCompatMeta);
    const compatMaps = this.parseCompatMapsField(level, levelCompatMeta);
    return compatMaps.map((mapMeta) => {
      const layerInstance = layerByIdentifier.get(mapMeta.layerId);
      if (!layerInstance) {
        throw new Error(
          `LDtk level "${levelName}" is missing layer "${mapMeta.layerId}" required for compat map "${mapMeta.name}".`,
        );
      }

      return new CompatTileMap(this).loadFromLdtk(mapMeta, layerInstance, sharedObjectLayers);
    });
  }

  async loadOptionalJson(url, description) {
    try {
      const response = await fetch(url);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to load ${description} (${url.pathname}): ${error.message}`);
    }
  }

  async initializeMaps() {
    const ldtkUrl = new URL('../assets/maps.ldtk', import.meta.url);
    const compatMetaUrl = new URL('../assets/maps.ldtk.meta.json', import.meta.url);

    let ldtkProject;
    try {
      const response = await fetch(ldtkUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      ldtkProject = await response.json();
    } catch (error) {
      throw new Error(`Failed to load LDtk project (${ldtkUrl.pathname}): ${error.message}`);
    }

    if (!ldtkProject || typeof ldtkProject !== 'object' || !Array.isArray(ldtkProject.levels)) {
      throw new Error('assets/maps.ldtk is missing or invalid.');
    }

    const compatMeta = await this.loadOptionalJson(compatMetaUrl, 'LDtk compat metadata');
    if (compatMeta !== null) {
      if (!compatMeta || typeof compatMeta !== 'object' || Array.isArray(compatMeta)) {
        throw new Error('assets/maps.ldtk.meta.json is invalid.');
      }
      if (!compatMeta.levels || typeof compatMeta.levels !== 'object' || Array.isArray(compatMeta.levels)) {
        throw new Error('assets/maps.ldtk.meta.json is missing its levels map.');
      }
    }

    this.ldtkCompatMeta = compatMeta;
    this.mapsByName = {};
    this.mapsList = [];
    for (const level of ldtkProject.levels) {
      const levelMaps = this.createMapsFromLdtkLevel(level);
      for (const map of levelMaps) {
        if (map._name && this.mapsByName[map._name]) {
          throw new Error(`Duplicate compat map name "${map._name}" in assets/maps.ldtk.`);
        }

        this.mapsList.push(map);
        if (map._name) {
          this.mapsByName[map._name] = map;
        }
      }
    }

    this.assets.maps = ldtkProject;
    this.assets.mapsCompat = compatMeta;
  }

  resolveTilesheet(path) {
    if (!path) {
      return null;
    }

    const sheet = this.tilesheets[path];
    if (!sheet) {
      throw new Error(`Unknown tilesheet path "${path}" requested by map.`);
    }
    return sheet;
  }

  installGlobals() {
    window.__pbRuntime = this;
    window.assets = this.assets;

    window.gamepad = {
      btn: {
        up: false,
        down: false,
        left: false,
        right: false,
        A: false,
        B: false,
        X: false,
        Y: false,
      },
      x: 0,
      y: 0,
    };

    window.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    window.random = (min, max) => {
      if (max === undefined) {
        return Math.floor(Math.random() * min);
      }
      return Math.floor(min + Math.random() * (max - min));
    };
    window.advanceTime = (ms = 1000 / 60) => {
      const frameMs = 1000 / 60;
      const steps = Math.max(1, Math.round(ms / frameMs));
      for (let i = 0; i < steps; i += 1) {
        this.step();
      }
    };
    window.render_game_to_text = () => {
      let litPixels = null;
      if (this.screenCtx && this.screenCanvas) {
        const image = this.screenCtx.getImageData(0, 0, this.screenCanvas.width, this.screenCanvas.height).data;
        let count = 0;
        for (let i = 0; i < image.length; i += 4) {
          if (image[i] !== 0 || image[i + 1] !== 0 || image[i + 2] !== 0) {
            count += 1;
          }
        }
        litPixels = count;
      }

      return JSON.stringify({
        note: 'origin=(0,0) top-left; x right; y down',
        currentMap: window.map?._name || null,
        background: Array.isArray(window.background) ? window.background.map((map) => map?._name || null) : [],
        entityObjects: Array.isArray(window.entityObjects) ? window.entityObjects.length : null,
        mapsLoaded: this.mapsList.length,
        fatalError: this.fatalError ? String(this.fatalError) : null,
        bgcolor: Number.isInteger(window.bgcolor) ? window.bgcolor : null,
        player: window.player
          ? {
            x: window.player.x,
            y: window.player.y,
            dx: window.player.dx,
            dy: window.player.dy,
          }
          : null,
        screen: {
          width: this.screenCanvas?.width || null,
          height: this.screenCanvas?.height || null,
          litPixels,
        },
      });
    };

    window.getMap = (mapRef) => this.getMap(mapRef);
    window.tilesheet = (sheet) => this.setTilesheet(sheet);
    window.sprite = (tile, x, y, flipH = false, flipV = false, flipR = false) =>
      this.sprite(tile, x, y, flipH, flipV, flipR);
    window.draw = (drawable, x, y, flipH = false, flipV = false, flipR = false) =>
      this.draw(drawable, x, y, flipH, flipV, flipR);
    window.cls = () => this.cls();
    window.pen = (color) => this.pen(color);
    window.paper = (color) => this.paper(color);
    window.rect = (x, y, w, h) => this.rect(x, y, w, h);
    window.rectf = (x, y, w, h) => this.rectf(x, y, w, h);
    window.locate = (x, y) => this.locate(x, y);
    window.print = (text, x, y) => this.print(text, x, y);
    window.println = (text) => this.println(text);
    window.setCharset = (charset) => this.setCharset(charset);

    window.sfx = (name, volume = 1) => {
      this.playSfx(name, volume);
    };
    window.music = (track = null) => {
      if (track === null || track === undefined || track === false) {
        this.stopBgm();
        return;
      }

      if (typeof track === 'number' || typeof track === 'string') {
        this.playBgm(track);
        return;
      }

      this.errorOnce('audio:music:invalid', 'music(track) expects a number/string track key or null.');
    };
    window.patatracker = {
      playSong: (index) => {
        this.playBgm(index);
      },
      stop: () => {
        this.stopBgm();
      },
    };
  }

  async loadAudioManifest() {
    const manifestUrl = new URL('../audio/manifest.json', import.meta.url);

    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        console.error(
          `[audio] Missing manifest at "${manifestUrl.pathname}" (HTTP ${response.status}). ` +
          'Audio will stay disabled until a manifest exists.',
        );
        return;
      }

      const manifest = await response.json();
      this.audioManifest = this.parseAudioManifest(manifest, manifestUrl);
    } catch (error) {
      console.error('[audio] Failed to load audio manifest. Audio will stay disabled.', error);
    }
  }

  parseAudioManifest(manifest, manifestUrl) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      console.error('[audio] audio/manifest.json must be a JSON object.');
      return { bgm: {}, sfx: {} };
    }

    return {
      bgm: this.parseAudioGroup(manifest.bgm, 'bgm', manifestUrl),
      sfx: this.parseAudioGroup(manifest.sfx, 'sfx', manifestUrl),
    };
  }

  parseAudioGroup(group, groupName, manifestUrl) {
    if (group === undefined) {
      return {};
    }
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      console.error(`[audio] "${groupName}" in audio manifest must be an object.`);
      return {};
    }

    const parsed = {};
    for (const [key, raw] of Object.entries(group)) {
      const entry = this.parseAudioEntry(raw, groupName, key, manifestUrl);
      if (entry) {
        parsed[String(key)] = entry;
      }
    }
    return parsed;
  }

  parseAudioEntry(rawEntry, groupName, key, manifestUrl) {
    if (typeof rawEntry === 'string') {
      const url = this.resolveAudioUrl(rawEntry, manifestUrl);
      if (!url) {
        console.error(`[audio] "${groupName}.${key}" has an empty file path.`);
        return null;
      }
      return {
        url,
        loop: groupName === 'bgm',
        volume: 1,
      };
    }

    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      console.error(`[audio] "${groupName}.${key}" must be a string or object.`);
      return null;
    }

    if (typeof rawEntry.file !== 'string') {
      console.error(`[audio] "${groupName}.${key}.file" must be a string.`);
      return null;
    }

    const url = this.resolveAudioUrl(rawEntry.file, manifestUrl);
    if (!url) {
      console.error(`[audio] "${groupName}.${key}.file" is empty.`);
      return null;
    }

    const loop = rawEntry.loop === undefined ? groupName === 'bgm' : Boolean(rawEntry.loop);
    const volume = Number.isFinite(rawEntry.volume) ? Math.max(0, Math.min(1, rawEntry.volume)) : 1;

    return {
      url,
      loop,
      volume,
    };
  }

  resolveAudioUrl(filePath, manifestUrl) {
    const normalized = String(filePath).trim();
    if (!normalized) {
      return null;
    }
    return new URL(normalized, manifestUrl).href;
  }

  playSfx(name, volume = 1) {
    const key = String(name);
    const entry = this.audioManifest.sfx[key];
    if (!entry) {
      this.errorOnce(`audio:sfx:missing:${key}`, `[audio] Missing SFX mapping for "${key}" in audio/manifest.json.`);
      return;
    }

    const clip = new Audio(entry.url);
    clip.preload = 'auto';
    clip.loop = false;
    const runtimeVolume = Number.isFinite(volume) ? volume : 1;
    clip.volume = Math.max(0, Math.min(1, entry.volume * runtimeVolume));

    this.activeSfx.add(clip);
    clip.addEventListener('ended', () => {
      this.activeSfx.delete(clip);
    }, { once: true });
    clip.addEventListener('error', () => {
      this.errorOnce(
        `audio:sfx:file:${key}`,
        `[audio] Failed to load SFX "${key}" from "${entry.url}".`,
      );
      this.activeSfx.delete(clip);
    }, { once: true });

    const playResult = clip.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((error) => {
        this.errorOnce(`audio:sfx:play:${key}`, `[audio] Failed to play SFX "${key}".`);
        console.error(error);
        this.activeSfx.delete(clip);
      });
    }
  }

  playBgm(index) {
    const key = String(index);
    const entry = this.audioManifest.bgm[key];
    if (!entry) {
      this.errorOnce(`audio:bgm:missing:${key}`, `[audio] Missing BGM mapping for track "${key}" in audio/manifest.json.`);
      return;
    }

    this.stopBgm();

    const track = new Audio(entry.url);
    track.preload = 'auto';
    track.loop = entry.loop;
    track.volume = entry.volume;
    track.addEventListener('error', () => {
      this.errorOnce(
        `audio:bgm:file:${key}`,
        `[audio] Failed to load BGM track "${key}" from "${entry.url}".`,
      );
    }, { once: true });

    this.currentBgm = track;

    const playResult = track.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((error) => {
        this.errorOnce(`audio:bgm:play:${key}`, `[audio] Failed to play BGM track "${key}".`);
        console.error(error);
        if (error && error.name === 'NotAllowedError') {
          this.pendingBgmIndex = key;
          this.attachAudioUnlockRetry();
        }
      });
    }
  }

  stopBgm() {
    this.pendingBgmIndex = null;
    this.detachAudioUnlockRetry();

    if (!this.currentBgm) {
      return;
    }

    this.currentBgm.pause();
    this.currentBgm.currentTime = 0;
    this.currentBgm = null;
  }

  attachAudioUnlockRetry() {
    if (this.audioUnlockHandler) {
      return;
    }

    this.audioUnlockHandler = () => {
      const pending = this.pendingBgmIndex;
      this.pendingBgmIndex = null;
      this.detachAudioUnlockRetry();
      if (pending !== null) {
        this.playBgm(pending);
      }
    };

    window.addEventListener('pointerdown', this.audioUnlockHandler, { once: true });
    window.addEventListener('keydown', this.audioUnlockHandler, { once: true });
  }

  detachAudioUnlockRetry() {
    if (!this.audioUnlockHandler) {
      return;
    }

    window.removeEventListener('pointerdown', this.audioUnlockHandler);
    window.removeEventListener('keydown', this.audioUnlockHandler);
    this.audioUnlockHandler = null;
  }

  updateGamepadState() {
    const btn = window.gamepad.btn;
    const pad = this.getFirstPad();

    btn.up = this.keyDown('up') || this.padDirectionDown(pad, 'up');
    btn.down = this.keyDown('down') || this.padDirectionDown(pad, 'down');
    btn.left = this.keyDown('left') || this.padDirectionDown(pad, 'left');
    btn.right = this.keyDown('right') || this.padDirectionDown(pad, 'right');

    btn.A = this.keyDown('A') || this.padButtonDown(pad, 'A');
    btn.B = this.keyDown('B') || this.padButtonDown(pad, 'B');
    btn.X = this.keyDown('X') || this.padButtonDown(pad, 'X');
    btn.Y = this.keyDown('Y') || this.padButtonDown(pad, 'Y');

    let axisX = 0;
    if (btn.left) {
      axisX -= 1;
    }
    if (btn.right) {
      axisX += 1;
    }

    const analogX = this.padAxisX(pad);
    if (Math.abs(analogX) > Math.abs(axisX)) {
      axisX = analogX;
    }

    window.gamepad.x = axisX;
  }

  getFirstPad() {
    if (!this.scene.input || !this.scene.input.gamepad) {
      return null;
    }
    if (this.scene.input.gamepad.total <= 0) {
      return null;
    }
    return this.scene.input.gamepad.getPad(0);
  }

  keyDown(name) {
    return Boolean(this.keyboard[name] && this.keyboard[name].isDown);
  }

  padDirectionDown(pad, direction) {
    if (!pad) {
      return false;
    }

    const directional = pad[direction];
    if (!directional) {
      return false;
    }

    if (typeof directional === 'boolean') {
      return directional;
    }

    if (typeof directional === 'number') {
      return directional > 0.5;
    }

    return Boolean(directional.pressed || directional.value > 0.5);
  }

  padButtonDown(pad, buttonName) {
    if (!pad) {
      return false;
    }

    const button = pad[buttonName];
    if (!button) {
      return false;
    }

    if (typeof button === 'boolean') {
      return button;
    }

    if (typeof button === 'number') {
      return button > 0.5;
    }

    return Boolean(button.pressed || button.value > 0.5);
  }

  padAxisX(pad) {
    if (!pad) {
      return 0;
    }

    const axis = pad.axes && pad.axes[0];
    if (!axis) {
      return 0;
    }

    if (typeof axis.getValue === 'function') {
      return axis.getValue();
    }

    if (typeof axis.value === 'number') {
      return axis.value;
    }

    return 0;
  }

  getMap(mapRef) {
    if (typeof mapRef === 'string') {
      return this.mapsByName[mapRef];
    }

    if (typeof mapRef === 'number') {
      return this.mapsList[mapRef];
    }

    throw new Error(`Invalid map reference type: ${typeof mapRef}`);
  }

  makeImageRef(key, path) {
    if (!this.scene.textures.exists(key)) {
      throw new Error(`Missing image texture "${key}".`);
    }
    const texture = this.scene.textures.get(key);
    const source = texture.getSourceImage();
    if (!source) {
      throw new Error(`Texture "${key}" has no source image.`);
    }
    return new ImageRef(source, path);
  }

  warnOnce(key, message) {
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    console.warn(message);
  }

  errorOnce(key, message) {
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    console.error(message);
  }

  resolveColor(index) {
    if (!Number.isInteger(index)) {
      throw new Error(`Palette index must be an integer. Received: ${index}`);
    }
    if (index < 0 || index >= this.palette.length) {
      throw new Error(`Palette index ${index} is out of bounds (0-${this.palette.length - 1}).`);
    }
    return this.palette[index];
  }

  createCharsetDefinition(image, sourceX, sourceY, sourceWidth, sourceHeight) {
    if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height)) {
      throw new Error('Charset source image is invalid or missing dimensions.');
    }
    if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) {
      throw new Error('Charset source offsets must be finite numbers.');
    }
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
      throw new Error('Charset source size must be finite numbers.');
    }

    const x = Math.floor(sourceX);
    const y = Math.floor(sourceY);
    const width = Math.floor(sourceWidth);
    const height = Math.floor(sourceHeight);

    if (width <= 0 || height <= 0) {
      throw new Error(`Charset source has invalid dimensions (${width}x${height}).`);
    }
    if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
      throw new Error(
        `Charset source rect (${x}, ${y}, ${width}, ${height}) is out of image bounds (${image.width}x${image.height}).`,
      );
    }
    if (width < miniTextFontMetrics.columns || height < miniTextFontMetrics.rows) {
      throw new Error(
        `Charset source (${width}x${height}) is smaller than ${miniTextFontMetrics.columns}x${miniTextFontMetrics.rows}.`,
      );
    }

    const charWidth = Math.floor(width / miniTextFontMetrics.columns);
    const charHeight = Math.floor(height / miniTextFontMetrics.rows);
    if (charWidth <= 0 || charHeight <= 0) {
      throw new Error(`Computed charset glyph size is invalid (${charWidth}x${charHeight}).`);
    }

    return {
      image,
      sourceX: x,
      sourceY: y,
      width,
      height,
      charWidth,
      charHeight,
      columns: miniTextFontMetrics.columns,
      rows: miniTextFontMetrics.rows,
      glyphCount: miniTextFontMetrics.glyphCount,
      tintCache: new Map(),
    };
  }

  charsetSourceFromInput(charset) {
    if (!charset || typeof charset !== 'object') {
      throw new Error('setCharset() expects a sprite/image/texture-like object.');
    }

    if (charset._isSprite) {
      if (!charset.img) {
        throw new Error('setCharset() received a sprite without an image.');
      }
      return {
        image: charset.img,
        sourceX: Number.isFinite(charset.x) ? charset.x : 0,
        sourceY: Number.isFinite(charset.y) ? charset.y : 0,
        sourceWidth: Number.isFinite(charset.w) ? charset.w : charset.img.width,
        sourceHeight: Number.isFinite(charset.h) ? charset.h : charset.img.height,
      };
    }

    if (charset._isPixelboxTexture) {
      if (!charset.canvas) {
        throw new Error('setCharset() received a PixelboxTexture without a canvas.');
      }
      return {
        image: charset.canvas,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: charset.canvas.width,
        sourceHeight: charset.canvas.height,
      };
    }

    if (charset.canvas && Number.isFinite(charset.canvas.width) && Number.isFinite(charset.canvas.height)) {
      return {
        image: charset.canvas,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: charset.canvas.width,
        sourceHeight: charset.canvas.height,
      };
    }

    if (Number.isFinite(charset.width) && Number.isFinite(charset.height)) {
      return {
        image: charset,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: charset.width,
        sourceHeight: charset.height,
      };
    }

    throw new Error('setCharset() could not resolve image data from the provided object.');
  }

  getTintedCharsetCanvas(charset, colorIndex) {
    const cacheKey = String(colorIndex);
    if (charset.tintCache.has(cacheKey)) {
      return charset.tintCache.get(cacheKey);
    }

    const tintedCanvas = document.createElement('canvas');
    tintedCanvas.width = charset.width;
    tintedCanvas.height = charset.height;

    const tintedCtx = tintedCanvas.getContext('2d', { alpha: true });
    if (!tintedCtx) {
      throw new Error('Failed to create tinted charset drawing context.');
    }
    tintedCtx.imageSmoothingEnabled = false;
    tintedCtx.clearRect(0, 0, charset.width, charset.height);
    tintedCtx.drawImage(
      charset.image,
      charset.sourceX,
      charset.sourceY,
      charset.width,
      charset.height,
      0,
      0,
      charset.width,
      charset.height,
    );
    tintedCtx.globalCompositeOperation = 'source-in';
    tintedCtx.fillStyle = this.resolveColor(colorIndex);
    tintedCtx.fillRect(0, 0, charset.width, charset.height);
    tintedCtx.globalCompositeOperation = 'source-over';

    charset.tintCache.set(cacheKey, tintedCanvas);
    return tintedCanvas;
  }

  normalizePrintText(value) {
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return '[Object]';
      }
    }
    return String(value);
  }

  getTextMetrics() {
    const active = this.charset || this.defaultCharset;
    return {
      charWidth: active.charWidth,
      charHeight: active.charHeight,
    };
  }

  measureBitmapTextWidth(text) {
    const active = this.charset || this.defaultCharset;
    const normalized = this.normalizePrintText(text);

    let width = 0;
    let maxWidth = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      if (code === 13) {
        continue;
      }
      if (code === 10) {
        maxWidth = Math.max(maxWidth, width);
        width = 0;
        continue;
      }

      width += active.charWidth;
      maxWidth = Math.max(maxWidth, width);
    }

    return maxWidth;
  }

  drawBitmapTextToContext(ctx, text, x, y, colorIndex = this.penColor) {
    if (!ctx || typeof ctx.drawImage !== 'function') {
      throw new Error('drawBitmapTextToContext() requires a valid 2D canvas context.');
    }

    const active = this.charset || this.defaultCharset;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`drawBitmapTextToContext() requires finite coordinates. Received (${x}, ${y}).`);
    }
    const glyphAtlas = this.getTintedCharsetCanvas(active, colorIndex);
    const normalized = this.normalizePrintText(text);
    const startX = Math.round(x);
    const startY = Math.round(y);

    let cursorX = startX;
    let cursorY = startY;
    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      if (code === 13) {
        continue;
      }
      if (code === 10) {
        cursorX = startX;
        cursorY += active.charHeight;
        continue;
      }

      const glyph = code - 32;
      if (glyph >= 0 && glyph < active.glyphCount) {
        const sourceX = (glyph % active.columns) * active.charWidth;
        const sourceY = Math.floor(glyph / active.columns) * active.charHeight;
        ctx.drawImage(
          glyphAtlas,
          sourceX,
          sourceY,
          active.charWidth,
          active.charHeight,
          cursorX,
          cursorY,
          active.charWidth,
          active.charHeight,
        );
      }

      cursorX += active.charWidth;
    }
  }

  setCharset(charset = null) {
    const previousMetrics = this.getTextMetrics();
    const cursorColumn = Math.ceil(this.textCursor.x / previousMetrics.charWidth);
    const cursorRow = Math.ceil(this.textCursor.y / previousMetrics.charHeight);

    if (charset === null || charset === undefined) {
      this.charset = this.defaultCharset;
    } else {
      const source = this.charsetSourceFromInput(charset);
      this.charset = this.createCharsetDefinition(
        source.image,
        source.sourceX,
        source.sourceY,
        source.sourceWidth,
        source.sourceHeight,
      );
    }

    this.textCursor.x = cursorColumn * this.charset.charWidth;
    this.textCursor.y = cursorRow * this.charset.charHeight;
    return this.charset;
  }

  pen(colorIndex) {
    this.penColor = colorIndex;
    return this;
  }

  paper(colorIndex) {
    this.paperColor = colorIndex;
    return this;
  }

  cls() {
    this.screenCtx.fillStyle = this.resolveColor(this.paperColor);
    this.screenCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    return this;
  }

  rect(x, y, width, height) {
    this.screenCtx.strokeStyle = this.resolveColor(this.penColor);
    this.screenCtx.strokeRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    return this;
  }

  rectf(x, y, width, height) {
    this.screenCtx.fillStyle = this.resolveColor(this.paperColor);
    this.screenCtx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    return this;
  }

  locate(x, y) {
    this.textCursor.x = Math.round(x);
    this.textCursor.y = Math.round(y);
    return this;
  }

  print(text, x = this.textCursor.x, y = this.textCursor.y) {
    this.drawBitmapTextToContext(this.screenCtx, text, x, y, this.penColor);
    return this;
  }

  println(text) {
    this.print(text, this.textCursor.x, this.textCursor.y);
    this.textCursor.y += this.charset.charHeight;
    return this;
  }

  setTilesheet(sheet) {
    this.currentTilesheet = sheet || null;
    return this.currentTilesheet;
  }

  sprite(tile, x, y, flipH = false, flipV = false, flipR = false) {
    if (!this.currentTilesheet) {
      throw new Error('Cannot draw sprite: no active tilesheet.');
    }
    this.drawTileToContext(this.screenCtx, this.currentTilesheet, tile, x, y, flipH, flipV, flipR);
    return this;
  }

  draw(drawable, x, y, flipH = false, flipV = false, flipR = false) {
    this.drawDrawableToContext(this.screenCtx, drawable, x, y, flipH, flipV, flipR);
    return this;
  }

  drawMapToContext(ctx, map, x, y) {
    if (!map.tilesheet) {
      return;
    }

    const offsetX = x || 0;
    const offsetY = y || 0;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const startX = Math.max(0, Math.floor((-offsetX) / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor((-offsetY) / TILE_SIZE) - 1);
    const endX = Math.min(map.width, Math.ceil((width - offsetX) / TILE_SIZE) + 1);
    const endY = Math.min(map.height, Math.ceil((height - offsetY) / TILE_SIZE) + 1);

    for (let mapY = startY; mapY < endY; mapY += 1) {
      for (let mapX = startX; mapX < endX; mapX += 1) {
        const tile = map.get(mapX, mapY);
        if (!tile) {
          continue;
        }
        this.drawTileToContext(
          ctx,
          map.tilesheet,
          tile.sprite,
          offsetX + mapX * TILE_SIZE,
          offsetY + mapY * TILE_SIZE,
          tile.flipH,
          tile.flipV,
          tile.flipR,
        );
      }
    }
  }

  drawTileToContext(ctx, sheet, tile, x, y, flipH = false, flipV = false, flipR = false) {
    if (!sheet || !sheet.img) {
      throw new Error('Cannot draw tile: invalid tilesheet.');
    }
    if (!Number.isInteger(tile)) {
      throw new Error(`Tile index must be an integer. Received: ${tile}`);
    }

    const columns = Math.floor(sheet.w / TILE_SIZE);
    if (columns <= 0) {
      throw new Error(`Tilesheet "${sheet.path}" has invalid width (${sheet.w}).`);
    }

    const sx = sheet.x + (tile % columns) * TILE_SIZE;
    const sy = sheet.y + Math.floor(tile / columns) * TILE_SIZE;
    this.drawImageSection(ctx, sheet.img, sx, sy, TILE_SIZE, TILE_SIZE, x, y, TILE_SIZE, TILE_SIZE, flipH, flipV, flipR);
  }

  drawDrawableToContext(ctx, drawable, x, y, flipH = false, flipV = false, flipR = false) {
    if (!drawable) {
      throw new Error('draw() received an empty drawable.');
    }

    if (drawable._isTileMap) {
      this.drawMapToContext(ctx, drawable, x, y);
      return;
    }

    if (drawable._isPixelboxTexture) {
      this.drawImageSection(
        ctx,
        drawable.canvas,
        0,
        0,
        drawable.canvas.width,
        drawable.canvas.height,
        x,
        y,
        drawable.canvas.width,
        drawable.canvas.height,
        flipH,
        flipV,
        flipR,
      );
      return;
    }

    if (drawable.canvas) {
      this.drawImageSection(
        ctx,
        drawable.canvas,
        0,
        0,
        drawable.canvas.width,
        drawable.canvas.height,
        x,
        y,
        drawable.canvas.width,
        drawable.canvas.height,
        flipH,
        flipV,
        flipR,
      );
      return;
    }

    if (drawable.img) {
      this.drawImageSection(
        ctx,
        drawable.img,
        drawable.x || 0,
        drawable.y || 0,
        drawable.w || drawable.width,
        drawable.h || drawable.height,
        x,
        y,
        drawable.w || drawable.width,
        drawable.h || drawable.height,
        flipH,
        flipV,
        flipR,
      );
      return;
    }

    throw new Error('draw() received an unsupported drawable object.');
  }

  drawImageSection(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh, flipH, flipV, flipR) {
    const x = Math.round(dx);
    const y = Math.round(dy);

    if (!flipH && !flipV && !flipR) {
      ctx.drawImage(image, sx, sy, sw, sh, x, y, dw, dh);
      return;
    }

    ctx.save();
    ctx.translate(x + dw / 2, y + dh / 2);

    if (flipR) {
      ctx.rotate(Math.PI / 2);
    }

    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

class PixelboxCompatScene extends PhaserRuntime.Scene {
  constructor() {
    super('PixelboxCompatScene');
    this.runtime = new PixelboxRuntime(this);
  }

  preload() {
    this.runtime.preload();
  }

  async create() {
    await this.runtime.create();
  }

  update() {
    this.runtime.step();
  }
}

export function startPhaserGame() {
  return new PhaserRuntime.Game({
    type: PhaserRuntime.WEBGL,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#000000',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    input: {
      gamepad: true,
    },
    scale: {
      mode: PhaserRuntime.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [PixelboxCompatScene],
  });
}
