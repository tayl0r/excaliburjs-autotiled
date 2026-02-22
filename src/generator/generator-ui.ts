import type { ProjectMetadata } from '../core/metadata-schema.js';
import type { WangSet } from '../core/wang-set.js';
import type { WangColor } from '../core/wang-color.js';
import { wangColorHex } from '../core/wang-color.js';
import { loadMetadata } from '../core/metadata-loader.js';
import { computeColorDistances } from '../core/color-distance.js';
import { generateAllVariants } from '../core/variant-generator.js';
import { generateMap, type BiomeConfig, type GeneratorSettings } from '../core/map-generator.js';
import { NUM_MAP_LAYERS } from '../core/layers.js';
import type { SavedMap } from '../core/map-schema.js';

// --- Style constants ---
const FONT_FAMILY = "'Segoe UI', system-ui, sans-serif";
const BG_COLOR = '#1a1a2e';
const PANEL_COLOR = '#16213e';
const TEXT_COLOR = '#ccc';
const TEXT_BRIGHT = '#e0e0e0';
const BORDER_COLOR = '#333';
const ACCENT = '#6666cc';
const ACCENT_HOVER = '#7777dd';

const BTN_BASE = `padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: ${FONT_FAMILY};`;
const BTN_STYLE = `background: #333; color: ${TEXT_COLOR}; border: 1px solid #555; ${BTN_BASE}`;
const BTN_ACTIVE = `background: ${ACCENT}; color: #fff; border: 1px solid #8888ee; ${BTN_BASE}`;
const INPUT_STYLE = `background: #252545; color: ${TEXT_BRIGHT}; border: 1px solid ${BORDER_COLOR}; border-radius: 3px; padding: 4px 8px; font-size: 12px; font-family: ${FONT_FAMILY};`;
const LABEL_STYLE = `color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;`;
const SELECT_STYLE = `background: #252545; color: ${TEXT_BRIGHT}; border: 1px solid ${BORDER_COLOR}; border-radius: 3px; padding: 4px 6px; font-size: 12px; font-family: ${FONT_FAMILY}; cursor: pointer;`;

interface BiomeRow {
  colorId: number;
  name: string;
  hex: string;
  checkbox: HTMLInputElement;
  slider: HTMLInputElement;
  weightLabel: HTMLSpanElement;
}

type Algorithm = 'noise' | 'voronoi' | 'zones';

export class GeneratorUI {
  private container: HTMLElement;
  private wangSet: WangSet;
  private wangSetName: string;
  private colors: WangColor[];

  // UI elements
  private algorithm: Algorithm = 'noise';
  private noiseBtn!: HTMLButtonElement;
  private voronoiBtn!: HTMLButtonElement;
  private zonesBtn!: HTMLButtonElement;
  private biomeRows: BiomeRow[] = [];
  private biomesSection!: HTMLDivElement;
  private zoneBiomesSection!: HTMLDivElement;
  private zoneSelects: HTMLSelectElement[] = [];
  private connectivityStatus!: HTMLDivElement;
  private widthInput!: HTMLInputElement;
  private heightInput!: HTMLInputElement;
  private seedInput!: HTMLInputElement;
  private scaleRow!: HTMLDivElement;
  private scaleSlider!: HTMLInputElement;
  private scaleLabel!: HTMLSpanElement;
  private pointCountRow!: HTMLDivElement;
  private pointCountSlider!: HTMLInputElement;
  private pointCountLabel!: HTMLSpanElement;
  private varietyRow!: HTMLDivElement;
  private varietySlider!: HTMLInputElement;
  private varietyLabel!: HTMLSpanElement;
  private boundaryNoiseRow!: HTMLDivElement;
  private boundaryNoiseSlider!: HTMLInputElement;
  private boundaryNoiseLabel!: HTMLSpanElement;
  private generateBtn!: HTMLButtonElement;
  private saveInput!: HTMLInputElement;
  private saveBtn!: HTMLButtonElement;
  private canvas!: HTMLCanvasElement;
  private feedbackEl!: HTMLDivElement;

