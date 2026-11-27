# syntax=docker/dockerfile:1
# 錯誤：單一階段，在同一個 RUN 裡編譯、prune、刪原始碼。最後看到的檔案很乾淨，但 COPY src 那一層還帶著 .ts
FROM node:24.22.2-alpine3.24
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --omit=dev && rm -rf src tsconfig.json /root/.npm node_modules/@types node_modules/@typescript
ENV NODE_ENV=production
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
