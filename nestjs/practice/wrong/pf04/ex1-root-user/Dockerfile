# 多階段建置（第 4 課）：build 階段有編譯工具，最後的映像只有正式依賴與編譯結果，用非 root 執行
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
# 錯誤：沒有 USER，容器裡用 root 執行
EXPOSE 3000
CMD ["node", "dist/main.js"]
