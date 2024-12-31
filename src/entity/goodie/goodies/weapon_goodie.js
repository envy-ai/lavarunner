import Goodie from '../goodie.js';

export default class WeaponGoodie extends Goodie {
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
    this.entityName = 'Weapon';
    this.weapon = "Sword";

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

  init(x, y) {
    super.init(x, y);
    try {
      this.setSprite(this.metadata.sprite);
      this.weapon = this.metadata.weapon;
    } catch(e) {
      console.log(`No metadata for weapon at ${this.tx},${this.ty}`);
    }
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
      console.log(`Player got weapon ${this.weapon}`);
      player.addWeapon(this.weapon);
      this.die();
    }
  }
}