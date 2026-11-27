# cafe-hash：沒有 shell 的 cafe-api（distroless），執行環境的設定寫死在映像的 ENV 裡，manifest 看不到
# break.sh 與測試建置時用 --build-arg 傳入 POOL、HEAP，建置 context 是 practice/shared/cafe-api
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91
WORKDIR /app
COPY server.ts ./
ARG POOL
ARG HEAP
ENV APP_VERSION=hash UV_THREADPOOL_SIZE=$POOL NODE_OPTIONS=--max-old-space-size=$HEAP
EXPOSE 3000
CMD ["server.ts"]
