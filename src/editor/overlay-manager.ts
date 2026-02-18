/**
 * Manages the editor HTML overlay lifecycle and layout.
 * CSS grid: left sidebar (280px) | center spritesheet viewer | right inspector (280px)
 */
export class OverlayManager {
  private overlay: HTMLDivElement;
  private topBar!: HTMLDivElement;
  private leftSidebar!: HTMLDivElement;
  private centerPanel!: HTMLDivElement;
  private rightPanel!: HTMLDivElement;
  private _active = false;

  constructor() {
    this.overlay = document.getElementById('editor-overlay') as HTMLDivElement;
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'editor-overlay';
      document.body.appendChild(this.overlay);
    }
    this.setupLayout();
  }

  private setupLayout(): void {
    this.overlay.style.cssText = `
      display: none;
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 100;
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
    `;

    this.overlay.replaceChildren();

    // CSS grid layout
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: 280px 1fr 280px;
      grid-template-rows: 40px 1fr;
      height: 100%;
      width: 100%;
      gap: 0;
    `;

    // Top bar
    this.topBar = document.createElement('div');
    this.topBar.style.cssText = `
      grid-column: 1 / -1;
      background: #16213e;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-bottom: 1px solid #333;
    `;
    const title = document.createElement('span');
    title.textContent = 'Tile Metadata Editor';
    title.style.cssText = 'font-weight: 600; font-size: 14px;';
    this.topBar.appendChild(title);

    // Spacer to push close button to the right
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.topBar.appendChild(spacer);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close (Esc)';
    closeBtn.style.cssText = `
      background: #333; color: #ccc; border: 1px solid #555;
      padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    this.topBar.appendChild(closeBtn);

    // Left sidebar (WangSet panel)
    this.leftSidebar = document.createElement('div');
    this.leftSidebar.style.cssText = `
      background: #1e1e3a;
      border-right: 1px solid #333;
      overflow-y: auto;
      padding: 8px;
    `;

    // Center (spritesheet viewer)
    this.centerPanel = document.createElement('div');
    this.centerPanel.style.cssText = `
      background: #12122a;
      overflow: auto;
      position: relative;
    `;

    // Right sidebar (inspector)
    this.rightPanel = document.createElement('div');
    this.rightPanel.style.cssText = `
      background: #1e1e3a;
      border-left: 1px solid #333;
      overflow-y: auto;
      padding: 8px;
    `;

    grid.appendChild(this.topBar);
    grid.appendChild(this.leftSidebar);
    grid.appendChild(this.centerPanel);
    grid.appendChild(this.rightPanel);
    this.overlay.appendChild(grid);
  }

  get isActive(): boolean {
    return this._active;
  }

  show(): void {
    this._active = true;
    this.overlay.style.display = 'block';
  }

  hide(): void {
    this._active = false;
    this.overlay.style.display = 'none';
  }

  toggle(): void {
    if (this._active) this.hide();
    else this.show();
  }

  /** Mount an element into the top bar (inserted before the spacer/close button) */
  mountTopBar(element: HTMLElement): void {
    const spacer = this.topBar.querySelector('[style*="flex: 1"]') ?? this.topBar.lastChild;
    this.topBar.insertBefore(element, spacer);
  }

  /** Mount an element into the left sidebar */
  mountLeft(element: HTMLElement): void {
    this.leftSidebar.appendChild(element);
  }

  /** Mount an element into the center panel */
  mountCenter(element: HTMLElement): void {
    this.centerPanel.appendChild(element);
  }

  /** Mount an element into the right panel */
  mountRight(element: HTMLElement): void {
    this.rightPanel.appendChild(element);
  }

  /** Get the center panel container (for sizing calculations) */
  getCenterContainer(): HTMLDivElement {
    return this.centerPanel;
  }
}
