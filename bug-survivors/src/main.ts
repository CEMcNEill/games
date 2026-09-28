import Phaser from 'phaser';
import { startKit, K, spr, anim } from '@shared/kit';
import { W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { GameScene, productName, theName } from './game';

startKit({
  id: 'bug-survivors',
  name: 'Bug Survivors',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene],
  gameScene: 'Game',
  howTo: (t) => [
    `Bugs are swarming ${t.prospect.name}. Survive until ${theName(t.game.boss.name)} shows up, then squash it.`,
    'Move with the ARROW KEYS or WASD. Your PostHog weapons fire on their own.',
    'Grab the blue gems. Each level-up lets you pick a new PostHog product or an upgrade (LEFT/RIGHT, ENTER).',
    `You start with ${productName(t.game.starting_product)}. ESC pauses.`,
  ],
  titleArt: (scene: Phaser.Scene) => {
    // The hedgehog facing down a lineup of the prospect's bugs, with the boss looming.
    scene.add.sprite(W / 2, 150, spr('boss')).play(anim('boss')).setAlpha(0.9);
    scene.add.sprite(W / 2 - 150, 164, spr('player')).setScale(2).play(anim('player'));
    [0, 1, 2].forEach((i) => {
      scene.add.sprite(W / 2 + 70 + i * 26, 170 + (i % 2) * 10, spr(`enemy_${i + 1}`)).setScale(2).setFlipX(true)
        .play(anim(`enemy_${i + 1}`));
    });
  },
  postSanitize: (t, issues) => {
    // The starting weapon must be one of the featured products.
    if (!t.products.includes(t.game.starting_product)) {
      issues.push(`game.starting_product ${t.game.starting_product} not in products: using ${t.products[0]}`);
      t.game.starting_product = t.products[0];
    }
  },
});

export { K };
