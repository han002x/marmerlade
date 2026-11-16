import { build } from 'esbuild';
import { copyFile, chmod, cp, mkdir } from 'node:fs/promises';
await build({ entryPoints: ['server/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' });
await copyFile('ONTOLOGY.md', 'dist/guide.md');
await copyFile('server/example.json', 'dist/example.marmerlade.json');
await chmod('dist/cli.js', 0o755);
await mkdir('dist/skills', { recursive: true });
for (const name of ['marmerlade-director', 'marmerlade-docs', 'marmerlade-setup']) {
  await cp(`.agents/${name}`, `dist/skills/${name}`, { recursive: true });
}
