export default class Entity {
  constructor() {
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.maxSpeed = 1;
    this.bbox = {
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    };
    this.facing = null;
    this.state = null;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.flipH = false;
    this.states = {};
    this.metadata = {};
    this.entityName = 'Generic Entity';
    this.customSprite = null;    
    this.customTimer = 0;
    this.invincibilityFrames = 0;
    this.invincibilityDuration = 12;
    this.noKnockback = true;
    this.knockbackDuration = 0;
    this.knockbackTimer = 0;
    this.spriteSheet = assets.tilesheet;
    this.ignoreEdges = false;
  }

  init(x, y) {
    //console.log(['init ' + this.constructor.name, x, y]);
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.xm = 0;
    this.ym = 0;
    //console.log([this.startX, this.startY]);    
    var tx = Math.floor(this.startX / tileSize);
    var ty = Math.floor(this.startY / tileSize);

    // Load metadata for this entity, if it exists.
    try {
      this.metadata = assets.data.mapdata[map._name]['entities'][tx.toString()+','+ty.toString()];
      console.log(['loaded metadata', this.metadata]);
    } catch(error) {
      this.metadata = {};
    }
  }

  get tx() {
    return Math.floor(this.x / tileSize);
  }

  get ty() {
    return Math.floor(this.y / tileSize);
  }

  set tx(x) {
    this.x = x;
    this.tx = x * tileSize;
  }

  set ty(y) {
    this.y = y;
    this.ty = y * tileSize;
  }

  restart() {
    console.log('restart');
    this.x = this.startX;
    this.y = this.startY;
    this.xm = 0;
    this.ym = 0;
    this.freeze = false;
    console.log([this.x, this.y]);
  }

  getBbox() {
    if(this.facing == facing.right) return this.bbox;
    return {
      x1: tileSize - this.bbox.x2 - 1,
      y1: this.bbox.y1,
      x2: tileSize - this.bbox.x1,
      y2: this.bbox.y2,
    }
  }

  getPos() {
    return {
      x: this.x - camera.x,
      y: this.y - camera.y,
    }
  }

  getX() {
    return this.x - camera.x;
  }

  getY() {
    return this.y - camera.y;
  }

  getSprite() {
    var spr = this.states[this.state].anim[0];
    for(var c in this.states[this.state].anim) {
      if(this.stateCounter >= c) {
        spr = this.states[this.state].anim[c];
      } else {
        break;
      }
    }
    return spr;
  }

  colliding() {
    var bbox = this.getBbox();
    var tileX = [this.x + bbox.x1, this.x + bbox.x2 + 1];
    var tileY = [this.y + bbox.y1, this.y + bbox.y2];
    var result = [];

    for(ty of tileY) {
      var ty = Math.floor(ty / tileSize);
      for(tx of tileX) {
        var tx = Math.floor(tx / tileSize);
        var tile = map.get(tx, ty);
        if(tile) {
          //console.log(tile);
          tile = tile.sprite;          
          if(tiles[tile] !== undefined) {
            for(var prop of tiles[tile]) {
              if(!result.includes(prop)) result.push(prop);
            }
          }
        }
      }
    }

    //if(result.length > 0) console.log(result);
    return result;
  }

  getRealBbox() {
    var bbox = this.getBbox();
    return {
      x1: bbox.x1 + this.x,
      x2: bbox.x2 + this.x,
      y1: bbox.y1 + this.y,
      y2: bbox.y2 + this.y,
    };
  }

  getCenter() {
    var bbox = this.getBbox();
    return {
      x: Math.floor((bbox.x1 + bbox.x2) / 2),
      y: Math.floor((bbox.y1 + bbox.y2) / 2),
    }
  }

  getRealCenter() {
    var bbox = this.getRealBbox();
    return {
      x: Math.floor((bbox.x1 + bbox.x2) / 2),
      y: Math.floor((bbox.y1 + bbox.y2) / 2),
    }
  }
  
  offsetBox(bbox, x, y) {
    return {
      x1: bbox.x1 + x,
      y1: bbox.y1 + y,
      x2: bbox.x2 + x,
      y2: bbox.y2 + y,
    };
  }

