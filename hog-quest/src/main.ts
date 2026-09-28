import Phaser from 'phaser';
import { startKit, spr, anim, heatRow, meta } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { W, text } from '@shared/ui';
import { K } from '@shared/kit';
import { ACHIEVEMENTS } from './achievements';
import { hq, ENDINGS } from './save';
import { R } from './state';
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
    'In battles: FIGHT, ACT, POSTHOG or SPARE. ACT > CHECK says what a problem wants. The right PostHog product fixes it at once.',
    'Then dodge its attack with the heart. Brush past bullets for TP. Be kind: sparing is the best ending.',
  ],
  titleArt: (scene: Phaser.Scene) => {
    scene.add.sprite(W / 2, 150, spr('boss')).setScale(2).play(anim('boss'));
    scene.add.sprite(W / 2 - 150, 162, spr('player'), 6).setScale(3);
    [0, 1, 2].forEach((i) => scene.add.sprite(W / 2 + 86 + i * 44, 166 - (i % 2) * 12, spr(`enemy_${i + 1}`)).play(anim(`enemy_${i + 1}`)));
    // Returning players see which endings they have found.
    const found = hq().endings;
    if (found.length) {
      const parts = ENDINGS.map((e) => (found.includes(e) ? e.toUpperCase() : '???'));
      text(scene, W / 2, 16, `ENDINGS ${found.length}/3: ${parts.join('  ')}`, { align: 'center', color: K.ui.accentInt, depth: 10 });
    }
  },
  // The first visit gets a clean title (Enter starts the story); after that: mode and heat.
  titleMenu: () => {
    if (meta.data.runs === 0) return [];
    const rushOpen = meta.data.wins > 0;
    return [
      { key: 'mode', label: 'MODE', choices: [{ label: 'STORY', value: 'story' }, { label: 'BOSS RUSH', value: 'rush', locked: !rushOpen }] },
      heatRow(5),
    ];
  },
  endSummary: (d) => {
    const lines: string[] = [];
    const s = hq();
    if (K.run.mode === 'rush') {
      if (d.won) lines.push(`RUSH TIME ${R.rushTime.toFixed(1)}s   BEST ${s.rushBest ? s.rushBest.toFixed(1) + 's' : '-'}`);
      return lines;
    }
    if (d.won && R.ending) {
      lines.push(`ENDING: ${R.ending.toUpperCase()}   (${s.endings.length}/3 FOUND)`);
      const missing = ENDINGS.filter((e) => !s.endings.includes(e));
      const tease: Record<string, string> = {
        pacifist: 'What if you spared every single problem?',
        bugfix: 'What if you FOUGHT every problem instead?',
        neutral: 'What if you spared some, and fought some?',
      };
      if (missing.length) lines.push(tease[missing[0]]);
    }
    if (R.secretsFound) lines.push(`SECRETS FOUND: ${R.secretsFound}`);
    return lines;
  },
  achievements: ACHIEVEMENTS,
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
    // Optional route endings: when the theme leaves them out, the sanitiser borrows the default
    // theme's text. Drop that instead, so the game falls back to the prospect's own `ending`.
    for (const k of ['ending_pacifist', 'ending_bugfix']) {
      const i = issues.findIndex((x) => x === `game.${k}: missing`);
      if (i >= 0) { issues.splice(i, 1); delete g[k]; }
    }
    void hooks;
  },
});
