// Hand-made room library (28x15 tiles of 16px). The theme picks 3-4 layouts and names them; the
// LLM never designs a map. Legend:
//   # wall   . floor   , rug   : server floor   O window   B whiteboard (both wall-mounted)
//   D desk  P plant  S server rack  T table  K counter  C couch  h chair  M coffee machine  F shelf
//   L / R  doors on row 7 (walls when there's no room that way)
//   s start   n NPC spot   e door blocker   m mid-room guard   b boss spot (all floor underneath)
export const COLS = 28;
export const ROWS = 15;
export const TILE = 16;
export const OX = 16; // room origin on screen
export const OY = 30;
export const DOOR_ROW = 7;

export const LAYOUTS: Record<string, string[]> = {
  lobby: [
    '############################',
    '###OO####OO#######OO####OO##',
    '#P........................P#',
    '#..n.......KKKKK..........F#',
    '#..........KKKKK...........#',
    '#.....................n....#',
    '#..........................#',
    'L..s.........m.......b..e..R',
    '#..........................#',
    '#.CCC..............,,,,,...#',
    '#.........n........,TTT,...#',
    '#P.................,,,,,..P#',
    '#..........................#',
    '#PP..hh...........hh.....PP#',
    '############################',
  ],
  open_office: [
    '############################',
    '##OO##OO##BB####OO##OO##OO##',
    '#P........................P#',
    '#.DD.DD.DD........DD.DD.DD.#',
    '#.hh.hh.hh....n...hh.hh.hh.#',
    '#.....n....................#',
    '#..........................#',
    'L..s.........m.......b..e..R',
    '#..........................#',
    '#.DD.DD.DD........DD.DD.DD.#',
    '#.hh.hh.hh........hh.hh.hh.#',
    '#.............n............#',
    '#P.......................FF#',
    '#PP.....................MFP#',
    '############################',
  ],
  server_room: [
    '############################',
    '######BB############OO######',
    '#::::::::::::::::::::::::::#',
    '#:SS:SS:SS:SS:::SS:SS:SS:::#',
    '#:SS:SS:SS:SS:::SS:SS:SS:::#',
    '#::::::n::::::::::::::n::::#',
    '#::::::::::::::::::::::::::#',
    'L::s:::::::::m:::::::b::e::R',
    '#::::::::::::::::::::::::::#',
    '#:SS:SS:SS:::::::SS:SS:SS::#',
    '#:SS:SS:SS:::n:::SS:SS:SS::#',
    '#::::::::::::::::::::::::::#',
    '#M:::::::::::::::::::::::FF#',
    '#P::::::::::::::::::::::::P#',
    '############################',
  ],
  meeting_room: [
    '############################',
    '####BBBB####OO####OO####BB##',
    '#P.........n..............P#',
    '#...,,,,,,,,,,,,,,,,,,,,...#',
    '#...,hhhhhhhhhhhhhhhhhh,...#',
    '#...,TTTTTTTTTTTTTTTTTT,...#',
    '#...,,,,,,,,,,,,,,,,,,,,...#',
    'L..s.........m.......b..e..R',
    '#..........................#',
    '#..n.......................#',
    '#.CCC...............CCC..n.#',
    '#..........................#',
    '#P..........FFFF..........P#',
    '#PP......................PP#',
    '############################',
  ],
  kitchen: [
    '############################',
    '##OO#####OO#####OO#####OO###',
    '#KKKKKKKMKKKK.............P#',
    '#...........n..............#',
    '#.....................TT.n.#',
    '#..,,,,,,.............hh...#',
    '#..,TTTT,..................#',
    'L..s.........m.......b..e..R',
    '#..........................#',
    '#......n...........hh......#',
    '#..................TT......#',
    '#..................hh......#',
    '#CCC.......................#',
    '#P......................FFP#',
    '############################',
  ],
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

// Tile frames in the 'tiles' sheet (art.py TILES order).
export const F = {
  floor: 0, rug: 1, wallFace: 2, wallTop: 3, desk: 4, plant: 5, server: 6, table: 7, counter: 8,
  whiteboard: 9, door: 10, couch: 11, window: 12, chair: 13, coffee: 14, shelf: 15, srvFloor: 16,
};

const OBJECTS: Record<string, number> = {
  D: F.desk, P: F.plant, S: F.server, T: F.table, K: F.counter, C: F.couch, h: F.chair, M: F.coffee, F: F.shelf,
};
const SOLID = new Set(['#', 'O', 'B', 'D', 'P', 'S', 'T', 'K', 'C', 'h', 'M', 'F']);

export interface Spot { col: number; row: number }

export interface RoomMap {
  layout: string;
  grid: string[];
  solid: boolean[][];
  floorFrame: number;
  spots: { s: Spot; n: Spot[]; e: Spot; m: Spot; b: Spot };
  hasLeft: boolean;
  hasRight: boolean;
}

export function buildRoom(layout: string, hasLeft: boolean, hasRight: boolean): RoomMap {
  const grid = LAYOUTS[layout] ?? LAYOUTS.lobby;
  const server = layout === 'server_room';
  const spots = { s: { col: 3, row: DOOR_ROW }, n: [] as Spot[], e: { col: 24, row: DOOR_ROW }, m: { col: 13, row: DOOR_ROW }, b: { col: 21, row: DOOR_ROW } };
  const solid: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    solid.push([]);
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r]?.[c] ?? '#';
      let s = SOLID.has(ch);
      if (ch === 'L') s = !hasLeft;
      if (ch === 'R') s = !hasRight;
      solid[r].push(s);
      if (ch === 's') spots.s = { col: c, row: r };
      if (ch === 'n') spots.n.push({ col: c, row: r });
      if (ch === 'e') spots.e = { col: c, row: r };
      if (ch === 'm') spots.m = { col: c, row: r };
      if (ch === 'b') spots.b = { col: c, row: r };
    }
  }
  return { layout, grid, solid, floorFrame: server ? F.srvFloor : F.floor, spots, hasLeft, hasRight };
}

/** Frames to draw at a cell: [floor, object?]. */
export function cellFrames(room: RoomMap, c: number, r: number): number[] {
  const ch = room.grid[r]?.[c] ?? '#';
  const below = room.grid[r + 1]?.[c];
  const floor = ch === ',' ? F.rug : room.floorFrame;
  if (ch === '#') return [below === undefined || below === '#' || below === 'O' || below === 'B' || c === 0 || c === COLS - 1 ? F.wallTop : F.wallFace];
  if (ch === 'O') return [F.window];
  if (ch === 'B') return [F.whiteboard];
  if (ch === 'L') return [room.hasLeft ? F.door : F.wallTop];
  if (ch === 'R') return [room.hasRight ? F.door : F.wallTop];
  if (OBJECTS[ch] !== undefined) return [floor, OBJECTS[ch]];
  return [floor];
}

export const cellX = (c: number) => OX + c * TILE + TILE / 2;
export const cellY = (r: number) => OY + r * TILE + TILE / 2;
export const colOf = (x: number) => Math.floor((x - OX) / TILE);
export const rowOf = (y: number) => Math.floor((y - OY) / TILE);
