// Between-runs screen, reached from the title's SHOP choice: permanent upgrades and hoggie capsules bought with gold,
// the hoggie roster (pick who to play), the crest wall (achievements) and the lore page (merch, handbook pages,
// evolutions, totals). TAB or 1-4 switch tabs; ESC goes back to the title.
import Phaser from 'phaser';
import { K } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { meta } from '@shared/meta';
import { text, box, W, H, PixelText } from '@shared/ui';
import { onKeys, starfield } from '@shared/scenes';
import { SHOP, WEAPONS, SUPER, PASSIVES, WeaponId, RELICS, RELIC_IDS, PAGES, capsulePrice } from './content';
import { productName, HOG32, HOG64, CREST64 } from './game';
import { save, persist, rollCapsule, unlockHog, hasCrest, syncCrestHogs } from './save';
import { HOGS, hogFrame, hogLine, sigOf, isSignature, SECRET_HOGS } from './hoggies';
import { CREST_LIST, crestFrame, ACHIEVEMENTS } from './crests';

const TABS = ['UPGRADES', 'HOGGIES', 'CRESTS', 'LORE'];
const HOG_COLS = 13, HOG_ROWS = 4, CREST_COLS = 11;

export class ShopScene extends Phaser.Scene {
  private tab = 0;
  private row = 0;
  private sel = 0;      // grid selection (hoggies / crests)
  private scroll = 0;   // hoggie grid first row
  private lorePage = 0;
  private flash = '';
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Shop'); }

