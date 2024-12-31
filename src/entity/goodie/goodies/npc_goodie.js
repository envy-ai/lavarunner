import Goodie from '../goodie.js';

export default class NpcGoodie extends Goodie {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.left;
    this.state = state.stand;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0;
    this.flipH = true;
    this.entityName = 'Npc';
    this.data = {};

    this.bbox = {
      x1: -6,
      y1: 1,
      x2: 13,
      y2: 7,
    };

    this.states = {
      [state.stand]: {
        anim: {
          0: 32,
        },
        reset: -1,
      },
    };
  }

  init(x, y) {
    super.init(x, y);
    var tx = Math.floor(this.startX / tileSize);
    var ty = Math.floor(this.startY / tileSize);

    try {
      this.data = assets.data.npcs[map._name][tx.toString()+','+ty.toString()];
      this.setSprite(this.data.sprite);

      console.log(['loaded npc data', this.data]);
    } catch(error) {
      console.log(error);
      console.log(assets.data.npcs);
      console.log(`No data for NPC at (${tx}, ${ty}) on ${map._name}`);
    }

  }

  setSprite(s) {
    this.states[state.stand].anim[0] = s;
  }

  update() {
    super.update();

    var ctr = this.getRealCenter();
    var pctr = player.getRealCenter();

    if(pctr.x > ctr.x) {
      this.facing = facing.right;
    } else {
      this.facing = facing.left;
    }

    if(this.collidingWith(player)) {
      this.drawActionSprite(2);
    } 

    if(this.collidingWith(player) && input.pressed.Y) {
      console.log(Flags);
      console.log("Dialog", this.data.dialog);

      for(var i = this.data.dialog.length - 1; i >= 0; i--) {        
        var t = this.data.dialog[i];
        if(t.condition !== undefined) {
          console.log(`NPC checking condition: ${t.condition}:`);
          var result = eval(t.condition);
          console.log(`Eval: ${t.condition}: ${result}`);
        } else {
          console.log('NPC: no condition');
        }
        if(t.condition === undefined || result) {
          var post_eval = null;
          if(t.post_eval !== undefined) {
            post_eval = t.post_eval;
          }
          if(t.pre_eval !== undefined) {
            console.log(`Pre Eval: ${t.pre_eval}`)
            eval(t.pre_eval);
          }

          if(t.text) {
            console.log(`Post Eval: ${post_eval}`)
            say(t.text, post_eval);
          } else if(post_eval !== null) {
            console.log(`Post Eval: ${post_eval}`)
            eval(post_eval);
          }

          return;
        }
      }
    }    
  }
}