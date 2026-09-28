// Achievement table (fixed kit text). Unlocked with achieve(id) from battle/explore/rush code.
import type { AchievementDef } from '@shared/meta';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_spare', name: 'Kind Hog', desc: 'Spare your first problem.' },
  { id: 'words_only', name: 'Words Only', desc: 'Spare a problem without using a product.' },
  { id: 'no_hit', name: 'Untouchable', desc: 'Win a battle without getting hit.' },
  { id: 'crit', name: 'Perfect Timing', desc: 'Land a critical FIGHT hit.' },
  { id: 'graze', name: 'Close Shave', desc: 'Graze 60 bullets in one run.' },
  { id: 'shop', name: 'Snack Break', desc: 'Buy something from the vending machine.' },
  { id: 'pacifist', name: 'Everyone Spared', desc: 'Reach the pacifist ending.' },
  { id: 'neutral', name: 'Middle Path', desc: 'Reach the neutral ending.' },
  { id: 'bugfix', name: 'Bug Squasher', desc: 'Reach the bugfix ending.', hidden: true },
  { id: 'all_endings', name: 'Seen It All', desc: 'Find all three endings.' },
  { id: 'secrets', name: 'Curious Hog', desc: 'Find every secret in one run.', hidden: true },
  { id: 'miniboss', name: 'Behind The Door', desc: 'Settle the hidden problem.', hidden: true },
  { id: 'rush', name: 'Rush Hour', desc: 'Clear the boss rush.' },
  { id: 'heat3', name: 'Crunch Time', desc: 'Win on heat 3 or higher.' },
];
