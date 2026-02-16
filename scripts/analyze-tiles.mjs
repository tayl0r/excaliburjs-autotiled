/**
 * Analyze tiles 100-115 from terrain.png to determine the corner color pattern.
 * For each 16x16 tile, sample the 4 corners (4x4 pixel regions) and classify
 * as grass or dirt based on how different they are from known dirt color.
 */
import sharp from 'sharp';

const IMAGE_PATH = 'assets/TimeFantasy_TILES_6.24.17/TILESETS/terrain.png';
const TILE_W = 16;
const TILE_H = 16;
const COLUMNS = 39;
const CORNER_SAMPLE = 4;

async function main() {
  const image = sharp(IMAGE_PATH);
  const { width } = await image.metadata();
  const raw = await image.raw().toBuffer();
  const channels = 4;

  function getPixel(x, y) {
    const idx = (y * width + x) * channels;
    return { r: raw[idx], g: raw[idx + 1], b: raw[idx + 2] };
  }

  function avgColor(tileX, tileY, cornerX, cornerY) {
    const startX = tileX * TILE_W + (cornerX === 0 ? 1 : TILE_W - CORNER_SAMPLE - 1);
    const startY = tileY * TILE_H + (cornerY === 0 ? 1 : TILE_H - CORNER_SAMPLE - 1);
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < CORNER_SAMPLE; dy++) {
      for (let dx = 0; dx < CORNER_SAMPLE; dx++) {
        const px = getPixel(startX + dx, startY + dy);
        r += px.r; g += px.g; b += px.b; count++;
      }
    }
    return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
  }

  // Reference: tile 100 = full dirt, tile 115 = full grass
  const dirtRef = avgColor(100 % COLUMNS, Math.floor(100 / COLUMNS), 0, 0);
  const grassRef = avgColor(115 % COLUMNS, Math.floor(115 / COLUMNS), 0, 0);

  function colorDist(a, b) {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  function classify(c) {
    const dDirt = colorDist(c, dirtRef);
    const dGrass = colorDist(c, grassRef);
    return dGrass < dDirt ? 'G' : 'D';
  }

  console.log(`Dirt reference:  (${dirtRef.r}, ${dirtRef.g}, ${dirtRef.b})`);
  console.log(`Grass reference: (${grassRef.r}, ${grassRef.g}, ${grassRef.b})\n`);

  console.log('Tile | Offset | TL TR BR BL | Binary (TL=b0 TR=b1 BL=b2 BR=b3) | WangId');
  console.log('-----|--------|-------------|-----------------------------------|-------');

  for (let tileId = 100; tileId <= 115; tileId++) {
    const col = tileId % COLUMNS;
    const row = Math.floor(tileId / COLUMNS);
    const offset = tileId - 100;

    const tl = classify(avgColor(col, row, 0, 0));
    const tr = classify(avgColor(col, row, 1, 0));
    const br = classify(avgColor(col, row, 1, 1));
    const bl = classify(avgColor(col, row, 0, 1));

    // Determine binary encoding: which bit position = which corner?
    const tlG = tl === 'G' ? 1 : 0;
    const trG = tr === 'G' ? 1 : 0;
    const brG = br === 'G' ? 1 : 0;
    const blG = bl === 'G' ? 1 : 0;

    // WangId: [T(0), TR(1), R(2), BR(3), B(4), BL(5), L(6), TL(7)]
    // Grass=1, Dirt=2, edges=0 for corner type
    const tlColor = tl === 'G' ? 1 : 2;
    const trColor = tr === 'G' ? 1 : 2;
    const brColor = br === 'G' ? 1 : 2;
    const blColor = bl === 'G' ? 1 : 2;
    const wangId = `[0,${trColor},0,${brColor},0,${blColor},0,${tlColor}]`;

    console.log(
      `${String(tileId).padStart(4)} | ${String(offset).padStart(6)} | ` +
      `${tl}  ${tr}  ${br}  ${bl}  | ` +
      `TL=${tlG} TR=${trG} BL=${blG} BR=${brG} = ${offset.toString(2).padStart(4, '0')} | ` +
      wangId
    );
  }
}

main().catch(console.error);
