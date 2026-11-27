# syntax=docker/dockerfile:1

# 階段 1：編譯。需要 typescript 等 devDependencies，所以完整 npm ci
# 編譯出來的 JS 跟 CPU 架構無關，固定在建置機器的架構上跑，不用模擬
FROM --platform=$BUILDPLATFORM node:24.22.2-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 階段 2：只裝正式依賴（pino 是純 JS，所以也能在建置機器的架構上裝）
FROM --platform=$BUILDPLATFORM node:24.22.2-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 階段 3：最終映像，跟著目標架構。只有 package.json、正式依賴、編譯結果
FROM node:24.22.2-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
