// What each Ship It combo does, as timed beats (ms after the cut-in, action). battle.ts plays the
// cut-in, then schedules the beats and ends the turn after the last one.
import { R, Member } from './state';
import type { ComboId, Kind } from './rules';
import type { Foe } from './battle';

export interface ComboCtx {
  atk: number;          // the pair's best ATK
  mag: number;          // the pair's best MAG
  target: Foe | undefined;
  foes(): Foe[];        // alive foes
  hit(f: Foe, dmg: number, kind: Kind, crit?: boolean): void;
  phys(atk: number, def: number): number;
  magic(mag: number, power: number, def: number): number;
  guardOf(f: Foe): Foe;
  heal(m: Member, amount: number): void;
  cure(m: Member): void;
  refresh(): void;
}

type Beat = [number, () => void];

export const COMBO_FX: Record<ComboId, (c: ComboCtx) => Beat[]> = {
  // One hit of every kind on every foe: always finds the weak spot.
  launch_day: (c) => (['strike', 'magic', 'data'] as Kind[]).map((k, i): Beat => [i * 220, () => c.foes().forEach((f) =>
    c.hit(f, k === 'strike' ? c.phys(c.atk, f.def) : c.magic(c.mag, 1.0, f.def), k))]),
  // A huge crit on one foe, then the whole party is patched up.
  hotfix_rush: (c) => {
    const f = c.guardOf(c.target && c.target.alive ? c.target : [...c.foes()].sort((a, b) => b.hp - a.hp)[0]);
    return [
      [0, () => c.hit(f, Math.round(c.phys(c.atk, f.def) * 3), 'strike', true)],
      [260, () => { for (const p of R.party) { if (p.hp <= 0) p.hp = 1; c.heal(p, p.maxHp * 0.5); c.cure(p); } c.refresh(); }],
    ];
  },
  // Strong magic on all, then everyone is FOCUSED and gets MP back.
  insight_loop: (c) => [
    [0, () => c.foes().forEach((f) => c.hit(f, c.magic(c.mag, 1.6, f.def), 'magic'))],
    [260, () => { for (const p of R.party) if (p.hp > 0) { p.status.focused = 3; p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * 0.4)); } c.refresh(); }],
  ],
  // Solo hedgehog: three waves of strikes.
  solo_ship: (c) => [0, 200, 400].map((t): Beat => [t, () => c.foes().forEach((f) => c.hit(f, c.phys(c.atk, f.def), 'strike'))]),
};
