// One game, turn by turn: node trace (see run-sim.sh with TRACE=1). Args: seed diff personality heat map
import { World, Owner, hash } from '../src/world';
import { aiTurn } from '../src/ai';
const [seedS = 'seed0', diff = 'normal', pers = 'opportunist', heatS = '0', map = 'classic'] = process.argv.slice(2);
const w = new World({ seed: hash(seedS), biome: 'meadow', difficulty: diff, products: ['product_analytics', 'experiments', 'feature_flags', 'error_tracking', 'data_warehouse', 'session_replay'], names: { capital: 'HQ', cities: ['A', 'B', 'C', 'D', 'E'], rivalCapital: 'Old', rivalShort: 'Mono' }, personality: pers, heat: Number(heatS), map });
w.autoPlayer = true;
const log: string[] = [];
w.onEvent = (e, d) => { if (e === 'capture') log.push(`${d.by} took ${d.city.id}${d.city.capital ? '(cap)' : ''}`); if (e === 'reward') log.push(`${d.city.owner} ${d.id}`); };
for (let g = 0; g < 30 && !w.over; g++) {
  const acts: Record<number, Record<string, number>> = {};
  for (const o of w.owners()) {
    if (!w.f[o].alive) { if (o === w.f.length - 1) w.endTurn(o); continue; }
    w.startTurn(o);
    const it = aiTurn(w, o as Owner); acts[o] = {};
    for (let a = it.next(), n = 0; !a.done && n < 400; a = it.next(), n++) {
      const v = a.value; acts[o][v.kind] = (acts[o][v.kind] ?? 0) + 1;
      if (v.kind === 'research') w.research(o, v.tech); else if (v.kind === 'harvest') w.harvest(o, v.x, v.y); else if (v.kind === 'train') w.train(o, v.city, v.type);
      else if (v.kind === 'move') w.move(v.u, v.x, v.y); else if (v.kind === 'attack') w.attack(v.u, v.target); else if (v.kind === 'capture') w.capture(v.u); else if (v.kind === 'invest') w.invest(o, v.city);
      if (w.over) break;
    }
    if (w.over) break;
    w.endTurn(o);
  }
  const s = (o: number) => `c${w.myCities(o).length} L${w.myCities(o).reduce((a, c) => a + c.level, 0)} u${w.myUnits(o).length}(${w.myUnits(o).map((u) => u.type[0]).join('')}) $${w.f[o].stars}+${w.income(o)} t${w.f[o].techs.length} sc${w.score(o)} ${JSON.stringify(acts[o] ?? {})}`;
  console.log(`T${w.turn - 1}`.padEnd(4), s(0), ' | ', s(1), ' ', log.splice(0).join(', '), w.f[1].ai.assault ? 'ASSAULT' : '', w.f[1].ai.target);
}
console.log(w.over, w.scoreParts(0), w.scoreParts(1), w.f[0].techs);
