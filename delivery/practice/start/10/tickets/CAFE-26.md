# CAFE-26：main 的 CI 是紅的

- 回報：技術主管（小林）
- 優先序：P1（CI 紅著，所有 PR 都不能合併）

這週剛把 CI 接上（`ci.mjs`，每個 PR、每次推到 main 都會跑）。第一次跑就紅了，log 在 `ci-log/run-1873.txt`。
這幾天合併進 main、還沒被 CI 檢查過的東西：

- CAFE-21 訂單頁與櫃台小票顯示取餐時間（`web/src/components/PickupTime.vue`、`api/src/pickup/pickup-label.ts`、`GET /orders/:id/ticket`）
- CAFE-23 叫號機的取餐號碼（`api/src/orders/order-number.ts`）；作者在 vitest 設定加了 `retry: 3`
- 阿哲合併 main 時解了 `package.json` 的衝突

請開一個 PR 把 CI 修綠。規則：不改 `ci.mjs`、不放寬型別或契約、不加 retry、不跳過測試。

---

群組裡的對話：

> 阿哲：取餐號碼那個測試本來就時好時壞，我這邊重跑兩次就過了，CI 也重跑看看？
> 小林：重跑三次，三次失敗的測試都不一樣。先別重跑了，照 log 一個一個看。
> 店長（昨天）：小票上的取餐時間跟客人說的差很多，是不是印表機的時鐘壞了？
