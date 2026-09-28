// Print one ASCII map per type and count fallbacks over many seeds.
import { generateMap, MAP_TYPES, hash } from '../src/mapgen';
for (const id of Object.keys(MAP_TYPES)) {
  let fb = 0;
  for (let i = 0; i < 300; i++) { const m = generateMap(hash('s' + i), 'meadow', id, 2); if (m.cities.length === 8 && m.cities[1].x === 7 && m.cities[1].y === 2 && id !== 'classic') fb++; }
  const m = generateMap(hash('show'), 'meadow', id, 2);
  console.log(`== ${id} ${m.W}x${m.H} cities ${m.cities.length} fallback-like ${fb}/300`);
  for (let y = 0; y < m.H; y++) console.log(m.tiles.slice(y * m.W, (y + 1) * m.W).map((t) => t.city >= 0 ? (m.cities[t.city].capital ? 'C' : 'v') : t.ruins ? 'R' : t.res ? '*' : { plain: '.', forest: 'f', mountain: '^', water: '~' }[t.t]).join(''));
}
