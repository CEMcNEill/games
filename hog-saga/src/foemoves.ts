// What each enemy move does, one handler per FoeMoveId (ai.ts picks the move, battle.ts supplies the
// context). Every handler ends by calling c.done(ms) with how long the move takes on screen.
import { K } from '@shared/kit';
import { R, Member } from './state';
import { STATUS, StatusId } from './rules';
import { randomVictim, FoeMove, FoeMoveId } from './ai';
import type { Foe } from './battle';

/** MASS OUTAGE power (telegraphed a turn ahead; DEFEND and Feature Flags each halve it). */
export const OUTAGE = 1.7;

export interface FoeCtx {
  f: Foe;
  mv: FoeMove;
  /** The move's target, or a random living member. Null only if the whole party is down. */
  v: Member | null;
  boss: boolean;
  strike(m: Member, mult?: number): void;
  spell(m: Member, mult: number): void;
  inflict(m: Member, s?: StatusId): void;
  aliveParty(): Member[];
  done(ms: number): void;
  say(t: string): void;
  lunge(): void;
  wait(ms: number, fn: () => void): void;
  shake(px: number, ms: number): void;
  flashCam(ms: number, r: number, g: number, b: number): void;
  tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): void;
  sparkle(o: Foe, colour: number): void;
  redraw(o: Foe): void;
  refresh(): void;
}

/** Moves that don't need a party target. */
export const SELF_MOVES = new Set<FoeMoveId>(['guard', 'harden', 'cure', 'focus', 'windup', 'charge', 'rollback']);

/** A follow-up hit on someone new (fast foes, the angry boss). */
function again(c: FoeCtx, line: string, lunge: boolean) {
  c.wait(lunge ? 350 : 500, () => {
    const v2 = randomVictim();
    if (!v2) return;
    if (lunge) c.lunge();
    c.say(line);
    c.strike(v2);
    c.refresh();
  });
}

export const FOE_MOVES: Record<FoeMoveId, (c: FoeCtx) => void> = {
  attack: (c) => {
    c.lunge();
    c.say(`${c.f.name} attacks ${c.v!.name}!`);
    c.strike(c.v!);
    c.inflict(c.v!, c.mv.status);
    c.done(800);
  },
  double: (c) => {
    c.lunge();
    c.say(`${c.f.name} darts at ${c.v!.name}!`);
    c.strike(c.v!);
    c.inflict(c.v!, c.mv.status);
    again(c, `${c.f.name} strikes again!`, true);
    c.done(1100);
  },
  windup: (c) => {
    c.f.windup = true;
    c.say(`${c.f.name} winds up a heavy blow! DEFEND or BREAK it!`);
    K.play('status', 0.5);
    c.tween({ targets: c.f.s, angle: -8, duration: 150 / R.speed, yoyo: true });
    c.done(900);
  },
  heavy: (c) => {
    c.f.windup = false;
    c.lunge();
    c.say(`${c.f.name} lands a heavy blow on ${c.v!.name}!`);
    c.strike(c.v!, 1.8);
    c.shake(4, 200);
    c.inflict(c.v!, c.mv.status);
    c.done(900);
  },
  miss: (c) => {
    c.lunge();
    c.say(`${c.f.name} swings wildly and misses!`);
    c.done(700);
  },
  guard: (c) => {
    c.f.guarding = c.mv.ally!;
    c.mv.ally!.guardedBy = c.f;
    c.say(`${c.f.name} guards ${c.mv.ally!.name}!`);
    K.play('shield', 0.5);
    c.done(800);
  },
  harden: (c) => {
    c.f.hardened = 2;
    c.say(`${c.f.name} hardens its shell!`);
    K.play('shield', 0.5);
    c.done(700);
  },
  cure: (c) => {
    const a = c.mv.ally!;
    for (const k of Object.keys(a.status) as StatusId[]) if (!STATUS[k].good) delete a.status[k];
    if (a.broken) { a.broken = 0; a.shield = a.maxShield; }
    a.hp = Math.min(a.maxHp, a.hp + Math.round(a.maxHp * 0.15));
    c.say(`${c.f.name} patches up ${a.name}!`);
    K.play('heal', 0.5);
    c.sparkle(a, 0x58d854);
    c.done(800);
  },
  focus: (c) => {
    const a = c.mv.ally!;
    a.status.focused = 3;
    c.say(`${c.f.name} FOCUSES ${a.name}!`);
    K.play('status', 0.5);
    c.sparkle(a, STATUS.focused.color);
    c.done(800);
  },
  storm: (c) => {
    c.lunge();
    c.say(c.boss ? `${c.f.name} triggers a system-wide outage!` : `${c.f.name} casts a storm on the whole party!`);
    c.flashCam(120, 248, 56, 0);
    for (const m of c.aliveParty()) c.spell(m, c.boss ? 0.98 : 0.7);
    c.done(900);
  },
  hex: (c) => {
    c.lunge();
    c.say(`${c.f.name} casts a hex on ${c.v!.name}!`);
    c.spell(c.v!, 1.15);
    c.inflict(c.v!, c.mv.status);
    c.done(900);
  },
  charge: (c) => {
    const s = c.f.s;
    c.f.telegraph = true;
    c.say(`${c.f.name} is charging a MASS OUTAGE! DEFEND!`);
    K.play('boss', 0.5);
    c.tween({ targets: s, scaleX: s.scaleX * 1.1, scaleY: s.scaleY * 1.1, duration: 200 / R.speed, yoyo: true, repeat: 1 });
    c.done(1100);
  },
  outage: (c) => {
    c.f.telegraph = false;
    c.lunge();
    c.say(`${c.f.name} unleashes a MASS OUTAGE!`);
    c.flashCam(200, 248, 56, 0);
    c.shake(6, 300);
    for (const m of c.aliveParty()) c.spell(m, OUTAGE);
    c.done(1200);
  },
  slam: (c) => {
    const s = c.f.s;
    c.tween({ targets: s, scaleX: s.scaleX * 1.05, scaleY: s.scaleY * 1.05, duration: 120, yoyo: true });
    c.say(`${c.f.name} slams ${c.v!.name}!`);
    c.strike(c.v!);
    c.inflict(c.v!, c.mv.status);
    // The angry boss deploys twice now and then (more often in phase 3).
    if (c.f.phase >= 2 && Math.random() < (c.f.phase >= 3 ? 0.6 : 0.3)) {
      again(c, `${c.f.name} deploys again!`, false);
      c.done(1300);
      return;
    }
    c.done(1000);
  },
  rollback: (c) => {
    c.f.canRollback = false;
    c.f.hp = Math.min(c.f.maxHp, c.f.hp + Math.round(c.f.maxHp * 0.15));
    c.say(`${c.f.name} ROLLS BACK and restores itself!`);
    K.play('heal');
    c.flashCam(200, 216, 0, 204);
    c.redraw(c.f);
    c.done(1100);
  },
};
