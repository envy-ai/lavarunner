import Goodie from "../goodie.js";

export default class ItemGoodie extends Goodie {
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
    this.entityName = 'Item';
    this.itemName = "Generic Item";

    this.bbox = {
      x1: 2,
      y1: 2,
      x2: 6,
      y2: 6,
    };

    this.states = {
      [state.stand]: {
        anim: {
          0: 6,
        },
        reset: 80,
      },
    };
  }

  setSprite(s) {
    this.states[state.stand]['anim'][0] = s;
  }

  init(x, y, metadata = null) {
    super.init(x, y, metadata);

    if (!Number.isInteger(this.metadata.sprite)) {
      throw new Error(`Item at ${this.tx},${this.ty} on "${map._name}" is missing integer metadata.sprite.`);
    }
    if (typeof this.metadata.item !== 'string' || this.metadata.item.length === 0) {
      throw new Error(`Item at ${this.tx},${this.ty} on "${map._name}" is missing metadata.item.`);
    }

    this.setSprite(this.metadata.sprite);
    this.itemName = this.metadata.item;
    this.y--;
  }

  update() {
    super.update();
    if(this.stateCounter == 0) this.y++;
    if(this.stateCounter == 12) this.y++;
    if(this.stateCounter == 40) this.y--;
    if(this.stateCounter == 52) this.y--;

    if(this.collidingWith(player)) {
      sfx('bonus');
      
      console.log(`Player got item ${this.itemName}`);
      if(this.itemName) {
        player.addItem(this.itemName, 1);
      }
      this.die();
    }
  }
}
