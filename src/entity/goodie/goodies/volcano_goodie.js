import Goodie from '../goodie.js';
import LavaBubbleEnemy from '../../enemy/enemies/lava_bubble_enemy.js';
import Particle from '../../particle/particle.js';

export default class VolcanoGoodie extends Goodie {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.right;
    this.state = state.stand;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = true;
    this.entityName = 'Volcano';
    this.bubbleInterval = 220;
    this.bubbleCounter = random(this.bubbleInterval);
    this.spriteSheet = assets.sprites.enemies;

    this.bbox = {
      x1: 1,
      y1: 4,
      x2: 6,
      y2: 7,
    };

    this.states = {
      [state.stand]: {
        anim: {
          0: 33,
        },
        reset: -1,
      },
    };
  }

  update() {
    super.update();
    this.bubbleCounter++;
    if(this.bubbleCounter >= this.bubbleInterval) {
      var bubble = new LavaBubbleEnemy(0);
      var ctr = bubble.getCenter();
      bubble.init(this.x + ctr.x - 2, this.y + ctr.y - 2);
      enemyQueue.push(bubble);
      this.bubbleCounter = 0;
    }

    var particleChance = randRange(0, 20);

    if(particleChance == 1) {
      var p = new Particle();
      p.x = this.x + 4;
      p.y = this.y + 4;
      p.xm = randFloatRange(-0.25, 0.25);
      p.ym = randFloatRange(-0.3, -0.5);
      p.colors = assets.data.particles.spark.colors;
      p.gravity = 0.05;
      p.setLife(assets.data.particles.spark.duration);
      particleQueue.push(p);
    }
  }
}