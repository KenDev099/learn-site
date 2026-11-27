---
title: 部署與維運 階段 1：伺服器基本功
subtitle: 第 1～6 課一頁圖解：全貌與 Docker、shell、程序與訊號、網路、TLS、SSH 與 systemd
cols: 3
theme: shadcn
課程: 部署與維運 第 1～6 課
---
程式上線之後，要看懂它是哪個程序、聽在哪個 port、怎麼被找到、怎麼被信任，再交給 systemd 或容器讓它一直跑著。[回 部署與維運 學習地圖](../index.html)

## A 一個請求的路，一次改動的路 {span=2}
```flow LR
(使用者) -> DNS -> [負載平衡或反向代理]
[負載平衡或反向代理] -> *app 副本
app 副本 -> [(資料庫)] & [(快取)]
```
```flow LR
(commit) -> PR -> CI -> [建置映像] -> [映像倉庫] -> staging -> production -> 監控
監控 --> [映像倉庫]: 出事就回滾到上一個映像
```
映像只建置一次，各環境跑同一個映像、只換設定；staging 盡量和正式環境一致（dev/prod parity）。

## B Docker 與第一個容器
```kv cols=1
Client: Mac 上的 docker 指令
Server: Linux 虛擬機裡的 daemon；連不上 daemon 就啟動 Docker Desktop
docker run --rm: 用完即丟的容器，刪掉後裡面的改動也沒了
-d --name: 在背景跑服務
port: 一律發布在 127.0.0.1，例如 `-p 127.0.0.1:18010:80`
CPU 架構: Mac 是 arm64（Linux 叫 aarch64），很多伺服器是 amd64（x86_64）
```

## C Shell：資料流、權限、腳本
- Linux 的檔案都在 `/` 底下：`/etc` 設定、`/var/log` 記錄、`/usr/bin` 程式；shell 依 PATH 找程式。
- stdout、stderr 是兩條資料流，`|` 只接 stdout。重新導向由左到右處理：`cmd > file 2>&1` 錯誤進檔案，`cmd 2>&1 > file` 錯誤還是印在畫面。
- 處理 log：awk 取欄位 → sort → uniq -c → sort -k1,1nr -k2,2 → head；JSON log 用 jq。

| 權限 | 用在 |
|---|---|
| 644 | 一般檔案 |
| 755 | 資料夾與腳本；資料夾的 x 是能不能進去 |
| 600 | secret |

腳本開頭 `#!/usr/bin/env bash` 加 `set -euo pipefail`，變數加引號，寫檔用暫存檔加 `mv`。macOS 是 zsh、bash 3.2、BSD 工具，伺服器是 bash 5.2、GNU 工具：腳本在跟伺服器一樣的容器裡測。

## D 訊號與結束碼
| 訊號 | 用途 | 被它殺掉的結束碼 |
|---|---|---|
| SIGTERM | 請程式收尾 | 143（128+15） |
| SIGINT | Ctrl+C | 130（128+2） |
| SIGHUP | 常用來重新載入設定 | — |
| SIGKILL | 不能攔截 | 137（128+9） |

```callout warn 看到 137 先查 OOMKilled
`docker inspect` 的 `State.OOMKilled` 是 true 是記憶體問題，false 是收到 SIGTERM 停不下來、逾時後被殺。
```
PID 1 不套用預設訊號動作、要回收殭屍：包裝腳本用 `exec`，需要 init 時用 `--init`。誰在聽 port 用 `ss -ltnp`、`lsof -nP -iTCP:3000 -sTCP:LISTEN`，不要用 `ps | grep` 猜。

## E 資源不夠用的樣子
| 情況 | 結果 |
|---|---|
| V8 heap 滿 | 程式自己 abort，OOMKilled=false |
| 容器記憶體滿 | 核心 OOM kill，137，OOMKilled=true |
| 開的檔案與連線超過 `ulimit -n` | EMFILE |
| 磁碟滿 | log 寫不進去、資料庫拒絕寫入；`df -h` 找分割區，`du -sh` 往下找 |

heap 上限要在目標環境量。正式環境不用 `&`、nohup 跑服務，交給 systemd 或容器。

## F 連不上時照順序查 {span=2}
```flow LR
DNS -> TCP -> TLS -> HTTP
DNS --> [dig]
TCP --> [nc -zv]
TLS --> [curl -v]
HTTP --> [curl -i]
```
| 現象 | 意思 | 去查 |
|---|---|---|
| refused（立刻） | 對方回 RST，沒人聽 | 程式有沒有跑、port、監聽位址 |
| timeout（等到放棄） | 封包被丟 | 防火牆、安全群組、IP |

- IP 是機器的地址，port 是門牌；私有位址（10/8、172.16/12、192.168/16）靠 NAT 共用公開 IP。CIDR：/24 是 256 個位址，/32 是一個，/0 是全部。
- 127.0.0.1 只收同一台機器（同一個容器）的連線，0.0.0.0 收所有網卡：容器裡聽 0.0.0.0，主機端 -p 寫 127.0.0.1。
- 慢的時候用 `curl -w` 看每一段花多久。DNS 答案依 TTL 快取；zone 檔注意結尾的點、TTL、SOA 序號。

## G TLS：憑證怎麼被信任
```flow LR
[網站憑證：SAN 加公鑰] -> [中繼 CA]: 由它簽名
[中繼 CA] -> *[信任庫裡的根 CA]: 由它簽名
```
- TLS 提供加密、完整性和伺服器身分驗證；身分驗證最常被關掉，也最不能關。
- 伺服器要送中繼憑證（`fullchain.pem`）；失敗多半是名稱不符、過期、不信任的簽發者。
- 本機自建 CA：客戶端用 `--cacert`、`ca`、`NODE_EXTRA_CA_CERTS` 信任它，不關驗證。
- 公開憑證用 ACME 自動申請與續期；有效期一路縮到 47 天，續期不能寫死天數。
- HTTP 只做 301 轉址並保留路徑；HSTS 只放在 HTTPS 回應，max-age 先短再長。

## H SSH 與 systemd：登入伺服器，讓服務一直跑
```kv cols=1
雙向驗證: 伺服器用 authorized_keys 驗證你，你用 known_hosts 驗證伺服器；私鑰 600、不離開你的電腦
第一次連線: TOFU，從另一個管道比對指紋
主機身分改變: 先查原因，確認後才 `ssh-keygen -R` 那一筆
sshd: 關掉密碼與 root 登入，`sshd -t` 檢查後再重啟，保留舊連線
ssh -L: 把只在伺服器內部開放的服務接到本機
```
systemd unit：專屬使用者、EnvironmentFile 放 secret、`Type=exec`、`Restart=on-failure`、合理的 `TimeoutStopSec`、沙箱設定、`WantedBy=multi-user.target`。改 unit 要 daemon-reload，開機啟動要 enable，部署新版要 restart，看 log 用 `journalctl -u`；崩潰迴圈預設會撞到 10 秒 5 次的啟動限制。
