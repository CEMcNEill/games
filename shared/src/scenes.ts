// Screens every kit shares: Boot (loader with per-slot fallback), Title, HowTo and End.
import Phaser from 'phaser';
import { registerFont } from './font';
import { K, anim, makeSfx } from './kit';
import { hooks } from './hooks';
import { capture } from './analytics';
import { text, box, blink, fitScale, W, H } from './ui';

function enter(scene: Phaser.Scene, name: string, state: string) {
  hooks.scene = name;
  hooks.state = state;
}

/** Press any of `codes` once (ignores keys held from the previous screen). */
export function onKeys(scene: Phaser.Scene, codes: string[], fn: (code: string) => void, armMs = 250) {
  let armed = false;
  scene.time.delayedCall(armMs, () => (armed = true));
  const h = (e: KeyboardEvent) => {
    if (!armed || e.repeat || !codes.includes(e.code)) return;
    fn(e.code);
  };
  scene.input.keyboard!.on('keydown', h);
  scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown', h));
}

export function startMusic(scene: Phaser.Scene) {
  if (!scene.cache.audio.exists('music')) return;
  const existing = scene.sound.get('music');
  if (existing?.isPlaying) return;
  (existing ?? scene.sound.add('music', { loop: true, volume: 0.35 })).play();
}

/** Drifting pixel stars in brand colours; a cheap, on-theme backdrop for menu screens. */
export function starfield(scene: Phaser.Scene, n = 60) {
  const cols = [K.ui.textInt, K.ui.dimInt, K.ui.accentInt, K.ui.panelInt];
  const stars = Array.from({ length: n }, (_, i) => {
    const s = scene.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 1, 1, cols[i % cols.length])
      .setOrigin(0).setAlpha(Phaser.Math.FloatBetween(0.3, 1));
    return { s, v: Phaser.Math.FloatBetween(4, 18) };
  });
  scene.events.on('update', (_t: number, dt: number) => {
    for (const st of stars) {
      st.s.x -= (st.v * dt) / 1000;
      if (st.s.x < 0) { st.s.x = W; st.s.y = Phaser.Math.Between(0, H); }
    }
  });
}

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    enter(this, 'Boot', 'boot');
    registerFont(this);
    const ui = K.ui;
    const g = this.add.graphics();
    this.load.on('progress', (p: number) => {
      g.clear().fillStyle(ui.textInt).fillRect(W / 2 - 61, H / 2 - 4, 122, 8)
        .fillStyle(ui.bgInt).fillRect(W / 2 - 60, H / 2 - 3, 120, 6)
        .fillStyle(ui.accentInt).fillRect(W / 2 - 60, H / 2 - 3, Math.round(120 * p), 6);
    });
    const themed = K.manifest.sprites ?? {};
    for (const s of K.kit.slots) {
      this.load.spritesheet(`d:${s.id}`, `assets/default/${s.id}.png`, { frameWidth: s.w, frameHeight: s.h });
      if (themed[s.id]) this.load.spritesheet(`t:${s.id}`, themed[s.id], { frameWidth: s.w, frameHeight: s.h });
    }
    const musicUrl = K.manifest.music || 'assets/default/music.ogg';
    this.load.audio('music', musicUrl);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      hooks.fallbacks.push(`${file.key}: failed to load ${file.url}`);
      if (file.key === 'music' && K.manifest.music) {
        K.manifest.music = null;
        this.load.audio('music', 'assets/default/music.ogg');
      }
    });
  }

  create() {
    makeSfx(this);
    for (const s of K.kit.slots) {
      const t = `t:${s.id}`;
      let key = `d:${s.id}`;
      if (this.textures.exists(t)) {
        const img = this.textures.get(t).getSourceImage() as HTMLImageElement;
        if (img.width === s.w * s.frames && img.height === s.h) key = t;
        else hooks.fallbacks.push(`${s.id}: themed sprite is ${img.width}x${img.height}, expected ${s.w * s.frames}x${s.h}`);
      }
      K.sprites[s.id] = key;
      if (s.frames > 1 && !this.anims.exists(anim(s.id))) {
        this.anims.create({ key: anim(s.id), frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frames - 1 }),
          frameRate: s.fps ?? 6, repeat: -1 });
      }
    }
    hooks.ready = true;
    this.scene.start('Title');
  }
}

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    enter(this, 'Title', 'title');
    const { theme, ui } = K;
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this);
    K.kit.titleArt?.(this);
    // Title: as big as fits on one line, else two lines at x2.
    const sc = fitScale(theme.title, W - 40, 3);
    const t = text(this, W / 2, 34, theme.title, { scale: sc === 1 ? 2 : sc, align: 'center', color: ui.accentInt,
      maxWidth: W - 40, maxLines: 2, shadow: ui.panelInt, depth: 10 });
    text(this, W / 2, 34 + t.textHeight + 8, theme.tagline, { align: 'center', color: ui.textInt,
      maxWidth: W - 60, maxLines: 2, depth: 10 });
    const press = text(this, W / 2, 214, 'PRESS ENTER', { scale: 2, align: 'center', color: ui.textInt, depth: 10 });
    blink(this, press, 500);
    text(this, W / 2, H - 14, 'Arrows/WASD move   Enter select   M mute', { align: 'center', color: ui.dimInt, depth: 10 });
    const go = () => {
      K.play('select');
      startMusic(this);
      this.scene.start('HowTo');
    };
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], go, 150);
    this.input.keyboard!.once('keydown', () => startMusic(this));
  }
}

