ARG NODE_IMAGE=node:20.19.6-alpine3.21
ARG PNPM_VERSION=10.30.2
ARG NPM_REGISTRY=https://registry.npmjs.org/

FROM ${NODE_IMAGE} AS builder

ARG PNPM_VERSION
ARG NPM_REGISTRY

WORKDIR /app

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install --global "pnpm@${PNPM_VERSION}" \
    && pnpm --version

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN pnpm config set registry "${NPM_REGISTRY}"
RUN pnpm install --frozen-lockfile

COPY core ./core
COPY web ./web

RUN pnpm build:web
RUN pnpm -C core build:ts

# ==========================================
FROM ${NODE_IMAGE} AS prod-deps

ARG PNPM_VERSION
ARG NPM_REGISTRY

WORKDIR /app

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install --global "pnpm@${PNPM_VERSION}" \
    && pnpm --version

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN pnpm config set registry "${NPM_REGISTRY}"
RUN pnpm -C core install --prod --frozen-lockfile

# ==========================================

FROM ${NODE_IMAGE} AS runner

WORKDIR /app/core

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

COPY --from=prod-deps /app/node_modules ../node_modules/
COPY --from=prod-deps /app/core/node_modules ./node_modules/
COPY --from=prod-deps /app/package.json ../package.json
COPY --from=prod-deps /app/core/package.json ./package.json

COPY --from=builder /app/core/client.js ./client.js
COPY --from=builder /app/core/dist ./dist
COPY --from=builder /app/core/src/gameConfig ./src/gameConfig
COPY --from=builder /app/core/src/proto ./src/proto
RUN mkdir -p src/utils data/logs
COPY --from=builder /app/core/src/utils/tsdk.wasm ./src/utils/tsdk.wasm
COPY --from=builder /app/web/dist ../web/dist

RUN chmod -R 755 data

VOLUME ["/app/core/data"]

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3007/api/game-version || exit 1

CMD ["node", "client.js"]
