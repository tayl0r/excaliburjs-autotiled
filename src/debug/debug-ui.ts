import type { ProjectMetadata, WangTileData } from '../core/metadata-schema.js';
import type { WangSet } from '../core/wang-set.js';
import { loadMetadata } from '../core/metadata-loader.js';
import { computeColorDistances } from '../core/color-distance.js';
import { generateAllVariants } from '../core/variant-generator.js';

const BG = '#1a1a2e';
const PANEL = '#16213e';
const BORDER = '#333';
const TEXT = '#e0e0e0';
const TEXT_DIM = '#999';
const FONT = "'Segoe UI', system-ui, sans-serif";

interface PrefabInfo {
  name: string;
  data: Record<string, unknown>;
}

export class DebugUI {
  private container: HTMLElement;

  constructor(
    container: HTMLElement,
    private metadata: ProjectMetadata,
    private prefabs: PrefabInfo[],
  ) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.style.cssText = `
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 32px 64px;
      background: ${BG};
      color: ${TEXT};
      font-family: ${FONT};
      font-size: 13px;
      line-height: 1.5;
    `;
    this.container.replaceChildren();

    const { wangSets, transformations } = loadMetadata(this.metadata);
    const ws = wangSets[0];
    const { distances, nextHop } = computeColorDistances(ws);
    ws.setDistanceMatrix(distances);
    ws.setNextHopMatrix(nextHop);
    const variants = generateAllVariants(ws, transformations);
    ws.setVariants(variants);

    const rawWs = this.metadata.wangsets[0];

    this.container.appendChild(this.heading('Autotile Debug'));

    // --- Tilesets ---
    this.container.appendChild(this.section('Tilesets'));
    for (let i = 0; i < this.metadata.tilesets.length; i++) {
      const ts = this.metadata.tilesets[i];
      this.container.appendChild(this.kvTable([
        ['Index', String(i)],
        ['Image', ts.tilesetImage],
        ['Tile Size', `${ts.tileWidth} x ${ts.tileHeight}`],
        ['Columns', String(ts.columns)],
        ['Total Tiles', String(ts.tileCount)],
      ]));
    }

    // --- WangSet Overview ---
    this.container.appendChild(this.section(`WangSet: ${ws.name}`));
    this.container.appendChild(this.kvTable([
      ['Type', ws.type],
      ['Colors', String(ws.colors.length)],
      ['Base Tiles', String(ws.tileCount)],
      ['Variants (with transforms)', String(variants.length)],
      ['Max Color Distance', String(ws.maxColorDistance)],
    ]));

    // --- Transformations ---
    this.container.appendChild(this.section('Transformations'));
    const tx = transformations;
    this.container.appendChild(this.kvTable([
      ['Rotate', tx.allowRotate ? 'Yes' : 'No'],
      ['Flip Horizontal', tx.allowFlipH ? 'Yes' : 'No'],
      ['Flip Vertical', tx.allowFlipV ? 'Yes' : 'No'],
      ['Prefer Untransformed', tx.preferUntransformed ? 'Yes' : 'No'],
    ]));

    // --- Colors ---
    this.container.appendChild(this.section('Colors'));
    this.container.appendChild(this.buildColorsTable(ws, rawWs.wangtiles));

    // --- Direct Connections ---
    this.container.appendChild(this.section('Direct Connections (Distance = 1)'));
    this.container.appendChild(this.buildConnectionsList(ws, distances));

    // --- Distance Matrix ---
    this.container.appendChild(this.section('Color Distance Matrix'));
    this.container.appendChild(this.buildDistanceMatrix(ws, distances));

    // --- Next-Hop Matrix ---
    this.container.appendChild(this.section('Next-Hop Matrix'));
    this.container.appendChild(this.para('Shows the first intermediate color on the shortest path from row to column.'));
    this.container.appendChild(this.buildNextHopMatrix(ws, nextHop));

    // --- Full Paths ---
    this.container.appendChild(this.section('Shortest Paths Between All Colors'));
    this.container.appendChild(this.buildPathsList(ws, distances, nextHop));

    // --- Tile-per-Color Stats ---
    this.container.appendChild(this.section('Tiles Per Color'));
    this.container.appendChild(this.buildTileColorStats(ws, rawWs.wangtiles));

