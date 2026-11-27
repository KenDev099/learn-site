# 同事照著「在新主機上手動部署」的步驟寫的 Dockerfile：建置會失敗，就算修好了也不能上線
# 練習 1～3 都改這個檔案；指令的意思見第 8 課
FROM node:24.22.2-alpine3.24
ENV NODE_ENV=production
COPY . /app
WORKDIR /app
RUN npm install
RUN npm run build
EXPOSE 3000
CMD npm start
