-- 練習 4：註冊時自動建立 profiles 的一列。照正式專案的寫法寫 public.、auth.users（判分時測試會換成這一題專屬的名字）
-- 1. public.profiles：id（uuid，主鍵，外鍵指向 auth.users(id)，使用者刪掉時跟著刪）、display_name（text，不能是 NULL，預設 ''）
--    開 RLS，登入的人只讀得到自己那一列（GRANT＋policy）
-- 2. 函式 public.handle_new_user()：把 new.id 與註冊時傳的 display_name（在 new.raw_user_meta_data 裡）寫進 profiles
-- 3. create trigger：auth.users 每新增一列（after insert … for each row）就執行它

