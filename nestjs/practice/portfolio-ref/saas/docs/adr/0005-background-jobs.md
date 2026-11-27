# 0005. 匯出用 BullMQ，worker 先跟 API 同一個程序

## 狀態

已採用（2026-11-19）

## 背景

匯出可能要幾秒到幾分鐘，不能讓 HTTP 請求等。worker 裡沒有請求，租戶上下文要自己帶。

## 決定

API 建立匯出紀錄、回 202，把 `{ exportId, tenantId, userId, requestId }` 放進佇列（jobId 用匯出的 id）。worker 用 job 的 tenantId 重建同一套租戶上下文，不用看得到所有租戶的系統身分。worker 先跟 API 同一個程序。

## 後果

- 部署只有一個服務；匯出量大到影響 API 的延遲時，把 worker 拆成獨立的程序（程式不用改，只換啟動方式）。
- job 失敗會重試 3 次；匯出整份重新產生，所以重試是冪等的。
