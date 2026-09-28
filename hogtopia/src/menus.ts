// Modal panels drawn over the map: research tree, train/invest, city level-up reward and the truce offer.
// Each returns its game objects so the scene can destroy them; input stays in the scene.
import Phaser from 'phaser';
import { K, spr } from '@shared/kit';
import { text, box } from '@shared/ui';
import products from '../../shared/products.json';
import { TECHS, TIER2, BASE_TECHS, UNITS, UNIT_ORDER, TRAINABLE, UnitType, LEVEL_REWARDS } from './data';
import { World, City } from './world';

export const productName = (id: string) => (products as Record<string, { name: string }>)[id]?.name ?? id;
export const techName = (id: string) => TECHS[id]?.name ?? productName(id);

type Objs = Phaser.GameObjects.GameObject[];

/** Research grid: row 0 = base techs, then one row per product (col 0 product, col 1 its tier 2). */
export function techGrid(w: World): string[][] {
  const rows: string[][] = [BASE_TECHS.filter((b) => w.techList.includes(b))];
  for (const p of w.products) rows.push([p, TIER2[p]].filter((t) => t && w.techList.includes(t)));
  return rows;
}

function techStatus(w: World, id: string) {
  if (w.has(0, id)) return { s: 'OWNED', ok: true, owned: true };
  const req = TECHS[id].requires;
  if (req && !w.has(0, req)) return { s: 'LOCKED', ok: false, owned: false };
  return { s: `${w.techCost(0, id)}*`, ok: w.canResearch(0, id), owned: false };
}

export function drawTech(scene: Phaser.Scene, w: World, row: number, col: number): Objs {
  const ui = K.ui, o: Objs = [];
  const grid = techGrid(w);
  const bx = 8, by = 20, bw = 464, bh = 30 + grid.length * 17 + 46;
  o.push(box(scene, bx, by, bw, bh, ui.bgInt, ui.textInt, ui.panelInt).setDepth(30));
  o.push(text(scene, bx + bw / 2, by + 6, `RESEARCH - you have ${w.f[0].stars} stars`, { align: 'center', color: ui.accentInt, depth: 31 }));
  grid.forEach((ids, r) => {
    const y = by + 22 + r * 17;
    if (r === 0) {
      const cw = Math.floor((bw - 16) / Math.max(1, ids.length));
      ids.forEach((id, c) => {
        const x = bx + 8 + c * cw, st = techStatus(w, id);
        if (r === row && c === col) o.push(scene.add.rectangle(x - 2, y - 3, cw - 4, 15, ui.panelInt, 0.7).setOrigin(0).setDepth(31));
        o.push(text(scene, x, y, techName(id), { depth: 32, color: st.owned ? ui.accentInt : ui.textInt, maxWidth: cw - 40, maxLines: 1 }));
        o.push(text(scene, x + cw - 10, y, st.s, { align: 'right', depth: 32, color: st.owned ? ui.accentInt : st.ok ? ui.textInt : ui.dimInt }));
      });
      o.push(scene.add.rectangle(bx + 6, y + 12, bw - 12, 1, ui.dimInt).setOrigin(0).setDepth(31));
      return;
    }
    ids.forEach((id, c) => {
      const x = c === 0 ? bx + 8 : bx + 248, cw = c === 0 ? 232 : 208, st = techStatus(w, id);
      if (r === row && c === col) o.push(scene.add.rectangle(x - 2, y - 3, cw, 15, ui.panelInt, 0.7).setOrigin(0).setDepth(31));
      if (c === 0) o.push(scene.add.image(x, y - 4, spr(`icon_${id}`)).setOrigin(0).setDepth(32).setScale(0.875));
      else o.push(text(scene, x - 10, y, '>', { depth: 32, color: ui.dimInt }));
      o.push(text(scene, x + (c === 0 ? 18 : 0), y, techName(id), { depth: 32, color: st.owned ? ui.accentInt : st.s === 'LOCKED' ? ui.dimInt : ui.textInt, maxWidth: cw - 60, maxLines: 1 }));
      o.push(text(scene, x + cw - 6, y, st.s, { align: 'right', depth: 32, color: st.owned ? ui.accentInt : st.ok ? ui.textInt : ui.dimInt }));
    });
  });
  const id = grid[row]?.[col];
  if (id) {
    const line = TECHS[id].tier === 1 ? K.theme.game.tech_lines?.[id] : '';
    const req = TECHS[id].requires && !w.has(0, TECHS[id].requires!) ? ` Needs ${techName(TECHS[id].requires!)}.` : '';
    o.push(text(scene, bx + 10, by + bh - 40, `${techName(id)}: ${TECHS[id].effect}${req}` + (line ? `\n${line}` : ''), { depth: 32, color: ui.textInt, maxWidth: bw - 20, maxLines: 3 }));
  }
  return o;
}

