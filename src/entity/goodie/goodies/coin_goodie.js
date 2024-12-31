import Goodie from '../goodie.js';

export default class CoinGoodie extends Goodie {
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
    this.flipH = true;
    this.entityName = 'Coin';

    this.bbox = {
      x1: 2,
      y1: 2,
      x2: 5,
      y2: 7,
    };

    this.states = {
      [state.stand]: {
        anim: {
          0: 0,
          6: 1,
          12: 2,
          18: 3,
        },
        reset: 24,
      },
    };
  }

  update() {
    super.update();
    if(this.collidingWith(player) || this.collidingWithBox(player.getRealWeaponBbox())) {
      sfx('coin');
      player.addItem('coin');
      this.die();
    }
  }
}