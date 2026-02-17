import { EditorState } from '../editor-state.js';

/**
 * Animation management panel.
 * Shows animation definitions with collapsible frame lists,
 * inline editing for offsets, sync frames button, and add/delete controls.
 * Mounted in the left sidebar below the WangSet panel.
 */
export class AnimationPanel {
  readonly element: HTMLDivElement;
  private state: EditorState;
  private listContainer!: HTMLDivElement;
  private addFormVisible = false;
  /** Track which animation index is expanded (-1 = none) */
  private expandedIndex: number = -1;

  constructor(state: EditorState) {
    this.state = state;

    this.element = document.createElement('div');
    this.element.style.cssText = 'margin-top: 16px;';

    const header = document.createElement('h3');
    header.textContent = 'Animations';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    this.listContainer = document.createElement('div');
    this.element.appendChild(this.listContainer);

    this.state.on('metadataChanged', () => this.render());

    this.render();
  }

  render(): void {
    while (this.listContainer.firstChild) {
      this.listContainer.removeChild(this.listContainer.firstChild);
    }

    const animations = this.state.animations;

    if (animations.length === 0 && !this.addFormVisible) {
      const empty = document.createElement('div');
      empty.textContent = 'No animations defined.';
      empty.style.cssText = 'color: #666; font-style: italic; padding: 8px 0;';
      this.listContainer.appendChild(empty);
    } else {
      animations.forEach((anim, animIndex) => {
        const animDiv = document.createElement('div');
        animDiv.style.cssText = `
          margin-bottom: 8px;
          background: ${this.expandedIndex === animIndex ? '#2a2a5a' : 'transparent'};
          border-radius: 4px;
          padding: 6px;
        `;

        // Animation header row
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
          display: flex; align-items: center; gap: 6px;
          cursor: pointer; padding: 4px 0;
          font-weight: ${this.expandedIndex === animIndex ? '600' : '400'};
        `;
        headerRow.addEventListener('click', () => {
          this.expandedIndex = this.expandedIndex === animIndex ? -1 : animIndex;
          this.render();
        });

        // Name (supports inline rename on dblclick)
        const nameSpan = document.createElement('span');
        nameSpan.textContent = anim.name;
        nameSpan.style.cssText = 'flex: 1; font-size: 12px;';
        nameSpan.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.startInlineRename(nameSpan, animIndex);
        });
        headerRow.appendChild(nameSpan);

        // Frame count badge
        const badge = document.createElement('span');
        badge.textContent = `${anim.frameCount}f`;
        badge.style.cssText = 'font-size: 10px; color: #888; background: #333; padding: 1px 6px; border-radius: 3px;';
        headerRow.appendChild(badge);

        // Pattern badge
        const patternBadge = document.createElement('span');
        patternBadge.textContent = anim.pattern;
        patternBadge.style.cssText = 'font-size: 10px; color: #888; background: #333; padding: 1px 6px; border-radius: 3px;';
        headerRow.appendChild(patternBadge);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '\u00d7';
        deleteBtn.title = `Delete animation "${anim.name}"`;
        deleteBtn.style.cssText = `
          background: #333; color: #ccc; border: none; cursor: pointer;
          font-size: 14px; line-height: 1; padding: 2px 6px;
          border-radius: 3px;
        `;
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete animation "${anim.name}"?`)) {
            if (this.expandedIndex === animIndex) {
              this.expandedIndex = -1;
            } else if (this.expandedIndex > animIndex) {
              this.expandedIndex--;
            }
            this.state.removeAnimation(animIndex);
          }
        });
        headerRow.appendChild(deleteBtn);

        animDiv.appendChild(headerRow);

