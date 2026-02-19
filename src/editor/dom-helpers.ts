/**
 * Shared DOM construction helpers for the tileset editor panels.
 * Reduces repetitive element creation and inline style strings.
 */

// --- Common style constants ---

export const PANEL_BTN_STYLE = `
  background: #333; color: #ccc; border: 1px solid #555;
  cursor: pointer; font-size: 11px; padding: 4px 10px;
  border-radius: 3px;
`;

export const DANGER_BTN_STYLE = `
  background: #4a2020; color: #ccc; border: 1px solid #633;
  padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;
`;

export const DELETE_BTN_STYLE = `
  background: #333; color: #ccc; border: none; cursor: pointer;
  font-size: 12px; line-height: 1; padding: 1px 5px;
  border-radius: 3px;
`;

export const INPUT_STYLE = `
  background: #1e1e3a; color: #e0e0e0; border: 1px solid #555;
  font-size: 11px; padding: 2px 4px; border-radius: 3px;
`;

export const SELECT_STYLE = INPUT_STYLE;

export const INLINE_EDIT_STYLE = `
  flex: 1; background: #1e1e3a; color: #e0e0e0; border: 1px solid #6666cc;
  font-size: 12px; padding: 1px 4px; border-radius: 2px; outline: none;
`;

export const SECTION_HEADER_STYLE = `
  margin: 0 0 8px 0; font-size: 13px; color: #aaa;
  text-transform: uppercase; letter-spacing: 1px;
`;

export const TAB_BASE_STYLE = `
  padding: 5px 14px; border: none; cursor: pointer;
  font-size: 11px; font-family: inherit;
`;

// --- Element creation helpers ---

/** Create a styled `<h3>` section header */
export function sectionHeader(text: string, extraStyle = ''): HTMLHeadingElement {
  const h = document.createElement('h3');
  h.textContent = text;
  h.style.cssText = SECTION_HEADER_STYLE + extraStyle;
  return h;
}

/** Create a styled `<button>` */
export function panelButton(text: string, style = PANEL_BTN_STYLE): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = style;
  return btn;
}

/** Create a small close/delete button with the x character */
export function deleteButton(title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = '\u00d7';
  btn.title = title;
  btn.style.cssText = DELETE_BTN_STYLE;
  return btn;
}

/** Create a small badge `<span>` (e.g. keyboard shortcuts, probability) */
export function badge(text: string, opts?: { highlight?: boolean }): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  const hi = opts?.highlight ?? false;
  span.style.cssText = `
    font-size: 10px; color: ${hi ? '#eeb300' : '#888'};
    background: #2a2a2a; padding: 0 4px;
    border-radius: 2px; border: 1px solid ${hi ? '#887700' : '#444'};
  `;
  return span;
}

/** Create a `<select>` element pre-populated with options */
export function selectInput(
  items: Array<{ value: string; text: string; disabled?: boolean }>,
  selectedValue: string,
  style = SELECT_STYLE,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.style.cssText = style;
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.text;
    if (item.disabled) opt.disabled = true;
    if (item.value === selectedValue) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

/** Create a labeled number `<input>` */
export function numberInput(value: number, opts?: {
  min?: string;
  max?: string;
  step?: string;
  width?: string;
  style?: string;
}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  if (opts?.min !== undefined) input.min = opts.min;
  if (opts?.max !== undefined) input.max = opts.max;
  if (opts?.step !== undefined) input.step = opts.step;
  const w = opts?.width ?? '50px';
  input.style.cssText = (opts?.style ?? INPUT_STYLE) + `; width: ${w};`;
  return input;
}

/** Create a text `<input>` for inline editing */
export function textInput(value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.style.cssText = INLINE_EDIT_STYLE;
  return input;
}

/** Apply active/inactive tab styling to a button */
export function applyTabStyle(btn: HTMLButtonElement, isActive: boolean): void {
  btn.style.cssText = `
    ${TAB_BASE_STYLE}
    background: ${isActive ? '#1e1e3a' : 'transparent'};
    color: ${isActive ? '#e0e0e0' : '#666'};
    border-bottom: 2px solid ${isActive ? '#6666cc' : 'transparent'};
  `;
}

/** Create a probability badge that is clickable for inline editing */
export function probabilityBadge(probability: number): HTMLSpanElement {
  const isDefault = probability === 1.0;
  const span = badge(`P:${+probability.toPrecision(4)}`, { highlight: !isDefault });
  span.style.cursor = 'pointer';
  span.style.userSelect = 'none';
  span.title = 'Click to edit probability';
  return span;
}
