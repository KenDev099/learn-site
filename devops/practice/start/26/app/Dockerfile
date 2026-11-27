# 練習 1：寫出正式環境用的映像（要求看課程頁的練習 1）
# - 多階段：建置階段 npm ci + npm run build；最終階段只有 package.json、正式依賴、dist/、migrations/
# - ARG APP_VERSION、GIT_SHA：轉成同名的 ENV（/version 讀它們），GIT_SHA 也寫進 label org.opencontainers.image.revision
# - 非 root、HEALTHCHECK 打 /health/live、CMD ["node", "dist/server.js"]
# 基底映像：node:24.22.2-alpine3.24
