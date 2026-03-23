import Enemy from '../enemy.js';
import Particle from '../../particle/particle.js';
import {
  ENEMY_SPRITE_SHEET_PATH,
  SPRITE_EDITOR_IDENTIFIERS,
  buildSpriteEditorTilesetRelPath,
} from '../../sprite_editor_definitions.js';

export default class LavaBubbleEnemy extends Enemy {
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
    this.flipH = true;
    this.entityName = 'Lava Bubble';
    this.lifeCounter = 125;
    this.noKnockback = true;
    this.ignoreEdges = true;

    this.spriteEditorIdentifier = SPRITE_EDITOR_IDENTIFIERS.LAVA_BUBBLE_ENEMY;
    this.spriteEditorStateIdentifiers = {
      [state.move]: 'move',
      [state.ouch]: 'ouch',
    };
    this.spriteEditorDefinition = this.requireSpriteEditorDefinition(
      this.spriteEditorIdentifier,
      buildSpriteEditorTilesetRelPath(ENEMY_SPRITE_SHEET_PATH),
    );
  }

  update() {
    super.update();

    if(this.state == state.move) {
      if(this.stateCounter == 14) {
        this.x--;
      }
      if(this.stateCounter == 29) {
        this.x++;
      }
      this.y -= 0.175;
    }

    this.lifeCounter--;
    if(this.lifeCounter <= 0) {
      this.die();
    }

    if(this.collidingWith(player)) {
      this.lifeCounter = 0;
    }
  }

  knockback() {
  }

  die() {
    super.die();
    this.explode(assets.data.particles.shortSpark);
  }
}
