import { World, Owner, hash } from '../src/world';
import { aiTurn } from '../src/ai';
const [seedS = 'seed3', diff = 'normal', pers = 'turtle', turns = '8'] = process.argv.slice(2);
const w = new World({ seed: hash(seedS), biome: 'meadow', difficulty: diff, products: ['product_analytics', 'experiments', 'feature_flags', 'error_tracking', 'data_warehouse', 'session_replay'], names: { capital: 'HQ', cities: ['A', 'B', 'C', 'D', 'E'], rivalCapital: 'Old', rivalShort: 'Mono' }, personality: pers });
w.autoPlayer = true;
const map = () => { for (let y = 0; y < w.H; y++) { let s = ''; for (let x = 0; x < w.W; x++) { const u = w.unitAt(x, y), c = w.cityAt(x, y), t = w.tile(x, y); s += u ? (u.owner ? u.type[0].toUpperCase() : u.type[0]) : c ? (c.owner < 0 ? 'V' : c.owner ? 'R' : 'P') : t.t === 'water' ? '~' : t.t === 'mountain' ? '^' : t.t === 'forest' ? 'f' : '.'; } console.log(s); } };
for (let g = 0; g < Number(turns); g++) {
  for (const o of w.owners()) {
    w.startTurn(o);
    const it = aiTurn(w, o as Owner);
    for (let a = it.next(); !a.done; a = it.next()) {
      const v = a.value;
      if (o === 1) console.log(`T${w.turn} ${v.kind} ${'u' in v ? `${v.u.type}@${v.u.x},${v.u.y}` : ''} ${'x' in v ? `-> ${v.x},${v.y}` : ''} ${'type' in v ? v.type : ''}`);
      if (v.kind === 'research') w.research(o, v.tech); else if (v.kind === 'harvest') w.harvest(o, v.x, v.y); else if (v.kind === 'train') w.train(o, v.city, v.type);
      else if (v.kind === 'move') w.move(v.u, v.x, v.y); else if (v.kind === 'attack') w.attack(v.u, v.target); else if (v.kind === 'capture') w.capture(v.u); else if (v.kind === 'invest') w.invest(o, v.city);
    }
    w.endTurn(o);
  }
}
map();
