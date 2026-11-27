-- expand：只加可以是 NULL 的新欄位，舊版程式不認得它也照常運作
ALTER TABLE orders ADD COLUMN note text;
