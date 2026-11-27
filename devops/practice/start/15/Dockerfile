# syntax=docker/dockerfile:1
# 第 9 課的多階段建置：第一階段編譯，第二階段只留正式環境需要的東西
FROM node:24.22.2-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:24.22.2-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/src ./dist/src
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
