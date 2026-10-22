# syntax=docker/dockerfile:1.7
# Desertica CMS (Strapi 5). Multi-stage: native deps -> admin build -> slim runtime.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /opt/app
ENV STRAPI_TELEMETRY_DISABLED=true

# Toolchain for native modules (better-sqlite3 falls back to compiling when no prebuilt binary matches).
FROM base AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Production dependencies only (runtime image).
FROM toolchain AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Full dependencies + TypeScript compile + admin panel build.
FROM toolchain AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY config ./config
COPY src ./src
COPY database ./database
COPY public ./public
ENV NODE_ENV=production
# The build only needs the secrets to exist; the real ones are injected at run time.
RUN APP_KEYS=build1,build2,build3,build4 API_TOKEN_SALT=build ADMIN_JWT_SECRET=build \
    TRANSFER_TOKEN_SALT=build ENCRYPTION_KEY=build JWT_SECRET=build npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1337
COPY --chown=node:node package.json package-lock.json tsconfig.json ./
COPY --chown=node:node --from=prod-deps /opt/app/node_modules ./node_modules
COPY --chown=node:node --from=build /opt/app/dist ./dist
COPY --chown=node:node database ./database
COPY --chown=node:node seed ./seed
COPY --chown=node:node public/favicon.png ./public/favicon.png
# Writable state: media library and the sqlite file (only used when DATABASE_CLIENT=sqlite).
RUN mkdir -p public/uploads .tmp && chown -R node:node public .tmp
USER node
EXPOSE 1337
VOLUME ["/opt/app/public/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1337)+'/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/strapi", "start"]
