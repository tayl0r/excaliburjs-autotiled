# Template Batch Tagging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 4x4 template panel for click-to-assign and auto-fill batch tagging of 16 corner-type tiles.

**Architecture:** New `TemplatePanel` in the right sidebar, toggled via a tab button that switches between Inspector and Template views. EditorState gets a `templateMode` flag and `activeTemplateSlot` index. When template mode is on and a slot is selected, clicking a spritesheet tile assigns the WangId for that slot rather than opening the inspector.

**Tech Stack:** TypeScript, vanilla DOM, Vitest

---

### Task 1: EditorState — template mode state

**Files:**
- Modify: `src/editor/editor-state.ts`
- Modify: `tests/editor/editor-state.test.ts`

**Step 1: Write failing tests**

Append to `tests/editor/editor-state.test.ts`:

```typescript
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
    state.setActiveTemplateSlot(5);
    state.setTemplateMode(false);
    expect(state.activeTemplateSlot).toBe(-1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/editor/editor-state.test.ts`

**Step 3: Implement**

Add to `EditorState`:
- New events: `'templateModeChanged' | 'templateSlotChanged'` to the `EditorEvent` union
- Fields: `private _templateMode = false`, `private _activeTemplateSlot = -1`
- Getters: `get templateMode()`, `get activeTemplateSlot()`
- Methods:

```typescript
setTemplateMode(on: boolean): void {
  if (this._templateMode === on) return;
  this._templateMode = on;
  if (!on) this._activeTemplateSlot = -1;
  this.emit('templateModeChanged');
}

setActiveTemplateSlot(slot: number): void {
  if (this._activeTemplateSlot === slot) return;
  this._activeTemplateSlot = slot;
  this.emit('templateSlotChanged');
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```
feat(editor): add template mode state to EditorState
```

---

### Task 2: Template WangId generation utility

**Files:**
- Create: `src/editor/template-utils.ts`
- Create: `tests/editor/template-utils.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { templateSlotWangId, TEMPLATE_SLOTS } from '../../src/editor/template-utils.js';

describe('TEMPLATE_SLOTS', () => {
  it('has 16 entries', () => {
    expect(TEMPLATE_SLOTS).toHaveLength(16);
  });

  it('slot 0 is all-A (TL=A,TR=A,BR=A,BL=A)', () => {
    expect(TEMPLATE_SLOTS[0]).toEqual({ tl: 'A', tr: 'A', br: 'A', bl: 'A' });
  });

  it('slot 15 is all-B', () => {
    expect(TEMPLATE_SLOTS[15]).toEqual({ tl: 'B', tr: 'B', br: 'B', bl: 'B' });
  });

  it('slot 5 is TL=B,TR=A,BR=B,BL=A (binary 0101)', () => {
    expect(TEMPLATE_SLOTS[5]).toEqual({ tl: 'B', tr: 'A', br: 'B', bl: 'A' });
  });
});

