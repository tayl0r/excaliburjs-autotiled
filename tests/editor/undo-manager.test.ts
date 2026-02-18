import { describe, it, expect } from 'vitest';
import { UndoManager } from '../../src/editor/undo-manager.js';
import type { ProjectMetadata } from '../../src/core/metadata-schema.js';

function makeMetadata(name = 'test'): ProjectMetadata {
  return {
    version: 2,
    tilesets: [{ tilesetImage: 'test.png', tileWidth: 16, tileHeight: 16, columns: 16, tileCount: 256 }],
    wangsets: [{ name, type: 'corner', tile: -1, colors: [], wangtiles: [] }],
  };
}

describe('UndoManager', () => {
  it('starts with empty stacks', () => {
    const um = new UndoManager();
    expect(um.canUndo).toBe(false);
    expect(um.canRedo).toBe(false);
  });

  it('undo restores previous state', () => {
    const um = new UndoManager();
    const before = makeMetadata('before');
    const after = makeMetadata('after');
    um.pushSnapshot(before);
    const restored = um.undo(after);
    expect(restored!.wangsets[0].name).toBe('before');
  });

  it('redo restores undone state', () => {
    const um = new UndoManager();
    const before = makeMetadata('before');
    const after = makeMetadata('after');
    um.pushSnapshot(before);
    um.undo(after); // undo pushes 'after' to redo
    const redone = um.redo(before); // redo pushes 'before' to undo, returns 'after'
    expect(redone!.wangsets[0].name).toBe('after');
  });

  it('new action clears redo stack', () => {
    const um = new UndoManager();
    um.pushSnapshot(makeMetadata('v1'));
    um.undo(makeMetadata('v2'));
    expect(um.canRedo).toBe(true);
    um.pushSnapshot(makeMetadata('v3')); // new action
    expect(um.canRedo).toBe(false);
  });

  it('undo returns null when empty', () => {
    const um = new UndoManager();
    expect(um.undo(makeMetadata())).toBeNull();
  });

  it('redo returns null when empty', () => {
    const um = new UndoManager();
    expect(um.redo(makeMetadata())).toBeNull();
  });

  it('respects max size', () => {
    const um = new UndoManager();
    for (let i = 0; i < 60; i++) {
      um.pushSnapshot(makeMetadata(`v${i}`));
    }
    // Should have max 50 entries
    let count = 0;
    while (um.canUndo) {
      um.undo(makeMetadata());
      count++;
    }
    expect(count).toBe(50);
  });

  it('multiple undo/redo cycle preserves states', () => {
    const um = new UndoManager();
    const v1 = makeMetadata('v1');
    const v2 = makeMetadata('v2');
    const v3 = makeMetadata('v3');

    um.pushSnapshot(v1);   // undo stack: [v1]
    um.pushSnapshot(v2);   // undo stack: [v1, v2]

    // Current state is v3, undo should give v2
    const result1 = um.undo(v3);
    expect(result1!.wangsets[0].name).toBe('v2');

    // Current state is v2, undo should give v1
    const result2 = um.undo(result1!);
    expect(result2!.wangsets[0].name).toBe('v1');

    // Now redo back: current is v1, redo should give v2
    const result3 = um.redo(result2!);
    expect(result3!.wangsets[0].name).toBe('v2');

    // Current is v2, redo should give v3
    const result4 = um.redo(result3!);
    expect(result4!.wangsets[0].name).toBe('v3');

    // No more to redo
    expect(um.canRedo).toBe(false);
  });
});
