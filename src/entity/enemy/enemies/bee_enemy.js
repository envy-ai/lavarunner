import Enemy from '../enemy.js';

export default class BeeEnemy extends Enemy {
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
    this.accel = 0.03;
    this.speed = 0.6;
    this.flipH = true;
    this.entityName = 'Bee';
    this.life = 3;
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
          0: 48,
        },
        reset: 200,
      },
      [state.knockback]: {
        anim: {
          0: 48,
        },
        reset: -1,
      },
    };
  }

  knockback(x, y, flipX) {    
    if(this.noKnockback) return;
    if(this.isInvincible()) return;
    if(flipX) {
      this.xm = -x;
    } else {
      this.xm = x;
    }

    if(this.states.knockback !== undefined) this.state = knockback;
    this.knockbackTimer = this.knockbackDuration;
  }

  init(x, y) {
    super.init(x, y);    
    this.ym = -1;
    this.xm = -0.6;
  }

  update() {
    super.update();
    this.state = state.move;

    if(this.x < this.startX - 40) {
      this.xm += this.accel;
    } else if(this.x > this.startX + 40) {
      this.xm -= this.accel;
    }

    if(this.xm > 0) {
      this.facing = facing.right;
    } else {
      this.facing = facing.left;
    }

    this.xm = clamp(this.xm, -this.speed, this.speed);

    if(this.y > this.startY) {
      this.ym -= 0.1;
    } else {
      this.ym += 0.1;
    }

    this.move();
  }

  move() {
    this.x += this.xm;
    this.y += this.ym;
  }

  die() {
    super.die();
    this.explode(assets.data.particles.sparkBlue);
  }
}