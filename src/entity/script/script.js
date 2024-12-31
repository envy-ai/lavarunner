import Entity from '../entity.js';

export default class Script extends Entity {
  constructor() {
    super();
    this.itemName = 'Generic Script';
    this.mode = 'collide';

    this.bbox = {
      x1: 1,
      y1: 1,
      x2: 6,
      y2: 7,
    };
  }

  draw() {

  }

  die() {
    scriptQueue = scriptQueue.filter(e => e !== this);
  }

  update() {
    if(this.mode == 'collide' && this.collidingWith(player)) {
      this.run();
    } else if(this.mode == 'activate' && this.collidingWith(player) && input.pressed.Y) {
      this.run();
    }
  }
}