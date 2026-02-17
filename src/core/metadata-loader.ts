import { TilesetMetadata, WangSetData, DEFAULT_TRANSFORMATIONS } from './metadata-schema.js';
import { WangSet, WangSetType } from './wang-set.js';
import { WangColor } from './wang-color.js';
import { WangId } from './wang-id.js';

/** Load and parse tileset metadata from a JSON object */
export function loadMetadata(json: TilesetMetadata): {
  wangSets: WangSet[];
  transformations: typeof DEFAULT_TRANSFORMATIONS;
} {
  const transformations = json.transformations ?? { ...DEFAULT_TRANSFORMATIONS };
  const wangSets: WangSet[] = [];

  for (const wsData of json.wangsets) {
    const ws = loadWangSet(wsData);
    wangSets.push(ws);
  }

  return { wangSets, transformations };
}

function loadWangSet(data: WangSetData): WangSet {
  const colors: WangColor[] = data.colors.map((c, i) => ({
    id: i + 1,
    name: c.name,
    color: c.color,
    imageTileId: c.tile,
    probability: c.probability ?? 1.0,
  }));

  const ws = new WangSet(data.name, data.type as WangSetType, colors, data.tile);

  for (const wt of data.wangtiles) {
    if (wt.wangid.length !== 8) {
      throw new Error(`WangId for tile ${wt.tileid} must have exactly 8 elements, got ${wt.wangid.length}`);
    }
    ws.addTileMapping(wt.tileid, WangId.fromArray(wt.wangid), wt.probability);
  }

  return ws;
}

/** Validate metadata structure. Returns array of error strings (empty = valid). */
export function validateMetadata(json: TilesetMetadata): string[] {
  const errors: string[] = [];

  if (!json.tilesetImage) errors.push('Missing tilesetImage');
  if (!json.tileWidth || json.tileWidth <= 0) errors.push('Invalid tileWidth');
  if (!json.tileHeight || json.tileHeight <= 0) errors.push('Invalid tileHeight');
  if (!json.columns || json.columns <= 0) errors.push('Invalid columns');
  if (!json.tileCount || json.tileCount <= 0) errors.push('Invalid tileCount');

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
    if (!ws.colors || ws.colors.length === 0) {
      errors.push(`${prefix}: must have at least one color`);
    }

    const seenTileIds = new Set<number>();
    for (let ti = 0; ti < (ws.wangtiles ?? []).length; ti++) {
      const wt = ws.wangtiles[ti];
      const tPrefix = `${prefix}.wangtiles[${ti}]`;

      if (wt.tileid < 0 || wt.tileid >= json.tileCount) {
        errors.push(`${tPrefix}: tileid ${wt.tileid} out of range [0, ${json.tileCount})`);
      }
      if (seenTileIds.has(wt.tileid)) {
        errors.push(`${tPrefix}: duplicate tileid ${wt.tileid}`);
      }
      seenTileIds.add(wt.tileid);

      if (!wt.wangid || wt.wangid.length !== 8) {
        errors.push(`${tPrefix}: wangid must be 8 elements`);
        continue;
      }

      for (let i = 0; i < 8; i++) {
        const c = wt.wangid[i];
        if (c < 0 || c > (ws.colors?.length ?? 0)) {
          errors.push(`${tPrefix}: wangid[${i}] = ${c} out of range [0, ${ws.colors?.length ?? 0}]`);
        }
        // Corner type: edges must be 0
        if (ws.type === 'corner' && i % 2 === 0 && c !== 0) {
          errors.push(`${tPrefix}: corner type but wangid[${i}] (edge) = ${c}, should be 0`);
        }
        // Edge type: corners must be 0
        if (ws.type === 'edge' && i % 2 === 1 && c !== 0) {
          errors.push(`${tPrefix}: edge type but wangid[${i}] (corner) = ${c}, should be 0`);
        }
      }
    }
  }

  return errors;
}
