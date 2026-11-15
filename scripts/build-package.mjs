import { build } from 'esbuild';
import { copyFile, chmod, mkdir } from 'node:fs/promises';
await build({ entryPoints: ['server/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' });
await copyFile('ONTOLOGY.md', 'dist/guide.md');
await copyFile('server/example.json', 'dist/example.marmerlade.json');
await chmod('dist/cli.js', 0o755);
await mkdir('dist/skills/marmerlade', { recursive: true });
await copyFile('skills/marmerlade/SKILL.md', 'dist/skills/marmerlade/SKILL.md');