    // --- Prefabs ---
    this.container.appendChild(this.section(`Prefabs (${this.prefabs.length})`));
    if (this.prefabs.length === 0) {
      this.container.appendChild(this.para('No prefabs found.'));
    } else {
      this.container.appendChild(this.buildPrefabsTable());
    }
  }

  // ── Colors Table ──────────────────────────────────────────────────

  private buildColorsTable(ws: WangSet, wangtiles: WangTileData[]): HTMLTableElement {
    const headers = ['ID', 'Color', 'Name', 'Probability', 'Rep Tile', 'Tiles Using', 'Animated Tiles'];

    // Count tiles per color and animated tiles per color
    const tileCount = new Map<number, number>();
    const animatedCount = new Map<number, number>();
    for (const wt of wangtiles) {
      const colorsInTile = new Set(wt.wangid.filter(c => c > 0));
      for (const c of colorsInTile) {
        tileCount.set(c, (tileCount.get(c) ?? 0) + 1);
        if (wt.animation) {
          animatedCount.set(c, (animatedCount.get(c) ?? 0) + 1);
        }
      }
    }

    const rows: (string | HTMLElement)[][] = [];
    for (const color of ws.colors) {
      const swatch = document.createElement('div');
      swatch.style.cssText = 'display: flex; align-items: center; gap: 6px;';
      const box = document.createElement('span');
      box.style.cssText = `display: inline-block; width: 16px; height: 16px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.15); background: ${color.color}; vertical-align: middle;`;
      const hex = document.createElement('code');
      hex.textContent = color.color;
      hex.style.cssText = 'color: #aaa; font-size: 11px;';
      swatch.appendChild(box);
      swatch.appendChild(hex);

      const tc = tileCount.get(color.id) ?? 0;
      const ac = animatedCount.get(color.id) ?? 0;

      rows.push([
        String(color.id),
        swatch,
        color.name,
        String(color.probability),
        color.imageTileId >= 0 ? `${color.tilesetIndex}:${color.imageTileId}` : '(none)',
        String(tc),
        ac > 0 ? String(ac) : '-',
      ]);
    }

    return this.table(headers, rows);
  }

  // ── Direct Connections ─────────────────────────────────────────────

  private buildConnectionsList(ws: WangSet, distances: number[][]): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;';

    for (let i = 1; i < distances.length; i++) {
      const colorA = ws.getColor(i);
      if (!colorA) continue;

      const connected: string[] = [];
      const indirect: string[] = [];

      for (let j = 1; j < distances.length; j++) {
        if (i === j) continue;
        const colorB = ws.getColor(j);
        if (!colorB) continue;
        if (distances[i][j] === 1) {
          connected.push(colorB.name);
        } else {
          indirect.push(`${colorB.name} (dist ${distances[i][j]})`);
        }
      }

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';

      const swatch = document.createElement('span');
      swatch.style.cssText = `display: inline-block; width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.15); background: ${colorA.color}; flex-shrink: 0; margin-top: 3px;`;

      const label = document.createElement('span');
      label.style.cssText = 'min-width: 60px; font-weight: 600;';
      label.textContent = colorA.name;

      const info = document.createElement('div');

      const connectLine = document.createElement('div');
      if (connected.length > 0) {
        const tag = document.createElement('span');
        tag.textContent = 'connects to: ';
        tag.style.color = '#4caf50';
        connectLine.appendChild(tag);
        connectLine.appendChild(document.createTextNode(connected.join(', ')));
      } else {
        const tag = document.createElement('span');
        tag.textContent = 'no direct connections';
        tag.style.color = '#f44336';
        connectLine.appendChild(tag);
      }
      info.appendChild(connectLine);

      if (indirect.length > 0) {
        const indirectLine = document.createElement('div');
        indirectLine.style.cssText = 'color: #999; font-size: 11px;';
        indirectLine.textContent = `indirect: ${indirect.join(', ')}`;
        info.appendChild(indirectLine);
      }

      row.appendChild(swatch);
      row.appendChild(label);
      row.appendChild(info);
      container.appendChild(row);
    }

    return container;
  }

  // ── Distance Matrix ─────────────────────────────────────────────────

  private buildDistanceMatrix(ws: WangSet, distances: number[][]): HTMLTableElement {
    const n = ws.colors.length;
    const headers = ['', ...ws.colors.map(c => c.name)];
    const rows: (string | HTMLElement)[][] = [];

    for (let i = 0; i < n; i++) {
      const row: (string | HTMLElement)[] = [ws.colors[i].name];
      for (let j = 0; j < n; j++) {
        const d = distances[i + 1][j + 1];
        const cell = document.createElement('span');
        if (i === j) {
          cell.textContent = '0';
          cell.style.color = '#555';
        } else if (d === 1) {
          cell.textContent = '1';
          cell.style.cssText = 'color: #4caf50; font-weight: 600;';
        } else if (d === -1) {
          cell.textContent = '-';
          cell.style.color = '#f44336';
        } else {
          cell.textContent = String(d);
          cell.style.color = '#ff9800';
        }
        row.push(cell);
      }
      rows.push(row);
    }

    return this.table(headers, rows);
  }

  // ── Next-Hop Matrix ─────────────────────────────────────────────────

  private buildNextHopMatrix(ws: WangSet, nextHop: number[][]): HTMLTableElement {
    const n = ws.colors.length;
    const headers = ['', ...ws.colors.map(c => c.name)];
    const rows: (string | HTMLElement)[][] = [];

    for (let i = 0; i < n; i++) {
      const row: (string | HTMLElement)[] = [ws.colors[i].name];
      for (let j = 0; j < n; j++) {
        const hop = nextHop[i + 1][j + 1];
        const cell = document.createElement('span');
        if (i === j) {
          cell.textContent = '-';
          cell.style.color = '#555';
        } else if (hop < 0) {
          cell.textContent = '?';
          cell.style.color = '#f44336';
        } else {
          const hopColor = ws.getColor(hop);
          if (hopColor) {
            cell.style.cssText = 'display: flex; align-items: center; gap: 4px;';
            const box = document.createElement('span');
            box.style.cssText = `display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${hopColor.color}; border: 1px solid rgba(255,255,255,0.15);`;
            const name = document.createElement('span');
            name.textContent = hopColor.name;
            name.style.fontSize = '11px';
            cell.appendChild(box);
            cell.appendChild(name);
          } else {
            cell.textContent = String(hop);
          }
        }
        row.push(cell);
      }
      rows.push(row);
    }

    return this.table(headers, rows);
  }

  // ── Full Paths ────────────────────────────────────────────────────

  private buildPathsList(ws: WangSet, distances: number[][], nextHopMatrix: number[][]): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;';

    const n = ws.colors.length;
    for (let i = 1; i <= n; i++) {
      for (let j = i + 1; j <= n; j++) {
        const d = distances[i][j];
        if (d <= 1) continue; // skip trivial (self or direct)

        // Reconstruct full path
        const path = [i];
        let current = i;
        let safety = 20;
        while (current !== j && safety-- > 0) {
          current = nextHopMatrix[current][j];
          if (current < 0) break;
          path.push(current);
        }

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 12px;';

        for (let k = 0; k < path.length; k++) {
          const c = ws.getColor(path[k]);
          if (!c) continue;

          const chip = document.createElement('span');
          chip.style.cssText = `display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 3px; background: ${PANEL}; border: 1px solid ${BORDER};`;
          const box = document.createElement('span');
          box.style.cssText = `display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${c.color}; border: 1px solid rgba(255,255,255,0.15);`;
          const label = document.createElement('span');
          label.textContent = c.name;
          chip.appendChild(box);
          chip.appendChild(label);
          row.appendChild(chip);

          if (k < path.length - 1) {
            const arrow = document.createElement('span');
            arrow.textContent = '\u2192';
            arrow.style.color = TEXT_DIM;
            row.appendChild(arrow);
          }
        }

        const dist = document.createElement('span');
        dist.textContent = `(distance ${d})`;
        dist.style.cssText = `color: ${TEXT_DIM}; font-size: 11px; margin-left: 8px;`;
        row.appendChild(dist);

        container.appendChild(row);
      }
    }

    if (container.children.length === 0) {
      container.appendChild(this.para('All colors are directly connected (distance 1).'));
    }

    return container;
  }

  // ── Tiles Per Color ──────────────────────────────────────────────

  private buildTileColorStats(ws: WangSet, wangtiles: WangTileData[]): HTMLDivElement {
    const container = document.createElement('div');

    // Count unique color combinations in tiles
    const comboCounts = new Map<string, number>();
    const animatedComboCounts = new Map<string, number>();

    for (const wt of wangtiles) {
      const colorsInTile = [...new Set(wt.wangid.filter(c => c > 0))].sort((a, b) => a - b);
      const key = colorsInTile.map(c => ws.getColor(c)?.name ?? String(c)).join(' + ');
      comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
      if (wt.animation) {
        animatedComboCounts.set(key, (animatedComboCounts.get(key) ?? 0) + 1);
      }
    }

    const headers = ['Color Combination', 'Tile Count', 'Animated'];
    const rows: string[][] = [];
    const sortedKeys = [...comboCounts.keys()].sort();
    for (const key of sortedKeys) {
      const count = comboCounts.get(key) ?? 0;
      const animated = animatedComboCounts.get(key) ?? 0;
      rows.push([key, String(count), animated > 0 ? String(animated) : '-']);
    }

    container.appendChild(this.table(headers, rows));

    // Summary
    const totalAnimated = wangtiles.filter(wt => wt.animation).length;
    const summary = this.para(
      `Total: ${wangtiles.length} base tiles, ${totalAnimated} animated (${Math.round(100 * totalAnimated / wangtiles.length)}%)`
    );
    summary.style.marginTop = '8px';
    container.appendChild(summary);

    return container;
  }

  // ── Prefabs Table ─────────────────────────────────────────────────

  private buildPrefabsTable(): HTMLTableElement {
    const headers = ['Name', 'Layers', 'Total Tiles', 'Anchor'];
    const rows: string[][] = [];

    for (const p of this.prefabs) {
      const d = p.data as { layers?: Array<Array<unknown>>; anchorX?: number; anchorY?: number };
      const layers = d.layers ?? [];
      const totalTiles = layers.reduce((sum, l) => sum + (l?.length ?? 0), 0);
      const nonEmptyLayers = layers.filter(l => (l?.length ?? 0) > 0).length;
      rows.push([
        p.name,
        `${nonEmptyLayers} / ${layers.length}`,
        String(totalTiles),
        `${d.anchorX ?? 0}, ${d.anchorY ?? 0}`,
      ]);
    }

    return this.table(headers, rows);
  }

  // ── HTML Helpers ──────────────────────────────────────────────────

  private heading(text: string): HTMLHeadingElement {
    const h = document.createElement('h1');
    h.textContent = text;
    h.style.cssText = `font-size: 22px; font-weight: 700; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid ${BORDER};`;
    return h;
  }

  private section(text: string): HTMLHeadingElement {
    const h = document.createElement('h2');
    h.textContent = text;
    h.style.cssText = `font-size: 15px; font-weight: 600; margin: 24px 0 10px; color: #bbb; text-transform: uppercase; letter-spacing: 0.5px;`;
    return h;
  }

  private para(text: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.cssText = `color: ${TEXT_DIM}; font-size: 12px; margin-bottom: 8px;`;
    return p;
  }

  private kvTable(pairs: [string, string][]): HTMLTableElement {
    const tbl = document.createElement('table');
    tbl.style.cssText = 'border-collapse: collapse; margin-bottom: 12px; font-size: 12px;';
    for (const [k, v] of pairs) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = k;
      td1.style.cssText = `padding: 3px 16px 3px 0; color: ${TEXT_DIM}; white-space: nowrap;`;
      const td2 = document.createElement('td');
      td2.textContent = v;
      td2.style.cssText = 'padding: 3px 0;';
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbl.appendChild(tr);
    }
    return tbl;
  }

  private table(headers: string[], rows: (string | HTMLElement)[][]): HTMLTableElement {
    const tbl = document.createElement('table');
    tbl.style.cssText = `border-collapse: collapse; margin-bottom: 12px; font-size: 12px; width: 100%;`;

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = `padding: 6px 12px; text-align: left; border-bottom: 2px solid ${BORDER}; color: ${TEXT_DIM}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;`;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const rr = document.createElement('tr');
      rr.addEventListener('mouseenter', () => { rr.style.background = 'rgba(255,255,255,0.03)'; });
      rr.addEventListener('mouseleave', () => { rr.style.background = ''; });
      for (const cell of row) {
        const td = document.createElement('td');
        td.style.cssText = `padding: 5px 12px; border-bottom: 1px solid ${BORDER}; white-space: nowrap;`;
        if (typeof cell === 'string') {
          td.textContent = cell;
        } else {
          td.appendChild(cell);
        }
        rr.appendChild(td);
      }
      tbody.appendChild(rr);
    }
    tbl.appendChild(tbody);
    return tbl;
  }
}
