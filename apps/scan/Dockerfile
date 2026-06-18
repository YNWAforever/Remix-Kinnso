# syntax=docker/dockerfile:1
# Railway deploy image for @kinnso/scan-app — the creator DNA scan worker.
#
# The worker runs TypeScript directly via `tsx` (no compile step) and imports the
# @kinnso/scan and @kinnso/db workspace packages, so the build context MUST be the
# monorepo root. `turbo prune --docker` carves out just this app plus its workspace
# dependencies (and a pruned lockfile), keeping the image small and the install fast.
#
# Railway uses this via the root railway.json (build.dockerfilePath = apps/scan/Dockerfile),
# which keeps the repo root as the build context.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 1. Prune the monorepo down to scan-app + its workspace dependencies.
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2 prune @kinnso/scan-app --docker

# 2. Install the pruned dependency set, then layer in the pruned source.
FROM base AS runner
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ ./

# The worker binds 0.0.0.0:$PORT — Railway injects PORT; 8788 is the local fallback.
ENV PORT=8788
EXPOSE 8788
CMD ["pnpm", "--filter", "@kinnso/scan-app", "start"]
