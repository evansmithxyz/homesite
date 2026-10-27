// Builds the site into dist/, laid out the way it's served:
//
//   dist/              the homepage (site/)
//   dist/diagrammer/   Sentence Diagrammer (../grammar)
//   dist/cube/         Cube Timer (../cube)
//
// Each project builds with its own npm scripts and dependencies, so run `npm install` in each first.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const projects = [
  { folder: 'diagrammer', dir: resolve(root, '../grammar') },
  { folder: 'cube', dir: resolve(root, '../cube') },
];

rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'site'), dist, { recursive: true });

for (const { folder, dir } of projects) {
  if (!existsSync(join(dir, 'node_modules'))) throw new Error(`${dir} has no node_modules: run npm install there first`);
  console.log(`\n== Building ${dir} into dist/${folder}/`);
  // relative asset paths (--base ./), so each project works inside its folder
  execSync(`npm run build -- --base ./ --outDir "${join(dist, folder)}" --emptyOutDir`, { cwd: dir, stdio: 'inherit' });
}
console.log('\n== Built dist/');
