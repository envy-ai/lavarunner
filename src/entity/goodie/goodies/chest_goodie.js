import Goodie from '../goodie.js';
import {
  GOODIE_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

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

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.CHEST_GOODIE;
    this.spriteEditorStateIdentifiers = {
      [state.closed]: 'closed',
      [state.open]: 'open',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(GOODIE_SPRITE_SHEET_PATH),
    );
  }

  update() {
    super.update();
    
    if(this.state == state.closed && this.collidingWith(player)) {
      this.drawActionSprite(2);
    } 

    if(this.state == state.closed && this.collidingWith(player) && input.pressed.Y) {
      if (!this.metadata.contents || typeof this.metadata.contents !== 'object' || Array.isArray(this.metadata.contents)) {
        throw new Error(`Chest at ${this.tx},${this.ty} on "${map._name}" is missing object metadata.contents.`);
      }

      this.setState(state.open);
      sfx('bonus');
      for(var item in this.metadata.contents) {
        player.addItem(item, this.metadata.contents[item]);
      }

      if(this.metadata.sprite !== null && this.metadata.sprite !== undefined) {
        player.setCustomState(this.metadata.sprite, 30);
      }
    }
  }
}
