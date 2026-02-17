import { describe, it, expect } from 'vitest';
import { EditorState } from '../../src/editor/editor-state.js';
import { TilesetMetadata } from '../../src/core/metadata-schema.js';

function makeMetadata(): TilesetMetadata {
  return {
    tilesetImage: 'test.png',
    tileWidth: 16, tileHeight: 16,
    columns: 4, tileCount: 16,
    wangsets: [],
  };
}

describe('EditorState WangSet CRUD', () => {
  it('addWangSet creates a new WangSet and selects it', () => {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Ground', 'corner');
    expect(state.metadata.wangsets).toHaveLength(1);
    expect(state.metadata.wangsets[0].name).toBe('Ground');
    expect(state.metadata.wangsets[0].type).toBe('corner');
    expect(state.metadata.wangsets[0].colors).toEqual([]);
    expect(state.metadata.wangsets[0].wangtiles).toEqual([]);
    expect(state.activeWangSetIndex).toBe(0);
  });

  it('addWangSet selects the newly added set', () => {
    const state = new EditorState(makeMetadata());
    state.addWangSet('A', 'corner');
    state.addWangSet('B', 'edge');
    expect(state.activeWangSetIndex).toBe(1);
    expect(state.activeWangSet?.name).toBe('B');
  });

  it('removeWangSet removes by index and adjusts selection', () => {
    const state = new EditorState(makeMetadata());
    state.addWangSet('A', 'corner');
    state.addWangSet('B', 'corner');
    state.setActiveWangSet(0);
    state.removeWangSet(0);
    expect(state.metadata.wangsets).toHaveLength(1);
    expect(state.metadata.wangsets[0].name).toBe('B');
    expect(state.activeWangSetIndex).toBe(0);
  });

  it('removeWangSet clamps selection when removing last', () => {
    const state = new EditorState(makeMetadata());
    state.addWangSet('A', 'corner');
    state.removeWangSet(0);
    expect(state.metadata.wangsets).toHaveLength(0);
    expect(state.activeWangSetIndex).toBe(0);
  });

  it('renameWangSet updates the name', () => {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Old', 'corner');
    state.renameWangSet(0, 'New');
    expect(state.metadata.wangsets[0].name).toBe('New');
  });

  it('emits metadataChanged on add/remove/rename', () => {
    const state = new EditorState(makeMetadata());
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.addWangSet('A', 'corner');   // +1
    state.renameWangSet(0, 'B');       // +1
    state.removeWangSet(0);            // +1
    expect(count).toBe(3);
  });
});

describe('EditorState WangColor CRUD', () => {
  function stateWithWangSet(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    return state;
  }

  it('addColor appends a new color to the active WangSet', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    const colors = state.activeWangSet!.colors;
    expect(colors).toHaveLength(1);
    expect(colors[0].name).toBe('Grass');
    expect(colors[0].color).toBe('#00ff00');
    expect(colors[0].probability).toBe(1.0);
    expect(colors[0].tile).toBe(-1);
  });

  it('updateColor changes properties', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    state.updateColor(0, { name: 'DarkGrass', color: '#006600' });
    const c = state.activeWangSet!.colors[0];
    expect(c.name).toBe('DarkGrass');
    expect(c.color).toBe('#006600');
    expect(c.probability).toBe(1.0); // unchanged
  });

  it('removeColor removes and shifts wangid references', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');  // id 1
    state.addColor('Dirt', '#884400');   // id 2
    state.addColor('Sand', '#ffee00');   // id 3

    // Tag a tile: corners = [0, 2, 0, 3, 0, 1, 0, 2]
    state.setWangId(0, [0, 2, 0, 3, 0, 1, 0, 2]);

    // Remove Grass (color index 0, id 1) — Dirt becomes id 1, Sand becomes id 2
    state.removeColor(0);

    expect(state.activeWangSet!.colors).toHaveLength(2);
    expect(state.activeWangSet!.colors[0].name).toBe('Dirt');

    // WangId references should be shifted: old 2->1, old 3->2, old 1->0
    const wt = state.getWangTile(0);
    expect(wt!.wangid).toEqual([0, 1, 0, 2, 0, 0, 0, 1]);
  });

  it('removeColor with no wangtiles does not crash', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    state.removeColor(0);
    expect(state.activeWangSet!.colors).toHaveLength(0);
  });

  it('emits metadataChanged on color operations', () => {
    const state = stateWithWangSet();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.addColor('A', '#000');   // +1
    state.updateColor(0, { name: 'B' }); // +1
    state.removeColor(0);          // +1
    expect(count).toBe(3);
  });

  it('updateColor changes probability', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    state.updateColor(0, { probability: 0.5 });
    expect(state.activeWangSet!.colors[0].probability).toBe(0.5);
  });

  it('updateColor sets representative tile', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    expect(state.activeWangSet!.colors[0].tile).toBe(-1);
    state.updateColor(0, { tile: 42 });
    expect(state.activeWangSet!.colors[0].tile).toBe(42);
  });

  it('updateColor clears representative tile back to -1', () => {
    const state = stateWithWangSet();
    state.addColor('Grass', '#00ff00');
    state.updateColor(0, { tile: 42 });
    state.updateColor(0, { tile: -1 });
    expect(state.activeWangSet!.colors[0].tile).toBe(-1);
  });
});

