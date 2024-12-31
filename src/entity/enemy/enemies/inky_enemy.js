import Enemy from '../enemy.js';
import InkyProjectile from './inky_projectile.js';

export default class InkyEnemy extends Enemy {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.left;
    this.state = state.move;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = true;
    this.entityName = 'Inky';
    this.life = 6;
    this.knockbackDuration = 50;
    this.friction = 0.3;
    this.jumpTimer = 100;
    this.jumpFrame = 0;
    this.jumpAccel = 1.75;
    this.inkSpeed = 2;

    this.bbox = {
      x1: 2,
      y1: 1,
      x2: 6,
      y2: 7,
    };

    this.states = {
      [state.move]: {
        anim: {
          0: 64,
          4: 65,
          8: 66
        },
        reset: 12,
      },
      [state.knockback]: {
        anim: {
          0: 64,
          4: 65,
          8: 66
        },
        reset: 12,
      },
    };
  }

  update() {
    super.update();
    //console.log("i", this.invincibilityFrames, this.invincibilityDuration);
    var realCtr = this.getRealCenter();
    var playerCtr = player.getRealCenter();

    if(playerCtr.x > realCtr.x) {
      this.facing = facing.right;
    } else {
      this.facing = facing.left;
    }

    if(this.knockbackTimer > 0) {
      this.state = state.knockback;
      if(this.touchingTile('down', 'solid') && this.ym >= 0) {
        this.ym = 0;
      } else {        
        this.ym += gravity;
      }
      this.xm *= 0.8;
      if(Math.abs(this.xm) < 0.01) this.xm = 0;
    } else {
      this.state = state.move;
      this.jumpFrame += 1;
      if(this.touchingTile('down', 'solid')) {
        this.ym = 0;
        if(this.jumpFrame >= this.jumpTimer) {
          this.jumpFrame = 0;
          this.ym = -this.jumpAccel;
        }
      } else {
        this.ym += gravity;
      }

      if(this.jumpFrame == 18) {
        var ctr = this.getCenter();
        var ink = new InkyProjectile();
        ink.init(this.x + ctr.x - 2, this.y + ctr.y - 2);
        if(this.facing == facing.left) {
          ink.xm = -this.inkSpeed;
        } else {
          ink.xm = this.inkSpeed;
        }
        ink.ym = -1;

        enemyQueue.push(ink);
      }
    }

    this.move();
  }

  die() {
    super.die();
    this.explode(assets.data.particles.blackSplat);
  }
}