export function drawTrain(scene: Phaser.Scene, w: World, c: City, sel: number, name: (t: UnitType) => string): Objs {
  const ui = K.ui, o: Objs = [];
  const bx = 30, by = 36, bw = 250, bh = 150;
  o.push(box(scene, bx, by, bw, bh, ui.bgInt, ui.textInt, ui.panelInt).setDepth(30));
  o.push(text(scene, bx + bw / 2, by + 6, `TRAIN AT ${c.name.toUpperCase()}`, { align: 'center', color: ui.accentInt, depth: 31, maxWidth: bw - 12, maxLines: 1 }));
  [...TRAINABLE, 'invest'].forEach((id, i) => {
    const y = 54 + i * 16;
    if (i === sel) o.push(scene.add.rectangle(36, y - 2, 238, 14, ui.panelInt, 0.6).setOrigin(0).setDepth(31));
    if (id === 'invest') {
      o.push(scene.add.image(44, y - 1, spr('star')).setOrigin(0).setDepth(32));
      o.push(text(scene, 60, y, c.level >= 5 ? 'Invest: city is at max level' : `Invest in ${c.name}: +${w.has(0, 'multivariate') ? 2 : 1} pop  ${w.investCost(c)}*`,
        { depth: 32, color: w.canInvest(0, c) ? ui.textInt : ui.dimInt, maxWidth: 212, maxLines: 1 }));
      return;
    }
    const t = id as UnitType, s = w.stats({ owner: 0, type: t });
    const locked = !w.unlocked(0, t);
    const art = UNIT_ORDER.includes(t) ? scene.add.image(40, y - 3, spr('units'), UNIT_ORDER.indexOf(t)) : scene.add.image(40, y - 3, spr('extra'), 8);
    o.push(art.setOrigin(0).setDepth(32).setAlpha(locked ? 0.4 : 1));
    const label = locked ? `${name(t)} - needs ${techName(UNITS[t].tech!)}`
      : `${name(t)}  ${s.cost}*  A${s.atk} D${s.def} M${s.move}${s.range > 1 ? ` R${s.range}` : ''}`;
    o.push(text(scene, 60, y, label, { depth: 32, color: w.canTrain(0, c, t) ? ui.textInt : ui.dimInt, maxWidth: 212, maxLines: 1 }));
  });
  const cap = w.myUnits(0).length >= w.unitCap(0);
  o.push(text(scene, 155, by + bh - 14, cap ? 'Unit limit reached: grow your cities' : `You have ${w.f[0].stars} stars`, { align: 'center', depth: 32, color: ui.dimInt }));
  return o;
}

/** City level-up: pick one of two rewards (Polytopia). */
export function drawReward(scene: Phaser.Scene, c: City, level: number, sel: number): Objs {
  const ui = K.ui, o: Objs = [];
  const bx = 40, by = 56, bw = 220, bh = 104;
  o.push(box(scene, bx, by, bw, bh, ui.bgInt, ui.accentInt, ui.panelInt).setDepth(30));
  o.push(text(scene, bx + bw / 2, by + 6, `${c.name.toUpperCase()} LEVEL ${level}!`, { align: 'center', color: ui.accentInt, depth: 31, maxWidth: bw - 12, maxLines: 1 }));
  o.push(text(scene, bx + bw / 2, by + 17, 'Pick a reward', { align: 'center', color: ui.dimInt, depth: 31 }));
  LEVEL_REWARDS[level].forEach((r, i) => {
    const x = bx + 8 + i * 104, y = by + 32;
    o.push(box(scene, x, y, 100, 50, ui.bgInt, i === sel ? ui.accentInt : ui.dimInt, i === sel ? ui.accentInt : ui.bgInt).setDepth(31));
    o.push(text(scene, x + 50, y + 7, r.name, { align: 'center', depth: 32, color: i === sel ? ui.accentInt : ui.textInt, maxWidth: 94, maxLines: 1 }));
    o.push(text(scene, x + 50, y + 20, r.desc, { align: 'center', depth: 32, color: i === sel ? ui.textInt : ui.dimInt, maxWidth: 92, maxLines: 2 }));
  });
  o.push(text(scene, bx + bw / 2, by + bh - 14, 'LEFT/RIGHT choose - ENTER take it', { align: 'center', color: ui.dimInt, depth: 32 }));
  return o;
}

export function drawTruce(scene: Phaser.Scene, rival: string, sel: number): Objs {
  const ui = K.ui, o: Objs = [];
  const bx = 40, by = 60, bw = 220, bh = 92;
  o.push(box(scene, bx, by, bw, bh, ui.bgInt, 0xf83800, ui.panelInt).setDepth(30));
  o.push(scene.add.image(bx + 8, by + 8, spr('rival')).setOrigin(0).setDisplaySize(24, 24).setDepth(31));
  o.push(text(scene, bx + 40, by + 9, `${rival} offers a 5-turn truce.`, { color: ui.accentInt, depth: 31, maxWidth: bw - 48, maxLines: 2 }));
  o.push(text(scene, bx + 10, by + 38, 'Nobody attacks or takes cities. Refusing makes it angry; accepting makes it greedy.', { color: ui.textInt, depth: 31, maxWidth: bw - 20, maxLines: 3 }));
  ['ACCEPT', 'REFUSE'].forEach((s, i) => {
    o.push(text(scene, bx + 60 + i * 100, by + bh - 14, i === sel ? `<${s}>` : s, { align: 'center', depth: 32, color: i === sel ? ui.accentInt : ui.dimInt }));
  });
  return o;
}
