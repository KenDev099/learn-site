-- 改資料表的欄位名：資料還在，但舊版程式的 SELECT name 會失敗
ALTER TABLE "categories" RENAME COLUMN "name" TO "title";
ALTER INDEX "categories_name_key" RENAME TO "categories_title_key";
