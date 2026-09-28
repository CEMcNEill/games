// Verify the classic generator still matches the original one (old world.ts at /tmp/oldhog/world.ts:
// git show 13b37b4:hogtopia/src/world.ts > /tmp/oldhog/world.ts).
import { World as Old, hash } from '/tmp/oldhog/world';
import { generateMap } from '../src/mapgen';
let bad = 0;
for (let i = 0; i < 300; i++) for (const b of ['meadow', 'desert', 'tundra', 'circuit']) {
  const seed = hash('p' + i + b);
  const o = new Old(seed, b, 'normal', [], { capital: 'a', cities: ['b'], rivalCapital: 'c', rivalShort: 'd' });
  const m = generateMap(seed, b, 'classic', 2);
  const a = o.tiles.map((t) => t.t + t.res + t.ruins + t.city + ':' + t.terr).join();
  const c = m.tiles.map((t) => t.t + t.res + t.ruins + t.city + ':' + t.terr).join();
  const ca = o.cities.map((c) => `${c.x},${c.y},${c.owner}`).join(), cb = m.cities.map((c) => `${c.x},${c.y},${c.owner}`).join();
  if (a !== c || ca !== cb) bad++;
}
console.log('mismatches', bad, 'of 1200');
