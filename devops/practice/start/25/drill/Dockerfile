# 演練用的 cafe-api：sh drill.sh 會用它建出 2.3.1 與 2.4.0 兩個版本（不用改）
FROM node:24.22.2-alpine3.24
ARG VERSION
WORKDIR /app
# 旗標檔的掛載點先建好：docker diff 才不會把它算成容器裡的變更
RUN mkdir -p /etc/cafe
COPY releases/${VERSION}/server.mjs ./
LABEL org.opencontainers.image.version=${VERSION}
ENV APP_VERSION=${VERSION} FLAGS_FILE=/etc/cafe/flags.json
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
