import { describe, it, expect } from 'vitest';
import { EditorState, WangRegionClipboard } from '../../src/editor/editor-state.js';
import type { ProjectMetadata, TileAnimation } from '../../src/core/metadata-schema.js';

function makeMetadata(): ProjectMetadata {
  return {
    version: 2,
    tilesets: [{
      tilesetImage: 'test.png',
      tileWidth: 16, tileHeight: 16,
      columns: 4, tileCount: 16,
    }],
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
    state.addColor('Grass');
    const colors = state.activeWangSet!.colors;
    expect(colors).toHaveLength(1);
    expect(colors[0].name).toBe('Grass');
    expect(colors[0].probability).toBe(1.0);
    expect(colors[0].tile).toBe(-1);
  });

  it('updateColor changes properties', () => {
    const state = stateWithWangSet();
    state.addColor('Grass');
    state.updateColor(0, { name: 'DarkGrass' });
    const c = state.activeWangSet!.colors[0];
    expect(c.name).toBe('DarkGrass');
    expect(c.probability).toBe(1.0); // unchanged
  });

  it('removeColor removes and shifts wangid references', () => {
    const state = stateWithWangSet();
    state.addColor('Grass');  // id 1
    state.addColor('Dirt');   // id 2
    state.addColor('Sand');   // id 3

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
    state.addColor('Grass');
    state.removeColor(0);
    expect(state.activeWangSet!.colors).toHaveLength(0);
  });

  it('emits metadataChanged on color operations', () => {
    const state = stateWithWangSet();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.addColor('A');   // +1
    state.updateColor(0, { name: 'B' }); // +1
    state.removeColor(0);          // +1
    expect(count).toBe(3);
  });

  it('updateColor changes probability', () => {
    const state = stateWithWangSet();
    state.addColor('Grass');
    state.updateColor(0, { probability: 0.5 });
    expect(state.activeWangSet!.colors[0].probability).toBe(0.5);
  });

  it('updateColor sets representative tile', () => {
    const state = stateWithWangSet();
    state.addColor('Grass');
    expect(state.activeWangSet!.colors[0].tile).toBe(-1);
    state.updateColor(0, { tile: 42 });
    expect(state.activeWangSet!.colors[0].tile).toBe(42);
  });

  it('updateColor clears representative tile back to -1', () => {
    const state = stateWithWangSet();
    state.addColor('Grass');
    state.updateColor(0, { tile: 42 });
    state.updateColor(0, { tile: -1 });
    expect(state.activeWangSet!.colors[0].tile).toBe(-1);
  });
});

