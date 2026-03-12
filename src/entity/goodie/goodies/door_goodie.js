import Goodie from '../goodie.js';

export default class DoorGoodie extends Goodie {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.right;
    this.state = state.open;
    this.stateCounter = 0;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = true;
    this.entityName = 'Door';
    this.showBbox = false;

    if(spr == 18) {
      this.state = state.closed;
    }

    this.bbox = {
      x1: 1,
      y1: 1,
      x2: 6,
      y2: 7,
    };

    this.states = {
      [state.closed]: {
        anim: {
          0: 8,
        },
        reset: -1,
      },
      [state.open]: {
        anim: {
          0: 7,
        },
        reset: -1,
      },
    };
  }

  update() {
    super.update();
    if(this.freeze) return;

    if(this.state == state.closed && this.collidingWith(player) && player.hasItem("key") && !input.pressed.Y) {
      this.drawActionSprite(2);
    } else if(this.state == state.open && this.collidingWith(player) 
    && player.onGround() && !player.freeze) {
      this.drawActionSprite(3);
    } else if(this.state == state.closed && this.collidingWith(player) && !input.pressed.Y) {
      this.drawActionSprite(2);
    }

    if(this.state == state.closed && this.collidingWith(player) && input.pressed.Y && player.hasItem("key")) {
      this.setState(state.open);
      player.removeItem("key");
      sfx('unlock');
    } else if(this.state == state.open && this.collidingWith(player) 
        && input.pressed.up && player.onGround() && !player.freeze) {
      if (typeof this.metadata.map !== 'string' || this.metadata.map.length === 0) {
        throw new Error(`Door at ${this.tx},${this.ty} on "${map._name}" is missing metadata.map.`);
      }
      sfx('steps');

      if(this.metadata.x !== undefined) {
        if (!Number.isInteger(this.metadata.x) || !Number.isInteger(this.metadata.y)) {
          throw new Error(`Door at ${this.tx},${this.ty} on "${map._name}" has invalid metadata.x/y.`);
        }
        loadMap(this.metadata.map, this.metadata.x, this.metadata.y);
      } else {
        loadMap(this.metadata.map);
      }
    } if(this.state == state.closed && this.collidingWith(player) && input.pressed.Y &&! player.hasItem("key")) {
      say("It's locked...");
    }
  }
}
