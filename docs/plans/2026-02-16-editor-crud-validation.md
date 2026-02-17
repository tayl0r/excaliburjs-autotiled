# Editor CRUD & Completeness Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add WangSet/WangColor create/rename/delete and completeness validation to the tile metadata editor.

**Architecture:** Extend `EditorState` with mutation methods for WangSets and Colors, then update `WangSetPanel` UI to expose these operations. Add a completeness checker utility and wire it into the panel as a status display. All changes are pure TypeScript/DOM — no new dependencies.

**Tech Stack:** TypeScript, Vitest, vanilla DOM

---

### Task 1: EditorState — WangSet CRUD methods

**Files:**
- Modify: `src/editor/editor-state.ts`
- Test: `tests/editor/editor-state.test.ts` (create)

**Step 1: Write failing tests**

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/editor/editor-state.test.ts`
Expected: FAIL — methods don't exist yet

**Step 3: Implement WangSet CRUD in EditorState**

Add to `src/editor/editor-state.ts`:

```typescript
addWangSet(name: string, type: 'corner' | 'edge' | 'mixed'): void {
  this._metadata.wangsets.push({
    name,
    type,
    tile: 0,
    colors: [],
    wangtiles: [],
  });
  this._activeWangSetIndex = this._metadata.wangsets.length - 1;
  this.emit('activeWangSetChanged');
  this.emit('metadataChanged');
}

removeWangSet(index: number): void {
  if (index < 0 || index >= this._metadata.wangsets.length) return;
  this._metadata.wangsets.splice(index, 1);
  if (this._activeWangSetIndex >= this._metadata.wangsets.length) {
    this._activeWangSetIndex = Math.max(0, this._metadata.wangsets.length - 1);
  }
  this.emit('activeWangSetChanged');
  this.emit('metadataChanged');
}

