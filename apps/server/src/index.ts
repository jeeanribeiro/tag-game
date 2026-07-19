import { fileURLToPath } from 'node:url';
import { createGameServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const webDistPath =
  process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url));

const running = await createGameServer({ port, webDistPath });
console.log(`tag-game server listening on http://localhost:${running.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.close().then(() => {
      process.exit(0);
    });
  });
}