describe('EditorState tile probability', () => {
  function stateWithTaggedTile(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass');
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
    state.addColor('Grass');
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
    state.addColor('Grass');
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

describe('EditorState copyWangRegion / pasteWangRegion', () => {
  /** 4-column, 16-tile tileset with a wangset + 2 colors */
  function stateWith2x2Tagged(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass');  // color 1
    state.addColor('Dirt');   // color 2
    // Tag a 2x2 block (tiles 0,1,4,5 in a 4-col grid)
    state.setWangId(0, [0, 1, 0, 1, 0, 2, 0, 2]);  // row0 col0
    state.setWangId(1, [0, 2, 0, 2, 0, 1, 0, 1]);  // row0 col1
    state.setWangId(4, [0, 1, 0, 2, 0, 1, 0, 2]);  // row1 col0
    // tile 5 intentionally left untagged
    // Select the 2x2 region
    state.selectTile(0);
    state.selectTileRange(0, 5);
    return state;
  }

  it('copies 2x2 region with correct dimensions and entry count', () => {
    const state = stateWith2x2Tagged();
    state.copyWangRegion();

    const clip = state.wangClipboard!;
    expect(clip).not.toBeNull();
    expect(clip.width).toBe(2);
    expect(clip.height).toBe(2);
    // tile 5 has no wangid, so only 3 entries
    expect(clip.entries.size).toBe(3);
    // TL corner (index 7) of tile 0 is 2, so sourceColorA=2
    expect(clip.sourceColorA).toBe(2);
    expect(clip.sourceColorB).toBe(1);
  });

  it('emits clipboardChanged event', () => {
    const state = stateWith2x2Tagged();
    let count = 0;
    state.on('clipboardChanged', () => count++);
    state.copyWangRegion();
    expect(count).toBe(1);
  });

  it('paste remaps colors correctly', () => {
    const state = stateWith2x2Tagged();
    state.addColor('Sand');   // color 3
    state.addColor('Stone');  // color 4
    state.copyWangRegion();

    // Select a different 2x2 region (tiles 2,3,6,7)
    state.selectTile(2);
    state.selectTileRange(2, 7);

    // sourceColorA=2, sourceColorB=1 (detected from TL of tile 0)
    // Paste with colorA=3, colorB=4: remap 2→3, 1→4
    const ok = state.pasteWangRegion(3, 4);
    expect(ok).toBe(true);

    // tile 0 original: [0,1,0,1,0,2,0,2] → remap 2→3,1→4 → [0,4,0,4,0,3,0,3]
    const wt2 = state.getWangTile(2);
    expect(wt2!.wangid).toEqual([0, 4, 0, 4, 0, 3, 0, 3]);

    // tile 1 original: [0,2,0,2,0,1,0,1] → remap 2→3,1→4 → [0,3,0,3,0,4,0,4]
    const wt3 = state.getWangTile(3);
    expect(wt3!.wangid).toEqual([0, 3, 0, 3, 0, 4, 0, 4]);
  });

  it('paste returns false on dimension mismatch', () => {
    const state = stateWith2x2Tagged();
    state.copyWangRegion();

    // Select a 3x1 region (tiles 0,1,2)
    state.selectTile(0);
    state.selectTileRange(0, 2);

    const ok = state.pasteWangRegion(1, 2);
    expect(ok).toBe(false);
  });

  it('paste returns false when clipboard is empty', () => {
    const state = stateWith2x2Tagged();
    // No copy performed
    const ok = state.pasteWangRegion(1, 2);
    expect(ok).toBe(false);
  });

  it('paste is undoable (single undo reverts all pasted tiles)', () => {
    const state = stateWith2x2Tagged();
    state.copyWangRegion();

    // Select tiles 2,3,6,7
    state.selectTile(2);
    state.selectTileRange(2, 7);
    state.pasteWangRegion(1, 2);

    // Verify tiles were pasted
    expect(state.getWangTile(2)).toBeDefined();
    expect(state.getWangTile(3)).toBeDefined();
    expect(state.getWangTile(6)).toBeDefined();

    // Single undo should revert all
    state.undo();
    expect(state.getWangTile(2)).toBeUndefined();
    expect(state.getWangTile(3)).toBeUndefined();
    expect(state.getWangTile(6)).toBeUndefined();
  });

  it('tiles without wangids in source are skipped on paste', () => {
    const state = stateWith2x2Tagged();
    state.copyWangRegion();

    // Select tiles 2,3,6,7
    state.selectTile(2);
    state.selectTileRange(2, 7);
    state.pasteWangRegion(1, 2);

    // Tile at relative (1,1) had no wangid in source (tile 5), so tile 7 should be untagged
    expect(state.getWangTile(7)).toBeUndefined();
  });
});

describe('EditorState per-tile animation', () => {
  function stateWithTaggedTiles(): EditorState {
    const state = new EditorState(makeMetadata());
    state.addWangSet('Test', 'corner');
    state.addColor('Grass');
    state.setWangId(0, [0, 1, 0, 1, 0, 1, 0, 1]);
    state.setWangId(1, [0, 1, 0, 1, 0, 1, 0, 1]);
    state.setWangId(2, [0, 1, 0, 1, 0, 1, 0, 1]);
    return state;
  }

  it('setTileAnimation sets animation on a wangtile', () => {
    const state = stateWithTaggedTiles();
    const anim: TileAnimation = {
      frameDuration: 200,
      pattern: 'loop',
      frames: [
        { tileId: 0, tileset: 0 },
        { tileId: 3, tileset: 0 },
        { tileId: 6, tileset: 0 },
      ],
    };
    state.setTileAnimation(0, anim);
    expect(state.getWangTile(0)!.animation).toBeDefined();
    expect(state.getWangTile(0)!.animation!.frameDuration).toBe(200);
    expect(state.getWangTile(0)!.animation!.frames).toHaveLength(3);
  });

  it('setTileAnimation(undefined) clears animation', () => {
    const state = stateWithTaggedTiles();
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [{ tileId: 0, tileset: 0 }],
    });
    expect(state.getWangTile(0)!.animation).toBeDefined();
    state.setTileAnimation(0, undefined);
    expect(state.getWangTile(0)!.animation).toBeUndefined();
  });

  it('setTileAnimation is undoable', () => {
    const state = stateWithTaggedTiles();
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [{ tileId: 0, tileset: 0 }],
    });
    state.undo();
    expect(state.getWangTile(0)!.animation).toBeUndefined();
  });

  it('setTileAnimationMulti sets animation on multiple tiles', () => {
    const state = stateWithTaggedTiles();
    const anim: TileAnimation = {
      frameDuration: 150,
      pattern: 'ping-pong',
      frames: [{ tileId: 0, tileset: 0 }],
    };
    state.setTileAnimationMulti([0, 1, 2], anim);
    expect(state.getWangTile(0)!.animation).toBeDefined();
    expect(state.getWangTile(1)!.animation).toBeDefined();
    expect(state.getWangTile(2)!.animation).toBeDefined();
  });

  it('setTileAnimationMulti creates single undo snapshot', () => {
    const state = stateWithTaggedTiles();
    const anim: TileAnimation = {
      frameDuration: 100,
      pattern: 'loop',
      frames: [{ tileId: 0, tileset: 0 }],
    };
    state.setTileAnimationMulti([0, 1], anim);
    state.undo();
    expect(state.getWangTile(0)!.animation).toBeUndefined();
    expect(state.getWangTile(1)!.animation).toBeUndefined();
  });

  it('copyTileAnimation + pasteTileAnimation works with offset', () => {
    const state = stateWithTaggedTiles();
    // Set animation on tile 0 with offset of 3
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [
        { tileId: 0, tileset: 0 },
        { tileId: 3, tileset: 0 },
        { tileId: 6, tileset: 0 },
      ],
    });

    // Select tile 0 and copy
    state.selectTile(0);
    state.copyTileAnimation();
    expect(state.animationClipboard).not.toBeNull();
    expect(state.animationClipboard!.offset).toBe(3);

    // Select tile 1 and paste
    state.selectTile(1);
    state.pasteTileAnimation();

    // Tile 1's frames should be computed from its own ID + offset
    const anim1 = state.getWangTile(1)!.animation!;
    expect(anim1.frameDuration).toBe(200);
    expect(anim1.frames[0].tileId).toBe(1);
    expect(anim1.frames[1].tileId).toBe(4);
    expect(anim1.frames[2].tileId).toBe(7);
  });

  it('applyAnimationToColorTiles applies to all tiles with colorId', () => {
    const state = stateWithTaggedTiles();
    // Set animation on tile 0
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [
        { tileId: 0, tileset: 0 },
        { tileId: 3, tileset: 0 },
        { tileId: 6, tileset: 0 },
      ],
    });

    state.selectTile(0);
    state.applyAnimationToColorTiles(1); // color 1 = Grass

    // All tiles with color 1 should now have animations
    expect(state.getWangTile(0)!.animation).toBeDefined();
    expect(state.getWangTile(1)!.animation).toBeDefined();
    expect(state.getWangTile(2)!.animation).toBeDefined();

    // Tile 1's animation should use its own tile ID as base
    const anim1 = state.getWangTile(1)!.animation!;
    expect(anim1.frames[0].tileId).toBe(1);
    expect(anim1.frames[1].tileId).toBe(4);
    expect(anim1.frames[2].tileId).toBe(7);
  });

  it('applyAnimationToColorTiles is undoable', () => {
    const state = stateWithTaggedTiles();
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [
        { tileId: 0, tileset: 0 },
        { tileId: 3, tileset: 0 },
      ],
    });

    state.selectTile(0);
    state.applyAnimationToColorTiles(1);

    // All should have animations
    expect(state.getWangTile(1)!.animation).toBeDefined();
    expect(state.getWangTile(2)!.animation).toBeDefined();

    // Undo should revert the apply (but not the initial set)
    state.undo();
    expect(state.getWangTile(1)!.animation).toBeUndefined();
    expect(state.getWangTile(2)!.animation).toBeUndefined();
    // Tile 0 still has its animation from before
    expect(state.getWangTile(0)!.animation).toBeDefined();
  });

  it('emits metadataChanged on setTileAnimation', () => {
    const state = stateWithTaggedTiles();
    let count = 0;
    state.on('metadataChanged', () => count++);
    state.setTileAnimation(0, {
      frameDuration: 200,
      pattern: 'loop',
      frames: [{ tileId: 0, tileset: 0 }],
    });
    expect(count).toBe(1);
  });
});
