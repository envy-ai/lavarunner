import Wipe from '../../wipe.js';
import Entity from '../entity.js';
import TextParticle from '../particle/text_particle.js';
import {
  PLAYER_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER,
  SPRITE_EDITOR_WEAPON_ATTACK_STATE_IDENTIFIER,
  WEAPON_SPRITE_SHEET_PATH,
  buildWeaponAttackSpriteEditorIdentifier,
  buildSpriteEditorTilesetRelPath,
} from '../sprite_editor_definitions.js';

export default class Player extends Entity {
  constructor() {
    super();
    this.accel = 0.15;
    this.airAccel = 0.07;
    this.jumpAccel = 2.7;
    this.airJumpAccel = 2.7;
    this.maxSpeed = 1;
    this.wasGrounded = 0;
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.maxSpeed = 1;
    this.facing = facing.right;
    this.state = state.stand;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.oldBtnA = false;
    this.inventory = {};
    this.entityName = 'Player';
    this.weapon = null;
    this.weaponName = null;
    this.attackTimer = 0;
    this.maxLife = 10;
    this.life = 10;
    this.weapon_sprite = null;
    this.weapon_origin_right = { x: 6, y: 4 };
    this.weapon_origin_left = { x: 1, y: 4 };
    this.chain_atk_count = 0;
    this.showWeaponBbox = false;
    this.weaponFrame = null;
    this.knockbackDuration = 20;
    this.invincibilityDuration = 90;
    this.noKnockback = false;
    this.spriteSheet = assets.sprites.player_default;
    this.airJumpCounter = 0;

    // Turn on to debug
    this.showBbox = false;

    this.spriteEditorStateIdentifiers = {
      [state.stand]: 'stand',
      [state.move]: 'move',
      [state.jump]: 'jump',
      [state.fall]: 'fall',
      [state.ouch]: 'ouch',
      [state.slide]: 'slide',
      [state.knockback]: 'knockback',
    };
    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.PLAYER_DEFAULT;
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(PLAYER_SPRITE_SHEET_PATH),
    );
  }

  addItem(item, quantity = 1) {
    if(quantity == 0) return;
    if(this.inventory[item] === undefined) {
      this.inventory[item] = quantity;
    } else {
      this.inventory[item] += quantity;
    }
    if(quantity > 0) {
      console.log("got " + item + " x" + quantity);
    } else {
      console.log("removed " + item + " x" + -quantity);
    }
    console.log("inventory", this.inventory);
  }

  hasItem(item) {
    if(this.inventory[item] === undefined) {
      return 0;
    } else {
      return this.inventory[item];
    }
  }

  removeItem(item, quantity = 1) {
    this.addItem(item, -quantity);
    if(this.inventory[item] <= 0) {
      delete this.inventory[item];
    }
  }

  init(x, y, metadata = null) {
    super.init(x, y, metadata);
    //this.addItem("Double Jump Ring", 1);
  }

  move() {    
    this.clampMotion();
    var m = this.getMove();
    this.x = m.x;
    this.y = m.y;
    this.xm = m.xm;

    var bounceSpeed = 0.5;
    if(this.hasItem('Double Jump Ring')) bounceSpeed = 1.5;

    if(m.collision.down && this.ym > this.jumpAccel + bounceSpeed) {
      // boing!
      var bbox = this.getBbox();
      var ty = Math.floor((this.y + bbox.y2) / tileSize);
      this.ym = -(this.ym / 3);
      this.y -= 0.1;
      sfx('bounce');
    } else {      
      this.ym = m.ym;
    }
  }

  restart() {
    //debugger;
    super.restart();
    this.life = this.maxLife;
    patatracker.playSong(0);
  }

  damage(d) {
    if(this.isInvincible()) return;
    this.life -= d;
    if(this.life <= 0) {
      sfx('squeak');
      this.setState(state.ouch);
      this.die();
    } else {
      sfx('oof');
      this.setInvincible();
    }
    var ctr = this.getRealCenter();

    var p = new TextParticle();
    p.str = Math.round(d).toString();
    p.x = ctr.x;
    p.y = ctr.y - 4;
    p.colors = assets.data.particles.spark.colors;
    p.gravity = -0.05;
    p.setLife(assets.data.particles.spark.duration);
    textQueue.push(p);
  }

  die() {
    this.freeze = true;
    patatracker.stop();
    //setTimeout(() => this.restart(), 1500);
    Wipe.run(() => this.restart(), null);
  }

  addWeapon(weapon) {
    console.log("Got weapon " + weapon);
    const weaponData = assets.data.weapons[weapon];
    if(!Array.isArray(weaponData) || weaponData.length === 0) {
      throw new Error(`Player tried to equip unknown or invalid weapon "${weapon}".`);
    }
    this.weaponName = weapon;
    this.weapon = weaponData;
  }

  getWeaponAttackSpriteEditorDefinition(chainIndex = this.chain_atk_count) {
    if(this.weaponName === null || this.weapon === null) {
      throw new Error('Player requested weapon attack LDtk data without an equipped weapon.');
    }
    if(!Number.isInteger(chainIndex) || chainIndex < 0 || chainIndex >= this.weapon.length) {
      throw new Error(`Player requested invalid weapon chain index "${chainIndex}" for "${this.weaponName}".`);
    }

    return this.requireSpriteEditorDefinition(
      buildWeaponAttackSpriteEditorIdentifier(this.weaponName, chainIndex),
      buildSpriteEditorTilesetRelPath(WEAPON_SPRITE_SHEET_PATH),
      [SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER],
    );
  }

  getWeaponBbox() {
    if(this.weapon === null || this.weaponFrame === null || this.weaponFrame < 0 || this.attackTimer == 0) return null;
    const chain = this.weapon[this.chain_atk_count];
    if(!chain || typeof chain !== 'object' || Array.isArray(chain)) {
      throw new Error(`Player weapon "${this.weaponName}" chain "${this.chain_atk_count}" is invalid.`);
    }
    if(chain.frames === undefined) {
      return null;
    }

    const definition = this.getWeaponAttackSpriteEditorDefinition(this.chain_atk_count);
    const attackState = definition.states[SPRITE_EDITOR_WEAPON_ATTACK_STATE_IDENTIFIER];
    if(!attackState || !attackState.boxesByType || typeof attackState.boxesByType !== 'object' || Array.isArray(attackState.boxesByType)) {
      throw new Error(
        `LDtk sprite "${definition.identifier}" is missing attack state box data required by Player.`,
      );
    }

    const boxTrack = attackState.boxesByType[SPRITE_EDITOR_ATTACK_BOX_IDENTIFIER];
    if(boxTrack === undefined) {
      throw new Error(
        `LDtk sprite "${definition.identifier}" is missing attack box track required by Player.`,
      );
    }

    const bbox = this.resolveAnimationTrackValue(
      boxTrack,
      `LDtk sprite "${definition.identifier}" attack box`,
      this.weaponFrame,
    );
    if(bbox === null || this.facing == facing.right) return bbox;
    return {
      x1: tileSize - bbox.x2 - 1,
      y1: bbox.y1,
      x2: tileSize - bbox.x1,
      y2: bbox.y2,
    };
  }

  getRealWeaponBbox() {
    var weapon_bbox = this.getWeaponBbox();
    if(weapon_bbox === null) return null;
    var chain = this.weapon[this.chain_atk_count];

    if(this.facing == facing.right) {
      return {
        x1: weapon_bbox.x1 + this.x + this.weapon_origin_right.x - chain.origin.x,
        y1: weapon_bbox.y1 + this.y + this.weapon_origin_right.y - chain.origin.y,
        x2: weapon_bbox.x2 + this.x + this.weapon_origin_right.x - chain.origin.x,
        y2: weapon_bbox.y2 + this.y + this.weapon_origin_right.y - chain.origin.y,
      }
    } else {
      return {
        x1: weapon_bbox.x1 + this.x + this.weapon_origin_left.x - 7 + chain.origin.x,
        y1: weapon_bbox.y1 + this.y + this.weapon_origin_left.y - chain.origin.y,
        x2: weapon_bbox.x2 + this.x + this.weapon_origin_left.x - 7 + chain.origin.x,
        y2: weapon_bbox.y2 + this.y + this.weapon_origin_left.y - chain.origin.y,
      }
    }
  }

  update() {    
    super.update();

    if(this.freeze) return;
  
    if(this.state == state.custom) {
      this.customTimer--;
      if(this.customTimer <= 0) { 
        this.state = state.stand;
      } else {
        return;
      }    
    }

    var grounded = this.onGround();

    if(grounded) {
      if(this.hasItem("Double Jump Ring")) {
        this.airJumpCounter = 1;
      }
    }

    if(grounded && this.colliding().includes('exit')) {
      current_level++;
      this.freeze = true;
      setTimeout(() => {
        loadMap(levels[current_level]);
        player.freeze = false;
      }, 1500);
      return;
    }

    if(this.y > tileSize * map.height) { 
      sfx('thud');
      this.die();
    }

    var accel = this.accel;
    if(!grounded) {
      accel = this.airAccel;
    }

    if(this.attackTimer == 0) {
      this.chain_atk_count = 0;
    }

    if(this.knockbackTimer > 0) {
      if(this.xm > 0) this.xm = Math.max(this.xm - accel, 0);
      if(this.xm < 0) this.xm = Math.min(this.xm + accel, 0);

      this.ym += gravity;
      this.move();
      return;
    }

    var chain = null;
    
    if(this.weapon !== null) {
      chain = this.weapon[this.chain_atk_count];
      if(chain.cancel === undefined) chain.cancel = chain.anim_duration + 1;
    };

    var canMove = true;
    /*
    if(input.btn.Y) {
      console.log(gamepad);
    }
    */

    if(chain !== null && chain.stopMove !== undefined && chain.stopMove && this.attackTimer > 0) canMove = false;
    
    if(canMove && input.btn.right) {            
      if(this.xm + accel < this.maxSpeed) {
        this.xm = Math.max(this.xm + accel, this.maxSpeed);      
      } else {
        this.xm = Math.max(this.xm - accel, this.maxSpeed);      
      }
      this.facing = facing.right;
      if(grounded) this.setState(state.move);
    } else if (canMove && input.btn.left) { 
      if(this.xm - accel > -this.maxSpeed) {
        this.xm = Math.min(this.xm - accel, -this.maxSpeed); 
      } else {
        this.xm = Math.min(this.xm + accel, -this.maxSpeed); 
      }
      this.facing = facing.left;
      if(grounded) this.setState(state.move);
    } else {
      if(this.xm > 0) this.xm = Math.max(this.xm - accel, 0);
      if(this.xm < 0) this.xm = Math.min(this.xm + accel, 0);
      if(grounded) {
        if(this.xm == 0) {
          this.setState(state.stand);
        } else {
          this.setState(state.slide);
        }
      }
    }

    if(canMove && input.pressed.A && (grounded || (this.wasGrounded && this.ym >= 0))) {
      if(this.onPlatform() && input.btn.down) {
        this.y+=2;
      } else {
        this.ym = -this.jumpAccel;
        sfx('jump');  
      }
    } else if(canMove && input.pressed.A && this.airJumpCounter > 0) {
      this.ym = -this.airJumpAccel;
      this.airJumpCounter--;
      sfx('jump');  
    } else {
      this.ym += gravity;
    }

    if(input.released.A && !grounded && this.ym <= -0.7) {
      this.ym = -0.7;
    }

    var clamp_mult = 1;
    var gpx = Math.abs(gamepad.x);
    if(gpx >= 0.075) {
      clamp_mult = gpx; 
    }

    /*
    if(grounded) {
      this.xm = clamp(this.xm, -this.maxSpeed * clamp_mult, this.maxSpeed * clamp_mult);
    } else {
      this.xm = clamp(this.xm, -this.maxSpeed, this.maxSpeed);
    }
    */
    this.move();

    if(this.ym > 0) this.setState(state.fall);
    if(this.ym < 0) this.setState(state.jump);
    if(grounded) {
      this.wasGrounded = 4;
    } else {
      this.wasGrounded--;
      if(this.wasGrounded < 0) this.wasGrounded = 0;
    }

    if(input.pressed.B && chain !== null) {
      //console.log(this.chain_atk_count, chain);
      if(this.attackTimer == 0) {
        this.attackTimer = chain.anim_duration;
        sfx(chain.sfx);
      } else if(this.attackTimer <= chain.anim_duration - chain.cancel) {
        this.chain_atk_count++;
        if(this.chain_atk_count >= this.weapon.length) this.chain_atk_count = 0;
        chain = this.weapon[this.chain_atk_count];
        if(chain.cancel === undefined) chain.cancel = chain.anim_duration + 1;
        this.attackTimer = chain.anim_duration;
        sfx(chain.sfx);
      }
      if(chain.eval !== undefined) {
        eval(chain.eval);
      }
    }

    var weapon_frame = null;
    var weapon_real_bbox = null;
    
    if(this.attackTimer > 0) {
      weapon_frame = chain.anim_duration - this.attackTimer - 1;
      var weapon_bbox = null;
      this.weapon_sprite = null;

      if(chain.frames !== undefined) {
        for(var f in chain.frames) {
          f = parseInt(f);
          if(weapon_frame >= f) {
            this.weaponFrame = f;
            weapon_bbox = this.getWeaponBbox();
            //console.log(f, weapon_bbox);
            this.weapon_sprite = chain.frames[f].sprite;

            if(weapon_bbox !== null) {
              weapon_real_bbox = this.getRealWeaponBbox();

              if(weapon_frame == f) {
                if(chain.frames[f].xm !== undefined) {
                  this.xm += chain.frames[f].xm * (this.facing == facing.right? 1:-1);
                }
                if(chain.frames[f].ym !== undefined) {
                  this.ym += chain.frames[f].ym;
                }
              }
            } else {
              weapon_real_bbox = null;
            }
          } else {
            break;
          }
        }
      }

      //console.log(weapon_real_bbox);

      if(this.weapon_sprite !== null) {
        if(this.facing == facing.right) {
          queueSprite(assets.sprites.weapons, this.weapon_sprite, 
            this.x + this.weapon_origin_right.x - chain.origin.x,
            this.y + this.weapon_origin_right.y - chain.origin.y
          );
        } else {
          queueSprite(assets.sprites.weapons, this.weapon_sprite, 
            this.x + this.weapon_origin_left.x - 7 + chain.origin.x,
            this.y + this.weapon_origin_right.y - chain.origin.y,
            true
          );
        }
      }

      // Debug weapon box
      //if(weapon_real_bbox !== null) queueBox(weapon_real_bbox);

      this.attackTimer--;
    }

    for(var enemy of enemyQueue) {
      if(this.collidingWith(enemy) && !enemy.freeze && !enemy.isInvincible() && !this.isInvincible()){        
        this.knockback(enemy.playerKnockback.x, enemy.playerKnockback.y, (this.facing == facing.right));
        this.damage(enemy.playerDamage);
      }
      if(weapon_real_bbox !== null && enemy.collidingWithBox(weapon_real_bbox) && !enemy.isInvincible()) {        
        enemy.knockback(chain.knockback.x, chain.knockback.y, this.facing == facing.left);
        enemy.damage(chain.power);
      }
    }

    this.oldBtnA = input.btn.A;
  }

}
