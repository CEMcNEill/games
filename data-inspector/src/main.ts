import Phaser from 'phaser';
import { startKit, spr, anim, meta, heatRow } from '@shared/kit';
import { W, text, wrap } from '@shared/ui';
import schema from '../theme.schema.json';
import defaultTheme from '../themes/default.json';
import slots from '../slots.json';
import sfx from '../audio/sfx.json';
import { hooks, sharedDebug } from '@shared/hooks';
import { GameScene, TOOLS, productName, kitSave, lastEnd } from './game';
import { ACHIEVEMENTS, ENDINGS, fill } from './story';

startKit({
  id: 'data-inspector',
  name: 'Data Inspector',
  schema,
  defaultTheme,
  slots,
  sfx: sfx as Record<string, number[]>,
  scenes: [GameScene],
  gameScene: 'Game',
  howTo: (t) => {
    const tools = (t.products as string[]).filter((p) => p in TOOLS).slice(0, 4);
    return [
      `You run ${/^the /i.test(t.game.desk.name) ? '' : 'the '}${t.game.desk.name} at ${t.prospect.name}. Their events land on your desk, one at a time.`,
      'LEFT/A: APPROVE good data.   RIGHT/D: FLAG bad data, then pick the broken rule (1-4).',
      'The RULEBOOK and your other documents sit beside each record: TAB flips between them. New rules and new documents arrive every day for 5 days.',
      'Mistakes cost DATA QUALITY. If it hits zero, nobody trusts the dashboards.',
      tools.length
        ? `Keys 1-${tools.length} are PostHog tools, once a day: ${tools.map((id) => `${TOOLS[id as keyof typeof TOOLS].name} (${productName(id)})`).join(', ')}.`
        : 'Work fast: meet the daily quota for a bonus.',
    ];
  },
  postSanitize: (t, issues) => {
    // The shared sanitiser fills a missing optional field from the default theme's item at the same
    // index, so a rule could silently inherit another rule's property/values/min/max. Rule params are
    // optional by design: undo those fills (rules.ts then rejects rules missing what they need).
    const re = /^game\.days\[(\d+)\]\.rules\[(\d+)\]\.(property|value|values|min|max): missing$/;
    for (let i = issues.length - 1; i >= 0; i--) {
      const m = re.exec(issues[i]);
      if (!m) continue;
      delete t.game.days[+m[1]]?.rules?.[+m[2]]?.[m[3]];
      issues.splice(i, 1);
    }
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
    const out0: string[] = [];
    if (lastEnd.endless) return [`ENDLESS BEST ${save.endlessBest} RECORDS`];
    if (lastEnd.daily) out0.push(`DAILY SHIFT ${new Date().toISOString().slice(0, 10)}`);
    const out: string[] = out0;
    const e = lastEnd.ending;
    if (e) out.push(...wrap(fill(e.text, lastEnd.names), 68, 2));
    const found = save.endings.filter((id) => ENDINGS.some((x) => x.id === id)).length;
    out.push(`ENDINGS ${found}/${ENDINGS.length}${lastEnd.newBestGrade ? ` - NEW BEST GRADE ${lastEnd.grade}` : ''}`);
    return out;
  },
  titleArt: (scene: Phaser.Scene) => {
    // debug.unlockAll from the title should also mark every ending found (the game scene's own hook does too).
    const base = sharedDebug.unlockAll;
    if (base && !(base as any).kit) {
      const wrapped = () => { const s = kitSave(); s.endings = ENDINGS.map((e) => e.id); return base(); };
      (wrapped as any).kit = true;
      sharedDebug.unlockAll = wrapped;
      hooks.debug.unlockAll = wrapped;
    }
    // The inspector at the desk, facing a queue of the prospect's users.
    scene.add.sprite(W / 2 - 150, 150, spr('inspector')).setScale(2).play(anim('inspector'));
    scene.add.image(W / 2 - 104, 132, spr('stamp_ok'));
    scene.add.image(W / 2 - 104, 168, spr('stamp_flag'));
    [0, 1, 2, 3].forEach((i) => scene.add.image(W / 2 - 40 + i * 52, 150, spr(`persona_${i + 1}`)).setScale(i === 0 ? 2 : 1));
    // Returning players see how many endings they've found and their best grade.
    if (meta.data.runs > 0) {
      const save = kitSave();
      const found = save.endings.filter((id) => ENDINGS.some((x) => x.id === id)).length;
      const best = Object.entries(save.bestGrade).sort((a, b) => +b[0] - +a[0])[0];
      const line = `ENDINGS ${found}/${ENDINGS.length}${best ? ` - BEST GRADE ${best[1]} (HEAT ${best[0]})` : ''}`;
      text(scene, W / 2, 104, line, { align: 'center', color: 0xf8b800, depth: 10 });
    }
  },
});
