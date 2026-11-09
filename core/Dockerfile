# 刻意不声明外部的 syntax=docker/dockerfile:x.y 指令：那是 Dockerfile parser
# directive，BuildKit 会先去 docker.io 把对应镜像拉下来当解析器，再读本文件。
# 部分国内镜像加速站（如 docker.fnnas.com）不代理 docker/dockerfile 这个
# namespace，HEAD manifest 返回 401，构建会在第一步直接失败。本文件只用多阶段
# 构建、ARG before FROM、COPY --from、RUN --mount=type=cache（Dockerfile 1.2
# 起即内置支持）和 HEALTHCHECK，交给 Docker 引擎自带的解析器即可，无需外部镜像。
# 如确需升级 frontend，请改用能访问该镜像的 registry，不要直接加回这一行。

# NODE_IMAGE 默认写成全限定名而不是短名 node:...：短名会被补成
# docker.io/library/node，一旦宿主机配了失效的 registry mirror（如飞牛 fnOS 的
# docker.fnnas.com），metadata 阶段就返回 401，构建第一步直接失败。带域名的地址
# 不经过 docker.io，也就不受 mirror 影响，无需改动宿主机任何配置。
# DaoCloud public-image-mirror 按需同步，镜像 sha256 与 Docker Hub 源站一致。
# 想切回官方源：NODE_IMAGE=node:20.19.6-alpine3.21 docker compose up -d --build
# （compose 已用 ${NODE_IMAGE:-...} 注入；这里的 ARG 默认值须与 compose 保持一致）。
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20.19.6-alpine3.21
ARG PNPM_VERSION=10.30.2
ARG NPM_REGISTRY=https://registry.npmjs.org/

FROM ${NODE_IMAGE} AS pnpm-base

ARG PNPM_VERSION
ARG NPM_REGISTRY

WORKDIR /app

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install --global "pnpm@${PNPM_VERSION}" \
    && pnpm config set registry "${NPM_REGISTRY}" \
    && pnpm config set store-dir /pnpm/store \
    && pnpm --version

# Dependency installation is isolated from source copies so normal code changes
# keep this expensive layer cached. The store cache also survives lockfile edits.
FROM pnpm-base AS workspace-deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# .npmrc 里有 node-linker=hoisted，必须跟着进镜像：不带它时 pnpm 会退回默认
# 符号链接布局，core/tsconfig.json（declaration: true）在为 JS 生成 .d.ts 时
# 无法命名 Express 的推断类型，构建阶段报 TS2742。这里只影响构建阶段布局，
# 运行阶段仍用下面 prod-deps 的默认布局。
COPY .npmrc ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN --mount=type=cache,id=qq-farm-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# Web and Core use independent stages. BuildKit can reuse or execute them
# independently instead of rebuilding Web after a Core-only source change.
FROM workspace-deps AS web-builder

# 根目录 version.json 是版本号单一真源，界面上的「第 N 次更新」由它注入。
# 不拷进来时 vite 读不到会回退成 0；版本每次递增让该层缓存失效，正是期望行为。
COPY version.json ./version.json

# Web 有一个文件跨目录引用 core 的配置，必须在 COPY web 之前显式拷进来，
# 否则本阶段没有 ./core，Vite 会报 Could not resolve "../../../core/...":
#   web/src/utils/notification-template.ts -> core/src/config/notification-templates.json
# 只拷这一个文件，不能整体拷 core/src/gameConfig（素材太大）。
COPY core/src/config/notification-templates.json ./core/src/config/notification-templates.json
COPY web ./web
RUN pnpm -C web build

FROM workspace-deps AS core-builder

COPY core ./core
RUN pnpm -C core build:ts

# Production dependencies have their own cached stage and are unaffected by
# application source changes.
FROM pnpm-base AS prod-deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

RUN --mount=type=cache,id=qq-farm-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm -C core install --prod --frozen-lockfile

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

COPY --from=core-builder /app/core/client.js ./client.js
COPY --from=core-builder /app/core/dist ./dist
COPY --from=core-builder /app/core/src/gameConfig ./src/gameConfig
COPY --from=core-builder /app/core/src/proto ./src/proto
RUN mkdir -p src/utils data/logs
COPY --from=core-builder /app/core/src/utils/tsdk.wasm ./src/utils/tsdk.wasm
COPY --from=core-builder /app/core/src/utils/tsdk-wx.wasm ./src/utils/tsdk-wx.wasm
COPY --from=web-builder /app/web/dist ../web/dist

RUN chmod -R 755 data

VOLUME ["/app/core/data"]

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3007/api/game-version || exit 1

CMD ["node", "client.js"]
