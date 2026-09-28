// Hog Saga feel: the battle swirl and reveal, Ship It cut-ins, slash marks, bouncing damage numbers,
// ZzFX jingles and the battle/boss music swap. Everything is time-scaled by R.speed so bots stay fast.
import Phaser from 'phaser';
import { K, spr, meta } from '@shared/kit';
import { text, W, H } from '@shared/ui';
import { R } from './state';

const reduced = () => { try { return meta.reducedMotion(); } catch { return false; } };
const ms = (n: number) => Math.max(16, n / R.speed);

/** Spiral of black blocks closing in, then `done` (the Dragon Quest-ish battle swirl). */
export function swirl(scene: Phaser.Scene, dur: number, done: () => void) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(2000);
  const S = 30, cols = Math.ceil(W / S), rows = Math.ceil(H / S);
  const order: [number, number][] = [];
  let x0 = 0, y0 = 0, x1 = cols - 1, y1 = rows - 1;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) order.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) order.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) order.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) order.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  const total = ms(dur);
  const t0 = scene.time.now;
  let drawn = 0;
  const ev = scene.time.addEvent({ delay: 16, loop: true, callback: () => {
    const n = Math.min(order.length, Math.ceil(((scene.time.now - t0) / total) * order.length));
    for (; drawn < n; drawn++) {
      const [x, y] = order[drawn];
      g.fillStyle(drawn % 7 === 0 ? K.ui.panelInt : 0x000000, 1).fillRect(x * S, y * S, S, S);
    }
    if (drawn >= order.length) {
      ev.remove();
      done();
      scene.time.delayedCall(50, () => g.destroy());
    }
  } });
}

/** Battle opening: a black screen splits open from the middle. */
export function reveal(scene: Phaser.Scene, dur = 380) {
  const top = scene.add.rectangle(0, 0, W, H / 2, 0x000000).setOrigin(0).setDepth(3000);
  const bot = scene.add.rectangle(0, H / 2, W, H / 2, 0x000000).setOrigin(0).setDepth(3000);
  scene.tweens.add({ targets: top, y: -H / 2, duration: ms(dur), ease: 'Quad.In', onComplete: () => top.destroy() });
  scene.tweens.add({ targets: bot, y: H, duration: ms(dur), ease: 'Quad.In', onComplete: () => bot.destroy() });
}

/** Three white claw marks across a target. */
export function slash(scene: Phaser.Scene, x: number, y: number, colour = 0xfcfcfc) {
  const g = scene.add.graphics().setDepth(70);
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 7;
    g.lineStyle(2, 0x000000, 1).lineBetween(x - 11 + ox, y - 13, x + 9 + ox, y + 11);
    g.lineStyle(1, colour, 1).lineBetween(x - 11 + ox, y - 13, x + 9 + ox, y + 11);
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: ms(260), delay: ms(60), onComplete: () => g.destroy() });
}

/** Sparkle ring for magic and data hits. */
export function sparkle(scene: Phaser.Scene, x: number, y: number, colour: number) {
  const g = scene.add.graphics().setDepth(70);
  const pts = 8;
  const draw = (r: number) => {
    g.clear();
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      g.fillStyle(i % 2 ? 0xfcfcfc : colour, 1).fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r) - 1, 3, 3);
    }
  };
  const o = { r: 4 };
  draw(4);
  scene.tweens.add({ targets: o, r: 22, duration: ms(300), onUpdate: () => draw(o.r), onComplete: () => g.destroy() });
}

/** A damage number or word that pops up, overshoots and falls away. */
export function pop(scene: Phaser.Scene, x: number, y: number, str: string, colour: number, big = false) {
  const t = text(scene, x, y, str, { align: 'center', color: colour, depth: 120, scale: big ? 2 : 1 });
  if (reduced()) {
    scene.tweens.add({ targets: t, alpha: 0, delay: ms(500), duration: ms(200), onComplete: () => t.destroy() });
    return t;
  }
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, y: y - 12, duration: ms(160), ease: 'Back.Out' });
  scene.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: ms(520), duration: ms(260), onComplete: () => t.destroy() });
  return t;
}

