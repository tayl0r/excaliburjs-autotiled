import { PrefabEditorState } from './prefab-state.js';
import { startInlineEdit } from '../editor/inline-edit.js';

export class PrefabListPanel {
  readonly element: HTMLDivElement;
  private state: PrefabEditorState;
  private listContainer: HTMLDivElement;

  constructor(state: PrefabEditorState) {
    this.state = state;

    this.element = document.createElement('div');

    const header = document.createElement('h3');
    header.textContent = 'Prefabs';
    header.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px;';
    this.element.appendChild(header);

    this.listContainer = document.createElement('div');
    this.element.appendChild(this.listContainer);

    this.state.on('prefabListChanged', () => this.render());
    this.state.on('activePrefabChanged', () => this.render());
    this.state.on('prefabDataChanged', () => this.render());

    this.render();
  }

  private render(): void {
    this.listContainer.replaceChildren();

    const prefabs = this.state.prefabs;

    if (prefabs.size === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No prefabs yet.';
      empty.style.cssText = 'color: #666; font-style: italic; padding: 8px 0;';
      this.listContainer.appendChild(empty);
    }

    for (const [name, prefab] of prefabs) {
      const isActive = name === this.state.activePrefabName;
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 6px;
        padding: 4px 6px; margin: 2px 0;
        cursor: pointer; border-radius: 3px;
        background: ${isActive ? '#3a3a6a' : 'transparent'};
        border: 1px solid ${isActive ? '#6666cc' : 'transparent'};
      `;
      row.addEventListener('click', () => this.state.setActivePrefab(name));

      const label = document.createElement('span');
      label.textContent = name;
      label.style.cssText = 'flex: 1; font-size: 12px;';
      label.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineRename(label, name);
      });
      row.appendChild(label);

      const tileCount = prefab.layers.reduce((sum, l) => sum + l.length, 0);
      const badge = document.createElement('span');
      badge.textContent = `${tileCount}`;
      badge.style.cssText = 'font-size: 10px; color: #888; background: #2a2a2a; padding: 0 4px; border-radius: 2px; border: 1px solid #444;';
      badge.title = `${tileCount} tiles`;
      row.appendChild(badge);

      row.appendChild(this.rowButton('\u2398', `Duplicate "${name}"`, () => {
        this.state.duplicatePrefab(name);
      }));
      row.appendChild(this.rowButton('\u00d7', `Delete "${name}"`, () => {
        if (confirm(`Delete prefab "${name}"?`)) {
          this.state.deletePrefab(name);
          this.deletePrefabFromServer(name);
        }
      }));

      this.listContainer.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ New Prefab';
    addBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      cursor: pointer; font-size: 11px; padding: 4px 10px;
      border-radius: 3px; margin-top: 8px; width: 100%;
    `;
    addBtn.addEventListener('click', () => {
      let n = this.state.prefabs.size + 1;
      let name = `Prefab ${n}`;
      while (this.state.prefabs.has(name)) { n++; name = `Prefab ${n}`; }
      this.state.createPrefab(name);
      const labels = this.listContainer.querySelectorAll('span');
      for (const span of labels) {
        if (span.textContent === name) {
          this.startInlineRename(span as HTMLSpanElement, name);
          break;
        }
      }
    });
    this.listContainer.appendChild(addBtn);
  }

  private rowButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = `
      background: #333; color: #ccc; border: none; cursor: pointer;
      font-size: 12px; line-height: 1; padding: 1px 5px;
      border-radius: 3px;
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  private startInlineRename(target: HTMLSpanElement, currentName: string): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = `
      flex: 1; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
      font-size: 12px; padding: 1px 4px; border-radius: 2px; outline: none;
    `;

    startInlineEdit(
      target,
      input,
      (inp) => {
        const newName = inp.value.trim();
        if (newName && newName !== currentName) {
          this.state.renamePrefab(currentName, newName);
          const prefab = this.state.prefabs.get(newName);
          if (prefab) {
            this.savePrefabToServer(newName, prefab);
            this.deletePrefabFromServer(currentName);
          }
        }
      },
      () => this.render(),
    );
  }

  private postApi(endpoint: string, body: Record<string, unknown>): void {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(console.error);
  }

  private savePrefabToServer(name: string, data: unknown): void {
    this.postApi('/api/save-prefab', { filename: `${name}.json`, data });
  }

  private deletePrefabFromServer(name: string): void {
    this.postApi('/api/delete-prefab', { filename: `${name}.json` });
  }
}
