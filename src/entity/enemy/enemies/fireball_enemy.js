import Enemy from '../enemy.js';
import Particle from '../../particle/particle.js';

export default class FireballEnemy extends Enemy {
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
    this.speed = 0.5;
    this.entityName = 'Fireball';
    this.noKnockback = true;
    this.ignoreEdges = true;

    this.bbox = {
      x1: 1,
      y1: 1,
      x2: 6,
      y2: 6,
    };

    this.states = {
      [state.move]: {
        anim: {
          0: 16,
          12: 17,
        },
        reset: 24,
      },
    };
  }

  update() {
    super.update();
    this.xm = 0;
    this.ym = 0;

    if(this.touchingTile('down', 'solid')) {
      this.xm = this.speed;
    } else if(this.touchingTile('up', 'solid')) {
      this.xm = -this.speed;
    } else if(this.touchingTile('left', 'solid')) {
      this.ym = this.speed;
    } else if(this.touchingTile('right', 'solid')) {
      this.ym = -this.speed;
    } else if(this.touchingTile('downRight', 'solid')) {
      this.xm = this.speed;
    } else if(this.touchingTile('upLeft', 'solid')) {
      this.xm = -this.speed;
    } else if(this.touchingTile('downLeft', 'solid')) {
      this.ym = this.speed;
    } else if(this.touchingTile('upRight', 'solid')) {
      this.ym = -this.speed;
    } else {
      this.ym = this.speed;
    }

    this.move();

    if(this.stateCounter % 3 == 0) {
      var bbox = this.getRealBbox();
      var p = new Particle();
      p.x = randRange(bbox.x1, bbox.x2);
      p.y = randRange(bbox.y1, bbox.y2);
      p.colors = {
        0: 23,
        3: 22,
        6: 21,
        9: 20,
        12: 18,
        15: 16,
      }
      p.gravity = -0.075;
      p.xm = this.xm;
      p.ym = this.ym;
      
      p.setLife(18);
      particleQueue.push(p);
    }
  }

  die() {
    super.die();
    this.explode(assets.data.particles.spark);
  }
}