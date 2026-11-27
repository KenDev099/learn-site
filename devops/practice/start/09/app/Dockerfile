# syntax=docker/dockerfile:1
# 第 8 課的單一階段版本：能跑，但建置工具、原始碼、npm 快取全都留在映像裡
FROM node:24.22.2-alpine3.24
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
