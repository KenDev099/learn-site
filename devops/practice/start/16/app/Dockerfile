# 第 16 課的 cafe-api：只用 Node 內建模組，沒有套件要裝。這個檔案不用改
FROM node:24.22.2-alpine3.24
# APP_VERSION：/version 回報的版本（沒給就用 package.json 的 version）
# BROKEN_READY=1：做出一個 /health/ready 永遠失敗的壞版本，練習 2 用來演練部署失敗
ARG APP_VERSION=
ARG BROKEN_READY=0
ENV NODE_ENV=production APP_VERSION=$APP_VERSION BROKEN_READY=$BROKEN_READY
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
