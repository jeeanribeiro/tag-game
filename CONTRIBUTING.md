# Contributing

Thanks for taking an interest in tag-game!

## Setup

```bash
pnpm install
pnpm dev        # game server on :3000, Vite client on :5173
```

Node >= 24 and pnpm are required (`corepack enable` gives you the pinned pnpm).

## Before you open a PR

All of these must pass — CI runs the same commands:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## Guidelines

- Gameplay rules belong in `packages/shared` (pure, deterministic, unit-tested), not in the
  server or client. The server must stay the single authority: never trust a client-supplied
  position, speed or timer.
- Keep messages zod-validated. New client->server messages need a schema in
  `packages/shared/src/protocol.ts` and a test in `packages/shared/test/protocol.test.ts`.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
