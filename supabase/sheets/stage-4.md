---
title: Supabase 階段 4：伺服器端邏輯與上線
subtitle: 第 8～9 課一頁圖解：RPC、Edge Functions、混合架構、migration、攻擊測試、決策紀錄
cols: 3
theme: shadcn
課程: Supabase 第 8～9 課
---
用 Supabase 不代表沒有伺服器端：先問要不要離開資料庫、要不要一起成功、要跑多久，再決定放哪裡。上線靠 migration，安全靠攻擊測試，去留靠寫下來的代價。[回 Supabase 學習地圖](../index.html)

## A 邏輯放哪裡 {span=2}
```flow LR
[需求] -> {跑 60 秒以上或要排程重試?}
{跑 60 秒以上或要排程重試?} -> [自己的後端]: 是
{跑 60 秒以上或要排程重試?} -> {外部 API、金鑰或 webhook?}: 否
{外部 API、金鑰或 webhook?} -> [Edge Function]: 是
{外部 API、金鑰或 webhook?} -> {多表要一起成功或 RLS 寫不出來?}: 否
{多表要一起成功或 RLS 寫不出來?} -> [RPC]: 是
{多表要一起成功或 RLS 寫不出來?} -> [Data API]: 否
```
結帳是組合：Edge Function 呼叫 RPC 建訂單，再向金流扣款。這是第 8 課練習用的規則，真實需求要先問對這三個問題。

## B RPC 的三個要點
- 一個請求一個交易：任何一步 `raise exception`，前面的 insert 全部回滾。
- 價格、總價在函式裡從資料庫讀，參數只收 id 與數量。
- 預設 security invoker，RLS 照套；需要 definer 時鎖 search_path、自己檢查 `auth.uid()`。

```callout warn 新函式預設誰都能執行
新表的權限 2026 年起預設收回，函式沒有：本機實測 anon 能執行 public 的新函式。每個函式都 `revoke execute … from public, anon`，再 grant 給 authenticated。
```

## C Edge Function 用哪個身分
| 建 client 用 | 結果 | 用在 |
|---|---|---|
| publishable key＋呼叫者的 Authorization | ok RLS 與 `auth.uid()` 照常 | 代替使用者做事 |
| secret key | warn 繞過 RLS，`auth.uid()` 是 null | webhook、後台批次，自己檢查權限 |

金鑰放 secrets（本機 `supabase/functions/.env`，雲端 `supabase secrets set`）。預設驗 JWT；webhook 的函式設 `verify_jwt = false` 再自己驗簽章。上限：記憶體 256 MB、每請求 CPU 2 秒、整體 150 秒（免費）／400 秒（付費），2026-11-20 官方文件。

## D Migration 的流程
```flow LR
[migration new] -> [寫 SQL]
[寫 SQL] -> [migration up 套本機]
[migration up 套本機] -> [PR 與 CI：db reset＋advisors]
[PR 與 CI：db reset＋advisors] -> [db push --remote]
```
```callout err 已經上線的 migration 不能改
CLI 只看版本有沒有套用過，改舊檔正式環境不會變。修正寫新的 migration。bucket、policy、函式權限都寫進 migration，不留 Dashboard 手動步驟。
```

## E 漏洞清單與攻擊測試 {span=2}
| 漏洞 | 攻擊測試怎麼做 |
|---|---|
| view 沒有 security_invoker | B 讀報表，看有沒有 A 的列 |
| 角色看 user_metadata | B `updateUser` 寫 staff、`refreshSession`，再讀 A 的資料 |
| Storage INSERT 沒檢查路徑 | B 上傳到 `<A 的 id>/…` |
| security definer 函式公開又沒檢查呼叫者 | B 或 anon 呼叫，拿到 A 的資料 |

攻擊者一定是另一個人；檢查結果而不是錯誤（RLS 擋讀取回 `[]`）；修正前要是紅的。advisors 在練習的漏洞版本只抓到 user_metadata 那一個。

## F 決策紀錄的材料
| 主題 | 事實（2026-11-20 官方） |
|---|---|
| 連線池 | serverless 用 Supavisor transaction mode 6543，不支援 prepared statement |
| 備份 | Free 沒有；Pro 每日、保留 7 天；PITR 加購每月 100 美元起 |
| 費用 | Pro 25 美元起，含 100,000 MAU、8 GB 資料庫、250 GB egress、100 GB storage |
| 搬離 | 資料 pg_dump 帶得走；Auth、Storage、依賴 `auth.*` 的 RLS、前端呼叫要重寫 |

## G ADR 的四段
```tree list
ADR
  背景 | 只寫事實：規模、新需求、團隊、預算
  選項 | 至少三個，每個都有優點與代價
  決定 | 「我們將……」
  後果 | 好的、壞的都寫，加上什麼時候重新評估
```
期末的情境（POS 對帳、10～20 分鐘的批次）指向混合架構，但沒有標準答案，重點是代價寫清楚。
