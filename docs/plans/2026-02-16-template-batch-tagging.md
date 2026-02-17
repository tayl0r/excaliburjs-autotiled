# Template Batch Tagging (Method B) Design

**Goal:** Add a 4x4 template view for quickly assigning WangIds to 16 tiles at once using click-to-assign and auto-fill.

**Interaction model:** Click a template slot to select it, then click a tile in the spritesheet to assign. Auto-fill assigns all 16 from a 4x4 grid origin.

## UI

- Color A / Color B dropdowns at top
- 4x4 grid of template slots showing expected corner patterns
- Empty slots: dashed border with corner color indicators
- Filled slots: tile image preview
- Active slot: yellow border on click
- Auto-fill button: assigns 16 tiles from spritesheet starting at selected tile
- Clear button per slot

## Assignment flow

1. User clicks template slot → highlighted
2. User clicks spritesheet tile → WangId assigned based on slot's corner pattern
3. Slot shows tile image, spritesheet overlays update

## Auto-fill

Starting tile ID + row * columns + col for each of the 16 slots in the 4x4 binary counting pattern (TL=bit3, TR=bit2, BR=bit1, BL=bit0).

## Files

- New: `src/editor/panels/template-panel.ts`
- Modify: `src/editor/tile-editor.ts`
- Modify: `src/editor/editor-state.ts`
- Modify: `src/editor/panels/tileset-panel.ts`