  touching(direction, offsetX = 0, offsetY = 0) {    
    var bbox = this.offsetBox(this.getRealBbox(), offsetX, offsetY);
    var t = [];

    if(direction == 'down') {
      t = checkTilesH(bbox.x1, bbox.x2, bbox.y2 + 1);
    } else if(direction == 'up') {
      t = checkTilesH(bbox.x1, bbox.x2, bbox.y1 - 1);
    } else if(direction == 'left') {
      t = checkTilesV(bbox.x1 - 1, bbox.y1, bbox.y2);
    } else if(direction == 'right') {
      t = checkTilesV(bbox.x2 + 1, bbox.y1, bbox.y2);
    } else if(direction == 'upLeft') {
      t = checkTile(bbox.x1 - 1, bbox.y1 - 1);
    } else if(direction == 'upRight') {
      t = checkTile(bbox.x2 + 1, bbox.y1 - 1);
    } else if(direction == 'downLeft') {
      t = checkTile(bbox.x1 - 1, bbox.y2 + 1);
    } else if(direction == 'downRight') {
      t = checkTile(bbox.x2 + 1, bbox.y2 + 1);
    }

    return t;
  }

  touchingTile(direction, property, offsetX = 0, offsetY = 0) {
    var tlist = this.touching(direction, offsetX, offsetY);

    for(var tdata of tlist) {
      var tile = tdata.tile.sprite;
      if(tiles[tile] !== undefined) {
        if(tiles[tile].includes(property)) return true;
      }
    }
    return false;
  }

  onGround() {
    return (this.touchingTile('down', 'solid') || this.touchingTile('down', 'platform')) && this.ym >= 0;
  }

  onPlatform() {
    return (this.touchingTile('down', 'platform') && !this.touchingTile('down', 'solid')) && this.ym >= 0;
  }

  setState(s) {
    if(this.state != s) {
      this.state = s;
      this.stateCounter = 0;
    }
  }

  setCustomState(sprite, timer) {
    this.customSprite = sprite;
    this.customTimer = timer;
    this.state = state.custom;
  }

  draw() {
    tilesheet(this.spriteSheet);
    if(this.invincibilityFrames % 2 == 1) return;
    if(this.flipH) {
      if(this.state == state.custom) {
        sprite(this.customSprite, this.getX(), this.getY(), (this.facing == facing.right))
      } else {
        sprite(this.getSprite(), this.getX(), this.getY(), (this.facing == facing.right));
      }
    } else {
      if(this.state == state.custom) {
        sprite(this.customSprite, this.getX(), this.getY(), (this.facing == facing.left));
      } else {
        sprite(this.getSprite(), this.getX(), this.getY(), (this.facing == facing.left));
      }
    }

    if(this.showBbox) {
      var bbox = this.getBbox();
      pushPen(20);
      rect( 
        Math.round(this.x + bbox.x1 - camera.x), 
        Math.round(this.y + bbox.y1 - camera.y), 
        Math.round(bbox.x2 - bbox.x1 + 1), 
        Math.round(bbox.y2 - bbox.y1 + 1)
      );
      popPen();

      pushPen(6);
      print("x: " + this.x.toFixed(2), 10, 110);
      print("y: " + this.y.toFixed(2), 10, 119);
      popPen();
    }
  }

  updateStateCounter() {
    this.stateCounter++;
    try {
      if(this.states[this.state].reset >= 0 && this.stateCounter >= this.states[this.state].reset) this.stateCounter = 0;
    } catch(error) {
      this.stateCounter = 0;
    }
  }

  collidingWith(entity) {
    var rect1 = this.getRealBbox();
    var rect2 = entity.getRealBbox();

    return (
      rect1.x1 < rect2.x2 &&
      rect1.x2 > rect2.x1 &&
      rect1.y1 < rect2.y2 &&
      rect1.y2 > rect2.y1
    );
  }

  collidingWithBox(rect2) {
    if(rect2 === null) return false;
    var rect1 = this.getRealBbox();

    return (
      rect1.x1 < rect2.x2 &&
      rect1.x2 > rect2.x1 &&
      rect1.y1 < rect2.y2 &&
      rect1.y2 > rect2.y1
    );
  }

