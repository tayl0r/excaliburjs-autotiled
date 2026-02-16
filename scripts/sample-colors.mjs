import sharp from 'sharp';

const IMAGE_PATH = 'assets/TimeFantasy_TILES_6.24.17/TILESETS/terrain.png';
const COLUMNS = 39;
const TW = 16, TH = 16;

async function main() {
  const { width } = await sharp(IMAGE_PATH).metadata();
  const raw = await sharp(IMAGE_PATH).raw().toBuffer();

  function avgTile(tileId) {
    const col = tileId % COLUMNS;
    const row = Math.floor(tileId / COLUMNS);
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 2; dy < TH - 2; dy++) {
      for (let dx = 2; dx < TW - 2; dx++) {
        const px = ((row * TH + dy) * width + col * TW + dx) * 4;
        r += raw[px]; g += raw[px + 1]; b += raw[px + 2]; count++;
      }
    }
    r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  const sets = [
    { name: 'Dirt', start: 100 },
    { name: 'Stone', start: 139 },
    { name: 'Sand', start: 178 },
    { name: 'TanTile', start: 217 },
    { name: 'GreyTile', start: 256 },
    { name: 'Empty', start: 295 },
  ];

  for (const s of sets) {
    console.log(`${s.name} (tile ${s.start}): ${avgTile(s.start)}`);
  }
}

main();
