import Goodie from '../goodie.js';
import Particle from '../../particle/particle.js';


export default class GrenadeProjectile extends Goodie {
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
    this.flipH = false;
    this.entityName = 'Grenade';
    this.timer = 150;

    this.knockback = {
      x: 2.5,
      y: -1,
    }

    this.fireSpeed = {
      x: 2,
      y: -1
    }

    this.power = 8;
    this.splashPower = 4;
    this.radius = 16;

    this.origin = {
      x: 0,
      y: 4
    }

    this.bbox = {
      x1: 3,
      y1: 3,
      x2: 4,
      y2: 5,
    };

    this.states = {
      [state.stand]: {
        anim: {
          0: 10,
        },
        reset: -1,
      },
    };
  }

  die() {
    super.die();
    sfx('thud');
    this.explode(assets.data.particles.shortSpark);
    var bbox = this.getExplosionBbox();

    for(var enemy of enemyQueue) {
      var enemyCtr = enemy.getRealCenter();
      if(!enemy.isInvincible() && enemy.collidingWithBox(bbox)) {
        enemy.knockback(this.knockback.x, this.knockback.y, enemyCtr.x < ctr.x);
        enemy.damage(this.splashPower);
      }
    }
  }

  getExplosionBbox() {
    var ctr = this.getRealCenter();
    return {
      x1: ctr.x - this.radius,
      y1: ctr.y - this.radius,
      x2: ctr.x + this.radius,
      y1: ctr.y - this.radius,
    }
  }

  draw() {
    super.draw();
  }

  move() {    
    this.clampMotion();
    var m = this.getMove();
    this.x = m.x;
    this.y = m.y;

    if(m.collision.left || m.collision.right) {
      this.xm = -this.xm * 0.6;
    } else {      
      this.xm = m.xm;
    }

    if(m.collision.down) {
      this.ym = -this.ym * 0.6;
      this.xm *= 0.5;      
      
      if(Math.abs(this.xm) < 0.05) {
        this.xm = 0;
      }
      if(Math.abs(this.ym) < 0.05) {
        this.ym = 0;
      }
    } else {
      this.ym = m.ym;
    }
  }

  update() {    
    super.update();
    var ctr = this.getRealCenter();

    this.ym += gravity;

    this.move();

    for(var enemy of enemyQueue) {
      var enemyCtr = enemy.getRealCenter();
      if(this.collidingWith(enemy) && !enemy.freeze && !enemy.isInvincible()) {
        enemy.knockback(this.knockback.x, this.knockback.y, enemyCtr.x < ctr.x);
        enemy.damage(this.power);
        this.die();
      }
    }

    this.timer--;
    if(this.timer <= 0) this.die();
  }

  explode(particleType) {
    var ctr = this.getRealCenter();
    for(var i = 0; i < 20; i++) {
      var p = new Particle();
      var dir = Math.random() * Math.PI * 2;
      var spd = Math.random() * 1.2;
      p.x = ctr.x;
      p.y = ctr.y;
      p.entityName = 'explosion';
      p.xm = Math.cos(dir) * spd;
      p.ym = Math.sin(dir) * spd;
      p.colors = particleType.colors;
      p.gravity = 0;
      p.setLife(particleType.duration);
      particleQueue.push(p);
    }
  }
  
  static fire(p) {    
    var grenade = new GrenadeProjectile();
    var ctr = grenade.getCenter();

    if(p.facing == facing.right) {
      grenade.init(p.x + p.weapon_origin_right.x - ctr.x, p.y + p.weapon_origin_right.y - ctr.y);
      grenade.xm = p.xm + grenade.fireSpeed.x;
    } else {
      grenade.init(p.x + p.weapon_origin_left.x - ctr.x, p.y + p.weapon_origin_left.y - ctr.y);
      grenade.xm = p.xm - grenade.fireSpeed.x;
    }
    grenade.ym = p.ym + grenade.fireSpeed.y;
    goodieQueue.push(grenade);
    //window.disembugulate = true;
  }  
}