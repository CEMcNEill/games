import Phaser from 'phaser';
import { startKit, spr, anim, K } from '@shared/kit';
import { W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { ExploreScene } from './explore';
import { BattleScene } from './battle';
import { theName } from './state';

startKit({
  id: 'hog-saga',
  name: 'Hog Saga',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [ExploreScene, BattleScene],
  gameScene: 'Explore',
  howTo: (t) => [
    `Monsters from ${t.prospect.name}'s backlog roam the land. Lead the hedgehog, ${t.game.party[0].name} and ${t.game.party[1].name} east and defeat ${theName(t.game.boss.name)}.`,
    'ARROWS or WASD to walk. ENTER to talk, open chests and rest. ESC shows your party.',
    'Walk into a monster to fight. In battle pick FIGHT, SKILL, ITEM, DEFEND or RUN with the ARROWS and ENTER.',
    'Every SKILL is a PostHog product. Beat an area\'s monsters to bring down its firewall.',
  ],
  titleArt: (scene: Phaser.Scene) => {
    // A soft glow so dark generated sprites don't vanish into a dark brand background.
    const glow = scene.add.graphics();
    [[340, 90, 0.10], [300, 72, 0.12], [250, 54, 0.14]].forEach(([w, h, a]) =>
      glow.fillStyle(K.ui.panelInt, a).fillEllipse(W / 2, 150, w, h));
    glow.fillStyle(0xfcfcfc, 0.06).fillEllipse(W / 2 + 90, 140, 110, 90);
    scene.add.sprite(W / 2 + 90, 184, spr('boss')).setOrigin(0.5, 1).setScale(1.4).play(anim('boss'));
    const y = 172;
    scene.add.sprite(W / 2 - 150, y, spr('hero'), 6).setScale(3);
    scene.add.sprite(W / 2 - 110, y, spr('party_1')).setScale(3).play(anim('party_1'));
    scene.add.sprite(W / 2 - 70, y, spr('party_2')).setScale(3).play(anim('party_2'));
    scene.add.sprite(W / 2 + 10, 176, spr('enemy_1')).setOrigin(0.5, 1).setFlipX(true).play(anim('enemy_1'));
    scene.add.sprite(W / 2 + 170, 176, spr('enemy_5')).setOrigin(0.5, 1).play(anim('enemy_5'));
  },
});
