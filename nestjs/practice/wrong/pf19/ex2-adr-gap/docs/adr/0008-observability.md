# 0008. 可觀測性：結構化 log＋健康檢查，先不做分散式追蹤

## 狀態

已採用（2026-11-19）

## 背景

只有一個 API 程序（worker 在同一個程序），請求不跨服務。

## 決定

每行 log 是 JSON，帶 requestId、tenantId、userId；`/health/live`、`/health/ready` 給平台判斷。OpenTelemetry 之後再加。

## 後果

- 一個 requestId 就能在 log 裡找到整個請求。
- 拆出獨立的 worker 或服務之後，要補追蹤，否則跨程序串不起來。
