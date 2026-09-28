// window.__game: what playtest.py and the kit bots read and drive. Every kit fills the same shape.
export interface GameHooks {
  kit: string;
  ready: boolean;
  scene: string;
  state: string;          // title | howto | playing | paused | levelup | win | lose | ...
  score: number;
  elapsed: number;        // seconds of play in the current run
  fps: number;
  fallbacks: string[];    // slots/music that fell back to kit defaults at runtime
  themeIssues: string[];  // theme fields the sanitiser fixed
  textWarnings: string[]; // text the engine had to cut to fit
  events: { event: string; props: Record<string, unknown>; t: number }[];
  stats: Record<string, unknown>; // kit-specific live numbers (enemies on screen, level, hp...)
  debug: Record<string, (...a: any[]) => unknown>; // kit-specific test controls
}

export const hooks: GameHooks = {
  kit: '', ready: false, scene: '', state: 'boot', score: 0, elapsed: 0, fps: 0,
  fallbacks: [], themeIssues: [], textWarnings: [], events: [], stats: {}, debug: {},
};
(window as any).__game = hooks;