describe('templateSlotWangId', () => {
  it('generates correct WangId for slot 0 with colorA=1, colorB=2', () => {
    const wangid = templateSlotWangId(0, 1, 2);
    // All corners = A (1), edges = 0
    expect(wangid).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('generates correct WangId for slot 15 with colorA=1, colorB=2', () => {
    const wangid = templateSlotWangId(15, 1, 2);
    expect(wangid).toEqual([0, 2, 0, 2, 0, 2, 0, 2]);
  });

  it('generates correct WangId for slot 3 (TL=B,TR=B,BR=A,BL=A) binary 1100', () => {
    const wangid = templateSlotWangId(3, 1, 2);
    // TL=B(2), TR=B(2), BR=A(1), BL=A(1)
    // wangid indices: 7=TL, 1=TR, 3=BR, 5=BL
    expect(wangid).toEqual([0, 2, 0, 1, 0, 1, 0, 2]);
  });

  it('works with arbitrary color IDs', () => {
    const wangid = templateSlotWangId(15, 3, 7);
    expect(wangid).toEqual([0, 7, 0, 7, 0, 7, 0, 7]);
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement `src/editor/template-utils.ts`**

```typescript
export interface TemplateSlot {
  tl: 'A' | 'B';
  tr: 'A' | 'B';
  br: 'A' | 'B';
  bl: 'A' | 'B';
}

/**
 * 16 template slots in binary counting order:
 * TL=bit3, TR=bit2, BR=bit1, BL=bit0
 */
export const TEMPLATE_SLOTS: TemplateSlot[] = Array.from({ length: 16 }, (_, i) => ({
  tl: (i & 8) ? 'B' : 'A',
  tr: (i & 4) ? 'B' : 'A',
  br: (i & 2) ? 'B' : 'A',
  bl: (i & 1) ? 'B' : 'A',
}));

/**
 * Build a corner-type WangId array for a template slot.
 * Edges (indices 0,2,4,6) are 0. Corners use colorA or colorB.
 */
export function templateSlotWangId(slotIndex: number, colorA: number, colorB: number): number[] {
  const slot = TEMPLATE_SLOTS[slotIndex];
  const resolve = (v: 'A' | 'B') => v === 'A' ? colorA : colorB;
  // WangId layout: [Top, TR, Right, BR, Bottom, BL, Left, TL]
  return [0, resolve(slot.tr), 0, resolve(slot.br), 0, resolve(slot.bl), 0, resolve(slot.tl)];
}
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```
feat(editor): add template slot WangId generation utility
```

---

### Task 3: TemplatePanel UI

**Files:**
- Create: `src/editor/panels/template-panel.ts`

This is the core UI task. No unit test (DOM panel) — verify manually.

**Implementation:**

Create `src/editor/panels/template-panel.ts`. The panel contains:

1. **Color A / Color B selectors** — two dropdown `<select>` elements populated from the active WangSet's colors. Default A = color 1, B = color 2.

2. **4x4 grid** — 16 cells in a CSS grid. Each cell:
   - Shows 4 small colored squares in the corners (matching the slot's A/B pattern using the selected color's display color)
   - When a tile is assigned: draws the tile image in the cell center
   - Click: calls `state.setActiveTemplateSlot(slotIndex)` — active slot gets yellow border
   - Right-click: clears the assigned tile for that slot (calls `state.removeWangTile(tileId)` and clears local mapping)

3. **Auto-fill button** — "Auto-fill from selected tile". Reads `state.selectedTileId` as the origin. For each of the 16 slots at `(row, col)` in the 4x4 grid: `tileId = origin + row * metadata.columns + col`. Calls `state.setWangId(tileId, templateSlotWangId(slot, colorA, colorB))` for each.

4. **Clear All button** — removes all 16 tile assignments.

The panel listens to `templateSlotChanged`, `metadataChanged`, `activeWangSetChanged` to re-render.

Store assigned tile IDs in a local `Map<number, number>` (slotIndex → tileId), rebuilt from wangtile data on render by matching wangids against each slot's expected pattern.

Style: same dark theme as other panels. Grid cells ~50px with 2px gap. Use canvas or `drawImage` on small canvases for tile previews within cells.

**Step 1: Create the file with full implementation**

**Step 2: Verify TypeScript compiles: `npx tsc --noEmit`**

**Step 3: Commit**

```
feat(editor): add TemplatePanel with 4x4 grid and auto-fill
```

---

### Task 4: Wire template panel into tile editor

**Files:**
- Modify: `src/editor/tile-editor.ts`
- Modify: `src/editor/panels/tileset-panel.ts`

**Step 1: Mount template panel in right sidebar**

In `tile-editor.ts`:
- Import `TemplatePanel`
- Create a tab bar at the top of the right panel with two buttons: "Inspector" and "Template"
- Mount both panels in the right sidebar, show/hide based on `state.templateMode`
- Wire tab clicks: Inspector sets `state.setTemplateMode(false)`, Template sets `state.setTemplateMode(true)`
- Listen to `templateModeChanged` to toggle panel visibility

**Step 2: Handle spritesheet click in template mode**

In `tileset-panel.ts`, modify the click handler:
- If `state.templateMode && state.activeTemplateSlot >= 0`:
  - Instead of `state.selectTile(tileId)`, assign the clicked tile to the active template slot
  - Import `templateSlotWangId` and call `state.setWangId(tileId, templateSlotWangId(slot, colorA, colorB))`
  - Need to know colorA/colorB — read from template panel state (add `templateColorA` and `templateColorB` to EditorState, or have the template panel expose them)

Actually, simpler approach: add `templateColorA` and `templateColorB` getters/setters to EditorState (default to 1 and 2). The template panel's dropdowns update these. The tileset panel reads them when assigning.

Add to EditorState:
```typescript
private _templateColorA: number = 1;
private _templateColorB: number = 2;

get templateColorA(): number { return this._templateColorA; }
get templateColorB(): number { return this._templateColorB; }

setTemplateColorA(colorId: number): void {
  this._templateColorA = colorId;
  this.emit('templateModeChanged');
}

setTemplateColorB(colorId: number): void {
  this._templateColorB = colorId;
  this.emit('templateModeChanged');
}
```

Then in tileset-panel.ts click handler:
```typescript
if (this.state.templateMode && this.state.activeTemplateSlot >= 0) {
  const wangid = templateSlotWangId(
    this.state.activeTemplateSlot,
    this.state.templateColorA,
    this.state.templateColorB,
  );
  this.state.setWangId(tileId, wangid);
  // Advance to next slot
  if (this.state.activeTemplateSlot < 15) {
    this.state.setActiveTemplateSlot(this.state.activeTemplateSlot + 1);
  }
  return;
}
```

The auto-advance to the next slot makes rapid clicking through the spritesheet efficient: click slot 0, click tile, automatically moves to slot 1, click next tile, etc.

**Step 3: Verify TypeScript compiles: `npx tsc --noEmit`**

**Step 4: Test manually**

Run: `npm run dev`, press T.
1. Click "Template" tab in right panel
2. Select Color A = Grass, Color B = Dirt
3. Click slot 0 in the template grid
4. Click a tile in the spritesheet → it gets assigned, slot advances to 1
5. Click "Auto-fill from selected tile" with a tile selected → all 16 slots fill
6. Verify spritesheet overlays update
7. Switch back to Inspector tab, click tiles, verify normal inspector still works

**Step 5: Commit**

```
feat(editor): wire template panel with tab switching and click-to-assign
```

---

### Task 5: Final verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All pass

**Step 2: Type check**

Run: `npx tsc --noEmit`

**Step 3: Manual end-to-end test**

1. Open editor, create a new WangSet with 2 colors
2. Switch to Template tab, select colors A and B
3. Click through all 16 slots assigning tiles
4. Switch to Inspector — verify WangIds are correct
5. Use auto-fill on an existing terrain block
6. Check completeness status — should show 16/16
7. Close editor, paint on map, verify autotile works with newly tagged tiles

**Step 4: Commit any fixes**
