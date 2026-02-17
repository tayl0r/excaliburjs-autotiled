# WangColor UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add probability editing and representative tile picking to WangColor rows in the WangSet panel.

**Architecture:** Extend the existing `createColorRow` in `WangSetPanel` with two new inline elements. Pass the spritesheet `HTMLImageElement` into `WangSetPanel` so it can render tile thumbnails. Add tests for `updateColor` with probability and tile fields. No new files — all changes in existing editor files.

**Tech Stack:** TypeScript, vanilla DOM, Canvas API, Vitest

---

### Task 1: Tests for updateColor with probability and tile fields

**Files:**
- Modify: `tests/editor/editor-state.test.ts`

**Step 1: Write failing tests**

Append to the `EditorState WangColor CRUD` describe block in `tests/editor/editor-state.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they pass (these exercise existing `updateColor` logic)**

Run: `npx vitest run tests/editor/editor-state.test.ts`
Expected: PASS — `updateColor` already supports `probability` and `tile` via `Object.assign`. These tests confirm the existing behavior works for these fields.

**Step 3: Commit**

```
test(editor): add tests for updateColor probability and tile fields
```

---

### Task 2: Pass spritesheet image to WangSetPanel

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts:12-21` (constructor)
- Modify: `src/editor/tile-editor.ts:36` (construction call)

**Step 1: Add image parameter to WangSetPanel constructor**

In `src/editor/panels/wangset-panel.ts`, change the constructor to accept and store the image:

```typescript
// Add field after line 19 (private colorPickerOpen = false;)
private image: HTMLImageElement;

// Change constructor signature from:
constructor(state: EditorState) {
// to:
constructor(state: EditorState, image: HTMLImageElement) {
```

And store it:
```typescript
this.image = image;
```

**Step 2: Update TileEditor to pass image**

In `src/editor/tile-editor.ts:36`, change:
```typescript
this.wangSetPanel = new WangSetPanel(this.state);
```
to:
```typescript
this.wangSetPanel = new WangSetPanel(this.state, image);
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```
refactor(editor): pass spritesheet image to WangSetPanel
```

---

### Task 3: Add probability badge to color row

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts:275-374` (`createColorRow` method)

**Step 1: Add probability badge after the name label**

In `createColorRow`, after the name label block (after `row.appendChild(label);` at line 342) and before the keyboard shortcut badge (line 344), insert a probability badge for real colors:

```typescript
    // Probability badge (for real colors) — click to expand to inline input
    if (colorIndex !== undefined) {
      const ws = this.state.activeWangSet;
      const prob = ws?.colors[colorIndex]?.probability ?? 1.0;
      const probBadge = document.createElement('span');
      probBadge.textContent = `P:${prob}`;
      const isDefault = prob === 1.0;
      probBadge.style.cssText = `
        font-size: 10px; color: ${isDefault ? '#888' : '#eeb300'};
        background: #2a2a2a; padding: 0 4px;
        border-radius: 2px; border: 1px solid ${isDefault ? '#444' : '#887700'};
        cursor: pointer; user-select: none;
      `;
      probBadge.title = 'Click to edit probability';
      probBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startInlineProbabilityEdit(probBadge, colorIndex!);
      });
      row.appendChild(probBadge);
    }
```

**Step 2: Add the `startInlineProbabilityEdit` method**

Add after the `startInlineRenameColor` method (after line 269):

```typescript
  /**
   * Replace a probability badge with an inline number input.
   */
  private startInlineProbabilityEdit(badge: HTMLSpanElement, colorIndex: number): void {
    const ws = this.state.activeWangSet;
    if (!ws) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '1';
    input.step = '0.1';
    input.value = String(ws.colors[colorIndex].probability);
    input.style.cssText = `
      width: 48px; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 11px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0 && val <= 1) {
        this.state.updateColor(colorIndex, { probability: val });
      }
      this.render();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        this.render();
      }
    });
    input.addEventListener('blur', commit);

    badge.replaceWith(input);
    input.focus();
    input.select();
  }
```

**Step 3: Test manually**

Run: `npm run dev`, press T.
- Color rows should show `P:1` badges in dim gray
- Click a badge → number input appears
- Change to 0.5, press Enter → badge shows `P:0.5` in yellow
- Press Escape → reverts

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```
feat(editor): add probability badge with inline editing to color rows
```

---

### Task 4: Add representative tile thumbnail to color row

**Files:**
- Modify: `src/editor/panels/wangset-panel.ts:275-374` (`createColorRow` method)

**Step 1: Add tile thumbnail canvas at the start of the row**

In `createColorRow`, after the row div is created and before the swatch (before the `// Color swatch` comment at line 295), insert a tile thumbnail for real colors:

