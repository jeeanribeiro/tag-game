# Build stage: install the workspace, build client + server, then produce a
# pruned production bundle for the server package.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm -r build
RUN pnpm --filter @tag-game/server deploy --prod /out/server

# Runtime stage: one small image, the server serves the built client.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web

COPY --from=build /out/server /app
COPY --from=build /repo/apps/web/dist /app/web

EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