  getMove() {
    var newXm = this.xm;
    var newYm = this.ym;
    var newX = this.x + newXm;
    var newY = this.y + newYm;
    var collision = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    //console.log('getMove ' + newYm);
    var bbox = this.getBbox();
    //console.log(['new', newX, newY]);



    //var tileX = [newX + bbox.x1, newX + bbox.x2];
    var tileX = [this.x + bbox.x1, this.x + bbox.x2];
    var tileY = [newY + bbox.y1, newY + bbox.y2];

    if(newYm < 0) {
      let ty = Math.floor(tileY[0] / tileSize);
      // Check tiles above
      for(tx of tileX) {
        var tx = Math.floor(tx / tileSize);
        //console.log(['tile', tx, ty]);
        var tile = map.get(tx, ty);

        if(this.showBbox) {
          tileRect(11, tx, ty);
        }

        if(tile) {
          //console.log(tile);
          tile = tile.sprite;          
          if(tiles[tile] !== undefined && tiles[tile].includes("solid")) {
            //console.log("solid");
            newYm = 0;
            newY = (ty + 1) * tileSize - bbox.y1;
            collision.up = true;
            break;
          }
        } else {
          //console.log('no tile');
        }
      }
    } else if(newYm > 0) {
      // Check tiles below
      //if(this.touchingTile('down', 'platform', newXm, newYm)) debugger;
      let ty = Math.floor((tileY[1] + 1) / tileSize);
      let oldty = Math.ceil((this.y + bbox.y2) / tileSize) - 1;

      if(this.touchingTile('down', 'solid', 0, newYm) || (oldty < ty && this.touchingTile('down', 'platform', 0, newYm))) {
        newYm = 0;        
        newY = Math.floor((ty) * tileSize - bbox.y2 - 1);
        collision.down = true;
      } else {
        //console.log("no down tile");
      }
    }


    var tileX = [newX + bbox.x1, newX + bbox.x2];
    var tileY = [this.y + bbox.y1, this.y + bbox.y2];

    if(newXm > 0) {
      // Check tiles to the right
      let tx = Math.floor(Math.ceil(tileX[1]) / tileSize);
      for(ty of tileY) {
        var ty = Math.floor(ty / tileSize);
        //console.log(['tile', tx, ty]);
        var tile = map.get(tx, ty);

        if(this.showBbox) {
          tileRect(11, tx, ty);
        }

        if(tile) {
          //console.log(tile);
          tile = tile.sprite;          
          if(tiles[tile] !== undefined && tiles[tile].includes("solid")) {
            //console.log("solid");
            collision.right = true;
            newXm = 0;
            newX = tx * tileSize - bbox.x2 - 1;
            break;
          }
        } else if(tx >= map.width && !this.ignoreEdges) {
          //console.log('no tile');
          collision.right = true;
          newXm = 0;
          newX = tx * tileSize - bbox.x2 - 1;
          break;
        }
      }
    }

    var tileX = [newX + bbox.x1, newX + bbox.x2];
    var tileY = [this.y + bbox.y1, this.y + bbox.y2];

    if(newXm < 0) {
      // Check tiles to the left
      let tx = Math.floor(Math.floor(tileX[0]) / tileSize);
      for(ty of tileY) {
        var ty = Math.floor(ty / tileSize);
        //console.log(['tile', tx, ty]);
        var tile = map.get(tx, ty);

        if(this.showBbox) {
          tileRect(11, tx, ty);
        }

        if(tile) {
          //console.log(tile);
          tile = tile.sprite;          
          if(tiles[tile] !== undefined && tiles[tile].includes("solid")) {
            //console.log("solid");
            newXm = 0;
            newX = (tx + 1) * tileSize - bbox.x1;
            collision.left = true;
            break;
          }
        } else if(tx < 0 && !this.ignoreEdges) {
          //console.log('no tile');
          newXm = 0;
          newX = (tx + 1) * tileSize - bbox.x1;
          collision.left = true;
          break;
        }
      }
    } 

    return {
      x: newX,
      y: newY,
      xm: newXm,
      ym: newYm,
      collision: collision,
    };
  }

  die() {

  }

  move() {    
    this.clampMotion();
    var m = this.getMove();
    this.x = m.x;
    this.y = m.y;
    this.xm = m.xm;
    this.ym = m.ym;
  }

  update() {  
    if(!this.freeze) this.updateStateCounter();
    if(this.invincibilityFrames > 0) this.invincibilityFrames--;  
    if(this.knockbackTimer > 0) this.knockbackTimer--;  
  }

  drawActionSprite(s) {
    var ctr = this.getRealCenter();
    queueSprite(assets.ui, s, ctr.x - 3, ctr.y - 12);
  }

  isInvincible() {
    //console.log("inv", this.invincibilityFrames, this.invincibilityFrames > 0);
    return this.invincibilityFrames > 0;
  }

  setInvincible() {
    this.invincibilityFrames = this.invincibilityDuration;
  }

  knockback(x, y, flipX) {    
    //console.log("entity knockback", x, y);
    if(this.noKnockback) return;
    if(this.isInvincible()) return;
    if(flipX) {
      this.xm = -x;
    } else {
      this.xm = x;
    }
    this.ym = y;

    if(this.states.knockback !== undefined) this.state = knockback;
    this.knockbackTimer = this.knockbackDuration;
    //console.log('.');
  }
  
  clampMotion() {
    this.xm = clamp(this.xm, -tileSize + 1, tileSize - 1);
    this.ym = clamp(this.ym, -tileSize + 1, tileSize - 1);
  }

}

