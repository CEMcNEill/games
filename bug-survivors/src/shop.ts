// Between-runs screen, reached from the title's SHOP choice: permanent upgrades and hoggie capsules bought with gold,
// the hoggie roster (pick who to play), the crest wall (achievements) and the lore page (merch, handbook pages,
// evolutions, totals). TAB or 1-4 switch tabs; ESC goes back to the title.
import Phaser from 'phaser';
import { K } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { meta } from '@shared/meta';
import { text, box, W, H, NARROW, PixelText, TOUCH } from '@shared/ui';
import { onKeys, onTap, starfield, screen, button, inside, Rect, TAP } from '@shared/scenes';
import { SHOP, WEAPONS, SUPER, PASSIVES, WeaponId, RELICS, RELIC_IDS, PAGES, capsulePrice } from './content';
import { productName, HOG32, HOG64, CREST64 } from './game';
import { save, persist, rollCapsule, unlockHog, hasCrest, syncCrestHogs } from './save';
import { HOGS, hogFrame, hogLine, sigOf, isSignature, SECRET_HOGS } from './hoggies';
import { CREST_LIST, crestFrame, ACHIEVEMENTS } from './crests';

const TABS = ['UPGRADES', 'HOGGIES', 'CRESTS', 'LORE'];

export class ShopScene extends Phaser.Scene {
  private tab = 0;
  private row = 0;
  private sel = 0;      // grid selection (hoggies / crests)
  private scroll = 0;   // hoggie grid first row
  private lorePage = 0;
  private flash = '';
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tabRects: { x0: number; x1: number; i: number }[] = [];
  private downY = 0;
  private lay = layout();
  private btns: (Rect & { act: () => void })[] = []; // touch buttons drawn this frame

  constructor() { super('Shop'); }

