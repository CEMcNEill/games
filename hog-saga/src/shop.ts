// The town shop: items and starter gear for gold. UP/DOWN pick, ENTER buys, ESC leaves. Gear goes
// straight onto whoever gains most (gear.ts autoEquip); pieces nobody needs are greyed out.
import Phaser from 'phaser';
import { K, spr } from '@shared/kit';
import { text, box, W, H } from '@shared/ui';
import { R, ITEMS, ItemId } from './state';
import { SHOP, price, gearDef, gearLine, autoEquip, canWear } from './gear';
import { ICON } from './rules';

export class ShopMenu {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private cursor!: Phaser.GameObjects.Graphics;
  private sel = 0;
  private info!: ReturnType<typeof text>;
  private goldT!: ReturnType<typeof text>;
  private rows: ReturnType<typeof text>[] = [];
  private prices: ReturnType<typeof text>[] = [];
  open = false;

  private list: string[] = SHOP;
  private title = 'SHOP';
  private mult = 1;

  constructor(private scene: Phaser.Scene, private onClose: () => void) {}

  /** Price here (the travelling merchant sells gear at a discount). */
  cost(id: string) { return Math.round(price(id) * (gearDef(id) ? this.mult : 1)); }

  /** Open with a stock list (default: the town shop). */
  showStock(list: string[], title: string, mult = 1) {
    this.list = list;
    this.title = title;
    this.mult = mult;
    this.show(true);
  }

  show(keep = false) {
    if (!keep) { this.list = SHOP; this.title = 'SHOP'; this.mult = 1; }
    const s = this.scene, ui = K.ui;
    this.open = true;
    this.sel = 0;
    this.objs.push(box(s, 60, 22, W - 120, H - 44, ui.bgInt, ui.textInt, ui.panelInt).setScrollFactor(0).setDepth(960));
    this.objs.push(text(s, W / 2, 30, this.title, { align: 'center', color: ui.accentInt, scale: 2, fixed: true, depth: 961 }));
    this.objs.push(s.add.image(W - 118, 36, spr('saga_icons'), ICON.gold).setScrollFactor(0).setDepth(961));
    this.goldT = text(s, W - 110, 33, '', { fixed: true, depth: 961, color: 0xf8b800 });
    this.objs.push(this.goldT);
    this.rows = this.list.map((id, i) => {
      const y = 52 + i * 13;
      const g = gearDef(id);
      if (g) this.objs.push(s.add.image(84, y + 3, spr('saga_icons'), g.slot === 'weapon' ? ICON.weapon : g.slot === 'armor' ? ICON.armor : ICON.charm)
        .setScrollFactor(0).setDepth(961));
      else this.objs.push(s.add.image(84, y + 3, spr(`item_${id}`)).setScrollFactor(0).setDepth(961));
      const t = text(s, 94, y, '', { fixed: true, depth: 961 });
      const pr = text(s, W - 84, y, '', { fixed: true, depth: 961, align: 'right' });
      this.objs.push(t, pr);
      this.prices[i] = pr;
      return t;
    });
    this.info = text(s, W / 2, H - 50, '', { align: 'center', fixed: true, depth: 961, color: ui.dimInt, maxWidth: W - 140, maxLines: 1 });
    this.objs.push(this.info);
    this.objs.push(text(s, W / 2, H - 36, 'ENTER buy   ESC leave', { align: 'center', fixed: true, depth: 961, color: ui.accentInt }));
    this.cursor = s.add.graphics().setScrollFactor(0).setDepth(962);
    this.objs.push(this.cursor);
    this.refresh();
  }

  /** Who would take this piece (null for items; undefined if nobody gains from it). */
  private taker(id: string) {
    const g = gearDef(id);
    if (!g) return null;
    const owned = R.party.some((m) => Object.values(m.gear).includes(id as never));
    if (owned) return undefined;
    return R.party.some((m) => canWear(m, id)) ? true : undefined;
  }

  private refresh() {
    const ui = K.ui;
    this.goldT.setText(`${R.gold}`);
    this.list.forEach((id, i) => {
      const g = gearDef(id);
      const name = g ? g.name : ITEMS[id as ItemId].name;
      const have = g ? '' : ` x${R.items[id as ItemId]}`;
      const ok = R.gold >= this.cost(id) && this.taker(id) !== undefined;
      const owned = g && R.party.some((m) => Object.values(m.gear).includes(id as never));
      this.rows[i].setText(`${name}${have}`).setColor(ok ? ui.textInt : 0x7c7c7c);
      this.prices[i].setText(owned ? 'OWNED' : `${this.cost(id)}G`).setColor(owned ? ui.dimInt : ok ? 0xf8b800 : 0x7c7c7c);
    });
    const id = this.list[this.sel];
    const g = gearDef(id);
    this.info.setText(g ? `${g.cls === 'any' ? 'Anyone' : g.cls === 'hero' ? 'Hedgehog' : g.cls === 'analyst' ? R.party[1]?.name ?? '' : R.party[2]?.name ?? ''}: ${gearLine(id)}`
      : ITEMS[id as ItemId].line);
    const y = 52 + this.sel * 13;
    this.cursor.clear().fillStyle(ui.accentInt).fillTriangle(70, y, 70, y + 8, 75, y + 4);
  }

  /** Buy entry `i` (also used by the autopilot). Returns a message, or null if it couldn't. */
  buy(i = this.sel): string | null {
    const id = this.list[i];
    if (!id) return null;
    const cost = this.cost(id);
    if (R.gold < cost || this.taker(id) === undefined) return null;
    const g = gearDef(id);
    if (!g) {
      R.gold -= cost;
      R.items[id as ItemId]++;
      return `Bought a ${ITEMS[id as ItemId].name}.`;
    }
    const m = autoEquip(R.party, id);
    if (!m) return null;
    R.gold -= cost;
    return `${m.name} equips the ${g.name}!`;
  }

  key(e: KeyboardEvent) {
    const n = this.list.length;
    if (['ArrowUp', 'KeyW'].includes(e.code)) { this.sel = (this.sel + n - 1) % n; K.play('move', 0.4); this.refresh(); return; }
    if (['ArrowDown', 'KeyS'].includes(e.code)) { this.sel = (this.sel + 1) % n; K.play('move', 0.4); this.refresh(); return; }
    if (['Escape', 'KeyX', 'Backspace'].includes(e.code)) { this.close(); return; }
    if (['Enter', 'Space', 'NumpadEnter'].includes(e.code) && !e.repeat) {
      const msg = this.buy();
      if (!msg) { K.play('bump'); this.info.setText(R.gold < this.cost(this.list[this.sel]) ? 'Not enough gold.' : 'Nobody needs that.'); return; }
      K.play('chest');
      this.refresh();
      this.info.setText(msg);
    }
  }

  get stock() { return this.list; }

  close() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.open = false;
    K.play('back');
    this.onClose();
  }
}
