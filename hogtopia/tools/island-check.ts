// Archipelago sanity: home island size around each capital over many seeds.
import { generateMap, landDist, hash } from '../src/mapgen';
let lone = 0, small = 0, fb = 0;
const N = 2000;
for (let i = 0; i < N; i++) {
  const m = generateMap(hash('isl' + i), 'meadow', 'archipelago', 2);
  if (m.tiles.every((t) => t.t !== 'water')) { fb++; continue; }
  const d = landDist(m, m.cities[0].x, m.cities[0].y);
  const n = d.filter((v) => v >= 0).length;
  if (n <= 1) lone++;
  if (n < 12) small++;
}
console.log(`archipelago: ${N} maps, lone capital ${lone}, home island < 12 tiles ${small}, fallback maps ${fb}`);
