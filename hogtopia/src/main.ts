import Phaser from 'phaser';
import { startKit, spr, heatRow, meta } from '@shared/kit';
import { W } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { MapScene, productName } from './scene';
import { ACHIEVEMENTS, endSummary } from './progress';

startKit({
  id: 'hogtopia',
  name: 'Hogtopia',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [MapScene],
  gameScene: 'Map',
  howTo: (t) => [
    `Lead ${t.game.faction.name} from ${t.game.faction.capital}. ${t.game.rival.name} wants the same land. Take its capital, or out-grow it in 24 turns.`,
    'ARROWS move the cursor. ENTER selects a unit, then ENTER on a lit tile to move or on a red one to attack.',
    'Park a unit on a village for a turn, then press C to capture it. ENTER on your city trains units or invests; ENTER on a resource harvests it.',
    `T opens research: ${t.products.slice(0, 3).map(productName).join(', ')} and more PostHog tech. E ends the turn. Growing cities earn a reward.`,
  ],
  // Returning players pick the next map or today's daily map, and a HEAT level. A first visit shows no menu.
  titleMenu: () => (meta.data.runs > 0 ? [
    { key: 'mode', label: 'MAP', choices: [{ label: 'NEXT', value: 'standard' }, { label: 'DAILY', value: 'daily' }] },
    heatRow(5),
  ] : []),
  endSummary: (d) => endSummary(d),
  achievements: ACHIEVEMENTS,
  titleArt: (scene: Phaser.Scene) => {
    scene.add.image(W / 2 - 120, 150, spr('hq')).setScale(2);
    scene.add.image(W / 2 - 78, 158, spr('advisor')).setScale(2);
    scene.add.image(W / 2 + 120, 150, spr('rival')).setScale(2);
    [0, 1, 4].forEach((f, i) => scene.add.image(W / 2 - 34 + i * 18, 166 - (i % 2) * 6, spr('units'), f).setScale(2));
    [5, 6, 8].forEach((f, i) => scene.add.image(W / 2 + 30 + i * 18, 166 - (i % 2) * 6, spr('units'), f).setScale(2).setFlipX(true));
  },
  postSanitize: (t, issues) => {
    const g = t.game;
    // Keep only names we can use; the world needs at least one city name.
    const seen = new Set<string>();
    g.cities = (g.cities ?? []).filter((c: string) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
    if (!g.cities.length) { g.cities = ['North Office', 'South Office', 'Data Lake', 'Old Town']; issues.push('game.cities empty: using generic names'); }
    if (g.cities.includes(g.faction.capital)) { g.cities = g.cities.filter((c: string) => c !== g.faction.capital); if (!g.cities.length) g.cities = ['Outpost']; }
    if (!g.tips?.length) { g.tips = ['Grab villages early: every city means more stars.']; issues.push('game.tips empty'); }
    if (!g.rival.taunts?.length) { g.rival.taunts = ['You will never ship.']; issues.push('game.rival.taunts empty'); }
  },
});
