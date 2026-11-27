# 0004. 檔案經過 API 上傳，存在物件儲存

## 狀態

已採用（2026-11-19）

## 背景

檔案上限 5 MB，量不大。presigned URL 直傳省頻寬，但型別檢查與用量計算要等上傳完成後另外確認。

## 決定

經過 API（multer，記憶體上限 5 MB）上傳：先看 magic bytes 判斷型別，再寫進儲存。key 一律是 `tenants/<tenantId>/files/<隨機 id>`，不用使用者的檔名。下載一律 `attachment`＋`nosniff`。開發用本機磁碟，正式環境換 S3 相容儲存。

## 後果

- API 要多承擔上傳的頻寬與記憶體；檔案變大時改成 presigned URL＋上傳完成的確認端點（寫新的 ADR）。
- 刪除先刪 metadata 再刪物件，失敗留下的孤兒物件由排程清理。
