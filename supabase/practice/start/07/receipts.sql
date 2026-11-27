-- 練習 1：收據的 bucket 與權限。照正式專案的寫法寫 'receipts'（判分時測試會換成這一題專屬的 bucket 名稱）
-- 1. 建 bucket receipts：不公開、單檔最大 2 MB（2097152 bytes）、只收 image/png 與 image/jpeg
-- 2. 顧客：只能在自己的資料夾（路徑第一層是自己的 user id）上傳、讀取、覆蓋（upsert）自己的收據
-- 3. 店員（app_metadata 的 role 是 staff）：讀得到所有收據，但不能上傳或修改

