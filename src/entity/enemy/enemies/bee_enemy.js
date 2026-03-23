import Enemy from '../enemy.js';
import {
  ENEMY_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

export default class BeeEnemy extends Enemy {
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
    this.accel = 0.03;
    this.speed = 0.6;
    this.flipH = true;
    this.entityName = 'Bee';
    this.life = 3;
    this.knockbackDuration = 50;
    this.friction = 0.3;

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.BEE_ENEMY;
    this.spriteEditorStateIdentifiers = {
      [state.move]: 'move',
      [state.knockback]: 'knockback',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(ENEMY_SPRITE_SHEET_PATH),
    );
  }

  knockback(x, y, flipX) {    
    if(this.noKnockback) return;
    if(this.isInvincible()) return;
    if(flipX) {
      this.xm = -x;
    } else {
      this.xm = x;
    }

    if(this.hasAnimationState(state.knockback)) this.setState(state.knockback);
    this.knockbackTimer = this.knockbackDuration;
  }

  init(x, y, metadata = null) {
    super.init(x, y, metadata);    
    this.ym = -1;
    this.xm = -0.6;
  }

  update() {
    super.update();
    this.state = state.move;

    if(this.x < this.startX - 40) {
      this.xm += this.accel;
    } else if(this.x > this.startX + 40) {
      this.xm -= this.accel;
    }

    if(this.xm > 0) {
      this.facing = facing.right;
    } else {
      this.facing = facing.left;
    }

    this.xm = clamp(this.xm, -this.speed, this.speed);

    if(this.y > this.startY) {
      this.ym -= 0.1;
    } else {
      this.ym += 0.1;
    }

    this.move();
  }

  move() {
    this.x += this.xm;
    this.y += this.ym;
  }

  die() {
    super.die();
    this.explode(assets.data.particles.sparkBlue);
  }
}
