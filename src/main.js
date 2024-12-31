import Player from './entity/player/player.js';
import FireballEnemy from "./entity/enemy/enemies/fireball_enemy.js";
import MogusEnemy from "./entity/enemy/enemies/mogus_enemy.js";
import BeeEnemy from "./entity/enemy/enemies/bee_enemy.js";
import InkyEnemy from "./entity/enemy/enemies/inky_enemy.js";

import VolcanoGoodie from "./entity/goodie/goodies/volcano_goodie.js";
import ChestGoodie from "./entity/goodie/goodies/chest_goodie.js";
import CoinGoodie from "./entity/goodie/goodies/coin_goodie.js";
import DoorGoodie from "./entity/goodie/goodies/door_goodie.js";
import WeaponGoodie from "./entity/goodie/goodies/weapon_goodie.js";
import ItemGoodie from './entity/goodie/goodies/item_goodie.js';
import NpcGoodie from "./entity/goodie/goodies/npc_goodie.js";
import GrenadeProjectile from './entity/goodie/goodies/grenade_projectile.js';
window.GrenadeProjectile = GrenadeProjectile;

import ExitScript from "./entity/script/scripts/exit_script.js";
import TextBox from "./textbox.js";
import AtlasItem from "./atlas_item.js";
import Wipe from "./wipe.js";
import Scripts from './scripts.js';
window.Scripts = Scripts;
Scripts.init();

window.levels = [          
  "Home",
  "Test",     
  "Level 4",  
  "Level 1",
  "Level 2",  
  "Level 3",  
];

window.disembugulate = false;
const max_parallax = 10;
window.Flags = {};
var penColors = [];
var paperColors = [];
window.firstFrame = true;
window.evenFrame = true;
window.bgcolor = 1;
window.paused = false;
window.hideUI = false;

Wipe.init();


window.Flag = function(f) {
  console.log("Checking flag " + f);
  if(window.Flags[f] !== undefined) {
    console.log(`Flag ${f}: ${window.Flags[f]}`);
    return window.Flags[f];
  } 
  console.log(`Flag ${f} is not set`);
  return false;
}



window.template = function(str) {
  return eval('`' + str + '`');
}

