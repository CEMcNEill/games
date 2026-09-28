// Map sanity check: with every gate open and every event spot occupied at once, every goal
// (encounters, boss, chests, NPCs, quest, item, shop, inn, Wyrm, secrets) must still be reachable.
//   node hog-saga/tools/reach.mjs
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/map.ts', import.meta.url), 'utf8');
const rows = [...src.matchAll(/^  '(.*)',$/gm)].map((m) => m[1].replace(/\\"/g, '"'));
const world = fs.readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
const spots = [...world.match(/EVENT_SPOTS = \[(.*)\];/)[1].matchAll(/x: (\d+), y: (\d+)/g)].map((m) => [+m[1], +m[2]]);
const H = rows.length, W = rows[0].length;
const BLOCK = new Set('T~^r#HI&F');
const solid = new Set('ncq123456789BWh'.split(''));
const occupied = new Set(spots.map(([x, y]) => `${x},${y}`));
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !BLOCK.has(rows[y][x]) && !solid.has(rows[y][x]) && !occupied.has(`${x},${y}`);
let start;
rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 's') start = [x, y]; }));
const seen = new Set([start.join()]);
const q = [start];
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!seen.has(`${nx},${ny}`) && free(nx, ny)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); }
  }
}
let bad = 0;
rows.forEach((r, y) => [...r].forEach((c, x) => {
  if (!'ncqk123456789BWhSQHI'.includes(c)) return;
  const ok = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
  if (!ok && !'HI'.includes(c)) { console.log(`unreachable ${c} at ${x},${y}`); bad++; }
}));
console.log(bad ? `FAIL ${bad}` : `OK: all goals reachable with ${spots.length} event spots occupied`);
process.exit(bad ? 1 : 0);