        // Expanded details
        if (this.expandedIndex === animIndex) {
          const detailsDiv = document.createElement('div');
          detailsDiv.style.cssText = 'margin-top: 4px; padding-left: 4px;';

          // Duration row
          const durationRow = document.createElement('div');
          durationRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 11px;';

          const durationLabel = document.createElement('span');
          durationLabel.textContent = 'Duration:';
          durationLabel.style.color = '#aaa';
          durationRow.appendChild(durationLabel);

          const durationInput = document.createElement('input');
          durationInput.type = 'number';
          durationInput.value = String(anim.frameDuration);
          durationInput.min = '1';
          durationInput.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; width: 60px;';
          durationInput.addEventListener('change', () => {
            const val = parseInt(durationInput.value, 10);
            if (!isNaN(val) && val > 0) {
              this.state.updateAnimation(animIndex, { frameDuration: val });
            }
          });
          durationInput.addEventListener('keydown', (e) => e.stopPropagation());
          durationRow.appendChild(durationInput);

          const msLabel = document.createElement('span');
          msLabel.textContent = 'ms';
          msLabel.style.color = '#888';
          durationRow.appendChild(msLabel);

          // Pattern select
          const patternLabel = document.createElement('span');
          patternLabel.textContent = 'Pattern:';
          patternLabel.style.cssText = 'color: #aaa; margin-left: 8px;';
          durationRow.appendChild(patternLabel);

          const patternSelect = document.createElement('select');
          patternSelect.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px;';
          const loopOpt = document.createElement('option');
          loopOpt.value = 'loop';
          loopOpt.textContent = 'loop';
          loopOpt.selected = anim.pattern === 'loop';
          const ppOpt = document.createElement('option');
          ppOpt.value = 'ping-pong';
          ppOpt.textContent = 'ping-pong';
          ppOpt.selected = anim.pattern === 'ping-pong';
          patternSelect.appendChild(loopOpt);
          patternSelect.appendChild(ppOpt);
          patternSelect.addEventListener('change', () => {
            this.state.updateAnimation(animIndex, { pattern: patternSelect.value as 'loop' | 'ping-pong' });
          });
          durationRow.appendChild(patternSelect);

          detailsDiv.appendChild(durationRow);

          // Frame list
          anim.frames.forEach((frame, frameIndex) => {
            const frameRow = document.createElement('div');
            frameRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 2px 0; font-size: 11px;';

            const frameLabel = document.createElement('span');
            frameLabel.textContent = frame.description ?? `Frame ${frameIndex + 1}`;
            frameLabel.style.cssText = 'color: #aaa; min-width: 60px;';
            frameRow.appendChild(frameLabel);

            const offsetLabel = document.createElement('span');
            offsetLabel.textContent = 'offset:';
            offsetLabel.style.color = '#888';
            frameRow.appendChild(offsetLabel);

            const offsetInput = document.createElement('input');
            offsetInput.type = 'number';
            offsetInput.value = String(frame.tileIdOffset);
            offsetInput.style.cssText = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; width: 60px;';
            offsetInput.addEventListener('change', () => {
              const val = parseInt(offsetInput.value, 10);
              if (!isNaN(val)) {
                this.state.setAnimationFrameOffset(animIndex, frameIndex, val);
              }
            });
            offsetInput.addEventListener('keydown', (e) => e.stopPropagation());
            frameRow.appendChild(offsetInput);

            detailsDiv.appendChild(frameRow);
          });

          // Sync Frames button
          const syncBtn = document.createElement('button');
          syncBtn.textContent = 'Sync Frames';
          syncBtn.title = 'Copy WangId assignments from frame 1 to all other frames';
          syncBtn.style.cssText = `
            background: #333; color: #ccc; border: 1px solid #555;
            cursor: pointer; font-size: 11px; padding: 4px 10px;
            border-radius: 3px; margin-top: 6px; width: 100%;
          `;
          syncBtn.addEventListener('click', () => {
            this.state.syncAnimationFrames(animIndex);
          });
          detailsDiv.appendChild(syncBtn);

          animDiv.appendChild(detailsDiv);
        }

