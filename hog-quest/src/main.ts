import Phaser from 'phaser';
import { startKit, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { ExploreScene } from './explore';
import { BattleScene } from './battle';

startKit({
  id: 'hog-quest',
  name: 'Hog Quest',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [ExploreScene, BattleScene],
  gameScene: 'Explore',
  howTo: (t) => [
    `${t.prospect.name} has problems. Walk the office, meet the team, and deal with them, PostHog style.`,
    'ARROWS or WASD to walk. ENTER to talk and to read on.',
    'In battles: FIGHT, TALK, POSTHOG or SPARE. The right PostHog product (or a good talk) lets you SPARE a problem.',
    'Then dodge its attack with the heart. Be kind: sparing is the best ending.',
  ],
  titleArt: (scene: Phaser.Scene) => {
    scene.add.sprite(W / 2, 150, spr('boss')).setScale(2).play(anim('boss'));
    scene.add.sprite(W / 2 - 150, 162, spr('player'), 6).setScale(3);
    [0, 1, 2].forEach((i) => scene.add.sprite(W / 2 + 86 + i * 44, 166 - (i % 2) * 12, spr(`enemy_${i + 1}`)).play(anim(`enemy_${i + 1}`)));
  },
  postSanitize: (t, issues) => {
    const g = t.game;
    const fix = (def: any, where: string, i: number) => {
      if (def && !t.products.includes(def.solved_by)) {
        issues.push(`${where}.solved_by ${def.solved_by} not in products: using ${t.products[i % t.products.length]}`);
        def.solved_by = t.products[i % t.products.length];
      }
    };
    (g.enemies ?? []).forEach((e: any, i: number) => fix(e, `game.enemies[${i}]`, i));
    fix(g.boss, 'game.boss', 3);
    void hooks;
  },
});
