-- 練習 4：把今天（台北時間）的訂單加總寫進 daily_revenue（day 是主鍵）。
-- 這個 Job 可能被重跑：手動補跑、節點當機後在別處重跑、CronJob 偶爾建立兩次。
-- TODO：讓它重跑時更新同一天那一列的 total（和 generated_at），不能報錯、不能多一列，也不能保留舊的金額。
INSERT INTO daily_revenue (day, total)
SELECT (now() AT TIME ZONE 'Asia/Taipei')::date, coalesce(sum(total), 0)
FROM orders
WHERE (ordered_at AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date;
