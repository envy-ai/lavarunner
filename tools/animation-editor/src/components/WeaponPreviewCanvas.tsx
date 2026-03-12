import { useEffect, useMemo, useRef } from 'react';
import { PLAYER_BODY_BBOX, TILE_SIZE } from '../domain/defaults';
import type { Bbox, WeaponChain } from '../domain/types';
import {
  overlaps,
  resolveFacingBbox,
  resolveWeaponFrame,
  resolveWeaponRealBbox,
  resolveWeaponSpritePosition,
} from '../preview/engine';

interface WeaponPreviewCanvasProps {
  chain: WeaponChain;
  attackTimer: number;
  zoom: 4 | 8 | 12 | 16;
  facing: 'right' | 'left';
  onAttackTimerChange: (timer: number) => void;
  onFacingChange: (facing: 'right' | 'left') => void;
}

const PLAYER_POS = { x: 24, y: 24 };
const ENEMY_BOX: Bbox = { x1: 44, y1: 23, x2: 52, y2: 32 };

export function WeaponPreviewCanvas(props: WeaponPreviewCanvasProps): JSX.Element {
  const { chain, attackTimer, zoom, facing, onAttackTimerChange, onFacingChange } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineCounter = Math.max(chain.anim_duration - attackTimer - 1, 0);

  const resolution = useMemo(() => resolveWeaponFrame(chain, attackTimer), [attackTimer, chain]);

  const frameBbox = resolution.frame?.bbox ?? null;
  const facingFrameBbox = resolveFacingBbox(frameBbox, facing, TILE_SIZE);
  const worldWeaponBbox = resolveWeaponRealBbox({
    playerX: PLAYER_POS.x,
    playerY: PLAYER_POS.y,
    facing,
    chain,
    weaponBbox: facingFrameBbox,
  });
  const spritePosition = resolveWeaponSpritePosition({
    playerX: PLAYER_POS.x,
    playerY: PLAYER_POS.y,
    facing,
    chain,
  });

  const collision = worldWeaponBbox ? overlaps(worldWeaponBbox, ENEMY_BOX) : false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width = 96 * (zoom / 4);
    const height = 80 * (zoom / 4);

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101720';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    for (let gx = 0; gx <= width; gx += zoom) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 0; gy <= height; gy += zoom) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    const playerRect = {
      x: PLAYER_POS.x + PLAYER_BODY_BBOX.x1,
      y: PLAYER_POS.y + PLAYER_BODY_BBOX.y1,
      w: PLAYER_BODY_BBOX.x2 - PLAYER_BODY_BBOX.x1 + 1,
      h: PLAYER_BODY_BBOX.y2 - PLAYER_BODY_BBOX.y1 + 1,
    };

    ctx.strokeStyle = '#00b8ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(playerRect.x * (zoom / 2), playerRect.y * (zoom / 2), playerRect.w * (zoom / 2), playerRect.h * (zoom / 2));

    ctx.strokeStyle = collision ? '#47ff93' : '#f66';
    ctx.strokeRect(
      ENEMY_BOX.x1 * (zoom / 2),
      ENEMY_BOX.y1 * (zoom / 2),
      (ENEMY_BOX.x2 - ENEMY_BOX.x1 + 1) * (zoom / 2),
      (ENEMY_BOX.y2 - ENEMY_BOX.y1 + 1) * (zoom / 2),
    );

    if (resolution.frame?.sprite !== null && resolution.frame?.sprite !== undefined) {
      ctx.fillStyle = '#ffca55';
      ctx.fillRect(spritePosition.x * (zoom / 2), spritePosition.y * (zoom / 2), 12, 12);
      ctx.fillStyle = '#111';
      ctx.font = '10px monospace';
      ctx.fillText('W', spritePosition.x * (zoom / 2) + 3, spritePosition.y * (zoom / 2) + 9);
    }

    if (worldWeaponBbox) {
      ctx.strokeStyle = '#ff6767';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        worldWeaponBbox.x1 * (zoom / 2),
        worldWeaponBbox.y1 * (zoom / 2),
        (worldWeaponBbox.x2 - worldWeaponBbox.x1 + 1) * (zoom / 2),
        (worldWeaponBbox.y2 - worldWeaponBbox.y1 + 1) * (zoom / 2),
      );
    }

    ctx.fillStyle = '#d8eaf9';
    ctx.font = '11px monospace';
    ctx.fillText(`keyframe: ${resolution.threshold ?? 'none'}`, 8, 12);
  }, [chain, collision, facing, resolution.frame?.sprite, resolution.threshold, spritePosition.x, spritePosition.y, worldWeaponBbox, zoom]);

  return (
    <section className="preview-panel" aria-label="Weapon Preview Canvas">
      <header className="preview-controls">
        <label>
          Facing
          <select value={facing} onChange={(event) => onFacingChange(event.target.value as 'right' | 'left')}>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>

        <label>
          Time Remaining (Frames)
          <input
            type="range"
            min={0}
            max={Math.max(0, chain.anim_duration)}
            value={attackTimer}
            onChange={(event) => onAttackTimerChange(Number(event.target.value))}
          />
        </label>
        <code>
          {attackTimer} remaining | timeline {timelineCounter}/{chain.anim_duration}
        </code>
      </header>

      <div className="canvas-wrap">
        <canvas ref={canvasRef} role="img" aria-label="Weapon preview and collision probe" />
      </div>

      <footer className="bbox-readout">
        <code>Active keyframe: {resolution.threshold ?? 'none'}</code>
        <code>Collision: {collision ? 'hit' : 'no hit'}</code>
        <code>Active hitbox: {worldWeaponBbox ? `${worldWeaponBbox.x1},${worldWeaponBbox.y1},${worldWeaponBbox.x2},${worldWeaponBbox.y2}` : 'none'}</code>
      </footer>
    </section>
  );
}
