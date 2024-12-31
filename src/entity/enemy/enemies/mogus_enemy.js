import Enemy from '../enemy.js';

export default class MogusEnemy extends Enemy {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.right;
    this.state = state.move;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = true;
    this.entityName = 'Mogus';
    this.life = 6;
    this.knockbackDuration = 50;
    this.friction = 0.3;

    this.bbox = {
      x1: 2,
      y1: 1,
      x2: 6,
      y2: 7,
    };

    this.states = {
      [state.move]: {
        anim: {
          0: 0,
          8: 1,
        },
        reset: 16,
      },
      [state.knockback]: {
        anim: {
          0: 0,
        },
        reset: -1,
      },
    };
  }

  update() {
    super.update();
    //console.log("i", this.invincibilityFrames, this.invincibilityDuration);

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
      if(this.touchingTile('down', 'solid')) {
        this.ym = 0;
        if(this.facing == facing.left) {
          if(this.touchingTile('downLeft', 'solid') && !this.touchingTile('left', 'solid')) {
            this.xm = -this.speed;
          } else {
            this.facing = facing.right;
          }
        } else {
          if(this.touchingTile('downRight', 'solid') && !this.touchingTile('right', 'solid')) {
            this.xm = this.speed;
          } else {
            this.facing = facing.left;
          }
        }
      } else {
        this.ym += gravity;
      }
    }

    this.move();
  }

  die() {
    super.die();
    this.explode(assets.data.particles.sparkBlue);
  }
}