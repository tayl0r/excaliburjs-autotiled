/**
 * Snapshot-based undo/redo manager.
 * Before each mutation, a deep clone (JSON snapshot) of the state
 * is pushed onto the undo stack. Undo restores the snapshot and pushes
 * the current state to the redo stack. Any new mutation clears the redo stack.
 */
export class UndoManager<T = unknown> {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxSize = 50;

  /** Save a snapshot before a mutation */
  pushSnapshot(state: T): void {
    this.undoStack.push(JSON.stringify(state));
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  /** Undo: returns the previous state, or null if nothing to undo */
  undo(currentState: T): T | null {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return null;
    this.redoStack.push(JSON.stringify(currentState));
    return JSON.parse(snapshot);
  }

  /** Redo: returns the next state, or null if nothing to redo */
  redo(currentState: T): T | null {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return null;
    this.undoStack.push(JSON.stringify(currentState));
    return JSON.parse(snapshot);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
