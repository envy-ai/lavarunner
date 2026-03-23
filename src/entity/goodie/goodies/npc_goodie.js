import Goodie from '../goodie.js';
import {
  GOODIE_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

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

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.NPC_GOODIE;
    this.spriteEditorStateIdentifiers = {
      [state.stand]: 'stand',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(GOODIE_SPRITE_SHEET_PATH),
    );
  }

  init(x, y, metadata = null) {
    super.init(x, y, metadata);

    if (!Number.isInteger(this.metadata.sprite)) {
      throw new Error(`Npc at ${this.tx},${this.ty} on "${map._name}" is missing integer metadata.sprite.`);
    }
    if (!Array.isArray(this.metadata.dialog)) {
      throw new Error(`Npc at ${this.tx},${this.ty} on "${map._name}" is missing array metadata.dialog.`);
    }

    this.data = {
      sprite: this.metadata.sprite,
      dialog: this.metadata.dialog,
    };
    this.setSprite(this.data.sprite);

    for (let i = 0; i < this.data.dialog.length; i += 1) {
      const entry = this.data.dialog[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(
          `Npc at ${this.tx},${this.ty} on "${map._name}" has invalid dialog entry at index ${i}.`,
        );
      }
    }
  }

  setSprite(s) {
    this.overrideSpriteEditorStateFrame('stand', 0, s);
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
