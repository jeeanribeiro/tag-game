import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  // Bundle the shared workspace package (it ships as TypeScript source);
  // real dependencies stay external and come from node_modules.
  noExternal: [/^@tag-game\//],
});
