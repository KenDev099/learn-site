# 第 10 課的 migration 映像 learn-k8s/cafe-migrate：每個應用版本一個 tag，裡面是「到這一版為止」的所有 migration。
# 測試會自己建置（docker build --target v1 …）並載入課程叢集，你不用手動建。
# 正式專案裡這通常就是應用程式的映像換一個指令（例如 npx prisma migrate deploy），這裡用 psql 讓映像小、不用下載套件。
FROM postgres:18.6-alpine3.24 AS base
COPY migrate.sh /usr/local/bin/migrate
USER postgres
ENTRYPOINT ["migrate"]
CMD []

FROM base AS v1
COPY migrations/001_create_orders.sql /migrations/

FROM v1 AS v2
COPY migrations/002_add_orders_note.sql /migrations/

# 故意壞掉的版本：003 打錯表名，migration 一定失敗（練習 2 用來確認失敗時不會部署應用）
FROM v2 AS v3-broken
COPY migrations/003_index_order_items.sql /migrations/
