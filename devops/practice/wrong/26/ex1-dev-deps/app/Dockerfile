FROM node:24.22.2-alpine3.24
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
ENV NODE_ENV=production APP_VERSION=$APP_VERSION GIT_SHA=$GIT_SHA
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && rm -rf src
COPY migrations ./migrations
USER node
# alpine 內建 busybox 的 wget，比每次啟動一個 node 輕得多
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --start-interval=1s --retries=5 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/health/live"]
CMD ["node", "dist/server.js"]