/** Ship It cut-in: dark band, the pair sliding in, the combo name, a flash. */
export function cutIn(scene: Phaser.Scene, sprites: string[], title: string, colour: number, done: () => void) {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const band = scene.add.rectangle(0, 58, W, 84, 0x000000, 0.85).setOrigin(0).setDepth(400);
  const edge = scene.add.graphics().setDepth(401);
  edge.fillStyle(colour, 1).fillRect(0, 58, W, 2).fillRect(0, 140, W, 2);
  objs.push(band, edge);
  const speed = R.speed;
  sprites.forEach((k, i) => {
    const fromLeft = i === 0;
    const s = scene.add.sprite(fromLeft ? -40 : W + 40, 100, spr(k), k === 'hero' ? 6 : 0).setScale(4).setDepth(402);
    if (!fromLeft) s.setFlipX(true);
    const tx = sprites.length === 1 ? W / 2 - 110 : fromLeft ? W / 2 - 150 : W / 2 + 150;
    scene.tweens.add({ targets: s, x: tx, duration: Math.max(16, 220 / speed), ease: 'Back.Out' });
    objs.push(s);
  });
  const t = text(scene, W / 2, 92, title, { align: 'center', scale: 2, color: colour, depth: 403, shadow: 0x000000 });
  t.setAlpha(0);
  objs.push(t);
  scene.tweens.add({ targets: t, alpha: 1, duration: Math.max(16, 120 / speed), delay: Math.max(16, 200 / speed) });
  scene.time.delayedCall(Math.max(16, 260 / speed), () => {
    scene.cameras.main.flash(120, 255, 255, 255);
    K.play('combo');
  });
  scene.time.delayedCall(Math.max(40, 1100 / speed), () => {
    objs.forEach((o) => o.destroy());
    done();
  });
}

// ---------------------------------------------------------------- jingles + music

/** Play ZzFX note presets in a row (victory jingle, level-up fanfare). */
export function jingle(scene: Phaser.Scene, notes: string[], gap = 110, vol = 0.5) {
  notes.forEach((n, i) => {
    if (!n) return;
    scene.time.delayedCall(i * Math.max(20, gap / Math.min(R.speed, 2)), () => K.play(n, vol, 10));
  });
}
export const VICTORY = ['nC5', 'nE5', 'nG5', 'nC6', '', 'nG5', 'nC6'];
export const FANFARE = ['nG5', 'nG5', 'nG5', 'nC6'];

const TRACKS = { battle: 'saga-battle', boss: 'saga-boss' };

/** Queue the kit's battle tracks (fixed kit audio, not per prospect). */
export function loadMusic(scene: Phaser.Scene) {
  if (!scene.cache.audio.exists(TRACKS.battle)) scene.load.audio(TRACKS.battle, 'assets/kit/battle.ogg');
  if (!scene.cache.audio.exists(TRACKS.boss)) scene.load.audio(TRACKS.boss, 'assets/kit/boss.ogg');
}

let current: Phaser.Sound.BaseSound | null = null;

/** Swap the overworld music for a battle track (or back with `null`). Never throws. */
export function battleMusic(scene: Phaser.Scene, which: 'battle' | 'boss' | null) {
  try {
    const world = scene.sound.get('music');
    if (current) { current.stop(); current.destroy(); current = null; }
    if (!which) {
      if (world && world.isPaused) world.resume();
      return;
    }
    const key = TRACKS[which];
    if (!scene.cache.audio.exists(key)) return;
    if (world?.isPlaying) world.pause();
    current = scene.sound.add(key, { loop: true, volume: 0.35 });
    current.play();
  } catch { /* music is optional */ }
}
