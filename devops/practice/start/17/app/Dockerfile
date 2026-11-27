# syntax=docker/dockerfile:1
# 第 9 課的多階段建置，最終映像多了 migrations/（給 node dist/migrate.js 用）。第 17 課沿用

FROM --platform=$BUILDPLATFORM node:24.22.2-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM --platform=$BUILDPLATFORM node:24.22.2-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24.22.2-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
