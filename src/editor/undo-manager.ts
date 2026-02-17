import type { TilesetMetadata } from '../core/metadata-schema.js';

/**
 * Snapshot-based undo/redo manager for tileset metadata.
 * Before each mutation, a deep clone (JSON snapshot) of the entire metadata
 * object is pushed onto the undo stack. Undo restores the snapshot and pushes
 * the current state to the redo stack. Any new mutation clears the redo stack.
 */
export class UndoManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxSize = 50;

  /** Save a snapshot before a mutation */
  pushSnapshot(metadata: TilesetMetadata): void {
    this.undoStack.push(JSON.stringify(metadata));
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0; // Clear redo on new action
  }

  /** Undo: returns the previous metadata state, or null if nothing to undo */
  undo(currentMetadata: TilesetMetadata): TilesetMetadata | null {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return null;
    this.redoStack.push(JSON.stringify(currentMetadata));
    return JSON.parse(snapshot);
  }

  /** Redo: returns the next metadata state, or null if nothing to redo */
  redo(currentMetadata: TilesetMetadata): TilesetMetadata | null {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return null;
    this.undoStack.push(JSON.stringify(currentMetadata));
    return JSON.parse(snapshot);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
