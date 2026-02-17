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
