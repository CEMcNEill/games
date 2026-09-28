// Build every kit (or the ones named): compose theme.schema.json from the shared base + the kit's
// game schema, render default sprites, stage the default theme, then vite build to <kit>/dist.
//   node build-kits.mjs [kit ...]
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(ROOT, 'shared');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const all = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'kit.json')));
const kits = process.argv.slice(2).length ? process.argv.slice(2) : all;

export function composeSchema(kitDir) {
  const kit = read(path.join(kitDir, 'kit.json'));
  const schema = read(path.join(SHARED, 'theme.base.schema.json'));
  const game = read(path.join(kitDir, 'game.schema.json'));
  schema.$id = `https://games.local/kits/${kit.id}/theme.schema.json`;
  schema.title = `${kit.name} theme`;
  schema.properties.products.items.enum = kit.products;
  if (kit.products_min) schema.properties.products.minItems = kit.products_min;
  if (kit.products_max) schema.properties.products.maxItems = Math.min(kit.products_max, kit.products.length);
  // Any string enum left empty in the game schema means "one of this kit's products".
  const fill = (s) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.enum) && s.enum.length === 0) s.enum = kit.products;
    Object.values(s).forEach(fill);
  };
  fill(game);
  schema.properties.game = game;
  return schema;
}

for (const id of kits) {
  const dir = path.join(ROOT, id);
  const t0 = Date.now();
  write(path.join(dir, 'theme.schema.json'), composeSchema(dir));
  const pub = path.join(dir, 'public');
  fs.mkdirSync(path.join(pub, 'theme'), { recursive: true });
  execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', path.join(SHARED, 'sprites.py'), dir,
    path.join(pub, 'assets/default')], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (!fs.existsSync(path.join(pub, 'assets/default/music.ogg'))) {
    console.warn(`[${id}] no assets/default/music.ogg yet: run tools/kit-music.sh ${id}`);
  }
  fs.copyFileSync(path.join(dir, 'themes/default.json'), path.join(pub, 'theme/theme.json'));
  write(path.join(pub, 'theme/manifest.json'), { slug: `${id}-default`, sprites: {}, music: null, posthog: null });
  await build({
    root: dir,
    base: './',
    logLevel: 'warn',
    configFile: false,
    resolve: { alias: { '@shared': path.join(SHARED, 'src') } },
    build: { outDir: path.join(dir, 'dist'), emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000,
      reportCompressedSize: false },
  });
  console.log(`[${id}] built in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(ROOT, path.join(dir, 'dist'))}`);
}
