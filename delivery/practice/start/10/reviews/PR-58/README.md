# PR-58：CAFE-29 優惠券

- 作者：阿哲
- 分支：feature/coupons → main
- 審查者：你
- CI：✓ deps　✓ typecheck　✓ test

## 做了什麼

- 新增 `coupons` 表（代碼、說明、折扣百分比、使用上限、已使用次數）；`orders` 多了 `coupon_code`、`discount`
- `GET /coupons/:code`：結帳頁輸入代碼後先查一次，拿到說明與折數
- `POST /orders` 可以帶 `couponCode` 與 `discount`；用到上限回 409 `COUPON_USED_UP`
- 結帳頁：輸入優惠碼、顯示說明（行銷要粗體，所以用 v-html）、算好折扣一起送出；分享連結 `?coupon=OPEN10` 自動套用

## 怎麼測的

- 本機用 `OPEN10` 下單：合計 190 元，訂單金額 171 元 ✓
- `VIP50` 用一次之後再用，回 409 ✓

## 備註

行銷週五要發分享連結，希望今天能合併 🙏 規格見 `tickets/CAFE-29.md`。

---

這個資料夾裡的東西：

| 檔案 | 是什麼 |
|---|---|
| `pr.diff` | 這個 PR 的完整 diff（a/ 是 main、b/ 是 PR） |
| `tree/` | PR 分支上的程式（api、shared、web），要看前後文或行號就打開這裡的檔案 |
| `race.mjs` | `npm run review:race`：在 PR 的程式上跑你寫的 `tree/api/src/coupons/coupons.race.spec.ts` |
| `review.json` | 你的 review（練習 1） |
| `round2.md`、`round2.patch`、`round2/` | 作者看完 review 後的回覆與第二版（練習 3） |
| `rereview.json` | 你的再審結果（練習 3） |
