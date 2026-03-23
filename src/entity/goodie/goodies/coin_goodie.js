import Goodie from '../goodie.js';
import {
  GOODIE_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

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

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.COIN_GOODIE;
    this.spriteEditorStateIdentifiers = {
      [state.stand]: 'stand',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(GOODIE_SPRITE_SHEET_PATH),
    );
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
