// Headless AI-vs-AI balance runner (tools/run-sim.sh). Plays the autopilot (side 0) against the rival(s)
// with the real rules and AI, N seeds per difficulty x personality, and prints win rate / turns / reasons.
//   run-sim.sh [N] [difficulties] [personalities|all] [heat] [map|rotate] [passive]
import { World, Owner, hash } from '../src/world';
import { aiTurn, Action } from '../src/ai';
import { PERSONALITY_IDS } from '../src/data';
import { MAP_ROTATION } from '../src/mapgen';

function apply(w: World, a: Action, o: Owner) {
  switch (a.kind) {
    case 'research': w.research(o, a.tech); break;
    case 'harvest': w.harvest(o, a.x, a.y); break;
    case 'train': w.train(o, a.city, a.type); break;
    case 'move': w.move(a.u, a.x, a.y); break;
    case 'attack': w.attack(a.u, a.target); break;
    case 'capture': w.capture(a.u); break;
    case 'invest': w.invest(o, a.city); break;
  }
}

function runSide(w: World, o: Owner) {
  w.startTurn(o);
  const g = aiTurn(w, o);
  let n = 0;
  for (let a = g.next(); !a.done && n < 400; a = g.next(), n++) { apply(w, a.value, o); if (w.over) break; }
  if (!w.over) w.endTurn(o);
}

const PRODUCTS = (process.env.PRODUCTS ?? 'product_analytics,experiments,feature_flags,error_tracking,data_warehouse,session_replay').split(',');

export function play(seed: number, diff: string, personality: string, heat: number, map: string, passive: boolean) {
  const names = { capital: 'HQ', cities: ['A', 'B', 'C', 'D', 'E'], rivalCapital: 'Old', rivalShort: 'Mono' };
  const w = new World({ seed, biome: 'meadow', difficulty: diff, products: PRODUCTS, names, personality, heat, map });
  w.autoPlayer = true;
  if (process.env.SYM) { w.f[0].persona = w.f[1].persona; w.f[0].stars = w.f[1].stars; (w as any).canResearch = () => false; }
  for (let guard = 0; guard < 80 && !w.over; guard++) {
    for (const o of w.owners()) {
      if (!w.f[o].alive) { if (o === w.f.length - 1) w.endTurn(o); continue; }
      if (o === 0 && passive) { w.startTurn(0); w.endTurn(0); continue; }
      runSide(w, o);
      if (w.over) break;
    }
  }
  const vets = w.units.filter((u) => u.vet).length;
  return { won: !!w.over?.won, reason: w.over?.reason ?? 'none', turn: w.turn, score: w.score(0), rival: w.rivalScore(),
    cities: w.myCities(0).length, rcities: w.cities.filter((c) => c.owner > 0).length, kills: w.f[0].kills, lost: w.f[0].lost,
    vets, techs: w.f[0].techs.length, monuments: w.monuments.length, final: w.score(0) + (w.over?.bonus ?? 0) };
}

const argv = process.argv.slice(2);
const N = Number(argv[0] ?? 40);
const diffs = (argv[1] ?? 'easy,normal,hard').split(',');
const pers = !argv[2] || argv[2] === 'all' ? PERSONALITY_IDS : argv[2].split(',');
const heat = Number(argv[3] ?? 0);
const map = argv[4] ?? 'classic';
const passive = argv[5] === 'passive';
if (process.env.TABLE) console.log('| diff | rival | player win | avg turns | wins: domination/score | player capital lost | final score v rival | vets | monuments |\n|---|---|---|---|---|---|---|---|---|');
for (const diff of diffs) for (const p of pers) {
  const rs = Array.from({ length: N }, (_, i) => play(hash('seed' + i), diff, p, heat, map === 'rotate' ? MAP_ROTATION[i % MAP_ROTATION.length] : map, passive));
  const wins = rs.filter((r) => r.won).length;
  const reasons: Record<string, number> = {};
  for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const avg = (f: (r: any) => number) => (rs.reduce((s, r) => s + f(r), 0) / rs.length).toFixed(1);
  if (process.env.TABLE) {
    const dom = rs.filter((r) => r.won && r.reason === 'capital').length, cap = rs.filter((r) => r.reason === 'lost').length;
    console.log(`| ${diff} | ${p} | ${(100 * wins / N).toFixed(0)}% | ${avg((r) => Math.min(r.turn, 24))} | ${dom}/${wins - dom} | ${cap} | ${avg((r) => r.final)} v ${avg((r) => r.rival)} | ${avg((r) => r.vets)} | ${avg((r) => r.monuments)} |`);
    continue;
  }
  console.log(`${diff.padEnd(6)} ${p.padEnd(11)} win ${(100 * wins / N).toFixed(0).padStart(3)}%  turns ${avg((r) => Math.min(r.turn, 24))}  score ${avg((r) => r.score)} v ${avg((r) => r.rival)}  final ${avg((r) => r.final)}  cities ${avg((r) => r.cities)} v ${avg((r) => r.rcities)}  k/l ${avg((r) => r.kills)}/${avg((r) => r.lost)} vets ${avg((r) => r.vets)} tech ${avg((r) => r.techs)} mon ${avg((r) => r.monuments)} ${JSON.stringify(reasons)}`);
}
