// Kit contract and boot: every kit calls startKit(kitDef). The engine loads theme/theme.json and
// theme/manifest.json (written per prospect by make-game), sanitises the theme against the kit's
// schema, and runs Boot -> Title -> HowTo -> kit scenes -> End. Nothing per prospect touches code.
import Phaser from 'phaser';
import { sanitize } from './schema';
import { deriveUi, snap, Ui } from './palette';
import { hooks } from './hooks';
import { initAnalytics, capture } from './analytics';
import { Sfx, ZzfxParams } from './zzfx';
import { W, H } from './ui';
import { BootScene, TitleScene, HowToScene, EndScene } from './scenes';

export interface Slot {
  id: string;
  w: number;
  h: number;
  frames: number;
  fps?: number;
  /** Flux prompt template with {theme.path} placeholders; absent = fixed kit art, never generated. */
  prompt?: string;
  kind?: string; // 'sprite' (default) or 'tile'
}

export interface Manifest {
  slug?: string;
  sprites?: Record<string, string>; // slot id -> path of a generated/recoloured sprite
  music?: string | null;
  posthog?: { key?: string; host?: string } | null;
  draft?: boolean;
}

export interface KitDef {
  id: string;
  name: string;
  schema: any;
  defaultTheme: any;
  slots: Slot[];
  sfx: Record<string, ZzfxParams>;
  howTo: (theme: any) => string[];
  /** Draw kit art on the title screen (sprites, lineup). */
  titleArt?: (scene: Phaser.Scene) => void;
  /** Kit-specific fix-ups after schema sanitising (e.g. cross-field rules). */
  postSanitize?: (theme: any, issues: string[]) => void;
  scenes: Phaser.Types.Scenes.SceneType[];
  gameScene: string;
}

/** Everything the scenes need, set once at boot. */
export const K = {
  kit: null as unknown as KitDef,
  theme: null as any,
  ui: null as unknown as Ui,
  manifest: {} as Manifest,
  sfx: null as unknown as Sfx,
  /** slot id -> texture key actually in use (themed or default) */
  sprites: {} as Record<string, string>,
  /** play one ZzFX preset */
  play: (name: string, vol = 1, gap = 40) => K.sfx?.play(name, vol, gap),
};

export const spr = (id: string) => K.sprites[id] ?? `d:${id}`;
export const anim = (id: string) => `${id}-anim`;

async function getJson(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function hashPitch(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return 0.9 + ((Math.abs(h) % 1000) / 1000) * 0.2; // 0.9..1.1: each prospect's game sounds a bit different
}

export async function startKit(kit: KitDef) {
  hooks.kit = kit.id;
  K.kit = kit;
  const [raw, manifest] = await Promise.all([getJson('theme/theme.json'), getJson('theme/manifest.json')]);
  const issues: string[] = [];
  if (!raw) issues.push('theme.json missing or unreadable: using the default theme');
  const theme = sanitize(raw ?? kit.defaultTheme, kit.schema, kit.defaultTheme, '', issues);
  theme.palette = { primary: snap(theme.palette.primary), secondary: snap(theme.palette.secondary), accent: snap(theme.palette.accent) };
  kit.postSanitize?.(theme, issues);
  hooks.themeIssues.push(...issues);
  if (issues.length) console.warn('[theme] fixed fields:', issues);
  K.theme = theme;
  K.ui = deriveUi(theme.palette);
  K.manifest = manifest ?? {};
  document.title = theme.title;
  document.body.style.background = K.ui.bg;
  initAnalytics(K.manifest.posthog ?? undefined, K.manifest.slug ?? 'default', kit.id);

  const zoom = () => Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    zoom: zoom(),
    pixelArt: true,
    roundPixels: true,
    backgroundColor: K.ui.bg,
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    input: { keyboard: true, gamepad: false },
    audio: { disableWebAudio: false },
    fps: { target: 60 },
    scene: [BootScene, TitleScene, HowToScene, ...kit.scenes, EndScene],
  });
  window.addEventListener('resize', () => game.scale.setZoom(zoom()));
  game.events.on('step', () => { hooks.fps = Math.round(game.loop.actualFps); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      game.sound.mute = !game.sound.mute;
      K.sfx.muted = game.sound.mute;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  K.sfx = new Sfx(null, kit.sfx, hashPitch(theme.prospect.name));
  (window as any).__phaser = game;
  capture('game_opened', { referrer: document.referrer || null });
  return game;
}

export function makeSfx(scene: Phaser.Scene) {
  const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context ?? null;
  const muted = K.sfx?.muted ?? false;
  K.sfx = new Sfx(ctx, K.kit.sfx, hashPitch(K.theme.prospect.name));
  K.sfx.muted = muted;
}
