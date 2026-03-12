import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { generateEntityConstructorSnippets, serializeWeaponsFile } from '../domain/serialization';
import { useEditorStore } from '../store/editorStore';

describe('integration flows', () => {
  it('creates entity profile and exports constructor snippets', () => {
    const store = useEditorStore.getState();
    store.createEntity();

    const afterCreate = useEditorStore.getState();
    const active = afterCreate.entityProfiles.find((entity) => entity.id === afterCreate.activeEntityId);
    expect(active).toBeTruthy();

    if (!active) {
      return;
    }

    const snippets = generateEntityConstructorSnippets(active);
    expect(snippets.bboxSnippet.startsWith('this.bbox =')).toBe(true);
    expect(snippets.statesSnippet.startsWith('this.states =')).toBe(true);
  });

  it('loads, edits, and serializes weapon data with deterministic output', () => {
    const store = useEditorStore.getState();
    store.loadWeapons({
      Sword: [
        {
          power: 3,
          anim_duration: 8,
          sfx: 'slash',
          knockback: { x: 1, y: -1 },
          origin: { x: 0, y: 0 },
          frames: {
            '0': {
              sprite: 1,
              bbox: null,
            },
          },
        },
      ],
    });

    store.selectWeapon('Sword', 0);
    store.addWeaponFrame(4, {
      sprite: [8, 2, 1],
      bbox: { x1: 0, y1: 0, x2: 3, y2: 3 },
      xm: 1,
    });

    const serialized = serializeWeaponsFile(useEditorStore.getState().weapons);
    const parsed = JSON.parse(serialized) as {
      Sword: Array<{ frames: Record<string, { xm?: number }> }>;
    };
    expect(parsed.Sword[0].frames['4'].xm).toBe(1);
  });

  it('handles keyboard shortcuts for grid and play', () => {
    render(
      <MemoryRouter
        initialEntries={['/entity/active']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );

    const beforeGrid = useEditorStore.getState().canvasOptions.grid;
    fireEvent.keyDown(window, { key: 'g' });
    const afterGrid = useEditorStore.getState().canvasOptions.grid;

    expect(afterGrid).not.toBe(beforeGrid);

    fireEvent.keyDown(window, { key: ' ' });
    expect(useEditorStore.getState().entityPlayback.playing).toBe(true);
  });

  it('renders weapon active route without entering a render loop', () => {
    const view = render(
      <MemoryRouter
        initialEntries={['/weapon/active/0']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );

    expect(view.getAllByText('Weapon Editor').length).toBeGreaterThan(0);
    expect(view.getAllByLabelText('Weapon Preview Canvas').length).toBeGreaterThan(0);
  });
});
