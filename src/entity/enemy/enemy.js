import Entity from '../entity.js';
import TextParticle from '../particle/text_particle.js';
import Particle from '../particle/particle.js';
export default class Enemy extends Entity {
  constructor() {
    super();
    this.life = 1;
    this.maxLife = 1;
    this.entityName = 'Generic Enemy';
    this.noKnockback = false;
    this.playerDamage = 1;
    this.playerKnockback = { x: 1.5, y: -1.5 };
    this.spriteSheet = assets.sprites.enemies;
  }

  damage(d) {
    if(this.isInvincible()) return;
    this.life -= d;
    if(this.life <= 0) this.die();
    this.setInvincible();
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
    enemyQueue = enemyQueue.filter(e => e !== this);
  }

  update() {
    super.update();
    if(this.y > tileSize * map.height) { 
      enemyQueue = enemyQueue.filter(e => e !== this);
    }
  }

  
  
  explode(particleType) {
    var ctr = this.getRealCenter();
    for(var i = 0; i < 20; i++) {
      var p = new Particle();
      var dir = Math.random() * Math.PI * 2;
      var spd = Math.random() * 0.6;
      p.x = ctr.x;
      p.y = ctr.y;
      p.entityName = 'explosion';
      p.xm = Math.cos(dir) * spd;
      p.ym = Math.sin(dir) * spd;
      p.colors = particleType.colors;
      p.gravity = 0.075;
      p.setLife(particleType.duration);
      particleQueue.push(p);
    }
  }

  splat(particleType) {
    var ctr = this.getRealCenter();
    for(var i = 0; i < 20; i++) {
      var p = new Particle();
      var dir = Math.random() * Math.PI * 2;
      var spd = Math.random() * 0.6;
      p.x = ctr.x;
      p.y = ctr.y;
      p.entityName = 'explosion';
      p.xm = Math.cos(dir) * spd;
      p.ym = -Math.abs(Math.sin(dir) * spd);
      p.colors = particleType.colors;
      p.gravity = 0.075;
      p.setLife(particleType.duration);
      particleQueue.push(p);
    }
  }
}