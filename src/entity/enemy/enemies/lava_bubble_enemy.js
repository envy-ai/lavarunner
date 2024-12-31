import Enemy from '../enemy.js';
import Particle from '../../particle/particle.js';

export default class LavaBubbleEnemy extends Enemy {
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
    this.entityName = 'Lava Bubble';
    this.lifeCounter = 125;
    this.noKnockback = true;
    this.ignoreEdges = true;

    this.bbox = {
      x1: 3,
      y1: 2,
      x2: 4,
      y2: 3,
    };

    this.states = {
      [state.move]: {
        anim: {
          0: 32,
        },
        reset: 30,
      },
      [state.ouch]: {
        anim: {
          0: 32,
        },
        reset: -1,
      }
    };
  }

  update() {
    super.update();

    if(this.state == state.move) {
      if(this.stateCounter == 14) {
        this.x--;
      }
      if(this.stateCounter == 29) {
        this.x++;
      }
      this.y -= 0.175;
    }

    this.lifeCounter--;
    if(this.lifeCounter <= 0) {
      this.die();
    }

    if(this.collidingWith(player)) {
      this.lifeCounter = 0;
    }
  }

  knockback() {
  }

  die() {
    super.die();
    this.explode(assets.data.particles.shortSpark);
  }
}