describe('EditorState tile probability', () => {
  function stateWithTaggedTile(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass', '#00ff00');
    state.setWangId(0, [0, 1, 0, 1, 0, 1, 0, 1]);
    return state;
  }

  it('setTileProbability sets probability on existing wangtile', () => {
    const state = stateWithTaggedTile();
    state.setTileProbability(0, 0.5);
    expect(state.getWangTile(0)!.probability).toBe(0.5);
  });

  it('probability is undefined by default (treated as 1.0)', () => {
    const state = stateWithTaggedTile();
    expect(state.getWangTile(0)!.probability).toBeUndefined();
  });

  it('is no-op when tile has no wangtile entry', () => {
    const state = stateWithTaggedTile();
    state.setTileProbability(5, 0.5);
    expect(state.getWangTile(5)).toBeUndefined();
  });

  it('emits metadataChanged', () => {
    const state = stateWithTaggedTile();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.setTileProbability(0, 0.5);
    expect(count).toBe(1);
  });

  it('supports undo', () => {
    const state = stateWithTaggedTile();
    state.setTileProbability(0, 0.3);
    state.undo();
    expect(state.getWangTile(0)!.probability).toBeUndefined();
  });
});

describe('EditorState setWangIdMulti', () => {
  function stateWithWangSet(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass', '#00ff00');
    return state;
  }

  it('updates multiple tiles in one operation', () => {
    const state = stateWithWangSet();
    const wangid = [0, 1, 0, 1, 0, 1, 0, 1];
    state.setWangIdMulti([
      { tileId: 0, wangid },
      { tileId: 1, wangid },
      { tileId: 2, wangid },
    ]);
    expect(state.getWangTile(0)!.wangid).toEqual(wangid);
    expect(state.getWangTile(1)!.wangid).toEqual(wangid);
    expect(state.getWangTile(2)!.wangid).toEqual(wangid);
  });

  it('creates single undo snapshot', () => {
    const state = stateWithWangSet();
    state.setWangIdMulti([
      { tileId: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
      { tileId: 1, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
    ]);
    state.undo();
    expect(state.getWangTile(0)).toBeUndefined();
    expect(state.getWangTile(1)).toBeUndefined();
  });

  it('emits metadataChanged once', () => {
    const state = stateWithWangSet();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.setWangIdMulti([
      { tileId: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
      { tileId: 1, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
    ]);
    expect(count).toBe(1);
  });

  it('empty array is a no-op', () => {
    const state = stateWithWangSet();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.setWangIdMulti([]);
    expect(count).toBe(0);
  });
});

describe('EditorState setTileProbabilityMulti', () => {
  function stateWithTaggedTiles(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass', '#00ff00');
    state.setWangId(0, [0, 1, 0, 1, 0, 1, 0, 1]);
    state.setWangId(1, [0, 1, 0, 1, 0, 1, 0, 1]);
    state.setWangId(2, [0, 1, 0, 1, 0, 1, 0, 1]);
    return state;
  }

  it('sets probability on multiple tiles', () => {
    const state = stateWithTaggedTiles();
    state.setTileProbabilityMulti([0, 1, 2], 0.5);
    expect(state.getWangTile(0)!.probability).toBe(0.5);
    expect(state.getWangTile(1)!.probability).toBe(0.5);
    expect(state.getWangTile(2)!.probability).toBe(0.5);
  });

  it('creates single undo snapshot', () => {
    const state = stateWithTaggedTiles();
    state.setTileProbabilityMulti([0, 1], 0.5);
    state.undo();
    expect(state.getWangTile(0)!.probability).toBeUndefined();
    expect(state.getWangTile(1)!.probability).toBeUndefined();
  });

  it('skips tiles with no wangtile entry', () => {
    const state = stateWithTaggedTiles();
    state.setTileProbabilityMulti([0, 5], 0.5);
    expect(state.getWangTile(0)!.probability).toBe(0.5);
    expect(state.getWangTile(5)).toBeUndefined();
  });

  it('empty array is a no-op', () => {
    const state = stateWithTaggedTiles();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.setTileProbabilityMulti([], 0.5);
    expect(count).toBe(0);
  });
});

describe('EditorState template mode', () => {
  it('templateMode defaults to false', () => {
    const state = new EditorState(makeMetadata());
    expect(state.templateMode).toBe(false);
  });

  it('setTemplateMode toggles and emits', () => {
    const state = new EditorState(makeMetadata());
    let count = 0;
    state.on('templateModeChanged', () => count++);
    state.setTemplateMode(true);
    expect(state.templateMode).toBe(true);
    expect(count).toBe(1);
  });

  it('activeTemplateSlot defaults to -1', () => {
    const state = new EditorState(makeMetadata());
    expect(state.activeTemplateSlot).toBe(-1);
  });

  it('setActiveTemplateSlot updates and emits', () => {
    const state = new EditorState(makeMetadata());
    let count = 0;
    state.on('templateSlotChanged', () => count++);
    state.setActiveTemplateSlot(5);
    expect(state.activeTemplateSlot).toBe(5);
    expect(count).toBe(1);
  });

  it('setTemplateMode(false) resets activeTemplateSlot', () => {
    const state = new EditorState(makeMetadata());
    state.setTemplateMode(true);
    state.setActiveTemplateSlot(5);
    state.setTemplateMode(false);
    expect(state.activeTemplateSlot).toBe(-1);
  });
});
