# 0002. Prisma extension 與 RLS 兩道防線

## 狀態

已採用（2026-11-19）

## 背景

只靠程式自動加 `where.tenantId`：`$queryRaw`、巢狀寫入、新同事忘了用擴充過的 client，都會漏。只靠 RLS：錯誤要等到資料庫才發現，訊息也不好懂。

## 決定

兩者都用。應用程式用 `pf_app` 角色連線（不是 superuser、沒有 BYPASSRLS、不是表的擁有者）；每張有 `tenant_id` 的表 `ENABLE`＋`FORCE ROW LEVEL SECURITY`。每個操作在交易裡先 `set_config('app.tenant_id', …, true)`；多個操作的交易用 `TenantDb.tx()`，開頭設一次。

## 後果

- 每個查詢多一個交易與一句 `set_config`，延遲多約一次往返。
- 還沒有租戶的路徑（註冊、登入、接受邀請）要明確設定上下文（新的 tenantId、自己的 userId），不能關掉 RLS。
- 擴充過的 client 不能拿來開互動式交易（每個操作會另開交易，回滾不了），一律用 `tx()`。
