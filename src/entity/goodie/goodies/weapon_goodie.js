import Goodie from '../goodie.js';
import {
  GOODIE_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

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

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.WEAPON_GOODIE;
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

    if (typeof this.metadata.weapon !== 'string' || this.metadata.weapon.length === 0) {
      throw new Error(`Weapon at ${this.tx},${this.ty} on "${map._name}" is missing metadata.weapon.`);
    }

    this.weapon = this.metadata.weapon;
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
