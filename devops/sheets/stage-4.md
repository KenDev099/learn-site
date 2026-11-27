---
title: 部署與維運 階段 4：自動化交付
subtitle: 第 14～17 課一頁圖解：Git 歷史與後悔藥、CI、CD 與部署策略、migration 排進部署
cols: 3
theme: shadcn
課程: 部署與維運 第 14～17 課
---
每個改動走 PR 和必要檢查，建置一次映像、用 digest 推廣到 staging 和 production；migration 先跑而且要跟舊版相容，出事先回滾止血。[回 部署與維運 學習地圖](../index.html)

## A Git 存的是什麼
- commit 是不可變的完整快照，用雜湊值識別、指向父 commit，整個歷史是一張 DAG。
- 分支、HEAD、`origin/main` 都只是指標；`origin/main` 要 fetch 才會更新。

| 合併方式 | 做了什麼 |
|---|---|
| fast-forward | 只移指標 |
| merge | 產生有兩個父的合併 commit |
| rebase | 把 commit 重新做成新的 commit 接到新基底 |

別人拿到的分支不要 rebase，改寫後用 `--force-with-lease` 推送。解衝突要寫出兩邊需求都成立的內容；rebase 時 ours 是 main；lockfile 用 npm 重新產生。

## B 後悔藥：commit 別人拿到了嗎 {span=2}
```flow LR
{別人拿到了嗎?} -> [restore、amend、reset]: 沒有，可以改寫
{別人拿到了嗎?} -> *[revert]: 有，只能往前加 commit
[restore、amend、reset] --> [reflog]: 弄丟了用它救回
```
- reflog 記錄每次指標移動，預設保留 90 天，無法到達的 30 天。
- 機密進了歷史：先輪替，再用 git filter-repo 清除、force push、所有人重新 clone。
- `git bisect run` 二分搜尋第一個壞 commit：結束碼 0 好、1～127 壞、125 跳過；建置不起來回 125，結束要 `git bisect reset`。
- trunk-based：短命分支、小 PR、保護 main（必須 PR、狀態檢查、審查、禁止 force push）、CODEOWNERS。squash merge 讓主幹乾淨，但 bisect 只到 PR。annotated tag 加 semver 發佈，Conventional Commits 讓版本與 changelog 自動產生。

## C CI：每個 PR 在乾淨的機器上檢查
```flow LR
(PR) -> [check 型別檢查與單元測試] -> [integration 整合測試] -> *[image 建置映像]
[integration 整合測試] --> [(service container PostgreSQL)]: 先 migrate 再測
```
這課的 workflow：integration 用 `needs: check`，image 用 `needs: [check, integration]`，任何一關失敗後面都略過。設成必要狀態檢查，沒過就不能合併。
- job 預設平行，用 `needs` 排順序；`concurrency` 取消過時的 PR 執行；每個 job 設 `timeout-minutes`（預設 360）。
- job 在 runner 上用 `localhost` 與對應的 port，在容器裡才用服務名稱。
- 快：`npm ci`、`cache: npm`（不快取 `node_modules`）、互不依賴的檢查拆成平行 job、matrix 只用在需要的地方。
- npm scripts 是唯一的來源；推之前跑 `npm run ci` 與 actionlint。flaky 測試要修，不要重跑到綠。

## D Workflow 的安全
```kv cols=1
permissions: 從 `contents: read` 開始
action: 釘 40 字元 SHA
不可信的輸入: 經由 env 傳進腳本
pull_request_target: 不碰 PR 的程式碼
```

## E 部署策略比較 {span=2}
| 策略 | 停機 | 新舊共存 | 取捨 |
|---|---|---|---|
| recreate | no 有 | 沒有 | 先停舊版再啟動新版 |
| rolling | ok 沒有 | warn 有 | 一次換掉一部分副本 |
| 藍綠 | ok 沒有 | warn 有 | 回滾最快，要兩倍資源 |
| 金絲雀 | ok 沒有 | warn 有 | 限制影響範圍，要有指標才有用 |

新舊版共存時資料庫要同時相容兩版。功能旗標把部署與發布分開。持續交付是隨時可以上線、由人決定；持續部署是通過檢查就自動上線。

## F 藍綠部署與回滾
```flow TB
(啟動另一個顏色) -> [等 ready] -> [煙霧測試] -> [改 upstream] -> [nginx -t] -> *reload
```
舊顏色留著，回滾就是切回去；任何一步失敗都讓舊版繼續服務。金絲雀用 `split_clients` 依使用者識別分流，用 `map` 讓測試人員強制走新版。

出事先回滾止血；不能回滾（資料庫不相容）或問題很小時往前修。用健康關卡、煙霧測試、指標關卡自動回滾；用 DORA 的五個指標（變更前置時間、部署頻率、部署失敗復原時間、變更失敗率、部署重工率）看交付是否健康。

## G 建置一次，推廣同一個產物
```flow LR
[build job] -> [GHCR]: packages write，輸出 digest
[GHCR] -> staging: 同一個 digest
staging -> *production: environment 等核准
```
git SHA 與 semver 標籤指向同一個映像，部署和回滾用 digest，不用 `latest`；OCI label 記錄 revision、version、created；工作目錄不乾淨就不發佈。production 的 concurrency 群組加 `cancel-in-progress: false`；雲端權限用 OIDC。

## H Migration 排進部署 {span=2}
```flow LR
[migration job：用這次的映像跑一次] -> {成功?}
{成功?} -> *[換程式]: 是
{成功?} -> [停止部署，往前修]: 否
```
新舊程式會同時在新 schema 上跑，回滾時也是，所以每個 migration 都要 N-1 相容。不相容的改動拆開：

```flow LR
expand -> [部署雙寫版] -> 回填 -> [部署新版] -> contract
```
| 規則 | 內容 |
|---|---|
| lock_timeout | 每個 DDL 都設，等不到就放棄、退避重試、有次數上限 |
| statement_timeout | 比 migration 需要的長 |
| ADD COLUMN | 常數預設值不重寫表 |
| CONCURRENTLY | 不能在交易裡 |
| 回填 | 獨立的工作：分批、每批一個交易、可續跑、印進度、先記下終點 |
| 權限 | migration 角色擁有 schema；app 角色只有 SELECT／INSERT／UPDATE／DELETE，用預設權限涵蓋之後建的表 |

工具的 advisory lock 只防止重複套用。失敗時不改已套用的檔案；用 schema 比對偵測漂移，高風險的 migration 前先確認備份。