window.randRange = function(min, max) { 
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

window.randFloatRange = function(min, max) {
  return Math.random() * (max - min) + min;
}

window.pushPen = function(color) {
  penColors.push(color);
  pen(color);
};

window.popPen = function() {
  penColors.pop();
  if(penColors.length > 0) pen(penColors.slice(-1));
};

window.pushPaper = function(color) {
  paperColors.push(color);
  paper(color);
};

window.popPaper = function() {
  paperColors.pop();
  if(paperColors.length > 0) paper(paperColors.slice(-1));
};

window.drawBbox = function(bbox, color = 20) {
  //console.log(bbox);
  pushPaper(color);
  var x = Math.round(bbox.x1 - camera.x);
  var y = Math.round(bbox.y1 - camera.y);
  var w = bbox.x2 - bbox.x1 + 1;
  var h = bbox.y2 - bbox.y1 + 1;
  //console.log([x, y, w, h]);
  rectf(x, y, w, h);
  popPaper();
}

window.queueBox = function(box, color = 20) {
  boxQueue.push({
    box: box,
    color: color,
  });
}

window.enemyQueue = [];
window.goodieQueue = [];
window.particleQueue = [];
window.boxQueue = [];
window.spriteQueue = [];
window.scriptQueue = [];
window.textQueue = [];
window.spriteQueueDrawn = [];
window.atlasQueue = {};

window.gravity = 0.15;
window.tileSize = 8;
window.input = {};
window.tiles = null;

window.display = {
  w: 128,
  h: 128,
};

window.enemyTypes = {
  113: FireballEnemy,
  112: MogusEnemy,
  116: BeeEnemy,
  117: InkyEnemy,
}

window.goodieTypes = {
  16: CoinGoodie,
  17: DoorGoodie,
  18: DoorGoodie,
  19: ChestGoodie,
  20: WeaponGoodie,
  32: NpcGoodie,
  35: ItemGoodie,
  114: VolcanoGoodie,
}

window.scriptTypes = {
  34: ExitScript,
}

window.facing = {
  left: 0,
  right: 1,
};

window.state = {
  stand: 0,
  move: 1,
  jump: 2,
  fall: 3,
  ouch: 4,
  closed: 5,
  open: 6,
  custom: 7,
  slide: 8,
  knockback: 9,
};

window.current_level = 0;

window.camera = {
  x: 0,
  y: 0,
  set: function(x, y) {
    this.x = x;
    this.y = y;
  },
};

window.player = new Player();

window.background = [];
window.map = null;
window.foreground = null;
window.entityMap = null;

window.loadMap = function(mapname, px = null, py = null) {
  Wipe.run(() => _loadMap(mapname, px, py));
  //_loadMap(mapname);
}

function _loadMap(mapname, px = null, py = null) {
  console.log(`_loadmap ${mapname} ${px} ${py}`);
  enemyQueue = [];
  goodieQueue = [];
  particleQueue = [];
  textQueue = [];
  scriptQueue = [];
  atlasQueue = {};
  background = [];

  for(let i = 0; i < max_parallax; i++) {    
    let m = getMap(mapname + "/bg." + i)
    console.log("loading background " + mapname + "/bg." + i);
    if(m) {
      console.log("loaded", m);
      background.push(m);
    }
  }

  map = getMap(mapname + "/main");
  foreground = getMap(mapname + "/fg");
  entityMap = getMap(mapname + "/entities");

  tiles = assets.data.tiletypes[map._tilesheetPath];

  try {
    bgcolor = assets.data.mapdata[map._name]['bgcolor'];
  } catch(error) {
    bgcolor = 1;
  }

  var atlas;

  for(let m of background.concat([map, foreground])) {
    if(m !== undefined && m._name !== undefined) {
      atlasQueue[m._name] = [];
      try {
        atlas = assets.data.mapdata[m._name]['atlas'];
      } catch(error) {
        atlas = [];
      }
    
      if(atlas !== undefined) {
        for(let a of atlas) {
          let item = new AtlasItem(assets.atlas[a.sprite], a.x, a.y);
          atlasQueue[m._name].push(item);
        }
      }
    }
  }

  if(bgcolor === null || bgcolor === undefined) bgcolor = 1;
  
  var player_tile = entityMap.find(0).pop();

  for(var e in enemyTypes) {
    var enemyType = enemyTypes[e];
    //console.log("Adding enemies to map: " + enemyType.name);
    var enemy_tiles = entityMap.find(parseInt(e));
    //console.log(['find', e]);
    //console.log(['tiles', enemy_tiles]);
    for(var t of enemy_tiles) {
      console.log([enemyType.name, t.x, t.y]);
      //entityMap.remove(t.x, t.y)
      var enemy = new enemyType(parseInt(e));
      enemy.init(t.x * tileSize, t.y * tileSize);
      enemyQueue.push(enemy);
    }
  }

  for(var e in goodieTypes) {
    var goodieType = goodieTypes[e];
    //console.log("Adding enemies to map: " + goodieType.name);
    var goodie_tiles = entityMap.find(parseInt(e));
    //console.log(['find', e]);
    //console.log(['tiles', goodie_tiles]);
    for(var t of goodie_tiles) {
      console.log([goodieType.name, t.x, t.y]);
      //entityMap.remove(t.x, t.y)
      var goodie = new goodieType(parseInt(e));
      goodie.init(t.x * tileSize, t.y * tileSize);
      goodieQueue.push(goodie);
    }
  }

  for(var e in scriptTypes) {
    var scriptType = scriptTypes[e];
    //console.log("Adding scripts to map: " + scriptType.name);
    var script_tiles = entityMap.find(parseInt(e));
    //console.log(['find', e]);
    //console.log(['tiles', script_tiles]);
    for(var t of script_tiles) {
      console.log([scriptType.name, t.x, t.y]);
      //entityMap.remove(t.x, t.y)
      var script = new scriptType(parseInt(e));
      script.init(t.x * tileSize, t.y * tileSize);
      scriptQueue.push(script);
    }
  }

  //entityMap.remove(player_tile.x, player_tile.y)
  if(px !== null && py !== null) {
    player.init(px * tileSize, py * tileSize);
  } else {
    player.init(player_tile.x * tileSize, player_tile.y * tileSize);
  }
  //player.showBbox = true;
  
  //fireball.showBbox = true;
  console.log("player init complete");
  console.log(player_tile);
}

window.tileRect = function(color, x, y) {
  pushPen(color);
  rect(x * tileSize - camera.x, y * tileSize - camera.y, tileSize, tileSize);
  popPen();
}

window.checkTile = function(x, y) {
  var tx = Math.floor(x / tileSize);
  var ty = Math.floor(y / tileSize);
  var tile = map.get(tx, ty);
  if(tile) {
    return [{
      tx: tx,
      ty: ty,
      tile: map.get(tx, ty),
    }];
  } else {
    return [];
  }
}

window.checkTilesH = function(x1, x2, y, penColor = -1) {
  var tileX = [];
  //queueBox({x1: x1, y1: y, x2: x2, y2: y}, 33);
  for(var x = x1; x < x2; x += tileSize) {
    tileX.push(x);
  }
  tileX.push(x2);

  var ty = Math.floor(y / tileSize);
  var tiles = [];
  var old_tx = null;

  for(var tx of tileX) {
    tx = Math.floor(tx / tileSize);
    if(tx == old_tx) continue;
    old_tx = tx;
    var tile = map.get(tx, ty);
    if(penColor >= 0) {
      tileRect(penColor, tx, ty);
    }
    if(tile) {
      tiles.push({tx: tx, ty: ty, tile: tile});
    } 
  }

  return tiles;
}

window.checkTilesV = function(x, y1, y2, penColor = -1) {
  var tileY = [];
  for(var y = y1; y < y2; y += tileSize) {
    tileY.push(y);
  }
  tileY.push(y2);

  var tx = Math.floor(x / tileSize);
  var tiles = [];
  var old_ty = null;

  for(var ty of tileY) {    
    ty = Math.floor(ty / tileSize);
    if(ty == old_ty) continue;
    old_ty = ty;
    var tile = map.get(tx, ty);
    if(penColor >= 0) {
      tileRect(penColor, tx, ty);
    }
    if(tile) {
      tiles.push({tx: tx, ty: ty, tile: tile});
    } 
  }

  return tiles;
}
console.log(assets);
TextBox.init();
TextBox.setColor(6);

_loadMap(levels[current_level]);
pushPaper(1);
pushPen(20);
patatracker.playSong(0);

//console.log(map);
window.say = function(string, e = null, showBox = true) {
  TextBox.queue(template(string), e);
  TextBox.show();
  TextBox.showBox = showBox;
}
 
setInterval(function() {
  if(window.disembugulate) debugger;
  updateInput();

  if(!TextBox.isVisible() && !paused) {
    for(var e of particleQueue) {
      e.update();
    }
    for(var e of textQueue) {
      e.update();
    }
    player.update();
    for(var e of enemyQueue) {
      e.update();
    }
    for(var e of goodieQueue) {
      e.update();
    }
    for(var e of scriptQueue) {
      e.update();
    }
  }

  TextBox.update();
  Wipe.update();

  spriteQueueDrawn = [];

  evenFrame = !evenFrame;
}, 1000/60);

console.log(assets);

//▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
// Update is called once per frame
exports.update = function () {
  if(window.disembugulate) debugger;
  if(firstFrame) initInput();

  pushPaper(bgcolor);
  cls();
  popPaper();

  var camX = Math.round(player.x - display.w / 2 + tileSize);
  
  if(camX < 0) {
    camX = 0;
  }

  if(camX > map.width * tileSize - display.w) {
    camX = map.width * tileSize - display.w;
  }
  
  var camY = Math.round(player.y - display.h / 2 + tileSize);
  
  if(camY < 0) {
    camY = 0;
  }

  if(camY > map.height * tileSize - display.h) {
    camY = map.height * tileSize - display.h;
  }

  camera.set(camX, camY);

  var htiles = display.w / tileSize;
  var vtiles = display.h / tileSize;

  for(let b of background) {
    if(b) {
      b.draw(
        -camera.x * (b.width - htiles) / (map.width - htiles), 
        -camera.y * (b.height - vtiles) / (map.height - vtiles)
      );
    }

    if(atlasQueue[b._name] !== undefined) {
      for(var e of atlasQueue[b._name]) {
        e.draw(
          -camera.x * (b.width - htiles) / (map.width - htiles), 
          -camera.y * (b.height - vtiles) / (map.height - vtiles)
        );
      }
    }
  }

  map.draw(-camera.x, -camera.y);

  if(atlasQueue[map._name] !== undefined) {
    for(var e of atlasQueue[map._name]) {
      e.draw(-camera.x, -camera.y);
    }
  }

  for(var e of goodieQueue) {
    e.draw();
  }

  player.draw();
  for(var e of enemyQueue) {
    e.draw();
  }

  for(var e of particleQueue) {
    e.draw();
  }

  if(foreground) {
    foreground.draw(-camera.x, -camera.y);

    if(atlasQueue[foreground._name] !== undefined) {
      for(var e of atlasQueue[foreground._name]) {
        e.draw(-camera.x, -camera.y);
      }
    }
  }

  // Push drawn sprites into this queue to make sure we draw every sprite before it's deleted.
  // Queue is cleared on timer update.
  for(var s of spriteQueueDrawn) {
    drawSprites(s.sheet, s.tile, s.x, s.y, s.flipH, s.flipV, s.flipR);
  }

  while(spriteQueue.length > 0) {
    var s = spriteQueue.pop();    
    //console.log(s);
    //tilesheet(s.sheet);
    drawSprites(s.sheet, s.tile, s.x, s.y, s.flipH, s.flipV, s.flipR);
    spriteQueueDrawn.push(s);
  }
  tilesheet(assets.tiles.cave.tiles);

  while(boxQueue.length > 0) {
    var b = boxQueue.pop();
    drawBbox(b.box, b.color);    
  }

  for(var e of textQueue) {
    e.draw();
  }

  if(!window.hideUI) drawHealthBar();
  TextBox.draw();

  Wipe.draw();
  firstFrame = false;
};

window.drawSprites = function(sheet, tile, x, y, flipH = false, flipV = false, flipR = false) {
  tilesheet(sheet);

  if(Array.isArray(tile)) {
    var mult = 16;
    for(var i = 0; i < tile[1]; i++) {
      for(var j = 0; j < tile[2]; j++) {   
        /*             
        console.log([i + tile[0] + j * 16, 
          x - camera.x + i * tileSize * (flipH ? -1: 1), 
          y - camera.y + j * tileSize * (flipV ? -1: 1)]
        );
        */
        sprite(i + tile[0] + j * 16, 
          x - camera.x + i * tileSize * (flipH ? -1: 1), 
          y - camera.y + j * tileSize * (flipV ? -1: 1),
          flipH, flipV, flipR
        );
      }
    }
  } else {
    //console.log([tile, x - camera.x, y - camera.y]);
    sprite(tile, x - camera.x, y - camera.y, flipH, flipV, flipR);
  } 
};

window.queueSprite = function(sheet, tile, x, y, flipH = false, flipV = false, flipR = false) {
  spriteQueue.push({
    sheet: sheet,
    tile: tile,
    x: x,
    y: y,
    flipH: flipH,
    flipV: flipV,
    flipR: flipR,
  });
}

function initInput() {
  input = {
    btn: { ...gamepad.btn },
    pressed: { ...gamepad.btn },
    released: { ...gamepad.btn },
  };
}

function updateInput() {
  for(var b in gamepad.btn) {
    if(gamepad.btn[b] && !input.btn[b]) {
      input.pressed[b] = true;
    } else {
      input.pressed[b] = false;
    }

    if(!gamepad.btn[b] && input.btn[b]) {
      input.released[b] = true;
    } else {
      input.released[b] = false;
    }
  }
  input.btn = { ...gamepad.btn };
}

function drawHealthBar() {
  tilesheet(assets.ui);
  sprite(0, 9, 9);

  pushPen(6);
  rect(18, 9, 30, 7);
  popPen();

  pushPen(3);
  rect(19, 10, 28, 5);
  popPen();

  pushPaper(20);
  rectf(20, 11, 26 * player.life / player.maxLife, 3);
  popPaper();
}