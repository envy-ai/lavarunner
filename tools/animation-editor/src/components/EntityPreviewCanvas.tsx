import { useEffect, useMemo, useRef, useState } from 'react';
import { TILE_SIZE } from '../domain/defaults';
import type { Bbox, FacingMode, GridMode } from '../domain/types';
import { bboxHeight, bboxWidth, clampToInteger } from '../domain/utils';
import { mirrorBboxRightToLeft } from '../preview/engine';

type Edge = keyof Bbox;

interface EntityPreviewCanvasProps {
  bbox: Bbox;
  facing: FacingMode;
  grid: GridMode;
  onion: boolean;
  zoom: 4 | 8 | 12 | 16;
  background: 'checker' | 'dark' | 'light';
  currentSprite: number;
  previousSprite: number | null;
  nextSprite: number | null;
  onFacingChange: (facing: FacingMode) => void;
  onGridChange: (grid: GridMode) => void;
  onOnionChange: (onion: boolean) => void;
  onZoomChange: (zoom: 4 | 8 | 12 | 16) => void;
  onBackgroundChange: (background: 'checker' | 'dark' | 'light') => void;
  onBboxCommit: (bbox: Bbox) => void;
}

interface PanelRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 'right' | 'left';
}

function leftToRightBbox(left: Bbox): Bbox {
  return {
    x1: TILE_SIZE - left.x2,
    y1: left.y1,
    x2: TILE_SIZE - left.x1 - 1,
    y2: left.y2,
  };
}

function drawChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  zoom: number,
  dark = '#1d232f',
  light = '#252d3b',
): void {
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      ctx.fillStyle = (px + py) % 2 === 0 ? dark : light;
      ctx.fillRect(x + px * zoom, y + py * zoom, zoom, zoom);
    }
  }
}

function nearestEdge(pointX: number, pointY: number, bbox: Bbox): Edge | null {
  const tolerance = 0.35;
  if (Math.abs(pointX - bbox.x1) <= tolerance && pointY >= bbox.y1 && pointY <= bbox.y2) {
    return 'x1';
  }
  if (Math.abs(pointX - bbox.x2) <= tolerance && pointY >= bbox.y1 && pointY <= bbox.y2) {
    return 'x2';
  }
  if (Math.abs(pointY - bbox.y1) <= tolerance && pointX >= bbox.x1 && pointX <= bbox.x2) {
    return 'y1';
  }
  if (Math.abs(pointY - bbox.y2) <= tolerance && pointX >= bbox.x1 && pointX <= bbox.x2) {
    return 'y2';
  }
  return null;
}

function applyEdgeChange(bbox: Bbox, edge: Edge, value: number): Bbox {
  const next = { ...bbox, [edge]: value };
  if (next.x1 > next.x2) {
    const swap = next.x1;
    next.x1 = next.x2;
    next.x2 = swap;
  }
  if (next.y1 > next.y2) {
    const swap = next.y1;
    next.y1 = next.y2;
    next.y2 = swap;
  }
  return next;
}