  create(data?: { keep?: boolean }) {
    hooks.scene = 'Shop';
    hooks.state = 'shop';
    this.cameras.main.setBackgroundColor(K.ui.bg);
    screen(this, () => this.scene.restart({ keep: true })); // a rotate lays the shop out again, keeping your place
    this.lay = layout();
    starfield(this, 30);
    syncCrestHogs();
    if (!data?.keep) {
      this.row = 0;
      this.sel = Math.max(0, HOGS.findIndex((h) => h.id === save().hog));
    }
    if (this.tab === 1) this.scrollToSel();
    this.draw();
    onKeys(this, ['ArrowLeft', 'KeyA'], () => this.move(-1, 0), 120);
    onKeys(this, ['ArrowRight', 'KeyD'], () => this.move(1, 0), 120);
    onKeys(this, ['ArrowUp', 'KeyW'], () => this.move(0, -1), 120);
    onKeys(this, ['ArrowDown', 'KeyS'], () => this.move(0, 1), 120);
    onKeys(this, ['Tab'], () => this.moveTab(1), 150);
    onKeys(this, ['Digit1', 'Digit2', 'Digit3', 'Digit4'], (code) => this.setTab(Number(code.slice(-1)) - 1), 150);
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], () => this.act(), 250);
    onKeys(this, ['Escape', 'KeyQ'], () => { K.play('select'); this.scene.start('Title'); }, 150);
    // Touch (and mouse): tap tabs, rows and grid cells; tap a selected item again to buy / play as; swipe the grid.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.downY = this.cameras.main.getWorldPoint(p.x, p.y).y; }); // world space, like onTap
    onTap(this, (x, y) => this.tap(x, y), 250);
    // Only shop hooks here (the setter merges the shared ones); stale game hooks must not be callable.
    hooks.debug = {
      shopBuy: (id: string) => (id === 'capsule' ? this.buyCapsule() : this.buy(SHOP.findIndex((s) => s.id === id))),
      hog: (id: string) => this.pickHog(HOGS.findIndex((h) => h.id === id)),
      hero: (id: string) => this.pickHog(HOGS.findIndex((h) => h.id === id)),
      tab: (i: number) => this.setTab(i | 0),
    };
  }

  private tap(x: number, y: number) {
    const L = this.lay;
    const b = this.btns.find((r) => inside(r, x, y));
    if (b) { b.act(); return; }
    const t = this.tabRects.find((r) => x >= r.x0 && x <= r.x1);
    if (!TOUCH && y >= L.tabY - 6 && y <= L.tabY + 10 && t) { this.setTab(t.i); return; }
    if (this.tab === 0) {
      for (let i = 0; i <= SHOP.length; i++) {
        const ry = L.top + 4 + i * L.rowH - 3;
        if (y < ry || y > ry + L.rowH - 1) continue;
        if (this.row === i) this.act(); else { this.row = i; K.play('move', 0.5); this.draw(); }
        return;
      }
    } else if (this.tab === 1) {
      const swipe = y - this.downY;
      if (Math.abs(swipe) > 24) { this.scrollHogs(-Math.round(swipe / 34)); return; }
      if (!TOUCH && x > W - 44) { this.scrollHogs(y < (L.gridY + L.detailY) / 2 ? -1 : 1); return; }
      const c = Math.floor((x - L.cx) / 34), r = Math.floor((y - L.gridY) / 34);
      if (c < 0 || c >= L.hogCols || r < 0 || r >= L.hogRows) return;
      const i = (this.scroll + r) * L.hogCols + c;
      if (i >= HOGS.length) return;
      if (i === this.sel) this.pickHog(i); else { this.sel = i; K.play('move', 0.5); this.draw(); }
    } else if (this.tab === 2) {
      const c = Math.floor((x - L.crestX) / 37), r = Math.floor((y - L.gridY) / 28);
      const i = r * L.crestCols + c;
      if (c < 0 || c >= L.crestCols || r < 0 || i >= CREST_LIST.length) return;
      this.sel = i; K.play('move', 0.5); this.draw();
    } else if (!TOUCH) {
      this.lorePage = 1 - this.lorePage; K.play('move', 0.5); this.draw(); // touch uses the page button
    }
  }

  private scrollHogs(d: number) {
    const L = this.lay, rows = Math.ceil(HOGS.length / L.hogCols);
    this.scroll = Phaser.Math.Clamp(this.scroll + d, 0, Math.max(0, rows - L.hogRows));
    K.play('move', 0.5);
    this.draw();
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
      const L = this.lay;
      const n = this.tab === 1 ? HOGS.length : CREST_LIST.length, cols = this.tab === 1 ? L.hogCols : L.crestCols;
      this.sel = Phaser.Math.Clamp(this.sel + dx + dy * cols, 0, n - 1);
      if (this.tab === 1) this.scrollToSel();
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

  /** Keep the selected hoggie's row on screen (the grid's width changes with the screen). */
  private scrollToSel() {
    const L = this.lay, r = Math.floor(this.sel / L.hogCols);
    if (r < this.scroll) this.scroll = r;
    if (r >= this.scroll + L.hogRows) this.scroll = r - L.hogRows + 1;
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
    this.btns = [];
    const ui = K.ui, L = this.lay;
    const o = this.objs;
    const T = (x: number, y: number, s: string, opts: Parameters<typeof text>[4] = {}) => { const t = text(this, x, y, s, opts); o.push(t); return t; };
    o.push(box(this, L.mx, 8, W - L.mx * 2, H - 16, ui.bgInt, ui.textInt, ui.panelInt));
    T(L.cx - 4, 16, 'SHOP', { scale: 2, color: ui.accentInt });
    T(W - L.cx + 4, 20, `GOLD ${meta.data.coins}`, { align: 'right', color: 0xf8d878 });
    // Tabs: beside the title, or on their own row when the screen is narrow. Touch gets them as buttons.
    this.tabRects = [];
    if (TOUCH) {
      const x0 = L.narrow ? L.mx + 6 : 84, x1 = L.narrow ? W - L.mx - 6 : W - 90, gap = 3;
      const tw = Math.min(84, Math.floor((x1 - x0 - gap * 3) / 4));
      TABS.forEach((t, i) => this.addBtn({ x: x0 + i * (tw + gap), y: L.tabY, w: tw, h: TAP - 2 }, t, () => this.setTab(i), { on: i === this.tab }));
    } else {
      let x = L.narrow ? L.cx - 4 : 84;
      TABS.forEach((t, i) => {
        const on = i === this.tab;
        const s = on ? `<${t}>` : ` ${t} `;
        T(x, L.tabY, s, { color: on ? ui.accentInt : ui.dimInt });
        this.tabRects.push({ x0: x, x1: x + s.length * 6, i });
        x += (s.length + 1) * 6;
      });
    }
    if (this.tab === 0) this.drawUpgrades(T);
    else if (this.tab === 1) this.drawHogs(T);
    else if (this.tab === 2) this.drawCrests(T);
    else this.drawLore(T);
    if (TOUCH) {
      this.addBtn({ x: L.mx + 6, y: H - 14 - TAP, w: 60, h: TAP }, 'BACK', () => { K.play('select'); this.scene.start('Title'); });
      const help = ['Tap an upgrade, then BUY', 'Tap a hoggie, then PLAY. Swipe to scroll', 'Tap a crest to read it', ''][this.tab];
      if (help) T(L.mx + 74, H - 14 - TAP + (L.narrow ? 2 : 8), help, { color: ui.dimInt, maxWidth: W - L.mx * 2 - 84, maxLines: 2 });
    } else {
      const help = ['UP/DOWN choose   ENTER buy', 'ARROWS choose   ENTER play as', 'ARROWS look', 'UP/DOWN page'][this.tab];
      T(W / 2, H - 22, `${help}   TAB tabs   ESC back`, { align: 'center', color: ui.dimInt, maxWidth: W - 20, maxLines: 2 });
    }
  }

  /** A touch button, drawn now and tappable until the next draw. */
  private addBtn(r: Rect, label: string, act: () => void, o: Parameters<typeof button>[3] = {}) {
    this.objs.push(...button(this, r, label, o));
    this.btns.push({ ...r, act });
  }

  private drawUpgrades(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui, L = this.lay;
    const sv = save();
    // A row: name, line and price; the level pips sit mid-row, or under the line on a narrow screen.
    const row = (i: number) => L.top + 4 + i * L.rowH;
    const hl = (y: number) => this.objs.push(this.add.rectangle(L.cx - 8, y - 3, W - (L.cx - 8) * 2, L.rowH - 1, ui.panelInt, 0.35).setOrigin(0));
    SHOP.forEach((s, i) => {
      const y = row(i);
      const lvl = sv.shop[s.id] ?? 0;
      const on = i === this.row;
      if (on) hl(y);
      T(L.cx, y, s.name, { color: on ? ui.accentInt : ui.textInt });
      T(L.cx, y + 9, s.line, { color: ui.dimInt, maxWidth: L.narrow ? W - L.cx * 2 : W / 2 - 40 - L.cx, maxLines: 1 });
      for (let k = 0; k < s.cost.length; k++) {
        const px = L.narrow ? L.cx + k * 9 : W / 2 - 40 + k * 9, py = L.narrow ? y + 19 : y + 2;
        this.objs.push(this.add.rectangle(px, py, 7, 7, k < lvl ? ui.accentInt : 0x3c3c3c).setOrigin(0));
      }
      const cost = s.cost[lvl];
      const afford = cost !== undefined && meta.data.coins >= cost;
      const buyNow = TOUCH && on && cost !== undefined;
      if (buyNow) this.addBtn(this.buyRect(y), 'BUY', () => this.buy(i), { dim: !afford, color: afford ? 0xf8d878 : undefined });
      T(W - L.cx - 2 - (buyNow ? 50 : 0), y + 2, cost === undefined ? 'MAX' : `${cost} GOLD`, { align: 'right', color: cost === undefined ? ui.dimInt : afford ? 0xf8d878 : 0x7c7c7c });
    });
    // Hoggie capsule
    const y = row(SHOP.length);
    const on = this.row === SHOP.length;
    if (on) hl(y);
    const left = HOGS.filter((h) => !sv.hogs.includes(h.id) && !SECRET_HOGS.has(h.id)).length;
    const cost = capsulePrice(sv.hogs.length);
    T(L.cx, y, 'Hoggie Capsule', { color: on ? ui.accentInt : ui.textInt });
    T(L.cx, y + 9, left ? `A random new hoggie (${left} left)` : 'You have them all!', { color: ui.dimInt });
    const buyCap = TOUCH && on && !!left;
    if (buyCap) this.addBtn(this.buyRect(y), 'BUY', () => this.buyCapsule(), { dim: meta.data.coins < cost, color: meta.data.coins >= cost ? 0xf8d878 : undefined });
    T(W - L.cx - 2 - (buyCap ? 50 : 0), y + 2, left ? `${cost} GOLD` : 'DONE', { align: 'right', color: left && meta.data.coins >= cost ? 0xf8d878 : 0x7c7c7c });
    if (this.flash) {
      // The new hoggie: top right, or under the list when the screen is narrow.
      const fx = L.narrow ? W / 2 : W - 70, fy = L.narrow ? row(SHOP.length + 1) + 30 : 44;
      this.objs.push(this.add.image(fx, fy, HOG64, hogFrame(this.flash)));
      T(fx, fy + 34, 'NEW!', { align: 'center', color: 0x58d854 });
    }
  }

  /** The BUY button at the right end of an upgrade row. */
  private buyRect(y: number): Rect {
    const L = this.lay;
    return { x: W - L.cx - 44, y: y - 3, w: 46, h: L.rowH - 1 };
  }

  private drawHogs(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui, L = this.lay;
    const sv = save();
    const owned = new Set(sv.hogs);
    T(L.cx, L.top, `HOGGIES ${sv.hogs.length}/${HOGS.length}`, { color: ui.accentInt });
    const x0 = L.cx, y0 = L.gridY, cell = 34, cols = L.hogCols;
    for (let r = 0; r < L.hogRows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (this.scroll + r) * cols + c;
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
    // Scroll: buttons on touch (swiping works too), hints for the keyboard.
    const rows = Math.ceil(HOGS.length / cols);
    if (TOUCH) {
      const ax = W - L.mx - 30;
      this.addBtn({ x: ax, y: y0, w: 24, h: TAP }, '^', () => this.scrollHogs(-L.hogRows + 1), { dim: this.scroll <= 0 });
      this.addBtn({ x: ax, y: L.detailY - TAP - 6, w: 24, h: TAP }, 'v', () => this.scrollHogs(L.hogRows - 1), { dim: this.scroll + L.hogRows >= rows });
    } else {
      if (this.scroll > 0) T(W - L.cx - 2, y0, '^', { color: ui.dimInt });
      if (this.scroll + L.hogRows < rows) T(W - L.cx - 2, L.detailY - 16, 'v', { color: ui.dimInt });
    }
    // Selected hoggie
    const h = HOGS[this.sel];
    const open = owned.has(h.id);
    const playBtn = TOUCH && open && sv.hog !== h.id && !L.narrow;
    const y = L.detailY, tx = L.cx + 58, tw = W - tx - (playBtn ? 80 : 34);
    const pic = this.add.image(L.cx + 24, y + 26, HOG64, this.sel).setScale(0.75);
    if (!open) pic.setTintFill(0x2c2c2c);
    this.objs.push(pic);
    T(tx, y + 6, h.name.toUpperCase(), { color: open ? (isSignature(h.id) ? 0xf8d878 : ui.textInt) : ui.dimInt, maxWidth: W - tx - 10, maxLines: 1 });
    if (sv.hog === h.id) {
      if (L.narrow) T(L.cx + 24, y + 52, '(PLAYING)', { align: 'center', color: 0x58d854 });
      else T(tx + (h.name.length + 1) * 6, y + 6, '(PLAYING)', { color: 0x58d854 });
    } else if (TOUCH && open) {
      // PLAY: under the picture on a narrow screen, at the panel's right end on a wide one.
      const r = L.narrow ? { x: L.cx - 2, y: y + 52, w: 54, h: TAP } : { x: W - L.cx - 66, y: y + 4, w: 66, h: TAP };
      this.addBtn(r, L.narrow ? 'PLAY' : 'PLAY AS', () => this.pickHog(this.sel), { color: 0x58d854 });
    }
    const n = L.narrow ? 2 : 1;
    const line = T(tx, y + 17, open ? hogLine(h.id) : 'LOCKED', { color: ui.dimInt, maxWidth: tw, maxLines: n });
    const y2 = y + 17 + line.lineCount * 10 + 1;
    if (!open) T(tx, y2, `Unlock: ${this.howToUnlock(h.id)}`, { color: 0xf87858, maxWidth: tw, maxLines: n + 1 });
    else if (sigOf(h.id)?.start) T(tx, y2, `Starts with ${productName(sigOf(h.id)!.start!)}`, { color: 0x3cbcfc, maxWidth: tw, maxLines: n });
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
    const ui = K.ui, L = this.lay;
    const got = CREST_LIST.filter((c) => hasCrest(c.id)).length;
    T(L.cx, L.top, `CRESTS ${got}/${CREST_LIST.length}`, { color: ui.accentInt });
    const x0 = L.crestX, y0 = L.gridY, cell = 37, cols = L.crestCols;
    CREST_LIST.forEach((c, i) => {
      const x = x0 + (i % cols) * cell + 16, y = y0 + Math.floor(i / cols) * 28 + 13;
      const im = this.add.image(x, y, CREST64, crestFrame(c.id)).setScale(0.4);
      const open = hasCrest(c.id);
      if (!open) im.setTintFill(0x2c2c2c);
      this.objs.push(im);
      if (i === this.sel) this.objs.push(this.add.rectangle(x - 15, y - 14, 30, 28).setOrigin(0).setStrokeStyle(2, ui.accentInt));
    });
    const c = CREST_LIST[Math.min(this.sel, CREST_LIST.length - 1)];
    const open = hasCrest(c.id);
    const y = L.detailY + 6, tx = L.cx + 58, tw = W - tx - 44;
    const a = ACHIEVEMENTS.find((x) => x.id === c.id)!;
    this.objs.push(this.add.image(L.cx + 24, y + 16, CREST64, crestFrame(c.id)).setScale(0.6));
    if (!open) (this.objs[this.objs.length - 1] as Phaser.GameObjects.Image).setTintFill(0x2c2c2c);
    const hidden = a.hidden && !open;
    T(tx, y, hidden ? '???' : a.name.toUpperCase(), { color: open ? 0xf8d878 : ui.textInt, maxWidth: tw, maxLines: 1 });
    const desc = T(tx, y + 11, hidden ? 'A secret' : c.desc, { color: ui.dimInt, maxWidth: tw, maxLines: L.narrow ? 3 : 1 });
    const reward = this.add.image(W - L.cx - 22, y + 12, HOG32, hogFrame(c.hog));
    if (!open) reward.setTintFill(0x2c2c2c);
    this.objs.push(reward);
    T(tx, y + 12 + desc.lineCount * 10, `Unlocks ${HOGS[hogFrame(c.hog)]?.name ?? c.hog}`, { color: open ? 0x58d854 : ui.dimInt, maxWidth: tw, maxLines: 1 });
  }

  private drawLore(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui, L = this.lay;
    const sv = save();
    // Two columns side by side, or one long column on a narrow screen.
    const cols = L.narrow ? 1 : 2, colW = L.narrow ? W - L.cx * 2 : 206, colX = (c: number) => L.cx + c * 216;
    const y0 = L.gridY;
    if (this.lorePage === 0) {
      T(L.cx, L.top, `HANDBOOK PAGES ${sv.pages.length}/${PAGES.length}`, { color: ui.accentInt });
      const per = Math.ceil(PAGES.length / cols);
      PAGES.forEach(([t, line], i) => {
        const col = Math.floor(i / per);
        const y = y0 + (i % per) * 15;
        const found = sv.pages.includes(i);
        T(colX(col), y, found ? t : '???', { color: found ? 0xf8d878 : ui.dimInt, maxWidth: colW, maxLines: 1 });
        if (found) T(colX(col), y + 7, line, { color: ui.dimInt, maxWidth: colW, maxLines: 1, scale: 1 });
      });
      if (TOUCH) this.addBtn(this.pageRect(), 'MORE >', () => { this.lorePage = 1; K.play('move', 0.5); this.draw(); });
      else T(W - L.cx, L.top, 'DOWN: merch + more', { align: 'right', color: ui.dimInt });
      return;
    }
    T(L.cx, L.top, `MERCH ${sv.relics.length}/${RELIC_IDS.length}`, { color: ui.accentInt });
    const mcols = L.narrow ? 2 : 3, mw = L.narrow ? (W - L.cx * 2) / 2 : 145;
    RELIC_IDS.forEach((r, i) => {
      const found = sv.relics.includes(r);
      T(L.cx + (i % mcols) * mw, y0 + Math.floor(i / mcols) * 10, found ? RELICS[r].name : '???', { color: found ? ui.textInt : ui.dimInt, maxWidth: mw - 5, maxLines: 1 });
    });
    // Evolution codex: found ones show their recipe, the rest stay a mystery.
    const evos: [string, string][] = [
      ...(Object.entries(WEAPONS) as [WeaponId, (typeof WEAPONS)[WeaponId]][]).filter(([, w]) => w.evo).map(([id, w]) =>
        [w.evo!.name, `${productName(id)} + ${PASSIVES[w.evo!.passive].name}`] as [string, string]),
      [SUPER.name, `${WEAPONS[SUPER.a].evo!.name} + ${WEAPONS[SUPER.b].evo!.name}`],
    ];
    const ey = y0 + Math.ceil(RELIC_IDS.length / mcols) * 10 + 6;
    T(L.cx, ey, `EVOLUTIONS FOUND ${sv.codex.filter((n) => evos.some(([e]) => e === n)).length}/${evos.length}`, { color: ui.accentInt });
    const per = L.narrow ? evos.length : 10;
    evos.forEach(([n, how], i) => {
      const found = sv.codex.includes(n);
      const col = Math.floor(i / per);
      const y = ey + 11 + (i % per) * 9;
      T(colX(col), y, found ? n : '???', { color: found ? 0xf8d878 : ui.dimInt, maxWidth: colW, maxLines: 1 });
      void how;
    });
    const m = meta.data;
    const sy = L.narrow ? ey + 11 + evos.length * 9 + 8 : 190;
    const s1 = T(L.cx, sy, `RUNS ${m.runs}   BEST WAVE ${sv.bestWave}   BUGS ${sv.kills}   GOLD EARNED ${sv.gold}   CHESTS ${sv.chests}`,
      { color: ui.dimInt, maxWidth: W - L.cx * 2, maxLines: L.narrow ? 3 : 1 });
    T(L.cx, sy + s1.lineCount * 10 + 2, `ELITES ${sv.elites}   REVIVES ${sv.revives}   DAILIES ${sv.dailies}   CAPSULES BOUGHT ${sv.capsules}`,
      { color: ui.dimInt, maxWidth: W - L.cx * 2, maxLines: L.narrow ? 3 : 1 });
    if (TOUCH) this.addBtn(this.pageRect(), '< PAGES', () => { this.lorePage = 0; K.play('move', 0.5); this.draw(); });
    else T(W - L.cx, L.top, 'UP: handbook', { align: 'right', color: ui.dimInt });
  }

  /** The lore page button, top right of the page. */
  private pageRect(): Rect {
    const L = this.lay;
    return { x: W - L.cx - 72, y: L.top - 8, w: 74, h: TAP - 2 };
  }
}

/** Where the shop's pieces go on the live screen. At 480x270 it matches the original layout; a narrow (portrait) screen
 * gets the tabs on their own row, fewer grid columns and more rows, and the detail panels above the help line. */
function layout() {
  const narrow = NARROW();
  const mx = narrow ? 4 : 12, cx = narrow ? 14 : 28;
  // Touch: the tabs are buttons (a row of their own when narrow), BACK and the help line sit along the bottom.
  const tabY = TOUCH ? (narrow ? 32 : 10) : narrow ? 36 : 20;
  const top = TOUCH ? (narrow ? 66 : 44) : narrow ? 52 : 34, gridY = top + (TOUCH ? 18 : 12);
  const bottom = TOUCH ? H - 20 - TAP : H - 34;                 // above the help line (and BACK)
  const detailY = bottom - (narrow ? 76 : 50);                   // selected hoggie / crest panel
  const hogCols = Math.max(4, Math.floor((W - cx - (TOUCH ? 40 : 30)) / 34));
  const hogRows = Math.max(2, Math.floor((detailY - gridY) / 34));
  const crestX = cx + 8, crestCols = Math.max(4, Math.floor((W - crestX - 8) / 37));
  // Upgrade rows: as tall as fit (up to 22, or 30 when narrow) so every upgrade and the capsule show.
  const rowH = Math.min(narrow ? 30 : 22, Math.floor((bottom - top - 4) / (SHOP.length + 1)));
  return { narrow, mx, cx, tabY, top, gridY, bottom, detailY, hogCols, hogRows, crestX, crestCols, rowH };
}
