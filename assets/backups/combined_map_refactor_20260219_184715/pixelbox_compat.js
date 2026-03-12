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
    this.tilesheet = null;
    this.width = 0;
    this.height = 0;
    this.items = [];
    this.objectLayers = {};
  }

  _init(width, height) {
    this.width = width;
    this.height = height;
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

  normalizeObject(layer, object) {
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

      sprite = tileId - 1;
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
    const tileLayer = layers.find((layer) => layer && layer.type === 'tilelayer');
    if (!tileLayer || !Array.isArray(tileLayer.data)) {
      throw new Error(`Tiled map "${manifestEntry.name || '<unnamed>'}" is missing a tilelayer with data.`);
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
    this.tilesheet = this.runtime.resolveTilesheet(this._tilesheetPath);

    for (let index = 0; index < tileLayer.data.length; index += 1) {
      const rawGid = tileLayer.data[index];
      if (!Number.isInteger(rawGid)) {
        throw new Error(`Tiled map "${this._name}" has non-integer gid at index ${index}.`);
      }

      const gid = rawGid >>> 0;
      if (gid === 0) {
        continue;
      }

      const flipH = (gid & TILED_FLIPPED_HORIZONTALLY_FLAG) !== 0;
      const flipV = (gid & TILED_FLIPPED_VERTICALLY_FLAG) !== 0;
      const flipR = (gid & TILED_FLIPPED_DIAGONALLY_FLAG) !== 0;
      const tileId = gid & ~TILED_FLIP_MASK;
      const sprite = tileId - 1;

      if (sprite < 0) {
        throw new Error(`Tiled map "${this._name}" has invalid gid ${gid} at index ${index}.`);
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

      this.objectLayers[layer.name] = layer.objects.map((object) => this.normalizeObject(layer, object));
    }

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

    this.assets = null;
    this.mapsByName = {};
    this.mapsList = [];
    this.tilesheets = {};
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
      ['tilesheet', 'assets/tilesheet.png'],
      ['tiles/entities', 'assets/tiles/entities.png'],
      ['tiles/cave/background', 'assets/tiles/cave/background.png'],
      ['tiles/cave/foreground', 'assets/tiles/cave/foreground.png'],
      ['tiles/cave/tiles', 'assets/tiles/cave/tiles.png'],
      ['tiles/outdoor/background', 'assets/tiles/outdoor/background.png'],
      ['tiles/outdoor/foreground', 'assets/tiles/outdoor/foreground.png'],
      ['tiles/outdoor/tiles', 'assets/tiles/outdoor/tiles.png'],
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

    load.json('data/mapdata', 'assets/data/mapdata.json');
    load.json('data/npcs', 'assets/data/npcs.json');
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
    this.screenImage.setDisplaySize(width, height);
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
      data: {
        mapdata: data.get('data/mapdata'),
        npcs: data.get('data/npcs'),
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
  }

  async initializeMaps() {
    const manifestUrl = new URL('../assets/maps_tiled/manifest.json', import.meta.url);

    let manifest;
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      manifest = await response.json();
    } catch (error) {
      throw new Error(`Failed to load tiled map manifest (${manifestUrl.pathname}): ${error.message}`);
    }

    if (!manifest || manifest._type !== 'tiled-map-manifest' || !Array.isArray(manifest.maps)) {
      throw new Error('assets/maps_tiled/manifest.json is missing or invalid.');
    }

    this.mapsByName = {};
    this.mapsList = [];

    const loadedMaps = await Promise.all(
      manifest.maps.map(async (entry) => {
        if (!entry || typeof entry !== 'object') {
          throw new Error('Encountered invalid map entry in tiled map manifest.');
        }
        if (typeof entry.name !== 'string' || entry.name.length === 0) {
          throw new Error('Encountered map entry without a valid name in tiled map manifest.');
        }
        if (typeof entry.file !== 'string' || entry.file.length === 0) {
          throw new Error(`Map entry "${entry.name}" is missing its JSON filename.`);
        }

        const mapUrl = new URL(`../assets/maps_tiled/${entry.file}`, import.meta.url);
        let tiledMap;
        try {
          const response = await fetch(mapUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          tiledMap = await response.json();
        } catch (error) {
          throw new Error(`Failed to load tiled map "${entry.name}" (${mapUrl.pathname}): ${error.message}`);
        }

        return new CompatTileMap(this).loadFromTiled(entry, tiledMap);
      }),
    );

    for (const map of loadedMaps) {
      this.mapsList.push(map);
      if (map._name) {
        this.mapsByName[map._name] = map;
      }
    }

    this.assets.maps = manifest;
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
    window.setCharset = () => {};

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
    this.screenCtx.fillStyle = this.resolveColor(this.penColor);
    this.screenCtx.font = '8px monospace';
    this.screenCtx.textBaseline = 'top';
    this.screenCtx.fillText(String(text), Math.round(x), Math.round(y));
    return this;
  }

  println(text) {
    this.print(text, this.textCursor.x, this.textCursor.y);
    this.textCursor.y += TILE_SIZE;
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