export function EntityPreviewCanvas(props: EntityPreviewCanvasProps): JSX.Element {
  const {
    bbox,
    facing,
    grid,
    onion,
    zoom,
    background,
    currentSprite,
    previousSprite,
    nextSprite,
    onFacingChange,
    onGridChange,
    onOnionChange,
    onZoomChange,
    onBackgroundChange,
    onBboxCommit,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeEdge, setActiveEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState<{
    edge: Edge;
    region: PanelRegion;
    bboxDraft: Bbox;
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);

  const panelRegions = useMemo<PanelRegion[]>(() => {
    const panelPadding = 16;
    const panelSize = TILE_SIZE * zoom;

    if (facing === 'split') {
      return [
        { x: panelPadding, y: panelPadding, w: panelSize, h: panelSize, facing: 'right' },
        {
          x: panelPadding + panelSize + panelPadding,
          y: panelPadding,
          w: panelSize,
          h: panelSize,
          facing: 'left',
        },
      ];
    }

    return [
      {
        x: panelPadding,
        y: panelPadding,
        w: panelSize,
        h: panelSize,
        facing: facing === 'left' ? 'left' : 'right',
      },
    ];
  }, [facing, zoom]);

  const workingBbox = dragging?.bboxDraft ?? bbox;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width =
      facing === 'split'
        ? TILE_SIZE * zoom * 2 + 16 * 3
        : TILE_SIZE * zoom + 16 * 2;
    const height = TILE_SIZE * zoom + 16 * 2;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    for (const region of panelRegions) {
      if (background === 'checker') {
        drawChecker(ctx, region.x, region.y, TILE_SIZE, zoom);
      } else {
        ctx.fillStyle = background === 'dark' ? '#111722' : '#f5f7fb';
        ctx.fillRect(region.x, region.y, region.w, region.h);
      }

      if (grid !== 'off') {
        const gridStep = grid === '1px' ? 1 : 8;
        ctx.strokeStyle = grid === '1px' ? 'rgba(255,255,255,0.15)' : 'rgba(126,214,255,0.25)';
        for (let i = 0; i <= TILE_SIZE; i += gridStep) {
          ctx.beginPath();
          ctx.moveTo(region.x + i * zoom, region.y);
          ctx.lineTo(region.x + i * zoom, region.y + region.h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(region.x, region.y + i * zoom);
          ctx.lineTo(region.x + region.w, region.y + i * zoom);
          ctx.stroke();
        }
      }

      const regionBbox =
        region.facing === 'right' ? workingBbox : mirrorBboxRightToLeft(workingBbox, TILE_SIZE);

      if (onion) {
        ctx.fillStyle = 'rgba(155, 172, 194, 0.12)';
        ctx.fillRect(region.x, region.y, region.w, region.h);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(region.x, region.y, region.w, region.h);

      ctx.strokeStyle = '#00c8ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        region.x + regionBbox.x1 * zoom,
        region.y + regionBbox.y1 * zoom,
        (regionBbox.x2 - regionBbox.x1 + 1) * zoom,
        (regionBbox.y2 - regionBbox.y1 + 1) * zoom,
      );

      const markerEdge = activeEdge ?? hoveredEdge;
      if (markerEdge) {
        ctx.fillStyle = '#00e7ff';
        if (markerEdge === 'x1') {
          ctx.fillRect(region.x + regionBbox.x1 * zoom - 2, region.y, 4, region.h);
        } else if (markerEdge === 'x2') {
          ctx.fillRect(region.x + regionBbox.x2 * zoom - 2, region.y, 4, region.h);
        } else if (markerEdge === 'y1') {
          ctx.fillRect(region.x, region.y + regionBbox.y1 * zoom - 2, region.w, 4);
        } else {
          ctx.fillRect(region.x, region.y + regionBbox.y2 * zoom - 2, region.w, 4);
        }
      }

      ctx.fillStyle = '#6cf2cc';
      ctx.fillRect(region.x - 2, region.y - 2, 4, 4);

      ctx.fillStyle = '#d4f3ff';
      ctx.font = `${Math.max(10, Math.floor(zoom * 0.9))}px monospace`;
      ctx.fillText(`spr ${currentSprite}`, region.x + 4, region.y + 12);
      if (onion && previousSprite !== null && nextSprite !== null) {
        ctx.fillText(`prev ${previousSprite} / next ${nextSprite}`, region.x + 4, region.y + region.h - 4);
      }

      ctx.fillStyle = '#9bb3c4';
      ctx.font = '11px monospace';
      ctx.fillText(region.facing === 'right' ? 'RIGHT' : 'LEFT', region.x + 4, region.y - 4);
    }
  }, [activeEdge, background, currentSprite, facing, grid, hoveredEdge, onion, panelRegions, previousSprite, nextSprite, workingBbox, zoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!activeEdge) {
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const step = event.altKey ? 4 : 1;
      let delta = 0;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        delta = -step;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        delta = step;
      }

      const next = applyEdgeChange(bbox, activeEdge, bbox[activeEdge] + delta);
      onBboxCommit(next);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeEdge, bbox, onBboxCommit]);

  const pickRegion = (x: number, y: number): PanelRegion | null => {
    return (
      panelRegions.find(
        (region) =>
          x >= region.x &&
          x <= region.x + region.w &&
          y >= region.y &&
          y <= region.y + region.h,
      ) ?? null
    );
  };

  const toLocalCoords = (region: PanelRegion, x: number, y: number): { x: number; y: number } => ({
    x: clampToInteger((x - region.x) / zoom),
    y: clampToInteger((y - region.y) / zoom),
  });

  const onPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const region = pickRegion(x, y);
    if (!region) {
      return;
    }

    const local = toLocalCoords(region, x, y);

    const regionBbox = region.facing === 'right' ? bbox : mirrorBboxRightToLeft(bbox, TILE_SIZE);
    const edge = nearestEdge(local.x, local.y, regionBbox);

    if (!edge) {
      setActiveEdge(null);
      return;
    }

    setActiveEdge(edge);
    setDragging({
      edge,
      region,
      bboxDraft: bbox,
    });
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!dragging) {
      const region = pickRegion(x, y);
      if (!region) {
        setHoveredEdge(null);
        return;
      }
      const local = toLocalCoords(region, x, y);
      const regionBbox = region.facing === 'right' ? bbox : mirrorBboxRightToLeft(bbox, TILE_SIZE);
      setHoveredEdge(nearestEdge(local.x, local.y, regionBbox));
      return;
    }

    const local = toLocalCoords(dragging.region, x, y);
    const regionDraft =
      dragging.region.facing === 'right'
        ? dragging.bboxDraft
        : mirrorBboxRightToLeft(dragging.bboxDraft, TILE_SIZE);

    const updatedRegionBbox = applyEdgeChange(regionDraft, dragging.edge, local[dragging.edge.startsWith('x') ? 'x' : 'y']);

    const nextRightBbox =
      dragging.region.facing === 'right' ? updatedRegionBbox : leftToRightBbox(updatedRegionBbox);

    setDragging((prev) => (prev ? { ...prev, bboxDraft: nextRightBbox } : prev));
  };

  const onPointerUp: React.PointerEventHandler<HTMLCanvasElement> = (event) => {
    if (dragging) {
      onBboxCommit(dragging.bboxDraft);
    }
    setDragging(null);
    (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);
  };

  return (
    <section className="preview-panel" aria-label="Entity Preview Canvas">
      <header className="preview-controls">
        <label>
          Facing
          <select value={facing} onChange={(event) => onFacingChange(event.target.value as FacingMode)}>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="split">Split</option>
          </select>
        </label>

        <label>
          Grid
          <select value={grid} onChange={(event) => onGridChange(event.target.value as GridMode)}>
            <option value="off">Off</option>
            <option value="1px">1px</option>
            <option value="8px">8px</option>
          </select>
        </label>

        <label>
          Onion
          <input type="checkbox" checked={onion} onChange={(event) => onOnionChange(event.target.checked)} />
        </label>

        <label>
          Zoom
          <select
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value) as 4 | 8 | 12 | 16)}
          >
            <option value={4}>4x</option>
            <option value={8}>8x</option>
            <option value={12}>12x</option>
            <option value={16}>16x</option>
          </select>
        </label>

        <label>
          Background
          <select
            value={background}
            onChange={(event) =>
              onBackgroundChange(event.target.value as 'checker' | 'dark' | 'light')
            }
          >
            <option value="checker">Checker</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </header>

      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="img"
          aria-label="Entity sprite and bbox preview"
        />
      </div>

      <footer className="bbox-readout">
        <code>x1: {workingBbox.x1}</code>
        <code>y1: {workingBbox.y1}</code>
        <code>x2: {workingBbox.x2}</code>
        <code>y2: {workingBbox.y2}</code>
        <code>width: {bboxWidth(workingBbox)}</code>
        <code>height: {bboxHeight(workingBbox)}</code>
      </footer>
    </section>
  );
}