  create() {
    hooks.scene = 'Shop';
    hooks.state = 'shop';
    this.cameras.main.setBackgroundColor(K.ui.bg);
    starfield(this, 30);
    syncCrestHogs();
    this.row = 0;
    this.sel = Math.max(0, HOGS.findIndex((h) => h.id === save().hog));
    this.draw();
    onKeys(this, ['ArrowLeft', 'KeyA'], () => this.move(-1, 0), 120);
    onKeys(this, ['ArrowRight', 'KeyD'], () => this.move(1, 0), 120);
    onKeys(this, ['ArrowUp', 'KeyW'], () => this.move(0, -1), 120);
    onKeys(this, ['ArrowDown', 'KeyS'], () => this.move(0, 1), 120);
    onKeys(this, ['Tab'], () => this.moveTab(1), 150);
    onKeys(this, ['Digit1', 'Digit2', 'Digit3', 'Digit4'], (code) => this.setTab(Number(code.slice(-1)) - 1), 150);
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], () => this.act(), 250);
    onKeys(this, ['Escape', 'KeyQ'], () => { K.play('select'); this.scene.start('Title'); }, 150);
    // Only shop hooks here (the setter merges the shared ones); stale game hooks must not be callable.
    hooks.debug = {
      shopBuy: (id: string) => (id === 'capsule' ? this.buyCapsule() : this.buy(SHOP.findIndex((s) => s.id === id))),
      hog: (id: string) => this.pickHog(HOGS.findIndex((h) => h.id === id)),
      hero: (id: string) => this.pickHog(HOGS.findIndex((h) => h.id === id)),
      tab: (i: number) => this.setTab(i | 0),
    };
  }

  private setTab(i: number) {
    this.tab = ((i % TABS.length) + TABS.length) % TABS.length;
    if (this.tab === 2) this.sel = Math.min(this.sel, CREST_LIST.length - 1);
    if (this.tab === 1) this.sel = Math.max(0, HOGS.findIndex((h) => h.id === save().hog));
    this.row = 0;
    this.flash = '';
    K.play('move', 0.5);
    this.draw();
  }
  private moveTab(d: number) { this.setTab(this.tab + d); }

  private move(dx: number, dy: number) {
    if (this.tab === 1 || this.tab === 2) {
      const n = this.tab === 1 ? HOGS.length : CREST_LIST.length, cols = this.tab === 1 ? HOG_COLS : CREST_COLS;
      this.sel = Phaser.Math.Clamp(this.sel + dx + dy * cols, 0, n - 1);
      if (this.tab === 1) {
        const r = Math.floor(this.sel / cols);
        if (r < this.scroll) this.scroll = r;
        if (r >= this.scroll + HOG_ROWS) this.scroll = r - HOG_ROWS + 1;
      }
    } else if (this.tab === 3) {
      if (dx) { this.moveTab(dx); return; }
      this.lorePage = Phaser.Math.Clamp(this.lorePage + dy, 0, 1);
    } else {
      if (dx) { this.moveTab(dx); return; }
      const n = SHOP.length + 1;
      this.row = (this.row + dy + n) % n;
    }
    K.play('move', 0.5);
    this.draw();
  }

  private act() {
    if (this.tab === 0) { if (this.row < SHOP.length) this.buy(this.row); else this.buyCapsule(); }
    else if (this.tab === 1) this.pickHog(this.sel);
  }

  buy(i: number) {
    const s = SHOP[i];
    if (!s) return false;
    const sv = save();
    const lvl = sv.shop[s.id] ?? 0;
    const cost = s.cost[lvl];
    if (cost === undefined || !meta.spend(cost)) { K.play('hurt', 0.4); return false; }
    sv.shop[s.id] = lvl + 1;
    persist();
    K.play('levelup', 0.7);
    this.draw();
    return true;
  }

  /** A hoggie capsule: a random hoggie you don't have yet. */
  buyCapsule() {
    const sv = save();
    const cost = capsulePrice(sv.hogs.length);
    const id = rollCapsule();
    if (!id || !meta.spend(cost)) { K.play('hurt', 0.4); return false; }
    unlockHog(id);
    sv.capsules++;
    persist();
    K.play('evolve', 0.7);
    this.flash = id;
    this.draw();
    return true;
  }

  pickHog(i: number) {
    const h = HOGS[i];
    if (!h || !save().hogs.includes(h.id)) { K.play('hurt', 0.4); return false; }
    save().hog = h.id;
    persist();
    K.play('select');
    this.draw();
    return true;
  }

  private draw() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    const ui = K.ui;
    const o = this.objs;
    const T = (x: number, y: number, s: string, opts: Parameters<typeof text>[4] = {}) => { const t = text(this, x, y, s, opts); o.push(t); return t; };
    o.push(box(this, 12, 8, W - 24, H - 16, ui.bgInt, ui.textInt, ui.panelInt));
    T(24, 16, 'SHOP', { scale: 2, color: ui.accentInt });
    T(W - 24, 20, `GOLD ${meta.data.coins}`, { align: 'right', color: 0xf8d878 });
    let x = 84;
    TABS.forEach((t, i) => {
      const on = i === this.tab;
      const s = on ? `<${t}>` : ` ${t} `;
      T(x, 20, s, { color: on ? ui.accentInt : ui.dimInt });
      x += (s.length + 1) * 6;
    });
    if (this.tab === 0) this.drawUpgrades(T);
    else if (this.tab === 1) this.drawHogs(T);
    else if (this.tab === 2) this.drawCrests(T);
    else this.drawLore(T);
    const help = ['UP/DOWN choose   ENTER buy', 'ARROWS choose   ENTER play as', 'ARROWS look', 'UP/DOWN page'][this.tab];
    T(W / 2, H - 22, `${help}   TAB tabs   ESC back`, { align: 'center', color: ui.dimInt });
  }

  private drawUpgrades(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    SHOP.forEach((s, i) => {
      const y = 38 + i * 22;
      const lvl = sv.shop[s.id] ?? 0;
      const on = i === this.row;
      if (on) this.objs.push(this.add.rectangle(20, y - 3, W - 40, 21, ui.panelInt, 0.35).setOrigin(0));
      T(28, y, s.name, { color: on ? ui.accentInt : ui.textInt });
      T(28, y + 9, s.line, { color: ui.dimInt });
      for (let k = 0; k < s.cost.length; k++) {
        this.objs.push(this.add.rectangle(200 + k * 9, y + 2, 7, 7, k < lvl ? ui.accentInt : 0x3c3c3c).setOrigin(0));
      }
      const cost = s.cost[lvl];
      const afford = cost !== undefined && meta.data.coins >= cost;
      T(W - 30, y + 2, cost === undefined ? 'MAX' : `${cost} GOLD`, { align: 'right', color: cost === undefined ? ui.dimInt : afford ? 0xf8d878 : 0x7c7c7c });
    });
    // Hoggie capsule
    const y = 38 + SHOP.length * 22;
    const on = this.row === SHOP.length;
    if (on) this.objs.push(this.add.rectangle(20, y - 3, W - 40, 21, ui.panelInt, 0.35).setOrigin(0));
    const left = HOGS.filter((h) => !sv.hogs.includes(h.id) && !SECRET_HOGS.has(h.id)).length;
    const cost = capsulePrice(sv.hogs.length);
    T(28, y, 'Hoggie Capsule', { color: on ? ui.accentInt : ui.textInt });
    T(28, y + 9, left ? `A random new hoggie (${left} left)` : 'You have them all!', { color: ui.dimInt });
    T(W - 30, y + 2, left ? `${cost} GOLD` : 'DONE', { align: 'right', color: left && meta.data.coins >= cost ? 0xf8d878 : 0x7c7c7c });
    if (this.flash) {
      this.objs.push(this.add.image(W - 70, 44, HOG64, hogFrame(this.flash)));
      T(W - 70, 78, 'NEW!', { align: 'center', color: 0x58d854 });
    }
  }

  private drawHogs(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    const owned = new Set(sv.hogs);
    T(28, 34, `HOGGIES ${sv.hogs.length}/${HOGS.length}`, { color: ui.accentInt });
    const x0 = 28, y0 = 46, cell = 34;
    for (let r = 0; r < HOG_ROWS; r++) {
      for (let c = 0; c < HOG_COLS; c++) {
        const i = (this.scroll + r) * HOG_COLS + c;
        if (i >= HOGS.length) break;
        const h = HOGS[i];
        const x = x0 + c * cell + 16, y = y0 + r * cell + 16;
        const im = this.add.image(x, y, HOG32, i);
        if (!owned.has(h.id)) im.setTintFill(0x2c2c2c);
        this.objs.push(im);
        if (h.id === sv.hog) this.objs.push(this.add.rectangle(x - 16, y - 16, 32, 32).setOrigin(0).setStrokeStyle(1, 0x58d854));
        if (i === this.sel) this.objs.push(this.add.rectangle(x - 17, y - 17, 34, 34).setOrigin(0).setStrokeStyle(2, ui.accentInt));
        if (isSignature(h.id) && owned.has(h.id)) this.objs.push(this.add.rectangle(x + 11, y - 15, 3, 3, 0xf8d878).setOrigin(0));
      }
    }
    // Scroll hints
    const rows = Math.ceil(HOGS.length / HOG_COLS);
    if (this.scroll > 0) T(W - 30, 46, '^', { color: ui.dimInt });
    if (this.scroll + HOG_ROWS < rows) T(W - 30, 170, 'v', { color: ui.dimInt });
    // Selected hoggie
    const h = HOGS[this.sel];
    const open = owned.has(h.id);
    const y = 186;
    const pic = this.add.image(52, y + 26, HOG64, this.sel).setScale(0.75);
    if (!open) pic.setTintFill(0x2c2c2c);
    this.objs.push(pic);
    T(86, y + 6, h.name.toUpperCase(), { color: open ? (isSignature(h.id) ? 0xf8d878 : ui.textInt) : ui.dimInt });
    if (sv.hog === h.id) T(86 + (h.name.length + 1) * 6, y + 6, '(PLAYING)', { color: 0x58d854 });
    T(86, y + 17, open ? hogLine(h.id) : 'LOCKED', { color: ui.dimInt, maxWidth: W - 120, maxLines: 1 });
    if (!open) T(86, y + 28, `Unlock: ${this.howToUnlock(h.id)}`, { color: 0xf87858, maxWidth: W - 120, maxLines: 2 });
    else if (sigOf(h.id)?.start) T(86, y + 28, `Starts with ${productName(sigOf(h.id)!.start!)}`, { color: 0x3cbcfc, maxWidth: W - 120, maxLines: 1 });
  }

  private howToUnlock(id: string) {
    const c = CREST_LIST.find((x) => x.hog === id);
    if (c) return `the ${ACHIEVEMENTS.find((a) => a.id === c.id)?.name ?? c.id} crest (${c.desc})`;
    const u = sigOf(id)?.unlock;
    if (u) return u;
    if (id === 'business-evolution' || id === 'final-evolution') return 'Caveman evolves into it (waves 3 and 6)';
    return 'Hoggie capsules (clear waves, or buy one in UPGRADES)';
  }

  private drawCrests(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const got = CREST_LIST.filter((c) => hasCrest(c.id)).length;
    T(28, 34, `CRESTS ${got}/${CREST_LIST.length}`, { color: ui.accentInt });
    const x0 = 36, y0 = 46, cell = 37;
    CREST_LIST.forEach((c, i) => {
      const x = x0 + (i % CREST_COLS) * cell + 16, y = y0 + Math.floor(i / CREST_COLS) * 28 + 13;
      const im = this.add.image(x, y, CREST64, crestFrame(c.id)).setScale(0.4);
      const open = hasCrest(c.id);
      if (!open) im.setTintFill(0x2c2c2c);
      this.objs.push(im);
      if (i === this.sel) this.objs.push(this.add.rectangle(x - 15, y - 14, 30, 28).setOrigin(0).setStrokeStyle(2, ui.accentInt));
    });
    const c = CREST_LIST[Math.min(this.sel, CREST_LIST.length - 1)];
    const open = hasCrest(c.id);
    const y = 192;
    const a = ACHIEVEMENTS.find((x) => x.id === c.id)!;
    this.objs.push(this.add.image(52, y + 16, CREST64, crestFrame(c.id)).setScale(0.6));
    if (!open) (this.objs[this.objs.length - 1] as Phaser.GameObjects.Image).setTintFill(0x2c2c2c);
    const hidden = a.hidden && !open;
    T(86, y, hidden ? '???' : a.name.toUpperCase(), { color: open ? 0xf8d878 : ui.textInt });
    T(86, y + 11, hidden ? 'A secret' : c.desc, { color: ui.dimInt, maxWidth: W - 120, maxLines: 1 });
    const reward = this.add.image(W - 50, y + 12, HOG32, hogFrame(c.hog));
    if (!open) reward.setTintFill(0x2c2c2c);
    this.objs.push(reward);
    T(86, y + 22, `Unlocks ${HOGS[hogFrame(c.hog)]?.name ?? c.hog}`, { color: open ? 0x58d854 : ui.dimInt });
  }

  private drawLore(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    if (this.lorePage === 0) {
      T(28, 34, `HANDBOOK PAGES ${sv.pages.length}/${PAGES.length}`, { color: ui.accentInt });
      PAGES.forEach(([t, line], i) => {
        const col = i < 11 ? 0 : 1;
        const y = 46 + (i % 11) * 15;
        const found = sv.pages.includes(i);
        T(28 + col * 216, y, found ? t : '???', { color: found ? 0xf8d878 : ui.dimInt, maxWidth: 206, maxLines: 1 });
        if (found) T(28 + col * 216, y + 7, line, { color: ui.dimInt, maxWidth: 206, maxLines: 1, scale: 1 });
      });
      T(W - 28, 34, 'DOWN: merch + more', { align: 'right', color: ui.dimInt });
      return;
    }
    T(28, 34, `MERCH ${sv.relics.length}/${RELIC_IDS.length}`, { color: ui.accentInt });
    RELIC_IDS.forEach((r, i) => {
      const found = sv.relics.includes(r);
      T(28 + (i % 3) * 145, 46 + Math.floor(i / 3) * 10, found ? RELICS[r].name : '???', { color: found ? ui.textInt : ui.dimInt, maxWidth: 140, maxLines: 1 });
    });
    // Evolution codex: found ones show their recipe, the rest stay a mystery.
    const evos: [string, string][] = [
      ...(Object.entries(WEAPONS) as [WeaponId, (typeof WEAPONS)[WeaponId]][]).filter(([, w]) => w.evo).map(([id, w]) =>
        [w.evo!.name, `${productName(id)} + ${PASSIVES[w.evo!.passive].name}`] as [string, string]),
      [SUPER.name, `${WEAPONS[SUPER.a].evo!.name} + ${WEAPONS[SUPER.b].evo!.name}`],
    ];
    const ey = 82;
    T(28, ey, `EVOLUTIONS FOUND ${sv.codex.filter((n) => evos.some(([e]) => e === n)).length}/${evos.length}`, { color: ui.accentInt });
    evos.forEach(([n, how], i) => {
      const found = sv.codex.includes(n);
      const col = i < 10 ? 0 : 1;
      const y = ey + 11 + (i % 10) * 9;
      T(28 + col * 216, y, found ? n : '???', { color: found ? 0xf8d878 : ui.dimInt, maxWidth: 206, maxLines: 1 });
      void how;
    });
    const m = meta.data;
    T(28, 190, `RUNS ${m.runs}   BEST WAVE ${sv.bestWave}   BUGS ${sv.kills}   GOLD EARNED ${sv.gold}   CHESTS ${sv.chests}`,
      { color: ui.dimInt, maxWidth: W - 56, maxLines: 1 });
    T(28, 202, `ELITES ${sv.elites}   REVIVES ${sv.revives}   DAILIES ${sv.dailies}   CAPSULES BOUGHT ${sv.capsules}`, { color: ui.dimInt, maxWidth: W - 56, maxLines: 1 });
    T(W - 28, 34, 'UP: handbook', { align: 'right', color: ui.dimInt });
  }
}
