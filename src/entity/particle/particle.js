import Entity from '../entity.js';

export default class Particle extends Entity {
  constructor() {
    super();
    this.entityName = 'Generic Particle';
    this.gravity = gravity;
    this.wind = 0;
    this.totalLife = 30;
    this.life = 30;
    this.colors = { 0: 6 };
    this.sprite = null;
    this.tilesheet = null;
    this.moveFunction = null;
  }

  setLife(l) {
    this.totalLife = l;
    this.life = l;
  }

  draw() {
    if(this.colors !== null) {
      var count = this.totalLife - this.life;
      var color = 0;


      for(var i in this.colors) {
        if(count >= i) {
          color = this.colors[i];
        } else {
          break;
        }
      }

      pushPaper(color);
      rectf(this.getX(), this.getY(), 1, 1);
      popPaper();      
    } else {
      if(this.flipH) {
        sprite(this.getSprite(), this.getX(), this.getY(), (this.facing == facing.right));
      } else {
        sprite(this.getSprite(), this.getX(), this.getY(), (this.facing == facing.left));
      }
    }
  }

  die() {
    particleQueue = particleQueue.filter(e => e !== this);
  }

  update() {
    this.life--;
    if(this.life == 0) {
      this.die();
      return;
    }
    
    if(this.moveFunction) {
      this.moveFunction();
    } else {
      this.xm += this.wind;
      this.ym += this.gravity;    
      this.x += this.xm;
      this.y += this.ym;
    }
  }
}