        this.listContainer.appendChild(animDiv);
      });
    }

    // Add Animation form or button
    if (this.addFormVisible) {
      this.listContainer.appendChild(this.createAddForm());
    } else {
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add Animation';
      addBtn.style.cssText = `
        background: #333; color: #ccc; border: 1px solid #555;
        cursor: pointer; font-size: 11px; padding: 4px 10px;
        border-radius: 3px; margin-top: 8px; width: 100%;
      `;
      addBtn.addEventListener('click', () => {
        this.addFormVisible = true;
        this.render();
      });
      this.listContainer.appendChild(addBtn);
    }
  }

  /**
   * Create the inline "Add Animation" form.
   */
  private createAddForm(): HTMLDivElement {
    const form = document.createElement('div');
    form.style.cssText = `
      margin-top: 8px; padding: 8px;
      background: #2a2a5a; border-radius: 4px;
    `;

    const formTitle = document.createElement('div');
    formTitle.textContent = 'New Animation';
    formTitle.style.cssText = 'font-size: 12px; font-weight: 600; margin-bottom: 6px;';
    form.appendChild(formTitle);

    const inputStyle = 'background: #1e1e3a; color: #e0e0e0; border: 1px solid #555; font-size: 11px; padding: 2px 4px; border-radius: 3px; width: 100%; box-sizing: border-box;';

    // Name
    const nameRow = this.createFormRow('Name:');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = 'Animation';
    nameInput.style.cssText = inputStyle;
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // Frame count
    const countRow = this.createFormRow('Frames:');
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.value = '3';
    countInput.min = '1';
    countInput.style.cssText = inputStyle;
    countInput.addEventListener('keydown', (e) => e.stopPropagation());
    countRow.appendChild(countInput);
    form.appendChild(countRow);

    // Duration
    const durRow = this.createFormRow('Duration (ms):');
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.value = '200';
    durInput.min = '1';
    durInput.style.cssText = inputStyle;
    durInput.addEventListener('keydown', (e) => e.stopPropagation());
    durRow.appendChild(durInput);
    form.appendChild(durRow);

    // Pattern
    const patRow = this.createFormRow('Pattern:');
    const patSelect = document.createElement('select');
    patSelect.style.cssText = inputStyle;
    const loopOpt = document.createElement('option');
    loopOpt.value = 'loop';
    loopOpt.textContent = 'loop';
    loopOpt.selected = true;
    const ppOpt = document.createElement('option');
    ppOpt.value = 'ping-pong';
    ppOpt.textContent = 'ping-pong';
    patSelect.appendChild(loopOpt);
    patSelect.appendChild(ppOpt);
    patRow.appendChild(patSelect);
    form.appendChild(patRow);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';

    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create';
    createBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 4px 10px;
      border-radius: 3px; flex: 1;
    `;
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const frameCount = parseInt(countInput.value, 10);
      const frameDuration = parseInt(durInput.value, 10);
      const pattern = patSelect.value as 'loop' | 'ping-pong';

      if (!name) return;
      if (isNaN(frameCount) || frameCount < 1) return;
      if (isNaN(frameDuration) || frameDuration < 1) return;

      this.state.addAnimation(name, frameCount, frameDuration, pattern);
      this.addFormVisible = false;
      this.expandedIndex = this.state.animations.length - 1;
      this.render();
    });
    btnRow.appendChild(createBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 4px 10px;
      border-radius: 3px; flex: 1;
    `;
    cancelBtn.addEventListener('click', () => {
      this.addFormVisible = false;
      this.render();
    });
    btnRow.appendChild(cancelBtn);

    form.appendChild(btnRow);
    return form;
  }

  /**
   * Create a labeled form row.
   */
  private createFormRow(labelText: string): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 3px 0; font-size: 11px;';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'color: #aaa; min-width: 80px;';
    row.appendChild(label);

    return row;
  }

  /**
   * Replace an animation name span with an inline text input for renaming.
   */
  private startInlineRename(span: HTMLSpanElement, animIndex: number): void {
    const anims = this.state.animations;
    if (!anims[animIndex]) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = anims[animIndex].name;
    input.style.cssText = `
      flex: 1; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 12px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== anims[animIndex]?.name) {
        this.state.updateAnimation(animIndex, { name: newName });
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

    span.replaceWith(input);
    input.focus();
    input.select();
  }
}