  // State
  private generatedColors: number[] | null = null;
  private generatedWidth = 0;
  private generatedHeight = 0;

  constructor(container: HTMLElement, metadata: ProjectMetadata) {
    this.container = container;

    const { wangSets, transformations } = loadMetadata(metadata);
    const ws = wangSets[0];
    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);
    ws.setVariants(generateAllVariants(ws, transformations));
    this.wangSet = ws;
    this.wangSetName = metadata.wangsets[0].name;
    this.colors = this.wangSet.colors;

    this.build();
    this.updateAlgorithmUI();
    this.randomizeSeed();
  }

  // ── Layout ──────────────────────────────────────────────────────────

  private build(): void {
    this.container.style.cssText = `
      display: flex;
      width: 100%;
      height: 100vh;
      background: ${BG_COLOR};
      color: ${TEXT_BRIGHT};
      font-family: ${FONT_FAMILY};
      font-size: 13px;
      overflow: hidden;
      margin: 0;
    `;
    this.container.replaceChildren();

    // Left panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 280px;
      min-width: 280px;
      height: 100%;
      background: ${PANEL_COLOR};
      border-right: 1px solid ${BORDER_COLOR};
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0;
    `;

    panel.appendChild(this.buildHeader());
    panel.appendChild(this.buildAlgorithmToggle());
    panel.appendChild(this.buildDivider());
    this.biomesSection = this.buildBiomesSection();
    panel.appendChild(this.biomesSection);
    this.zoneBiomesSection = this.buildZoneBiomesSection();
    panel.appendChild(this.zoneBiomesSection);
    panel.appendChild(this.buildDivider());
    panel.appendChild(this.buildMapSizeSection());
    panel.appendChild(this.buildDivider());
    panel.appendChild(this.buildSeedSection());
    panel.appendChild(this.buildDivider());
    this.scaleRow = this.buildScaleSection();
    panel.appendChild(this.scaleRow);
    this.pointCountRow = this.buildPointCountSection();
    panel.appendChild(this.pointCountRow);
    this.varietyRow = this.buildVarietySection();
    panel.appendChild(this.varietyRow);
    this.boundaryNoiseRow = this.buildBoundaryNoiseSection();
    panel.appendChild(this.boundaryNoiseRow);
    panel.appendChild(this.buildDivider());
    panel.appendChild(this.buildGenerateSection());
    panel.appendChild(this.buildDivider());
    panel.appendChild(this.buildSaveSection());

    // Right preview area
    const preview = document.createElement('div');
    preview.style.cssText = `
      flex: 1;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${BG_COLOR};
      position: relative;
      overflow: hidden;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'image-rendering: pixelated;';
    preview.appendChild(this.canvas);

    // Empty state message
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = `
      position: absolute;
      color: #555;
      font-size: 14px;
      pointer-events: none;
      text-align: center;
      line-height: 1.6;
    `;
    emptyMsg.textContent = 'Click "Generate" to create a map preview';
    preview.appendChild(emptyMsg);
    // Hide message when canvas has content
    const origRender = this.renderPreview.bind(this);
    this.renderPreview = () => {
      origRender();
      emptyMsg.style.display = 'none';
    };

    // Feedback overlay
    this.feedbackEl = document.createElement('div');
    this.feedbackEl.style.cssText = `
      position: fixed;
      top: 12px;
      right: 16px;
      background: rgba(0,0,0,0.8);
      color: #aaa;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-family: ${FONT_FAMILY};
      z-index: 200;
      display: none;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(this.feedbackEl);

    this.container.appendChild(panel);
    this.container.appendChild(preview);

    // Re-render on window resize
    window.addEventListener('resize', () => {
      if (this.generatedColors) this.renderPreview();
    });
  }

  // ── Panel sections ──────────────────────────────────────────────────

  private buildHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 14px 16px 10px;
      border-bottom: 1px solid ${BORDER_COLOR};
    `;
    const title = document.createElement('h1');
    title.textContent = 'Map Generator';
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: ${TEXT_BRIGHT};
    `;
    header.appendChild(title);
    return header;
  }

  private buildAlgorithmToggle(): HTMLDivElement {
    const section = this.buildSection('Algorithm');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 4px;';

    this.noiseBtn = document.createElement('button');
    this.noiseBtn.textContent = 'Noise';
    this.noiseBtn.style.cssText = BTN_ACTIVE;
    this.noiseBtn.addEventListener('click', () => this.setAlgorithm('noise'));

    this.voronoiBtn = document.createElement('button');
    this.voronoiBtn.textContent = 'Voronoi';
    this.voronoiBtn.style.cssText = BTN_STYLE;
    this.voronoiBtn.addEventListener('click', () => this.setAlgorithm('voronoi'));

    this.zonesBtn = document.createElement('button');
    this.zonesBtn.textContent = 'Zones';
    this.zonesBtn.style.cssText = BTN_STYLE;
    this.zonesBtn.addEventListener('click', () => this.setAlgorithm('zones'));

    row.appendChild(this.noiseBtn);
    row.appendChild(this.voronoiBtn);
    row.appendChild(this.zonesBtn);
    section.appendChild(row);
    return section;
  }

  private buildBiomesSection(): HTMLDivElement {
    const section = this.buildSection('Biomes');

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    this.biomeRows = [];
    for (let i = 0; i < this.colors.length; i++) {
      const color = this.colors[i];
      const row = this.buildBiomeRow(color, i < 3);
      this.biomeRows.push(row);
      list.appendChild(row.checkbox.parentElement!.parentElement!);
    }

    section.appendChild(list);
    return section;
  }

  private buildBiomeRow(color: WangColor, defaultChecked: boolean): BiomeRow {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 4px 0;
    `;

    // Top row: checkbox + swatch + name
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = defaultChecked;
    checkbox.style.cssText = 'accent-color: ' + ACCENT + '; cursor: pointer; margin: 0;';

    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.15);
      background: ${color.color};
      flex-shrink: 0;
    `;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = color.name;
    nameSpan.style.cssText = `color: ${TEXT_BRIGHT}; font-size: 12px; flex: 1;`;

    const weightLabel = document.createElement('span');
    weightLabel.textContent = '50';
    weightLabel.style.cssText = 'color: #777; font-size: 11px; min-width: 24px; text-align: right;';

    topRow.appendChild(checkbox);
    topRow.appendChild(swatch);
    topRow.appendChild(nameSpan);
    topRow.appendChild(weightLabel);

    // Bottom row: weight slider (only visible when checked)
    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = `
      display: ${defaultChecked ? 'flex' : 'none'};
      align-items: center;
      gap: 6px;
      padding-left: 22px;
    `;

    const sliderLabel = document.createElement('span');
    sliderLabel.textContent = 'Weight';
    sliderLabel.style.cssText = 'color: #666; font-size: 10px; min-width: 36px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '100';
    slider.value = '50';
    slider.style.cssText = `flex: 1; accent-color: ${ACCENT}; height: 4px; cursor: pointer;`;

    slider.addEventListener('input', () => {
      weightLabel.textContent = slider.value;
    });

    checkbox.addEventListener('change', () => {
      sliderRow.style.display = checkbox.checked ? 'flex' : 'none';
      wrapper.style.opacity = checkbox.checked ? '1' : '0.5';
    });

    wrapper.style.opacity = defaultChecked ? '1' : '0.5';

    sliderRow.appendChild(sliderLabel);
    sliderRow.appendChild(slider);

    wrapper.appendChild(topRow);
    wrapper.appendChild(sliderRow);

    return {
      colorId: color.id,
      name: color.name,
      hex: color.color,
      checkbox,
      slider,
      weightLabel,
    };
  }

  private buildZoneBiomesSection(): HTMLDivElement {
    const section = this.buildSection('Zone Biomes');

    const defaultIds = this.getDefaultZoneBiomes();
    const zoneLabels = ['Center', 'NW', 'NE', 'SW', 'SE'];

    // Layout: NW/NE row, Center row, SW/SE row
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    `;

    this.zoneSelects = [];
    for (let i = 0; i < 5; i++) {
      this.zoneSelects.push(this.buildZoneSelect(defaultIds[i]));
    }

    // Row 1: NW, NE
    grid.appendChild(this.wrapZoneSelect(zoneLabels[1], this.zoneSelects[1]));
    grid.appendChild(this.wrapZoneSelect(zoneLabels[2], this.zoneSelects[2]));
    // Row 2: Center (spans 2 cols)
    const centerWrap = this.wrapZoneSelect(zoneLabels[0], this.zoneSelects[0]);
    centerWrap.style.gridColumn = '1 / -1';
    grid.appendChild(centerWrap);
    // Row 3: SW, SE
    grid.appendChild(this.wrapZoneSelect(zoneLabels[3], this.zoneSelects[3]));
    grid.appendChild(this.wrapZoneSelect(zoneLabels[4], this.zoneSelects[4]));

    section.appendChild(grid);

    // Connectivity status
    this.connectivityStatus = document.createElement('div');
    this.connectivityStatus.style.cssText = 'margin-top: 8px; font-size: 11px; line-height: 1.5;';
    section.appendChild(this.connectivityStatus);

    this.updateConnectivityStatus();
    return section;
  }

  private buildZoneSelect(defaultId: number): HTMLSelectElement {
    const select = document.createElement('select');
    select.style.cssText = SELECT_STYLE + ' width: 100%;';

    for (const color of this.colors) {
      const opt = document.createElement('option');
      opt.value = String(color.id);
      opt.textContent = color.name;
      select.appendChild(opt);
    }

    select.value = String(defaultId);
    select.addEventListener('change', () => this.updateConnectivityStatus());
    return select;
  }

  private wrapZoneSelect(label: string, select: HTMLSelectElement): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'color: #666; font-size: 10px;';

    wrapper.appendChild(lbl);
    wrapper.appendChild(select);
    return wrapper;
  }

  private getDefaultZoneBiomes(): number[] {
    // 5 zones: [center, NW, NE, SW, SE]
    const ids = this.colors.map(c => c.id);
    if (ids.length >= 5) return ids.slice(0, 5);
    const result: number[] = [];
    for (let i = 0; i < 5; i++) {
      result.push(ids[i % ids.length]);
    }
    return result;
  }

  private updateConnectivityStatus(): void {
    const biomes = this.zoneSelects.map(s => parseInt(s.value, 10));
    const zoneLabels = ['Center', 'NW', 'NE', 'SW', 'SE'];

    // Adjacent pairs: center touches all 4 corners, plus edge neighbors
    const adjacentPairs: [number, number][] = [
      [0, 1], [0, 2], [0, 3], [0, 4], // center ↔ each corner
      [1, 2], [3, 4],                   // NW↔NE, SW↔SE (horizontal)
      [1, 3], [2, 4],                   // NW↔SW, NE↔SE (vertical)
    ];

    const warnings: string[] = [];
    let allGood = true;

    for (const [a, b] of adjacentPairs) {
      const colorA = biomes[a];
      const colorB = biomes[b];
      if (colorA === colorB) continue;
      const dist = this.wangSet.colorDistance(colorA, colorB);
      if (dist > 2) {
        const nameA = this.colors.find(c => c.id === colorA)?.name ?? `Color ${colorA}`;
        const nameB = this.colors.find(c => c.id === colorB)?.name ?? `Color ${colorB}`;
        warnings.push(`${zoneLabels[a]}\u2194${zoneLabels[b]}: ${nameA}\u2194${nameB} (dist ${dist})`);
        allGood = false;
      }
    }

    this.connectivityStatus.replaceChildren();
    if (allGood) {
      this.connectivityStatus.style.color = '#6a6';
      this.connectivityStatus.textContent = 'Good connectivity';
    } else {
      this.connectivityStatus.style.color = '#cc6';
      this.connectivityStatus.appendChild(document.createTextNode('Wide transitions needed:'));
      for (const w of warnings) {
        this.connectivityStatus.appendChild(document.createElement('br'));
        this.connectivityStatus.appendChild(document.createTextNode(`\u00a0\u00a0\u2022 ${w}`));
      }
    }
  }

  private buildMapSizeSection(): HTMLDivElement {
    const section = this.buildSection('Map Size');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    this.widthInput = this.buildNumberInput(64, 10, 256, 'Width');
    this.heightInput = this.buildNumberInput(64, 10, 256, 'Height');

    const xLabel = document.createElement('span');
    xLabel.textContent = '\u00d7';
    xLabel.style.cssText = 'color: #666; font-size: 14px;';

    row.appendChild(this.wrapLabeledInput('W', this.widthInput));
    row.appendChild(xLabel);
    row.appendChild(this.wrapLabeledInput('H', this.heightInput));

    section.appendChild(row);
    return section;
  }

  private buildSeedSection(): HTMLDivElement {
    const section = this.buildSection('Seed');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    this.seedInput = document.createElement('input');
    this.seedInput.type = 'number';
    this.seedInput.value = '12345';
    this.seedInput.style.cssText = INPUT_STYLE + ' width: 100px; flex: 1;';

    const randomBtn = document.createElement('button');
    randomBtn.textContent = 'Randomize';
    randomBtn.style.cssText = BTN_STYLE;
    randomBtn.addEventListener('click', () => this.randomizeSeed());

    row.appendChild(this.seedInput);
    row.appendChild(randomBtn);

    section.appendChild(row);
    return section;
  }

  private buildScaleSection(): HTMLDivElement {
    const section = this.buildSection('Scale');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    this.scaleSlider = document.createElement('input');
    this.scaleSlider.type = 'range';
    this.scaleSlider.min = '0.01';
    this.scaleSlider.max = '0.2';
    this.scaleSlider.step = '0.005';
    this.scaleSlider.value = '0.05';
    this.scaleSlider.style.cssText = `flex: 1; accent-color: ${ACCENT}; cursor: pointer;`;

    this.scaleLabel = document.createElement('span');
    this.scaleLabel.textContent = '0.050';
    this.scaleLabel.style.cssText = 'color: #999; font-size: 11px; min-width: 36px; text-align: right; font-variant-numeric: tabular-nums;';

    this.scaleSlider.addEventListener('input', () => {
      this.scaleLabel.textContent = parseFloat(this.scaleSlider.value).toFixed(3);
    });

    row.appendChild(this.scaleSlider);
    row.appendChild(this.scaleLabel);
    section.appendChild(row);
    return section;
  }

  private buildPointCountSection(): HTMLDivElement {
    const section = this.buildSection('Point Count');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    this.pointCountSlider = document.createElement('input');
    this.pointCountSlider.type = 'range';
    this.pointCountSlider.min = '5';
    this.pointCountSlider.max = '100';
    this.pointCountSlider.step = '1';
    this.pointCountSlider.value = '30';
    this.pointCountSlider.style.cssText = `flex: 1; accent-color: ${ACCENT}; cursor: pointer;`;

    this.pointCountLabel = document.createElement('span');
    this.pointCountLabel.textContent = '30';
    this.pointCountLabel.style.cssText = 'color: #999; font-size: 11px; min-width: 24px; text-align: right; font-variant-numeric: tabular-nums;';

    this.pointCountSlider.addEventListener('input', () => {
      this.pointCountLabel.textContent = this.pointCountSlider.value;
    });

    row.appendChild(this.pointCountSlider);
    row.appendChild(this.pointCountLabel);
    section.appendChild(row);
    return section;
  }

  private buildVarietySection(): HTMLDivElement {
    const section = this.buildSection('Variety');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    this.varietySlider = document.createElement('input');
    this.varietySlider.type = 'range';
    this.varietySlider.min = '0';
    this.varietySlider.max = '30';
    this.varietySlider.step = '1';
    this.varietySlider.value = '15';
    this.varietySlider.style.cssText = `flex: 1; accent-color: ${ACCENT}; cursor: pointer;`;

    this.varietyLabel = document.createElement('span');
    this.varietyLabel.textContent = '15%';
    this.varietyLabel.style.cssText = 'color: #999; font-size: 11px; min-width: 32px; text-align: right; font-variant-numeric: tabular-nums;';

    this.varietySlider.addEventListener('input', () => {
      this.varietyLabel.textContent = this.varietySlider.value + '%';
    });

    row.appendChild(this.varietySlider);
    row.appendChild(this.varietyLabel);
    section.appendChild(row);
    return section;
  }

  private buildBoundaryNoiseSection(): HTMLDivElement {
    const section = this.buildSection('Boundary Noise');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    this.boundaryNoiseSlider = document.createElement('input');
    this.boundaryNoiseSlider.type = 'range';
    this.boundaryNoiseSlider.min = '0';
    this.boundaryNoiseSlider.max = '100';
    this.boundaryNoiseSlider.step = '1';
    this.boundaryNoiseSlider.value = '50';
    this.boundaryNoiseSlider.style.cssText = `flex: 1; accent-color: ${ACCENT}; cursor: pointer;`;

    this.boundaryNoiseLabel = document.createElement('span');
    this.boundaryNoiseLabel.textContent = '50%';
    this.boundaryNoiseLabel.style.cssText = 'color: #999; font-size: 11px; min-width: 32px; text-align: right; font-variant-numeric: tabular-nums;';

    this.boundaryNoiseSlider.addEventListener('input', () => {
      this.boundaryNoiseLabel.textContent = this.boundaryNoiseSlider.value + '%';
    });

    row.appendChild(this.boundaryNoiseSlider);
    row.appendChild(this.boundaryNoiseLabel);
    section.appendChild(row);
    return section;
  }

  private buildGenerateSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 12px 16px;';

    this.generateBtn = document.createElement('button');
    this.generateBtn.textContent = 'Generate Map';
    this.generateBtn.style.cssText = `
      width: 100%;
      padding: 10px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: ${FONT_FAMILY};
      background: ${ACCENT};
      color: #fff;
      border: 1px solid #8888ee;
      transition: background 0.15s;
    `;
    this.generateBtn.addEventListener('mouseenter', () => {
      this.generateBtn.style.background = ACCENT_HOVER;
    });
    this.generateBtn.addEventListener('mouseleave', () => {
      this.generateBtn.style.background = ACCENT;
    });
    this.generateBtn.addEventListener('click', () => this.generate());

    section.appendChild(this.generateBtn);
    return section;
  }

  private buildSaveSection(): HTMLDivElement {
    const section = this.buildSection('Save Map');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    this.saveInput = document.createElement('input');
    this.saveInput.type = 'text';
    this.saveInput.placeholder = 'map-name';
    this.saveInput.value = 'generated-map';
    this.saveInput.style.cssText = INPUT_STYLE + ' flex: 1;';

    this.saveBtn = document.createElement('button');
    this.saveBtn.textContent = 'Save';
    this.saveBtn.style.cssText = BTN_STYLE + ' opacity: 0.5; cursor: not-allowed;';
    this.saveBtn.disabled = true;
    this.saveBtn.addEventListener('click', () => this.save());

    row.appendChild(this.saveInput);
    row.appendChild(this.saveBtn);

    const hint = document.createElement('div');
    hint.textContent = 'Generate a map first to enable saving';
    hint.style.cssText = 'color: #555; font-size: 10px; margin-top: 4px;';
    this.saveBtn.addEventListener('mouseenter', () => {
      if (this.saveBtn.disabled) return;
      this.saveBtn.style.background = '#444';
    });
    this.saveBtn.addEventListener('mouseleave', () => {
      if (this.saveBtn.disabled) return;
      this.saveBtn.style.background = '#333';
    });

    section.appendChild(row);
    section.appendChild(hint);
    return section;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private buildSection(label: string): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = 'padding: 10px 16px;';

    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    section.appendChild(lbl);

    return section;
  }

  private buildDivider(): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = `height: 1px; background: ${BORDER_COLOR}; margin: 0;`;
    return div;
  }

  private buildNumberInput(defaultVal: number, min: number, max: number, placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(defaultVal);
    input.min = String(min);
    input.max = String(max);
    input.placeholder = placeholder;
    input.style.cssText = INPUT_STYLE + ' width: 60px;';
    return input;
  }

  private wrapLabeledInput(label: string, input: HTMLInputElement): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'color: #666; font-size: 11px;';

    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
  }

  // ── Algorithm toggle ────────────────────────────────────────────────

  private setAlgorithm(algo: Algorithm): void {
    this.algorithm = algo;
    this.updateAlgorithmUI();
  }

  private updateAlgorithmUI(): void {
    this.noiseBtn.style.cssText = this.algorithm === 'noise' ? BTN_ACTIVE : BTN_STYLE;
    this.voronoiBtn.style.cssText = this.algorithm === 'voronoi' ? BTN_ACTIVE : BTN_STYLE;
    this.zonesBtn.style.cssText = this.algorithm === 'zones' ? BTN_ACTIVE : BTN_STYLE;

    // Noise/Voronoi sections
    this.biomesSection.style.display = this.algorithm !== 'zones' ? 'block' : 'none';
    this.scaleRow.style.display = this.algorithm === 'noise' ? 'block' : 'none';
    this.pointCountRow.style.display = this.algorithm === 'voronoi' ? 'block' : 'none';

    // Zones sections
    this.zoneBiomesSection.style.display = this.algorithm === 'zones' ? 'block' : 'none';
    this.boundaryNoiseRow.style.display = this.algorithm === 'zones' ? 'block' : 'none';

    // Variety shown for all algorithms
    this.varietyRow.style.display = 'block';
  }

  // ── Seed ────────────────────────────────────────────────────────────

  private randomizeSeed(): void {
    this.seedInput.value = String(Math.floor(Math.random() * 1_000_000));
  }

  // ── Generation ──────────────────────────────────────────────────────

  private generate(): void {
    if (this.algorithm !== 'zones') {
      const enabledBiomes = this.getEnabledBiomes();
      if (enabledBiomes.length === 0) {
        this.showFeedback('Select at least one biome', true);
        return;
      }
    }

    const width = this.clampInt(this.widthInput.value, 10, 256, 64);
    const height = this.clampInt(this.heightInput.value, 10, 256, 64);
    const seed = parseInt(this.seedInput.value, 10) || 12345;
    const sprinkle = parseInt(this.varietySlider.value, 10) / 100;

    const settings: GeneratorSettings = {
      algorithm: this.algorithm,
      width,
      height,
      seed,
      biomes: this.getEnabledBiomes(),
      scale: parseFloat(this.scaleSlider.value),
      pointCount: parseInt(this.pointCountSlider.value, 10),
      sprinkle,
    };

    if (this.algorithm === 'zones') {
      settings.zoneBiomes = this.zoneSelects.map(s => parseInt(s.value, 10));
      settings.boundaryNoise = parseInt(this.boundaryNoiseSlider.value, 10) / 100;
    }

    const t0 = performance.now();
    this.generatedColors = generateMap(settings, this.wangSet);
    const elapsed = (performance.now() - t0).toFixed(0);
    this.generatedWidth = width;
    this.generatedHeight = height;

    this.renderPreview();
    this.enableSave();
    this.showFeedback(`Generated ${width}\u00d7${height} map in ${elapsed}ms`);
  }

  private getEnabledBiomes(): BiomeConfig[] {
    const biomes: BiomeConfig[] = [];
    for (const row of this.biomeRows) {
      if (row.checkbox.checked) {
        biomes.push({
          colorId: row.colorId,
          weight: parseInt(row.slider.value, 10),
        });
      }
    }
    return biomes;
  }

  private clampInt(val: string, min: number, max: number, fallback: number): number {
    const n = parseInt(val, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  // ── Preview rendering ──────────────────────────────────────────────

  private renderPreview(): void {
    if (!this.generatedColors) return;

    const parent = this.canvas.parentElement!;
    const availWidth = parent.clientWidth;
    const availHeight = parent.clientHeight;

    const cellSize = Math.max(1, Math.floor(Math.min(
      availWidth / this.generatedWidth,
      availHeight / this.generatedHeight,
    )));

    const canvasW = cellSize * this.generatedWidth;
    const canvasH = cellSize * this.generatedHeight;

    this.canvas.width = canvasW;
    this.canvas.height = canvasH;
    this.canvas.style.width = canvasW + 'px';
    this.canvas.style.height = canvasH + 'px';

    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Build color lookup from wangset colors
    const colorLookup = new Map<number, string>();
    colorLookup.set(0, BG_COLOR);
    for (const c of this.colors) {
      colorLookup.set(c.id, c.color);
    }

    for (let y = 0; y < this.generatedHeight; y++) {
      for (let x = 0; x < this.generatedWidth; x++) {
        const colorId = this.generatedColors[y * this.generatedWidth + x];
        if (colorId === 0) continue; // already filled with background

        let hex = colorLookup.get(colorId);
        if (!hex) {
          hex = wangColorHex(colorId);
          colorLookup.set(colorId, hex);
        }

        ctx.fillStyle = hex;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // ── Save ────────────────────────────────────────────────────────────

  private enableSave(): void {
    this.saveBtn.disabled = false;
    this.saveBtn.style.cssText = BTN_STYLE;
  }

  private async save(): Promise<void> {
    if (!this.generatedColors || this.saveBtn.disabled) return;

    const name = this.saveInput.value.trim();
    if (!name) {
      this.showFeedback('Enter a map name', true);
      return;
    }

    const size = this.generatedWidth * this.generatedHeight;
    const emptyLayer = new Array<number>(size).fill(0);
    const layers: number[][] = [this.generatedColors.slice()];
    for (let i = 1; i < NUM_MAP_LAYERS; i++) {
      layers.push(emptyLayer.slice());
    }

    const savedMap: SavedMap = {
      version: 2,
      name,
      wangSetName: this.wangSetName,
      width: this.generatedWidth,
      height: this.generatedHeight,
      layers,
      placedPrefabs: [],
    };

    this.saveBtn.disabled = true;
    this.saveBtn.style.opacity = '0.5';

    try {
      const resp = await fetch('/api/save-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `${name}.json`,
          data: savedMap,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());

      this.showFeedback(`Saved "${name}.json" successfully`);
    } catch (err) {
      console.error('Failed to save map:', err);
      this.showFeedback('Save failed \u2014 check console', true);
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.style.opacity = '1';
    }
  }

  // ── Feedback ────────────────────────────────────────────────────────

  private showFeedback(text: string, isError = false): void {
    this.feedbackEl.textContent = text;
    this.feedbackEl.style.color = isError ? '#f44' : '#aaa';
    this.feedbackEl.style.display = 'block';
    this.feedbackEl.style.opacity = '1';

    setTimeout(() => {
      this.feedbackEl.style.opacity = '0';
      setTimeout(() => { this.feedbackEl.style.display = 'none'; }, 300);
    }, 3000);
  }
}
