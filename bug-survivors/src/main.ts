import Phaser from 'phaser';
import { startKit, K, spr, anim, heatRow } from '@shared/kit';
import { meta } from '@shared/meta';
import { text, W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { GameScene, productName, theName, lastRun } from './game';
import { ShopScene } from './shop';
import { ACHIEVEMENTS, HEAT } from './content';
import { dailyBest, currentHero } from './save';

startKit({
  id: 'bug-survivors',
  name: 'Bug Survivors',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene, ShopScene],
  gameScene: 'Game',
  howTo: (t) => {
    const lines = [
      `Bugs are swarming ${t.prospect.name}. Survive until ${theName(t.game.boss.name)} shows up, then squash it.`,
      'Move with the ARROW KEYS or WASD. Your PostHog weapons fire on their own.',
      'Grab the blue gems. Each level-up lets you pick a new PostHog product or an upgrade (LEFT/RIGHT, ENTER).',
      `You start with ${productName(t.game.starting_product)}. Elites drop chests. ESC pauses.`,
    ];
    if (K.run.heat > 0) lines.push(`HEAT ${K.run.heat}: ${HEAT.slice(1, K.run.heat + 1).map((h) => h.desc).join(', ')}.`);
    else if (K.run.mode === 'endless') lines.push('ENDLESS: the boss returns every 2:00, stronger each time.');
    else if (K.run.mode === 'daily') lines.push("DAILY: everyone gets today's weapon, bugs and drops.");
    return lines;
  },
  titleArt: (scene: Phaser.Scene) => {
    // The hedgehog facing down a lineup of the prospect's bugs, with the boss looming.
    scene.add.sprite(W / 2, 150, spr('boss')).play(anim('boss')).setAlpha(0.9);
    const hero = currentHero();
    const hog = scene.add.sprite(W / 2 - 150, 164, spr('player')).setScale(2).play(anim('player'));
    if (hero.tint !== null) hog.setTint(hero.tint);
    if (hero.hat >= 0) scene.add.image(W / 2 - 150 - 24 + 18, 164 - 24 - 6, spr('hat'), hero.hat).setOrigin(0).setScale(2);
    [0, 1, 2].forEach((i) => {
      scene.add.sprite(W / 2 + 70 + i * 26, 170 + (i % 2) * 10, spr(`enemy_${i + 1}`)).setScale(2).setFlipX(true)
        .play(anim(`enemy_${i + 1}`));
    });
    // Returning players: gold in the bank and today's daily best.
    const parts: string[] = [];
    if (meta.data.coins > 0) parts.push(`GOLD ${meta.data.coins}`);
    const db = dailyBest();
    if (db > 0) parts.push(`DAILY BEST ${db}`);
    if (parts.length) text(scene, W / 2, 16, parts.join('   '), { align: 'center', color: 0xf8d878, depth: 10 });
    // SHOP is a title choice: when the run starts in shop mode, jump from the how-to straight to the shop.
    const howto = scene.scene.get('HowTo');
    const toShop = () => { if (K.run.mode === 'shop') howto.scene.start('Shop'); };
    howto.events.off('create', toShop);
    howto.events.once('create', toShop);
  },
  titleMenu: () => {
    const won = meta.data.wins > 0;
    return [
      { key: 'mode', choices: [
        { label: 'RUN', value: 'standard' },
        { label: 'DAILY', value: 'daily' },
        { label: 'ENDLESS', value: 'endless', locked: !won },
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
