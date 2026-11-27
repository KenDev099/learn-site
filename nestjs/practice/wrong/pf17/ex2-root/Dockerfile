# 多階段建置：最後的映像只有正式依賴與編譯結果，用非 root 執行（第 4、17 課）
FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:24.22.1-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24.22.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["node", "-e", "fetch('http://127.0.0.1:3100/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
