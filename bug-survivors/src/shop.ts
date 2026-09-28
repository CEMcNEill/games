// Between-runs screen, reached from the title's SHOP choice: permanent upgrades bought with gold,
// hero select, and a records page (achievements + evolution codex). ESC goes back to the title.
import Phaser from 'phaser';
import { K, spr, anim } from '@shared/kit';
import { hooks } from '@shared/hooks';
import { meta } from '@shared/meta';
import { text, box, W, H, PixelText } from '@shared/ui';
import { onKeys, starfield } from '@shared/scenes';
import { SHOP, HEROES, ACHIEVEMENTS, WEAPONS, SUPER, PASSIVES, WeaponId } from './content';
import { productName } from './game';
import { save, persist, heroUnlocked } from './save';

const TABS = ['UPGRADES', 'HEROES', 'RECORDS'];

export class ShopScene extends Phaser.Scene {
  private tab = 0;
  private row = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Shop'); }

  create() {
    hooks.scene = 'Shop';
    hooks.state = 'shop';
    this.cameras.main.setBackgroundColor(K.ui.bg);
    starfield(this, 30);
    this.row = 0;
    this.draw();
    onKeys(this, ['ArrowLeft', 'KeyA'], () => this.moveTab(-1), 150);
    onKeys(this, ['ArrowRight', 'KeyD'], () => this.moveTab(1), 150);
    onKeys(this, ['ArrowUp', 'KeyW'], () => this.moveRow(-1), 150);
    onKeys(this, ['ArrowDown', 'KeyS'], () => this.moveRow(1), 150);
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], () => this.act(), 250);
    onKeys(this, ['Escape', 'KeyQ'], () => { K.play('select'); this.scene.start('Title'); }, 150);
    // Only shop hooks here (the setter merges the shared ones); stale game hooks must not be callable.
    hooks.debug = {
      shopBuy: (id: string) => this.buy(SHOP.findIndex((s) => s.id === id)),
      hero: (id: string) => this.pickHero(HEROES.findIndex((h) => h.id === id)),
      tab: (i: number) => { this.tab = ((i | 0) + TABS.length) % TABS.length; this.row = 0; this.draw(); },
    };
  }

  private rows() { return this.tab === 0 ? SHOP.length : this.tab === 1 ? HEROES.length : 0; }

  private moveTab(d: number) {
    this.tab = (this.tab + d + TABS.length) % TABS.length;
    this.row = 0;
    K.play('move', 0.5);
    this.draw();
  }

  private moveRow(d: number) {
    const n = this.rows();
    if (!n) return;
    this.row = (this.row + d + n) % n;
    K.play('move', 0.5);
    this.draw();
  }

  private act() {
    if (this.tab === 0) this.buy(this.row);
    else if (this.tab === 1) this.pickHero(this.row);
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

  pickHero(i: number) {
    const h = HEROES[i];
    if (!h || !heroUnlocked(h.id)) { K.play('hurt', 0.4); return false; }
    save().hero = h.id;
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
    let x = 110;
    TABS.forEach((t, i) => {
      const on = i === this.tab;
      const s = on ? `<${t}>` : ` ${t} `;
      T(x, 20, s, { color: on ? ui.accentInt : ui.dimInt });
      x += (s.length + 1) * 6;
    });
    if (this.tab === 0) this.drawUpgrades(T);
    else if (this.tab === 1) this.drawHeroes(T);
    else this.drawRecords(T);
    const help = this.tab === 0 ? 'UP/DOWN choose   ENTER buy' : this.tab === 1 ? 'UP/DOWN choose   ENTER pick' : '';
    T(W / 2, H - 22, `${help}${help ? '   ' : ''}LEFT/RIGHT tabs   ESC back`, { align: 'center', color: ui.dimInt });
  }

  private drawUpgrades(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    SHOP.forEach((s, i) => {
      const y = 40 + i * 25;
      const lvl = sv.shop[s.id] ?? 0;
      const on = i === this.row;
      if (on) this.objs.push(this.add.rectangle(20, y - 3, W - 40, 23, ui.panelInt, 0.35).setOrigin(0));
      T(28, y, s.name, { color: on ? ui.accentInt : ui.textInt });
      T(28, y + 10, s.line, { color: ui.dimInt });
      for (let k = 0; k < s.cost.length; k++) {
        this.objs.push(this.add.rectangle(200 + k * 9, y + 2, 7, 7, k < lvl ? ui.accentInt : 0x3c3c3c).setOrigin(0));
      }
      const cost = s.cost[lvl];
      const afford = cost !== undefined && meta.data.coins >= cost;
      T(W - 30, y + 2, cost === undefined ? 'MAX' : `${cost} GOLD`, { align: 'right', color: cost === undefined ? ui.dimInt : afford ? 0xf8d878 : 0x7c7c7c });
    });
  }

  private drawHeroes(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    HEROES.forEach((h, i) => {
      const y = 42 + i * 48;
      const on = i === this.row;
      const open = heroUnlocked(h.id);
      if (on) this.objs.push(this.add.rectangle(20, y - 4, W - 40, 44, ui.panelInt, 0.35).setOrigin(0));
      const hog = this.add.sprite(50, y + 18, spr('player')).play(anim('player'));
      if (h.tint !== null) hog.setTint(h.tint);
      if (!open) hog.setTintFill(0x3c3c3c);
      this.objs.push(hog);
      if (h.hat >= 0 && open) this.objs.push(this.add.image(50 - 12 + 9, y + 18 - 12 - 3, spr('hat'), h.hat).setOrigin(0));
      T(80, y + 2, h.name.toUpperCase(), { color: open ? (on ? ui.accentInt : ui.textInt) : ui.dimInt });
      if (sv.hero === h.id && open) T(80 + (h.name.length + 1) * 6, y + 2, '(PLAYING)', { color: 0x58d854 });
      T(80, y + 13, open ? h.line : 'LOCKED', { color: ui.dimInt });
      if (!open) {
        const a = ACHIEVEMENTS.find((x) => x.id === h.unlock);
        T(80, y + 24, `Unlock: ${a?.desc.replace(/ \(unlocks.*\)$/, '') ?? '???'}`, { color: 0xf87858, maxWidth: W - 110, maxLines: 1 });
      }
    });
  }

  private drawRecords(T: (x: number, y: number, s: string, o?: any) => PixelText) {
    const ui = K.ui;
    const sv = save();
    const list = meta.achievements();
    T(28, 38, `ACHIEVEMENTS ${meta.achievementCount()}`, { color: ui.accentInt });
    const perCol = Math.ceil(list.length / 3);
    list.forEach((a, i) => {
      const col = Math.floor(i / perCol);
      const y = 50 + (i % perCol) * 10;
      T(28 + col * 145, y, `${a.got ? '*' : '-'} ${a.name}`, { color: a.got ? ui.textInt : ui.dimInt, maxWidth: 140, maxLines: 1 });
    });
    // Evolution codex: found ones show their recipe, the rest stay a mystery.
    const evos: [string, string][] = [
      ...(Object.entries(WEAPONS) as [WeaponId, (typeof WEAPONS)[WeaponId]][]).filter(([, w]) => w.evo).map(([id, w]) =>
        [w.evo!.name, `${productName(id)} + ${PASSIVES[w.evo!.passive].name}`] as [string, string]),
      [SUPER.name, `${WEAPONS[SUPER.a].evo!.name} + ${WEAPONS[SUPER.b].evo!.name}`],
    ];
    const ey = 56 + perCol * 10;
    T(28, ey, `EVOLUTIONS FOUND ${sv.codex.filter((n) => evos.some(([e]) => e === n)).length}/${evos.length}`, { color: ui.accentInt });
    T(W - 28, ey, 'weapon LV 5 + partner + chest', { align: 'right', color: ui.dimInt });
    evos.forEach(([n, how], i) => {
      const found = sv.codex.includes(n);
      const y = ey + 12 + i * 9;
      T(28, y, found ? n : '???', { color: found ? 0xf8d878 : ui.dimInt });
      if (found) T(160, y, how, { color: ui.dimInt, maxWidth: W - 190, maxLines: 1 });
    });
    const m = meta.data;
    T(28, 226, `RUNS ${m.runs}   WINS ${m.wins}   BUGS ${sv.kills}   GOLD EARNED ${sv.gold}   CHESTS ${sv.chests}`,
      { color: ui.dimInt, maxWidth: W - 56, maxLines: 1 });
  }
}