```typescript
    // Representative tile thumbnail (for real colors)
    if (colorIndex !== undefined) {
      const ws = this.state.activeWangSet;
      const repTile = ws?.colors[colorIndex]?.tile ?? -1;
      const thumb = document.createElement('canvas');
      thumb.width = 14;
      thumb.height = 14;
      thumb.style.cssText = `
        width: 14px; height: 14px; flex-shrink: 0;
        border-radius: 2px;
        ${repTile === -1
          ? 'border: 1px dashed rgba(255,255,255,0.2);'
          : 'border: 1px solid rgba(255,255,255,0.3);'}
      `;

      if (repTile >= 0) {
        const ctx = thumb.getContext('2d');
        if (ctx) {
          const { tileWidth, tileHeight, columns } = this.state.metadata;
          const sx = (repTile % columns) * tileWidth;
          const sy = Math.floor(repTile / columns) * tileHeight;
          ctx.drawImage(this.image, sx, sy, tileWidth, tileHeight, 0, 0, 14, 14);
        }
        thumb.title = `Representative tile #${repTile} (right-click to clear)`;
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.state.updateColor(colorIndex!, { tile: -1 });
        });
      } else {
        thumb.title = 'No representative tile set';
      }

      row.appendChild(thumb);
    }
```

**Step 2: Add "Set Rep Tile" button below the color list**

In the `render()` method, after the "+ Add Color" button block (after `colorsList.appendChild(addColorBtn);` at line 149), add the "Set Rep Tile" button:

```typescript
          // "Set Rep Tile" button — assigns selected tile as representative for active color
          const setRepBtn = document.createElement('button');
          setRepBtn.textContent = 'Set Rep Tile';
          const activeColor = this.state.activeColorId;
          const hasSelection = this.state.selectedTileId >= 0;
          const hasActiveColor = activeColor >= 1;
          setRepBtn.disabled = !hasSelection || !hasActiveColor;
          setRepBtn.title = hasSelection && hasActiveColor
            ? `Set tile #${this.state.selectedTileId} as representative for active color`
            : 'Select a tile and a color first';
          setRepBtn.style.cssText = `
            background: #333; color: ${setRepBtn.disabled ? '#666' : '#ccc'};
            border: 1px solid #555;
            cursor: ${setRepBtn.disabled ? 'not-allowed' : 'pointer'};
            font-size: 11px; padding: 4px 10px;
            border-radius: 3px; margin-top: 4px; width: 100%;
          `;
          setRepBtn.addEventListener('click', () => {
            if (this.state.selectedTileId >= 0 && this.state.activeColorId >= 1) {
              const ci = this.state.activeColorId - 1; // 0-based index
              this.state.updateColor(ci, { tile: this.state.selectedTileId });
            }
          });
          colorsList.appendChild(setRepBtn);
```

**Step 3: Listen to selectedTileChanged to refresh button state**

In the constructor, add another event listener (after the existing listeners around line 38):

```typescript
    this.state.on('selectedTileChanged', () => this.render());
```

**Step 4: Test manually**

Run: `npm run dev`, press T.
- Color rows should show a dashed-border placeholder at the start (no rep tile)
- Select a tile in the spritesheet, select a color, click "Set Rep Tile"
- The thumbnail should now show the tile image
- Right-click the thumbnail → clears back to dashed placeholder

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```
feat(editor): add representative tile thumbnail and picker to color rows
```

---

### Task 5: Run full test suite and final verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual end-to-end verification**

Run: `npm run dev`, press T to open editor:
1. Color rows show: [thumbnail] [swatch] [name] [P:1] [shortcut] [delete]
2. Click P:1 badge → input appears, change to 0.3, Enter → badge shows `P:0.3` in yellow
3. Press Escape in the input → reverts without saving
4. Select a tile in spritesheet, select Grass color, click "Set Rep Tile" → thumbnail appears
5. Right-click thumbnail → clears to dashed placeholder
6. "Set Rep Tile" button is disabled when no tile is selected
7. Undo reverts probability and rep tile changes
8. All existing features still work (color picker, rename, delete, etc.)

**Step 4: Commit any fixes**

```
fix(editor): address issues found in end-to-end testing
```
