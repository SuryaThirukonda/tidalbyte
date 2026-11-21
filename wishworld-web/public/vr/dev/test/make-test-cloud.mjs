// Writes a small SYNTHETIC point cloud in the lidar file format (docs/CONTRACT.md) to public/vr/dev/lidar/.
// It is not a real place and is only ever loaded by the dev harness (harness.html?tab=explore&lidar=dev).
// It exists to test two things without touching the real files in public/lidar/:
//   - a file whose points are in scan order (no "order": "random"), so Explore has to mix them itself;
//   - a place with no files at all: only "liberty" is written here, so picking Niagara Falls must show the
//     "could not load" card and no geometry.
//
//   node make-test-cloud.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lidar');
mkdirSync(outDir, { recursive: true });

const side = 200;            // points along each side
const count = side * side;   // 40,000
const size = 120;            // metres across
const scale = 0.01;
const positions = new Int16Array(count * 3);
const colours = new Uint8Array(count * 3);
let maxY = 0;

for (let iz = 0; iz < side; iz++) {
  for (let ix = 0; ix < side; ix++) {
    const i = iz * side + ix;
    const x = (ix / (side - 1) - 0.5) * size;
    const z = (iz / (side - 1) - 0.5) * size;
    // Rolling ground and one cone, so the shape is plainly artificial.
    const r = Math.hypot(x - 15, z + 10);
    const y = 4 + 3 * Math.sin(x * 0.12) * Math.cos(z * 0.1) + Math.max(0, 30 - r * 2.2);
    maxY = Math.max(maxY, y);
    positions[i * 3] = Math.round(x / scale);
    positions[i * 3 + 1] = Math.round(y / scale);
    positions[i * 3 + 2] = Math.round(z / scale);
    // A checkerboard in two flat colours: nothing like the height tints of the real files.
    const dark = (Math.floor(ix / 20) + Math.floor(iz / 20)) % 2 === 0;
    colours[i * 3] = dark ? 200 : 240;
    colours[i * 3 + 1] = dark ? 90 : 200;
    colours[i * 3 + 2] = dark ? 160 : 70;
  }
}

const info = {
  name: 'TEST CLOUD (not a real place)',
  count,
  scale,
  bounds: { min: [-size / 2, 0, -size / 2], max: [size / 2, Math.ceil(maxY), size / 2] },
  source: 'Synthetic test data made by public/vr/dev/test/make-test-cloud.mjs. Not lidar',
  facts: ['This is a test pattern, not a real place.', 'It checks that the Explore tab can load and show points.'],
  colorSpace: 'srgb',
};

writeFileSync(join(outDir, 'liberty.bin'), Buffer.concat([Buffer.from(positions.buffer), Buffer.from(colours.buffer)]));
writeFileSync(join(outDir, 'liberty.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`wrote ${count} synthetic points to ${outDir} (liberty.json + liberty.bin; no niagara on purpose)`);
