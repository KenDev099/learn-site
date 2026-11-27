# learn-k8s/cafe-api 的所有版本都從這個檔案建置（bin/images.mjs）
#   v1、v2：target app，--build-arg VERSION=v1／v2
#   bad、slow-start、no-sigterm、distroless：同名的 target
FROM node:24.22.2-alpine3.24 AS app
WORKDIR /app
COPY server.ts ./
ARG VERSION=v1
ENV APP_VERSION=$VERSION
EXPOSE 3000
USER node
CMD ["node", "server.ts"]

# 啟動就崩潰（CrashLoopBackOff 用）
FROM app AS bad
ENV APP_VERSION=bad CRASH_ON_START=1

# 45 秒才開始聽 port（startupProbe 用）
FROM app AS slow-start
ENV APP_VERSION=slow-start STARTUP_DELAY_MS=45000

# 收到 SIGTERM 不理會（寬限期到了才被 SIGKILL）
FROM app AS no-sigterm
ENV APP_VERSION=no-sigterm IGNORE_SIGTERM=1

# 沒有 shell 的映像（kubectl debug 用）：distroless 的 nonroot 版本，用 digest 釘住
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91 AS distroless
WORKDIR /app
COPY --from=app /app/server.ts ./
ENV APP_VERSION=distroless
EXPOSE 3000
CMD ["server.ts"]
