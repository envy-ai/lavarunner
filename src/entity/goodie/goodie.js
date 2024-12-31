import Entity from '../entity.js';
import Particle from '../particle/particle.js';

export default class Goodie extends Entity {
  constructor() {
    super();
    this.itemName = 'Generic Goodie';
    this.spriteSheet = assets.sprites.goodies;
  }

  die() {
    goodieQueue = goodieQueue.filter(e => e !== this);
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