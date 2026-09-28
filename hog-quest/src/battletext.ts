// Fixed kit text for battles: flavour lines, rule captions, enemy bubbles and product effects.
// Generic (no prospect words); anything about the prospect comes from the theme.

export const FLAVOUR = [
  '{name} is buffering ominously.',
  '{name} throws a stack trace at the wall. It sticks.',
  'Smells like a Friday deploy.',
  '{name} refreshes itself. Nothing changes.',
  '{name} mutters something about legacy reasons.',
  'The office wifi flickers.',
];

/** One-line captions the first time a turn uses a new rule. */
export const RULES: Record<string, string> = {
  gems: 'GEMS GIVE TP',
  stoplight: "BLUE: DON'T MOVE",
  gravity: 'HEAVY! UP TO JUMP',
  laser: 'LINE = LASER SOON',
  squeeze: 'THE BOX SHRINKS',
  burst: 'X = IT POPS',
  thread: 'FIND THE GAP',
};

/** What an enemy mutters as its turn starts, by mood (fixed kit text, short enough for the bubble). */
export const BUBBLES: Record<string, string[]> = {
  calm: ['...', 'Hmm?', 'Is this a demo?', 'Not now.', 'Works for me.', 'Ticket?'],
  annoyed: ['Rude.', 'Hmph!', 'I was FINE.', 'Wow. OK.', 'Seriously?'],
  ready: ['...thanks.', 'I feel seen.', 'Oh. Nice.', 'Maybe...'],
  furious: ['NO.', 'REBOOT!', '404!', 'ROLLBACK!', 'Why?!'],
};

export const EFFECTS: Record<string, string> = {
  session_replay: 'You replay its last move. You can see the next one coming.',
  feature_flags: 'You flag off its worst feature. Its next attack does half damage.',
  experiments: 'A/B test! Variant B hits for {n}.',
  error_tracking: 'Stack trace found! Your next FIGHT will be a critical hit.',
  product_analytics: 'You chart its behaviour. You understand it a little better.',
  surveys: 'You ask how it is feeling. It opens up a little.',
  web_analytics: 'Traffic stats show its next move. The next attack will be shorter.',
  data_warehouse: 'You query the warehouse and find a snack. +10 HP.',
};
