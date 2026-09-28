// Battle music: fixed kit tracks (assets/default/battle.ogg, boss.ogg, made with music.py). The
// exploration track (theme music) pauses during a battle and resumes after. Missing audio = silence.
import Phaser from 'phaser';

let current: Phaser.Sound.BaseSound | null = null;

export function preloadMusic(scene: Phaser.Scene) {
  if (!scene.cache.audio.exists('hq-battle')) scene.load.audio('hq-battle', 'assets/default/battle.ogg');
  if (!scene.cache.audio.exists('hq-boss')) scene.load.audio('hq-boss', 'assets/default/boss.ogg');
}

export function battleMusic(scene: Phaser.Scene, boss: boolean) {
  try {
    stopBattleMusic(scene, false);
    const key = boss ? 'hq-boss' : 'hq-battle';
    const explore = scene.sound.get('music');
    const wasPlaying = !!explore?.isPlaying;
    if (wasPlaying) explore!.pause();
    if (!scene.cache.audio.exists(key) || !wasPlaying) return; // no audio unlocked yet: stay quiet
    current = scene.sound.add(key, { loop: true, volume: 0.32 });
    current.play();
  } catch { /* audio must never break the game */ }
}

export function stopBattleMusic(scene: Phaser.Scene, resume = true) {
  try {
    if (current) { current.stop(); current.destroy(); current = null; }
    if (resume) {
      const explore = scene.sound.get('music');
      if (explore?.isPaused) explore.resume();
    }
  } catch { /* ignore */ }
}
