// The vending machine menu, drawn over the Explore scene. UP/DOWN pick, ENTER buys, ESC leaves.
import Phaser from 'phaser';
import { K } from '@shared/kit';
import { achieve } from '@shared/meta';
import { box, text, PixelText } from '@shared/ui';
import { R } from './state';
import { ITEMS, MAX_ITEMS } from './items';

export class Shop {
  sel = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private rows: PixelText[] = [];
  private cursor: PixelText;
  private goldT: PixelText;
  private msg: PixelText;

  constructor(private scene: Phaser.Scene, private done: () => void) {
    const ui = K.ui;
    const x = 40, y = 58, w = 400, h = 128;
    this.objs.push(box(scene, x, y, w, h, ui.bgInt, ui.textInt, ui.panelInt).setDepth(2100));
    this.objs.push(text(scene, x + 12, y + 8, 'VENDING MACHINE', { color: ui.accentInt, depth: 2101 }));
    this.goldT = text(scene, x + w - 12, y + 8, '', { align: 'right', color: ui.accentInt, depth: 2101 });
    this.cursor = text(scene, x + 12, 0, '♥', { color: 0xf83800, depth: 2101 });
    // Columns are separate texts: the pixel font collapses runs of spaces.
    ITEMS.forEach((it, i) => {
      const ry = y + 24 + i * 13;
      this.rows.push(text(scene, x + 24, ry, it.name, { depth: 2101, color: ui.textInt }));
      this.objs.push(text(scene, x + 124, ry, `${it.price}G`, { depth: 2101, color: ui.accentInt }));
      this.objs.push(text(scene, x + 156, ry, it.desc, { depth: 2101, color: ui.dimInt }));
    });
    this.rows.push(text(scene, x + 24, y + 24 + ITEMS.length * 13, 'LEAVE', { depth: 2101, color: ui.textInt }));
    this.msg = text(scene, x + 12, y + h - 16, '', { color: ui.dimInt, depth: 2101 });
    this.objs.push(this.goldT, this.cursor, this.msg, ...this.rows);
    this.draw('Gold drops from battles. Items are used with ITEM in battle.');
  }

  private draw(msg?: string) {
    this.goldT.setText(`${R.gold} G   BAG ${R.items.length}/${MAX_ITEMS}`);
    this.cursor.setY(this.rows[this.sel].y);
    this.rows.forEach((r, i) => {
      const it = ITEMS[i];
      r.setColor(i === this.sel ? K.ui.accentInt : it && it.price > R.gold ? K.ui.dimInt : K.ui.textInt);
    });
    if (msg !== undefined) this.msg.setText(msg);
  }

  key(code: string) {
    const n = this.rows.length;
    if (code === 'ArrowUp' || code === 'KeyW') { this.sel = (this.sel + n - 1) % n; K.play('move', 0.5); }
    else if (code === 'ArrowDown' || code === 'KeyS') { this.sel = (this.sel + 1) % n; K.play('move', 0.5); }
    else if (['Escape', 'KeyX', 'Backspace'].includes(code)) { this.close(); return; }
    else if (['Enter', 'Space', 'KeyZ', 'NumpadEnter'].includes(code)) {
      if (this.sel >= ITEMS.length) { this.close(); return; }
      this.draw(this.buy(ITEMS[this.sel].id));
      return;
    }
    this.draw();
  }

  buy(id: string): string { return buyItem(id); }

  close() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    K.play('select', 0.5);
    this.done();
  }
}

/** Buy one item; returns the message to show. */
export function buyItem(id: string): string {
  {
    const it = ITEMS.find((i) => i.id === id);
    if (!it) return '';
    if (R.items.length >= MAX_ITEMS) { K.play('hurt', 0.4); return 'Your bag is full.'; }
    if (R.gold < it.price) { K.play('hurt', 0.4); return `Not enough gold. The machine hums at you.`; }
    R.gold -= it.price;
    R.items.push(it.id);
    K.play('product', 0.6);
    achieve('shop');
    return `Clunk! You got a ${it.name}.`;
  }
}
