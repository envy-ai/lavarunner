import { useMemo, useState } from 'react';
import type { SpriteValue } from '../domain/types';

interface SpritePickerProps {
  open: boolean;
  value: SpriteValue;
  tilesheets: string[];
  selectedTilesheet: string;
  onTilesheetChange: (tilesheet: string) => void;
  onClose: () => void;
  onChange: (value: SpriteValue) => void;
}

const GRID_COLS = 16;
const GRID_ROWS = 16;

interface DragSelection {
  start: number;
  end: number;
}

function toCoords(index: number): { x: number; y: number } {
  return {
    x: index % GRID_COLS,
    y: Math.floor(index / GRID_COLS),
  };
}

function toIndex(x: number, y: number): number {
  return y * GRID_COLS + x;
}

function normalizeSelection(start: number, end: number): [number, number, number] {
  const from = toCoords(start);
  const to = toCoords(end);
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  return [toIndex(minX, minY), maxX - minX + 1, maxY - minY + 1];
}

function contains(index: number, sprite: SpriteValue): boolean {
  if (sprite === null) {
    return false;
  }
  if (typeof sprite === 'number') {
    return sprite === index;
  }

  const [start, width, height] = sprite;
  const startCoords = toCoords(start);
  const coords = toCoords(index);
  return (
    coords.x >= startCoords.x &&
    coords.x < startCoords.x + width &&
    coords.y >= startCoords.y &&
    coords.y < startCoords.y + height
  );
}

export function SpritePicker(props: SpritePickerProps): JSX.Element | null {
  const { open, value, tilesheets, selectedTilesheet, onTilesheetChange, onClose, onChange } = props;

  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);

  const canonicalLabel = useMemo(() => {
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'number') {
      return `${value}`;
    }
    return `[${value[0]},${value[1]},${value[2]}]`;
  }, [value]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card sprite-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Sprite Picker"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Sprite Picker</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="picker-toolbar">
          <label>
            Tilesheet
            <select
              value={selectedTilesheet}
              onChange={(event) => onTilesheetChange(event.target.value)}
            >
              {tilesheets.map((tilesheet) => (
                <option key={tilesheet} value={tilesheet}>
                  {tilesheet}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => onChange(null)}>
            Set Null
          </button>

          <div className="sprite-chip" aria-label="Selected Sprite Value">
            {canonicalLabel}
          </div>
        </div>

        <div
          className="sprite-grid"
          onPointerLeave={() => setDragSelection(null)}
        >
          {Array.from({ length: GRID_COLS * GRID_ROWS }).map((_, index) => {
            const selectedByValue = contains(index, value);
            const selectedByDrag =
              dragSelection &&
              contains(index, normalizeSelection(dragSelection.start, dragSelection.end));

            return (
              <button
                key={index}
                type="button"
                className={`sprite-cell ${selectedByValue || selectedByDrag ? 'is-selected' : ''}`}
                onClick={() => onChange(index)}
                onPointerDown={() => setDragSelection({ start: index, end: index })}
                onPointerEnter={(event) => {
                  if (event.buttons === 1 && dragSelection) {
                    setDragSelection({ ...dragSelection, end: index });
                  }
                }}
                onPointerUp={() => {
                  if (!dragSelection) {
                    return;
                  }
                  const normalized = normalizeSelection(dragSelection.start, dragSelection.end);
                  if (normalized[1] === 1 && normalized[2] === 1) {
                    onChange(normalized[0]);
                  } else {
                    onChange(normalized);
                  }
                  setDragSelection(null);
                }}
              >
                {index}
              </button>
            );
          })}
        </div>

        <p className="hint-line">Single click selects integer sprite index. Drag selects [start,width,height].</p>
      </div>
    </div>
  );
}