export class HowToScene extends Phaser.Scene {
  constructor() { super('HowTo'); }

  create() {
    enter(this, 'HowTo', 'howto');
    const { theme, ui } = K;
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this, 30);
    box(this, 24, 16, W - 48, H - 32, ui.bgInt, ui.textInt, ui.panelInt);
    text(this, W / 2, 28, 'HOW TO PLAY', { scale: 2, align: 'center', color: ui.accentInt });
    const lines = K.kit.howTo(theme);
    let y = 56;
    for (const l of lines) {
      const t = text(this, 44, y, l, { maxWidth: W - 88, maxLines: 3, color: ui.textInt });
      y += t.lineCount * 10 + 6;
      if (y > H - 50) break;
    }
    const press = text(this, W / 2, H - 38, 'PRESS ENTER TO START', { align: 'center', color: ui.accentInt });
    blink(this, press, 500);
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], () => {
      K.play('select');
      startMusic(this);
      capture('game_started', {});
      this.scene.start(K.kit.gameScene);
    });
    onKeys(this, ['Escape'], () => this.scene.start('Title'));
  }
}

export interface EndData {
  won: boolean;
  score: number;
  headline?: string;
  stats?: [string, string | number][];
  props?: Record<string, unknown>; // extra analytics properties
}

export class EndScene extends Phaser.Scene {
  constructor() { super('End'); }

  create(d: EndData) {
    enter(this, 'End', d.won ? 'win' : 'lose');
    hooks.score = d.score;
    const { theme, ui } = K;
    capture('game_finished', { outcome: d.won ? 'win' : 'lose', score: d.score, duration: Math.round(hooks.elapsed), ...d.props });
    K.play(d.won ? 'win' : 'lose');
    this.cameras.main.setBackgroundColor(ui.bg);
    starfield(this, d.won ? 80 : 20);
    const head = d.headline ?? (d.won ? 'VICTORY!' : 'GAME OVER');
    text(this, W / 2, 22, head, { scale: 3, align: 'center', color: d.won ? ui.accentInt : 0xf83800, shadow: ui.panelInt });
    text(this, W / 2, 62, d.won ? theme.text.win : theme.text.lose, { align: 'center', maxWidth: W - 60, maxLines: 3, color: ui.textInt });
    text(this, W / 2, 100, `SCORE ${d.score}`, { scale: 2, align: 'center', color: ui.accentInt });
    let y = 128;
    for (const [k, v] of d.stats ?? []) {
      text(this, W / 2 - 8, y, k, { align: 'right', color: ui.dimInt });
      text(this, W / 2 + 8, y, String(v), { color: ui.textInt });
      y += 12;
    }
    const press = text(this, W / 2, H - 50, 'ENTER: PLAY AGAIN   ESC: TITLE', { align: 'center', color: ui.textInt });
    blink(this, press, 500);
    text(this, W / 2, H - 22, theme.text.credits, { align: 'center', maxWidth: W - 40, maxLines: 2, color: ui.dimInt });
    onKeys(this, ['Enter', 'Space', 'NumpadEnter'], () => {
      capture('game_started', { replay: true });
      this.scene.start(K.kit.gameScene);
    }, 800);
    onKeys(this, ['Escape'], () => this.scene.start('Title'), 800);
  }
}
