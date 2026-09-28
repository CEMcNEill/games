// Map generation. Every map is point-symmetric (generate half, mirror through the centre) so both
// sides start equal, and validated so every city is reachable. 'classic' at 18x12 is the original
// generator: the first game for a prospect is exactly the map it always had.
import { Terrain, Res } from './data';

export interface Tile { t: Terrain; res: Res; ruins: boolean; city: number; terr: number; seen: boolean; fog: number; monument: string | null }
export interface City {
  id: number; x: number; y: number; owner: number; name: string; level: number; pop: number; capital: boolean;
  perks: string[]; home: number; // home = the faction whose capital this was (-1 for villages)
}
export interface MapData { W: number; H: number; tiles: Tile[]; cities: City[]; type: string }

export interface MapType { id: string; name: string; W: number; H: number; villages: number; water: number; mountain: number; forest: number; smooth: number; minDist: number; res: number; sea?: boolean }
/** Map presets for runs after the first. Shares are fractions of the half map. */
export const MAP_TYPES: Record<string, MapType> = {
  classic: { id: 'classic', name: 'Classic', W: 18, H: 12, villages: 3, water: -1, mountain: -1, forest: -1, smooth: 2, minDist: 10, res: 0.5 },
  highlands: { id: 'highlands', name: 'Highlands', W: 18, H: 12, villages: 3, water: 0.06, mountain: 0.22, forest: 0.3, smooth: 2, minDist: 10, res: 0.4 },
  lakes: { id: 'lakes', name: 'Lakes', W: 18, H: 12, villages: 3, water: 0.26, mountain: 0.06, forest: 0.22, smooth: 3, minDist: 10, res: 0.6 },
  continents: { id: 'continents', name: 'Continents', W: 18, H: 12, villages: 3, water: 0.34, mountain: 0.08, forest: 0.2, smooth: 3, minDist: 10, res: 0.55 },
  small: { id: 'small', name: 'Skirmish', W: 14, H: 10, villages: 2, water: 0.12, mountain: 0.1, forest: 0.24, smooth: 2, minDist: 8, res: 0.6 },
  // Islands: everyone starts with Sailing; cities only need to be reachable by land or sea.
  archipelago: { id: 'archipelago', name: 'Archipelago', W: 18, H: 12, villages: 3, water: 0.5, mountain: 0.04, forest: 0.22, smooth: 2, minDist: 10, res: 0.6, sea: true },
  wide: { id: 'wide', name: 'Frontier', W: 18, H: 12, villages: 4, water: 0.12, mountain: 0.1, forest: 0.25, smooth: 2, minDist: 10, res: 0.45 },
};
export const MAP_ROTATION = ['highlands', 'lakes', 'wide', 'archipelago', 'continents', 'small', 'classic'];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const land = (t: Tile) => t.t === 'plain' || t.t === 'forest';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const BIOME_SHARES: Record<string, number[]> = { meadow: [0.25, 0.1, 0.14], desert: [0.1, 0.14, 0.08], tundra: [0.28, 0.14, 0.12], circuit: [0.2, 0.1, 0.16] };

export function generateMap(seed: number, biome: string, typeId = 'classic', ruins = 2): MapData {
  const mt = MAP_TYPES[typeId] ?? MAP_TYPES.classic;
  const bio = BIOME_SHARES[biome] ?? [0.25, 0.12, 0.12];
  // Classic keeps the biome's own shares (and the exact original random sequence).
  const shares = mt.water < 0 ? bio : [mt.forest, mt.mountain, mt.water];
  // Classic keeps the original 60 attempts so its fallback cases match the old generator too.
  for (let attempt = 0, n = mt.id === 'classic' ? 60 : 80; attempt < n; attempt++) {
    const r = rng(seed + attempt * 7919);
    const m = tryGenerate(r, mt, shares, ruins);
    if (m) return m;
  }
  return fallbackMap(mt.id);
}

/** BFS distance over land from (x, y); -1 = unreachable. */
export function landDist(m: { W: number; H: number; tiles: Tile[] }, x: number, y: number, pass: (t: Tile) => boolean = land): number[] {
  const { W, H } = m;
  const d = new Array(W * H).fill(-1);
  const q = [y * W + x];
  d[y * W + x] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (d[j] >= 0 || !pass(m.tiles[j])) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return d;
}

const mkTile = (t: Terrain): Tile => ({ t, res: null, ruins: false, city: -1, terr: -1, seen: false, fog: 1, monument: null });
const mkCity = (id: number, x: number, y: number, owner: number, capital: boolean): City =>
  ({ id, x, y, owner, name: '', level: 1, pop: 0, capital, perks: [], home: capital ? owner : -1 });

