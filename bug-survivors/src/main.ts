import Phaser from 'phaser';
import { startKit, K, spr, anim, heatRow } from '@shared/kit';
import { meta } from '@shared/meta';
import { text, W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { GameScene, productName, theName, lastRun, HOG32, HOG64, CREST16, CREST64 } from './game';
import { ShopScene } from './shop';
import { HEAT, YOLO } from './content';
import { ACHIEVEMENTS } from './crests';
import { HOGS, hogFrame, hogName } from './hoggies';
import { dailyBest, currentHog, save, syncCrestHogs } from './save';

/** Runs once per how-to screen: the SHOP title choice skips straight to the shop. Module scope so off() matches. */
function toShop(this: void) {
  if (K.run.mode !== 'shop') return;
  const howto = (window as any).__phaser?.scene?.getScene('HowTo') as Phaser.Scene | undefined;
  howto?.scene.start('Shop');
}

startKit({
  id: 'bug-survivors',
  name: 'Bug Survivors',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene, ShopScene],
  gameScene: 'Game',
  // Kit-fixed PostHog brand art: every hoggie (player characters) and every team crest (achievements).
  preload: (scene) => {
    scene.load.spritesheet(HOG32, 'assets/kit/hoggies32.png', { frameWidth: 32, frameHeight: 32 });
    scene.load.spritesheet(HOG64, 'assets/kit/hoggies64.png', { frameWidth: 64, frameHeight: 64 });
    scene.load.spritesheet(CREST16, 'assets/kit/crests16.png', { frameWidth: 16, frameHeight: 16 });
    scene.load.spritesheet(CREST64, 'assets/kit/crests64.png', { frameWidth: 64, frameHeight: 64 });
  },
  howTo: (t) => {
    const lines = [
      `Bugs are swarming ${t.prospect.name}. Survive until ${theName(t.game.boss.name)} shows up, then squash it.`,
      'Every boss is a release. After it: cash out, or keep going into the next wave for new PostHog tools.',
      'Move with the ARROW KEYS or WASD. Your PostHog weapons fire on their own. Grab the blue gems to level up.',
      `You start with ${productName(t.game.starting_product)}. Elites drop chests. ESC pauses.`,
    ];
    if (K.run.heat > 0) lines.push(`HEAT ${K.run.heat}: ${HEAT.slice(1, K.run.heat + 1).map((h) => h.desc).join(', ')}.`);
    else if (K.run.mode === 'yolo') lines.push('YOLO: --dangerously-skip-permissions. x3 everything, no pauses, Max picks your cards.');
    else if (K.run.mode === 'daily') lines.push("DAILY: everyone gets today's weapon, bug waves and events, and the same hoggie.");
    return lines;
  },
  titleArt: (scene: Phaser.Scene) => {
    syncCrestHogs();
    // The hoggie facing down a lineup of the prospect's bugs, with the boss looming.
    scene.add.sprite(W / 2, 150, spr('boss')).play(anim('boss')).setAlpha(0.9);
    const hog = currentHog();
    const im = scene.add.image(W / 2 - 150, 166, HOG64, hogFrame(hog)).setFlipX(true);
    scene.tweens.add({ targets: im, y: 162, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    [0, 1, 2].forEach((i) => {
      scene.add.sprite(W / 2 + 70 + i * 26, 170 + (i % 2) * 10, spr(`enemy_${i + 1}`)).setScale(2).setFlipX(true)
        .play(anim(`enemy_${i + 1}`));
    });
    // Returning players: gold, best wave, hoggie count and today's daily best.
    const sv = save();
    const parts: string[] = [];
    if (meta.data.coins > 0) parts.push(`GOLD ${meta.data.coins}`);
    if (sv.bestWave >= 2) parts.push(`BEST WAVE ${sv.bestWave}`);
    if (meta.data.runs > 0) parts.push(`HOGGIES ${sv.hogs.length}/${HOGS.length}`);
    const db = dailyBest();
    if (db > 0) parts.push(`DAILY BEST ${db}`);
    if (parts.length) text(scene, W / 2, 16, parts.join('   '), { align: 'center', color: 0xf8d878, depth: 10 });
    if (meta.data.runs > 0) text(scene, W / 2 - 150, 202, hogName(hog).toUpperCase(), { align: 'center', color: K.ui.dimInt, depth: 10, maxWidth: 110, maxLines: 1 });
    // SHOP is a title choice: when the run starts in shop mode, jump from the how-to straight to the shop.
    const howto = scene.scene.get('HowTo');
    howto.events.off('create', toShop);
    howto.events.once('create', toShop);
  },
  titleMenu: () => {
    const yolo = save().bestWave >= YOLO.unlockWave;
    return [
      { key: 'mode', choices: [
        { label: 'RUN', value: 'standard' },
        { label: 'DAILY', value: 'daily' },
        { label: 'YOLO', value: 'yolo', locked: !yolo },
        { label: 'SHOP', value: 'shop' },
      ] },
      heatRow(5),
    ];
  },
  endSummary: () => lastRun.lines.slice(0, 2),
  achievements: ACHIEVEMENTS,
  postSanitize: (t, issues) => {
    // The starting weapon must be one of the featured products.
    if (!t.products.includes(t.game.starting_product)) {
      issues.push(`game.starting_product ${t.game.starting_product} not in products: using ${t.products[0]}`);
      t.game.starting_product = t.products[0];
    }
  },
});

export { K };
