import Enemy from '../enemy.js';
import {
  ENEMY_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

export default class InkyProjectile extends Enemy {
  constructor(spr) {
    super();
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.xm = 0;
    this.ym = 0;
    this.facing = facing.right;
    this.state = state.move;
    this.stateCounter = 0;
    this.showBox = false;
    this.freeze = false;
    this.speed = 0.4;
    this.flipH = false;
    this.entityName = 'Inky';
    this.life = 6;
    this.knockbackDuration = 50;
    this.friction = 0.3;
    this.jumpTimer = 100;
    this.jumpFrame = 0;
    this.jumpAccel = 1.75;

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.INKY_PROJECTILE;
    this.spriteEditorStateIdentifiers = {
      [state.move]: 'move',
      [state.knockback]: 'knockback',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(ENEMY_SPRITE_SHEET_PATH),
    );
  }

  update() {
    super.update();
    //console.log("i", this.invincibilityFrames, this.invincibilityDuration);

    this.state = state.move;
    this.jumpFrame += 1;
    if(this.touchingTile('down', 'solid')) {
      this.die();
    } else {
      this.ym += gravity;
    }

    this.move();
  }

  die() {
    super.die();
    this.splat(assets.data.particles.blackSplat);
  }
}