renameWangSet(index: number, name: string): void {
  const ws = this._metadata.wangsets[index];
  if (!ws) return;
  ws.name = name;
  this.emit('metadataChanged');
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/editor/editor-state.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(editor): add WangSet CRUD methods to EditorState
```

---

### Task 2: EditorState — WangColor CRUD methods

**Files:**
- Modify: `src/editor/editor-state.ts`
- Modify: `tests/editor/editor-state.test.ts`

**Step 1: Write failing tests**

Append to the test file:

```typescript
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
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/editor/editor-state.test.ts`
Expected: FAIL — methods don't exist yet

**Step 3: Implement WangColor CRUD in EditorState**

Add to `src/editor/editor-state.ts`:

```typescript
addColor(name: string, color: string): void {
  const ws = this.activeWangSet;
  if (!ws) return;
  ws.colors.push({ name, color, probability: 1.0, tile: -1 });
  this.emit('metadataChanged');
}

updateColor(colorIndex: number, updates: Partial<{ name: string; color: string; probability: number; tile: number }>): void {
  const ws = this.activeWangSet;
  if (!ws || !ws.colors[colorIndex]) return;
  Object.assign(ws.colors[colorIndex], updates);
  this.emit('metadataChanged');
}

removeColor(colorIndex: number): void {
  const ws = this.activeWangSet;
  if (!ws || !ws.colors[colorIndex]) return;

  const removedId = colorIndex + 1; // colors are 1-based in WangIds
  ws.colors.splice(colorIndex, 1);

  // Shift wangid references: removed -> 0, above removed -> decrement
  for (const wt of ws.wangtiles) {
    for (let i = 0; i < wt.wangid.length; i++) {
      if (wt.wangid[i] === removedId) {
        wt.wangid[i] = 0;
      } else if (wt.wangid[i] > removedId) {
        wt.wangid[i]--;
      }
    }
  }

  // Clamp active color
  if (this._activeColorId > ws.colors.length) {
    this._activeColorId = Math.max(1, ws.colors.length);
  }

  this.emit('metadataChanged');
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/editor/editor-state.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(editor): add WangColor CRUD methods to EditorState
```

---

### Task 3: Completeness checker utility

**Files:**
- Create: `src/editor/completeness-checker.ts`
- Test: `tests/editor/completeness-checker.test.ts` (create)

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { checkCompleteness, CompletenessResult } from '../../src/editor/completeness-checker.js';
import { WangSetData } from '../../src/core/metadata-schema.js';

function makeWangSet(colorCount: number, wangtiles: { tileid: number; wangid: number[] }[]): WangSetData {
  const colors = Array.from({ length: colorCount }, (_, i) => ({
    name: `Color${i + 1}`,
    color: '#000',
    probability: 1.0,
    tile: i,
  }));
  return { name: 'Test', type: 'corner', tile: 0, colors, wangtiles };
}

describe('checkCompleteness', () => {
  it('returns 0/0 for a WangSet with no colors', () => {
    const ws = makeWangSet(0, []);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.missing).toEqual([]);
  });

  it('returns 1/1 for 1 color with a full tile', () => {
    const ws = makeWangSet(1, [
      { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
    ]);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(1);   // 1^4
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('returns 16/16 for complete 2-color corner set', () => {
    // All 16 combinations of 2 colors in 4 corners
    const tiles = [];
    let id = 0;
    for (let tl = 1; tl <= 2; tl++) {
      for (let tr = 1; tr <= 2; tr++) {
        for (let br = 1; br <= 2; br++) {
          for (let bl = 1; bl <= 2; bl++) {
            tiles.push({ tileid: id++, wangid: [0, tr, 0, br, 0, bl, 0, tl] });
          }
        }
      }
    }
    const ws = makeWangSet(2, tiles);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(16);
    expect(result.matched).toBe(16);
    expect(result.missing).toEqual([]);
  });

  it('detects missing combinations', () => {
    // 2-color set with only 14 tiles (missing 2)
    const tiles = [];
    let id = 0;
    for (let tl = 1; tl <= 2; tl++) {
      for (let tr = 1; tr <= 2; tr++) {
        for (let br = 1; br <= 2; br++) {
          for (let bl = 1; bl <= 2; bl++) {
            // Skip the "all color 2" and "TL=2,TR=1,BR=2,BL=1" combos
            if (tl === 2 && tr === 2 && br === 2 && bl === 2) continue;
            if (tl === 2 && tr === 1 && br === 2 && bl === 1) continue;
            tiles.push({ tileid: id++, wangid: [0, tr, 0, br, 0, bl, 0, tl] });
          }
        }
      }
    }
    const ws = makeWangSet(2, tiles);
    const result = checkCompleteness(ws);
    expect(result.total).toBe(16);
    expect(result.matched).toBe(14);
    expect(result.missing).toHaveLength(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/editor/completeness-checker.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement completeness checker**

Create `src/editor/completeness-checker.ts`:

```typescript
import { WangSetData } from '../core/metadata-schema.js';

export interface MissingCombination {
  /** Corner colors: [TL, TR, BR, BL] using 1-based color IDs */
  corners: [tl: number, tr: number, br: number, bl: number];
}

export interface CompletenessResult {
  total: number;
  matched: number;
  missing: MissingCombination[];
}

/**
 * Check how many of the possible corner combinations in a WangSet
 * are covered by at least one tagged tile.
 *
 * Only supports corner-type WangSets (indices 1, 3, 5, 7).
 */
export function checkCompleteness(ws: WangSetData): CompletenessResult {
  const colorCount = ws.colors.length;
  if (colorCount === 0) {
    return { total: 0, matched: 0, missing: [] };
  }

  // Build a set of present corner combinations from wangtiles
  // Key format: "TL,TR,BR,BL"
  const present = new Set<string>();
  for (const wt of ws.wangtiles) {
    const tl = wt.wangid[7];
    const tr = wt.wangid[1];
    const br = wt.wangid[3];
    const bl = wt.wangid[5];
    present.add(`${tl},${tr},${br},${bl}`);
  }

  // Enumerate all possible combinations
  const missing: MissingCombination[] = [];
  let total = 0;

  for (let tl = 1; tl <= colorCount; tl++) {
    for (let tr = 1; tr <= colorCount; tr++) {
      for (let br = 1; br <= colorCount; br++) {
        for (let bl = 1; bl <= colorCount; bl++) {
          total++;
          if (!present.has(`${tl},${tr},${br},${bl}`)) {
            missing.push({ corners: [tl, tr, br, bl] });
          }
        }
      }
    }
  }

  return { total, matched: total - missing.length, missing };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/editor/completeness-checker.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(editor): add completeness checker for WangSet coverage validation
```

---

### Task 4: WangSetPanel — WangSet CRUD UI

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts`

No unit test for DOM rendering — test manually with `npm run dev` and open the editor with T key.

**Step 1: Add "New WangSet" button**

At the bottom of `render()`, after the keyboard hint, add a "+ New WangSet" button. On click, it creates a prompt for the name (or uses a default like "WangSet N"), then calls `state.addWangSet(name, 'corner')`.

**Step 2: Add delete button to WangSet header row**

In the WangSet header `div` (inside the `wangsets.forEach` loop), add a small "x" button. On click, show `confirm('Delete WangSet "X"?')`. If confirmed, call `state.removeWangSet(wsIndex)`.

**Step 3: Add inline rename on double-click**

On the WangSet name `span`, add a `dblclick` listener that replaces the span with an `<input>` pre-filled with the current name. On Enter or blur, call `state.renameWangSet(wsIndex, input.value)` and re-render.

**Step 4: Test manually**

Run: `npm run dev`, open browser, press T to open editor.
- Click "+ New WangSet" — a new set appears and is selected
- Double-click name — editable, Enter saves
- Click "x" — confirms and removes

**Step 5: Commit**

```
feat(editor): add WangSet create, rename, delete UI
```

---

### Task 5: WangSetPanel — WangColor CRUD UI

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts`

**Step 1: Add "Add Color" button**

Below the colors list for the active WangSet, add a "+ Add Color" button. On click, generate a default name ("Color N") and a random hue color, then call `state.addColor(name, hexColor)`.

**Step 2: Add color swatch picker**

Replace the static color swatch `div` with a hidden `<input type="color">`. Clicking the swatch opens the native color picker. On `input` event, call `state.updateColor(colorIndex, { color: input.value })`.

**Step 3: Add inline name editing**

On the color name label, add a `dblclick` listener that replaces it with an `<input>`. On Enter or blur, call `state.updateColor(colorIndex, { name: input.value })`.

**Step 4: Add delete button to each color row**

Small "x" button on each color row. On click, `confirm('Delete color "X"? This clears it from all tagged tiles.')`. If confirmed, call `state.removeColor(colorIndex)`.

**Step 5: Test manually**

Run `npm run dev`, press T:
- Click "+ Add Color" — new color appears with random swatch
- Click swatch — color picker opens, changing updates overlays
- Double-click name — editable
- Click "x" — removes color, tagged tile wangids update

**Step 6: Commit**

```
feat(editor): add WangColor create, edit, delete UI
```

---

### Task 6: Completeness status display

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts`

**Step 1: Add completeness status below colors list**

After the colors list and "Add Color" button, render a status line. Import `checkCompleteness` and call it with the active WangSet. Display:
- Green text "16/16 complete" when all present
- Yellow text "14/16 — 2 missing" when incomplete
- Nothing when no colors are defined

**Step 2: Add expandable missing list**

Make the status line clickable. When clicked, toggle a detail panel below it that lists each missing combination as readable text: "TL=Dirt, TR=Grass, BR=Grass, BL=Dirt" (using color names from the WangSet).

**Step 3: Test manually**

- With the existing terrain metadata, check that "Terrain" WangSet shows correct coverage stats
- Remove a wangtile tag, verify the count updates
- Click the status to see missing combos

**Step 4: Commit**

```
feat(editor): add completeness validation status to WangSet panel
```

---

### Task 7: Run full test suite and final verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including new editor tests

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual end-to-end verification**

Run: `npm run dev`, press T to open editor:
1. Create a new WangSet, add 2 colors
2. Tag a few tiles using the inspector zone grid
3. Verify completeness status updates
4. Rename a color, rename the WangSet
5. Delete a color, verify wangid references shift
6. Delete the WangSet
7. Verify the original "Terrain" WangSet still works
8. Close editor, paint on map, verify autotile still works

**Step 4: Commit any fixes**

```
fix(editor): address issues found in end-to-end testing
```
