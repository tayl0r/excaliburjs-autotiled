import { ProjectMetadata, WangSetData, TransformationConfig, DEFAULT_TRANSFORMATIONS } from './metadata-schema.js';
import { WangSet } from './wang-set.js';
import type { WangColor } from './wang-color.js';
import { WangId } from './wang-id.js';

/** Load and parse metadata from a ProjectMetadata JSON object */
export function loadMetadata(json: ProjectMetadata): {
  wangSets: WangSet[];
  transformations: TransformationConfig;
} {
  const transformations = json.transformations ?? { ...DEFAULT_TRANSFORMATIONS };
  const wangSets = json.wangsets.map(loadWangSet);
  return { wangSets, transformations };
}

function loadWangSet(data: WangSetData): WangSet {
  const colors: WangColor[] = data.colors.map((c, i) => ({
    id: i + 1,
    name: c.name,
    color: c.color,
    imageTileId: c.tile,
    tilesetIndex: c.tileset ?? 0,
    probability: c.probability ?? 1.0,
  }));

  const ws = new WangSet(data.name, data.type, colors, data.tile);

  for (const wt of data.wangtiles) {
    if (wt.wangid.length !== 8) {
      throw new Error(`WangId for tile ${wt.tileid} must have exactly 8 elements, got ${wt.wangid.length}`);
    }
    ws.addTileMapping(wt.tileset ?? 0, wt.tileid, WangId.fromArray(wt.wangid), wt.probability);
  }

  return ws;
}

/** Validate ProjectMetadata structure. Returns array of error strings (empty = valid). */
export function validateProjectMetadata(json: ProjectMetadata): string[] {
  const errors: string[] = [];

  if (json.version !== 2) errors.push(`Invalid version: ${json.version}`);
  if (!json.tilesets || json.tilesets.length === 0) errors.push('Must have at least one tileset');

  for (let ti = 0; ti < (json.tilesets ?? []).length; ti++) {
    const ts = json.tilesets[ti];
    const prefix = `tilesets[${ti}]`;
    if (!ts.tilesetImage) errors.push(`${prefix}: missing tilesetImage`);
    for (const field of ['tileWidth', 'tileHeight', 'columns', 'tileCount'] as const) {
      if (!ts[field] || ts[field] <= 0) errors.push(`${prefix}: invalid ${field}`);
    }
  }

  if (!json.wangsets || !Array.isArray(json.wangsets)) {
    errors.push('Missing or invalid wangsets array');
    return errors;
  }

  for (let si = 0; si < json.wangsets.length; si++) {
    const ws = json.wangsets[si];
    const prefix = `wangsets[${si}]`;

    if (!ws.name) errors.push(`${prefix}: missing name`);
    if (!['corner', 'edge', 'mixed'].includes(ws.type)) {
      errors.push(`${prefix}: invalid type "${ws.type}"`);
    }

    for (let wti = 0; wti < (ws.wangtiles ?? []).length; wti++) {
      const wt = ws.wangtiles[wti];
      const tPrefix = `${prefix}.wangtiles[${wti}]`;
      const tsIdx = wt.tileset ?? 0;

      if (tsIdx < 0 || tsIdx >= json.tilesets.length) {
        errors.push(`${tPrefix}: tileset index ${tsIdx} out of range [0, ${json.tilesets.length})`);
      } else if (wt.tileid < 0 || wt.tileid >= json.tilesets[tsIdx].tileCount) {
        errors.push(`${tPrefix}: tileid ${wt.tileid} out of range for tileset ${tsIdx}`);
      }
    }
  }

  return errors;
}
