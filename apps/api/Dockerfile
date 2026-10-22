# API image for the hosted demo (docs/04-deployment.md). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t multicooperativa-api .
# There is no compile step: the API runs TypeScript through tsx, so the image only needs the
# production dependencies, the sources and the generated Prisma client.
FROM node:24-slim

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    # Render's free instance has 512 MB: leave headroom for the native memory of Node and Prisma.
    NODE_OPTIONS=--max-old-space-size=320

# openssl: required by the Prisma schema engine that applies the migrations.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@12.9.1 \
 && npm cache clean --force

# Everything runs as the unprivileged user of the node image.
RUN mkdir /app && chown node:node /app
USER node
WORKDIR /app

# Manifests first, so the dependency layer is cached until they change.
COPY --chown=node:node pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --chown=node:node packages/contracts/package.json packages/contracts/
COPY --chown=node:node apps/api/package.json apps/api/
# The schema must exist before generating the client.
COPY --chown=node:node apps/api/prisma apps/api/prisma
COPY --chown=node:node apps/api/prisma.config.ts apps/api/

# Only the API and what it depends on (the contracts package), production dependencies only.
# Scripts are skipped (the root `prepare` runs husky); the Prisma client is generated explicitly.
# The pnpm store (~/.cache) is a build cache mount, so it does not end up in the image.
RUN --mount=type=cache,target=/home/node/.cache,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter "@multicooperativa/api..." \
 && pnpm --filter @multicooperativa/api exec prisma generate

COPY --chown=node:node packages/contracts packages/contracts
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node apps/api/tsconfig.json apps/api/
COPY --chown=node:node apps/api/src apps/api/src
# The seed scripts (`db:seed`, `db:seed:content`) run inside the container on the home server.
COPY --chown=node:node apps/api/scripts apps/api/scripts

WORKDIR /app/apps/api
EXPOSE 3000

# Migrations use DIRECT_URL (non-pooled) when set; the API uses DATABASE_URL (pooled).
# `exec` replaces the shell with node, so node is PID 1 and receives SIGTERM (graceful shutdown);
# going through `pnpm run` would leave pnpm/sh in between. Same commands as `start:prod`.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node --import tsx src/main.ts"]
