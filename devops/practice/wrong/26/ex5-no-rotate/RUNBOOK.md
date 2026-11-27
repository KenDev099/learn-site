# 咖啡店 API 維運手冊（runbook）

所有指令都在這個資料夾執行（正式機器上是 /srv/cafe）。環境：sh up.sh；網址：https://localhost:18263（憑證用 certs/ca.crt 驗證）。

## 部署

什麼時候用：要上新版本。部署前確認 CI 是綠的、migration 是向後相容的（第 17 課）。

```sh
image=$(sh release.sh 2.1.0)   # 正式環境由 CI 建置、推到 registry，這裡填 registry@sha256:…
sh deploy.sh "$image"
curl --cacert certs/ca.crt https://localhost:18263/version
```

成功的樣子：deploy.sh 印出「已切到 …」，/version 是新版本。deploy.sh 失敗時流量不會切換，看它印出的原因。

## 回滾

什麼時候用：部署後錯誤率或延遲變差。先回滾止血，再找原因。

```sh
sh rollback.sh
curl --cacert certs/ca.crt https://localhost:18263/version
```

rollback.sh 說另一個顏色沒有在跑時，用 .env 裡上一版的映像重新部署：

```sh
cat .env                       # BLUE_IMAGE、GREEN_IMAGE：找出上一版
sh deploy.sh learn-devops/cafe-api:26-1.0.0
```

migration 不會跟著回滾：部署前的 migration 都是向後相容的，舊版本照常能用（第 17 課）。

## 還原

什麼時候用：資料被誤刪、毀損。還原會蓋掉備份之後的所有寫入，先跟負責人確認要用哪一份備份。

```sh
# 1. 先在臨時容器演練：確認這份備份是好的，也知道要花多久
bash ops/restore-drill.sh offsite/cafe-20261102T030000Z.dump
# 2. 停掉兩個顏色的 api，還原期間不能有寫入
docker compose -f compose.prod.yaml stop api-blue api-green
# 3. 還原到正式的 db：--clean 先刪掉既有的表
docker compose -f compose.prod.yaml exec -T db pg_restore -U postgres -d cafe --clean --if-exists --exit-on-error < offsite/cafe-20261102T030000Z.dump
# 4. 啟動 api，確認
docker compose -f compose.prod.yaml up -d --wait api-blue api-green
curl --cacert certs/ca.crt https://localhost:18263/products
```

## 收到燃燒率告警

什麼時候用：CafeErrorBudgetBurn 告警響了（第 25 課）。目標是先止血。

```sh
# 1. 現在是哪一版？最近有沒有部署？
curl --cacert certs/ca.crt https://localhost:18263/version
cat .env
# 2. 錯誤長什麼樣子
docker compose -f compose.prod.yaml logs --since 15m api-blue api-green | grep '"level":50' | tail -20
# 3. 最近 1 小時內部署過：直接回滾
sh rollback.sh
```

沒有最近的部署：看 db、redis 的狀態（docker compose -f compose.prod.yaml ps），通知事故指揮者，照第 25 課的流程處理。

## 備份排程

用 systemd timer 每 15 分鐘執行一次 ops/backup.sh（RPO 15 分鐘）。設定在 ops/cafe-backup.service 與 ops/cafe-backup.timer。

```sh
sudo cp ops/cafe-backup.service ops/cafe-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cafe-backup.timer
systemctl list-timers cafe-backup.timer      # 下一次執行的時間
journalctl -u cafe-backup.service -n 20       # 最近幾次的結果
```

每週一早上跑一次 ops/restore-drill.sh，把 rto_seconds 記下來；沒還原過的備份不算備份。
