// Undertale-style typed text with a blip sound, rendered as pre-wrapped pixel text so words
// never jump between lines while typing.
import Phaser from 'phaser';
import { K } from '@shared/kit';
import { text, wrap, PixelText } from '@shared/ui';
import { cleanText } from '@shared/font';

export class Typewriter {
  t: PixelText;
  full = '';
  shown = 0;
  done = true;
  cps = 45;
  private acc = 0;
  private blipN = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, private cols: number, private maxLines: number, opts: { depth?: number; color?: number } = {}) {
    this.t = text(scene, x, y, '', { depth: opts.depth ?? 201, color: opts.color ?? K.ui.textInt, shadow: null });
  }

  show(str: string) {
    this.full = wrap(cleanText(str), this.cols, this.maxLines, 'dialogue').join('\n');
    this.shown = 0;
    this.acc = 0;
    this.done = this.full.length === 0;
    this.t.setText('');
  }

  finish() {
    this.shown = this.full.length;
    this.done = true;
    this.t.setText(this.full);
  }

  step(dt: number) {
    if (this.done) return;
    this.acc += dt * this.cps;
    while (this.acc >= 1 && this.shown < this.full.length) {
      this.acc -= 1;
      const ch = this.full[this.shown++];
      if (ch !== ' ' && ch !== '\n' && this.blipN++ % 2 === 0) K.play('blip', 0.35, 30);
      if ('.,!?'.includes(ch)) this.acc -= 3; // pause on punctuation
    }
    this.t.setText(this.full.slice(0, this.shown));
    if (this.shown >= this.full.length) this.done = true;
  }

  destroy() { this.t.destroy(); }
}

/** Split long text into pages of `lines` wrapped lines. */
export function paginate(str: string, cols: number, lines: number): string[] {
  const all = wrap(cleanText(str), cols, 99);
  const pages: string[] = [];
  for (let i = 0; i < all.length; i += lines) pages.push(all.slice(i, i + lines).join(' '));
  return pages.length ? pages : [''];
}
