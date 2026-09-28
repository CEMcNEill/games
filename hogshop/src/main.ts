import Phaser from 'phaser';
import { startKit, spr, anim, meta, heatRow } from '@shared/kit';
import { W, text, wrap } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { hooks, sharedDebug } from '@shared/hooks';
import { GameScene, productName, kitSave, lastEnd, names } from './game';
import { ACHIEVEMENTS, ENDINGS, TOOLS, fill } from './content';

startKit({
  id: 'hogshop',
  name: 'HogShop',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene],
  gameScene: 'Game',
  howTo: (t) => {
    const tools = (t.products as string[]).filter((p) => p in TOOLS).slice(0, 4);
    const g = t.game;
    return [
      `You run the back room at ${g.store.name}. Orders pop up at the top; the products ride in on two conveyor belts.`,
      'ARROWS move. SPACE grabs an item off a belt, packs it into its order\'s box at a table, and picks up the sealed box.',
      `Carry each sealed box to the door on its ticket (${g.docks.standard}, ${g.docks.express}, ${g.docks.international}) before the customer runs out of patience.`,
      'Lost orders and wrong doors cost stars. Keep the shop above zero stars for 5 days.',
      tools.length
        ? `Keys 1-${tools.length} are PostHog tools: ${tools.map((id) => `${TOOLS[id as keyof typeof TOOLS].name} (${productName(id)})`).join(', ')}.`
        : 'Work fast: every day has a shipping target.',
    ];
  },
  postSanitize: (t) => {
    // Customer names show on 92px tickets next to an order number: keep them short.
    t.game.customers = (t.game.customers as string[]).map((c) => String(c).slice(0, 8));
  },
  achievements: ACHIEVEMENTS,
  titleMenu: () => [
    { key: 'mode', label: 'MODE', choices: [
      { label: 'WEEK', value: 'week' },
      { label: 'ENDLESS', value: 'endless', locked: meta.data.wins === 0 },
      { label: 'DAILY', value: 'daily' },
    ] },
    heatRow(5),
  ],
  endSummary: () => {
    const save = kitSave();
    if (lastEnd.endless) return [`ENDLESS BEST ${save.endlessBest} ORDERS`];
    const out: string[] = [];
    if (lastEnd.daily) out.push(`DAILY WEEK ${new Date().toISOString().slice(0, 10)}`);
    const e = lastEnd.ending;
    if (e) out.push(...wrap(fill(e.text, lastEnd.names), 68, 2));
    const found = save.endings.filter((id) => ENDINGS.some((x) => x.id === id)).length;
    out.push(`ENDINGS ${found}/${ENDINGS.length}${lastEnd.newBestGrade ? ` - NEW BEST GRADE ${lastEnd.grade}` : ''}`);
    return out;
  },
  titleArt: (scene: Phaser.Scene) => {
    const base = sharedDebug.unlockAll;
    if (base && !(base as any).kit) {
      const wrapped = () => { const s = kitSave(); s.endings = ENDINGS.map((e) => e.id); return base(); };
      (wrapped as any).kit = true;
      sharedDebug.unlockAll = wrapped;
      hooks.debug.unlockAll = wrapped;
    }
    // A little belt of the shop's products rolling past the hog, who's holding a sealed box.
    const y = 150;
    const belt = scene.add.tileSprite(W / 2 - 150, y + 14, 300, 16, spr('belt')).setOrigin(0, 0.5);
    scene.events.on('update', (_t: number, dt: number) => { belt.tilePositionX -= dt * 0.03; });
    const items = [1, 2, 3, 4, 5, 6].map((i, k) => scene.add.image(W / 2 - 120 + k * 42, y + 12, spr(k === 3 ? 'hot_item' : `item_${i}`)));
    scene.events.on('update', (_t: number, dt: number) => {
      for (const im of items) { im.x += dt * 0.03; if (im.x > W / 2 + 146) im.x = W / 2 - 146; }
    });
    const hog = scene.add.sprite(W / 2, y - 12, spr('player'), 0).setScale(2);
    hog.play(anim('player'));
    scene.add.image(W / 2, y - 40, spr('box'), 2).setScale(2);
    scene.add.sprite(W / 2 - 170, y - 6, spr('dock'), 0);
    scene.add.sprite(W / 2 + 170, y - 6, spr('dock'), 1);
    if (meta.data.runs > 0) {
      const save = kitSave();
      const found = save.endings.filter((id) => ENDINGS.some((x) => x.id === id)).length;
      const best = Object.entries(save.bestGrade).sort((a, b) => +b[0] - +a[0])[0];
      const line = `ENDINGS ${found}/${ENDINGS.length}${best ? ` - BEST GRADE ${best[1]} (HEAT ${best[0]})` : ''}`;
      text(scene, W / 2, 184, line, { align: 'center', color: 0xf8b800, depth: 10 });
    }
    void names;
  },
});
