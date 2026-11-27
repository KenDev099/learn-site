# 錯誤：只有一個 stage，編譯工具、devDependencies、原始碼都留在最後的映像裡
FROM node:24.22.1-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
