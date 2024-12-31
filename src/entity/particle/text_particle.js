import Particle from './particle.js';

export default class TextParticle extends Particle {
  constructor() {
    super();
    this.entityName = 'Text Particle';
    this.gravity = -0.3;
    this.wind = 0;
    this.totalLife = 30;
    this.life = 30;
    this.str = 'x';
  }

  die() {
    textQueue = textQueue.filter(e => e !== this);
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

      pushPen(color);
      print(this.str, this.getX(), this.getY());
      popPen();      
    }
  }
}