---
title: 部署與維運 階段 2：容器化
subtitle: 第 7～11 課一頁圖解：容器與映像、Dockerfile、多階段建置與安全、Compose、設定與機密
cols: 3
theme: shadcn
課程: 部署與維運 第 7～11 課
---
映像只建一次、只裝執行需要的程式；資料放 volume，設定和機密在部署時才交給容器，同一個映像跑遍每個環境。[回 部署與維運 學習地圖](../index.html)

## A 容器是什麼
| | 容器 | 虛擬機 |
|---|---|---|
| 核心 | 共用主機核心 | 有自己的核心 |
| 隔離 | namespace 管看得到什麼、cgroup 管能用多少；不如 VM 徹底 | 用軟體模擬整台電腦 |

- 映像是唯讀的層加上啟動設定，層可以共用；容器在映像上多一層可寫層，刪容器就沒了。
- Mac 上的容器跑在 Docker Desktop 的 Linux VM 裡。
- 映像綁 CPU 架構，跑錯是 exec format error；Mac 會模擬 amd64，要到伺服器才看得到。

## B 容器的一生與資料放哪 {span=2}
```flow LR
(created) -> *running -> exited -> (刪除)
running --> exited: stop 先 SIGTERM 再 SIGKILL
```
| 放哪 | 結果 |
|---|---|
| 可寫層 | no 刪容器就沒了 |
| 具名 volume | ok postgres 18 掛 `/var/lib/postgresql` |
| bind mount | ok 把主機的資料夾掛進去 |

用 `ps -a`、`logs`、`inspect`、`exec` 查狀況；長駐服務用 `--restart unless-stopped`。`rm -v`、`volume prune` 刪匿名 volume，`volume prune -a`、`volume rm` 連具名的也刪。用 `--memory`、`--cpus` 設上限，超過記憶體上限是結束碼 137、OOMKilled。

## C Tag 會移動，digest 不會
```kv cols=1
tag: 會移動，今天和明天拉到的可能不同
digest: 內容的指紋，內容一變它就變
部署寫法: `名稱:tag@sha256:…`
multi-arch: 一個 tag 對應好幾種 CPU；釘 multi-arch index 的 digest
```

## D Dockerfile：順序決定建置要多久 {span=2}
```flow LR
FROM -> WORKDIR -> [COPY package*.json] -> [RUN npm ci] -> [COPY 原始碼] -> [USER node] -> HEALTHCHECK -> *CMD
```
- 層快取從第一個變動的步驟開始失效：少變的放前面；用 `--progress=plain` 看 `CACHED`。
- `docker build .` 的 `.` 是建置情境，用 `.dockerignore` 擋掉 `node_modules`、`.env`、`.git`。
- exec 形式的 `CMD` 讓 node 當 PID 1、直接收到 SIGTERM；`USER node` 不用 root。
- `HEALTHCHECK` 用映像裡一定有的 node 檢查 liveness；unhealthy 不會自動重啟。
- `ARG` 只活在建置時，要給程式用就轉成 `ENV`；版本資訊放最後，避免讓快取失效。`docker build --check` 和 `docker history` 幫你檢查結果。

## E 多階段建置
```flow TB
[build 階段：編譯] --> *[最終階段：乾淨的基底]: COPY --from
[deps 階段：裝正式依賴] --> *[最終階段：乾淨的基底]: COPY --from
```
單一階段的映像帶著編譯器、原始碼、npm 快取，後面的層刪檔案不會讓映像變小。最終階段要重寫 `USER`、`HEALTHCHECK`。基底映像在大小、libc 相容性、除錯方便和攻擊面之間取捨；沒有 shell 的映像用共用命名空間的除錯容器查問題。

## F 映像的安全
```callout err 機密不能進映像
ARG、ENV、COPY 後再刪都會讓機密留在映像裡。用 `RUN --mount=type=secret` 和 `--secret`；build check 的 SecretsUsedInArgOrEnv 幫你把關。
```
- 基底映像釘 digest、用 Dependabot／Renovate 更新、定期重建與掃描；掃描工具也要釘版本。
- SBOM 和 provenance 要推到 registry 才保留得住。
- 為 amd64 建置：`--platform` 寫在指令上，純 JS 的階段用 `$BUILDPLATFORM` 避免模擬。
- 執行時：`--read-only`、`--tmpfs`、`--cap-drop ALL`、`no-new-privileges`、非 root 使用者。

## G Compose：一個檔案啟動整套服務 {span=2}
```flow LR
[db 加 healthcheck] -> [migration]: service_healthy
[migration] -> *api: service_completed_successfully
```
| depends_on 條件 | 等到 |
|---|---|
| `service_started`（預設） | 容器啟動，不等資料庫準備好 |
| `service_healthy` | healthcheck 回報 healthy |
| `service_completed_successfully` | 跑完而且結束碼是 0 |

migration 也可以改用 pre_start 掛在服務底下。資料庫的 healthcheck 注意 `$$` 跳脫、`-h 127.0.0.1`。

- 同一個專案網路裡用服務名稱互連（內建 DNS 127.0.0.11）；只有真的要給主機連的服務才發布 port，而且發布在 127.0.0.1。
- 專案名稱是所有資源的前綴，明確指定。`up -d --wait --build` 適合腳本和 CI；`down` 保留 volume，`down -v` 會刪資料；`config` 看最終設定。
- 每個服務設記憶體上限、重啟策略、log 輪替（`local` driver），`stop_grace_period` 配合程式的排空時間。
- 主檔是類正式環境，`compose.override.yaml` 放開發用的修改，profile 放平常不開的工具。

## H 設定與機密怎麼交給容器
```flow LR
[run -e] -> environment -> env_file -> [映像 ENV]
```
優先順序由左到右。`.env`／`--env-file` 只替換 `compose.yaml` 的 `${...}`，不設定容器；必要的部署變數用 `${VAR:?}`，app 啟動時再驗證一次。

```callout warn 機密不放環境變數
會從 inspect、`/proc`、子程序、log 外洩。用 Compose secrets 掛成 `/run/secrets/<名稱>`，搭配 `_FILE` 慣例，檔案 600、不進 git。
```
push 出去就當作外洩：先輪替（新的上線、確認、撤銷舊的），再查紀錄、清歷史、加上 pre-commit 和 push protection；gitleaks 的 git 模式掃整個歷史，`git log -S` 找出加入的 commit。雙憑證讓輪替不中斷；能用短期憑證就不用長期密碼；伺服器多了之後用 secret manager 集中存放、授權、稽核。
