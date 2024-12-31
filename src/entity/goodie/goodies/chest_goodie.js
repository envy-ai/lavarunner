import Goodie from '../goodie.js';

export default class ChestGoodie extends Goodie {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.right;
    this.state = state.closed;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = true;
    this.entityName = 'Chest';

    this.bbox = {
      x1: 2,
      y1: 1,
      x2: 6,
      y2: 7,
    };

    this.states = {
      [state.closed]: {
        anim: {
          0: 4,
        },
        reset: -1,
      },
      [state.open]: {
        anim: {
          0: 5,
        },
        reset: -1,
      },
    };
  }

  update() {
    super.update();
    
    if(this.state == state.closed && this.collidingWith(player)) {
      this.drawActionSprite(2);
    } 

    if(this.state == state.closed && this.collidingWith(player) && input.pressed.Y) {
      this.setState(state.open);
      sfx('bonus');
      for(var item in this.metadata.contents) {
        player.addItem(item, this.metadata.contents[item]);
      }

      if(this.metadata.sprite !== null) {
        player.setCustomState(this.metadata.sprite, 30);
      }
    }
  }
}