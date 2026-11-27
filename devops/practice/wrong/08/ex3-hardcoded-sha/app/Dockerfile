# syntax=docker/dockerfile:1
FROM node:24.22.2-alpine3.24
WORKDIR /app

# 先只複製依賴清單：package*.json 沒變，下面的 npm ci 就整層重用快取
COPY package.json package-lock.json ./
RUN npm ci

# 再複製原始碼並編譯（devDependencies 裡的 typescript 這時候還在）
COPY . .
RUN npm run build

# 版本資訊放最後：每次 commit 都不同，放前面會讓 npm ci 的快取失效
ARG APP_VERSION=dev
ARG GIT_SHA
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    GIT_SHA=3f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39
LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=3f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39

EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --start-interval=1s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