function tryGenerate(r: () => number, mt: MapType, [pf, pm, pw]: number[], nRuins: number): MapData | null {
  const W = mt.W, H = mt.H, N = W * H;
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // Smoothing passes make blobby lakes and ranges; ranks give exact terrain shares.
  const blur = (a: number[]) => a.map((v, i) => {
    const x = i % W, y = (i / W) | 0;
    let s = v, n = 1;
    for (const [dx, dy] of DIRS) if (inMap(x + dx, y + dy)) { s += a[(y + dy) * W + x + dx]; n++; }
    return s / n;
  });
  let height = Array.from({ length: N }, () => r());
  for (let i = 0; i < mt.smooth; i++) height = blur(height);
  const half = height.slice(0, N / 2);
  const ranked = [...half].sort((a, b) => a - b);
  const waterCut = ranked[Math.floor(pw * half.length)] ?? -1;
  const mountCut = ranked[Math.floor((1 - pm) * half.length)] ?? 2;
  const tiles: Tile[] = [];
  const tile = (x: number, y: number) => tiles[y * W + x];
  for (let i = 0; i < N; i++) {
    const v = height[Math.min(i, N - 1 - i)];
    tiles.push(mkTile(v < waterCut ? 'water' : v >= mountCut ? 'mountain' : r() < pf ? 'forest' : 'plain'));
  }
  for (let i = N / 2; i < N; i++) tiles[i].t = tiles[N - 1 - i].t; // exact mirror
  const cities: City[] = [];
  const mirror = (x: number, y: number): [number, number] => [W - 1 - x, H - 1 - y];
  const px = 2 + Math.floor(r() * 2), py = 3 + Math.floor(r() * (H - 6));
  const spots: [number, number][] = [[px, py]];
  const per = mt.villages + 1;
  // Villages per side, in the left half, spread out.
  for (let tries = 0; spots.length < per && tries < 400; tries++) {
    const x = 1 + Math.floor(r() * (W / 2 - 1)), y = 1 + Math.floor(r() * (H - 2));
    if (spots.every(([sx, sy]) => cheb(sx, sy, x, y) >= 3) && cheb(x, y, ...mirror(x, y)) >= 3) spots.push([x, y]);
  }
  if (spots.length < per) return null;
  const all = [...spots, ...spots.map(([x, y]) => mirror(x, y))];
  all.forEach(([x, y], i) => {
    const t = tile(x, y);
    t.t = 'plain';
    const capital = i === 0 || i === per;
    cities.push(mkCity(i, x, y, capital ? (i === 0 ? 0 : 1) : -1, capital));
    t.city = i;
  });
  const caps = [cities[0], cities[per]];
  // Capitals get dry land around them.
  for (const c of caps) {
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy;
      if (inMap(x, y) && tile(x, y).t === 'mountain') tile(x, y).t = 'plain';
    }
  }
  // Territory: radius 1, capitals first.
  for (const c of [...caps, ...cities.filter((c) => !c.capital)]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (inMap(x, y) && tile(x, y).terr < 0) tile(x, y).terr = c.id;
    }
  }
  // Resources + ruins decided on the left half and mirrored.
  for (let i = 0; i < N / 2; i++) {
    const t = tiles[i];
    if (t.city >= 0) continue;
    const kind: Res = t.t === 'plain' ? 'data' : t.t === 'forest' ? 'fruit' : t.t === 'water' ? 'fish' : null;
    if (kind && t.terr >= 0 && r() < mt.res) t.res = kind;
  }
  for (let n = 0, tries = 0; n < nRuins && tries < 200; tries++) {
    const i = Math.floor(r() * (N / 2));
    const t = tiles[i], x = i % W, y = (i / W) | 0;
    if (land(t) && t.city < 0 && t.terr < 0 && !t.res && cities.every((c) => cheb(c.x, c.y, x, y) >= 2)) { t.ruins = true; n++; }
  }
  // Every capital needs at least 3 resources.
  const cap = cities[0];
  let have = 0;
  for (let i = 0; i < N; i++) if (tiles[i].terr === cap.id && tiles[i].res) have++;
  for (const [dx, dy] of DIRS) {
    if (have >= 3) break;
    const t = inMap(cap.x + dx, cap.y + dy) ? tile(cap.x + dx, cap.y + dy) : undefined;
    if (t && !t.res && t.t !== 'mountain') { t.res = t.t === 'water' ? 'fish' : t.t === 'forest' ? 'fruit' : 'data'; have++; }
  }
  // Mirror resources/ruins both ways (the capital top-up may have touched either half).
  for (let i = 0; i < N / 2; i++) {
    const a = tiles[i], b = tiles[N - 1 - i];
    a.res = b.res = a.res ?? b.res;
    a.ruins = b.ruins = a.ruins || b.ruins;
  }
  for (const c of cities) { const t = tile(c.x, c.y); t.t = 'plain'; t.res = null; t.ruins = false; }
  const m: MapData = { W, H, tiles, cities, type: mt.id };
  // Validate: every city reachable over land from the player's capital; capitals far apart.
  const d = landDist(m, cities[0].x, cities[0].y, mt.sea ? (t) => t.t !== 'mountain' : land);
  if (cities.some((c) => d[c.y * W + c.x] < 0)) return null;
  // Islands must really be islands: the two capitals may not share a landmass.
  if (mt.sea && landDist(m, cities[0].x, cities[0].y)[caps[1].y * W + caps[1].x] >= 0) return null;
  return cheb(caps[0].x, caps[0].y, caps[1].x, caps[1].y) >= mt.minDist ? m : null;
}

function fallbackMap(type: string): MapData {
  const W = 18, H = 12;
  const tiles = Array.from({ length: W * H }, () => mkTile('plain'));
  const spots = [[2, 5], [7, 2], [7, 9], [4, 9], [15, 6], [10, 9], [10, 2], [13, 2]];
  const cities = spots.map(([x, y], i) => mkCity(i, x, y, i === 0 ? 0 : i === 4 ? 1 : -1, i === 0 || i === 4));
  const tile = (x: number, y: number) => tiles[y * W + x];
  for (const c of cities) {
    tile(c.x, c.y).city = c.id;
    for (const [dx, dy] of [[0, 0], ...DIRS]) { const x = c.x + dx, y = c.y + dy; if (x >= 0 && y >= 0 && x < W && y < H && tile(x, y).terr < 0) tile(x, y).terr = c.id; }
  }
  for (const c of [cities[0], cities[4]]) for (const [dx, dy] of DIRS.slice(0, 3)) tile(c.x + dx, c.y + dy).res = 'data';
  return { W, H, tiles, cities, type };
}
