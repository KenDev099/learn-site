# 練習 1：多階段建置（第 9 課），加上版本資訊

FROM node:24.22.2-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.22.2-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24.22.2-alpine3.24
# 建置時由 CI 傳入；ARG 只在建置期間存在，要讓程式讀到就轉成 ENV
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA \
      org.opencontainers.image.version=$APP_VERSION
ENV NODE_ENV=production APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 3000
USER node
# alpine 內建 busybox 的 wget，比每次啟動一個 node 輕得多
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --start-interval=1s --retries=5 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/health/live"]
CMD ["node", "dist/server.js"]
