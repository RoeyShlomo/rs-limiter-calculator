/* Injects the built asset list and the deployment base path into dist/sw.js. */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const base = process.env.RS_BASE ?? '/rs-limiter-calculator/';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist)
  .map((f) => posix.join(base, relative(dist, f).split(/[\\/]/).join('/')))
  // The service worker itself is never precached.
  .filter((p) => !p.endsWith('/sw.js'))
  .sort();

const swPath = join(dist, 'sw.js');
const version = `${new Date().toISOString().slice(0, 10)}-${files.length}`;

const out = readFileSync(swPath, 'utf8')
  .replace('__PRECACHE__', JSON.stringify(files, null, 2))
  .replace('__BUILD_VERSION__', version)
  .replace('__BASE__', base);

writeFileSync(swPath, out);
console.log(`sw.js: ${files.length} precached entries, base ${base}, version ${version}`);
