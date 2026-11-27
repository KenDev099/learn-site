# BUG-31 修復紀錄

每一節固定幾行「- 欄位：值」，冒號後面填你查到的內容。

## 現象

- 顧客看到：結帳按下去畫面只顯示 HTTP 500，重試幾次都一樣，訂單送不出去
- 錯誤特徵：POST /orders 回 500，log 是 TypeError: Cannot read properties of undefined (reading 'price')，位置在 OrdersService.create

## 影響範圍

- 時間：2026-11-02 10:12:41 到 11:31:52（台北時間；起司蛋糕 10:05 下架之後）
- 失敗請求數：6
- 受影響顧客數：3

## 根因

- 程式位置：api/src/orders/orders.service.ts:27
- 說明：create() 只查 available = true 的商品，下架商品不在 byId 裡，byId.get(…)! 拿到 undefined 再讀 .price 就丟 TypeError，變成 500。菜單已經不顯示下架商品，但頁面開著沒重新整理的顧客，購物車裡還留著

## 修正

- 做法：先查出購物車所有商品，任何一項已下架就回 409 PRODUCT_UNAVAILABLE，details.productIds 列出全部下架的品項，message 寫商品名稱，不建立訂單

## 預防

- 回歸測試：含下架商品的訂單回 409 PRODUCT_UNAVAILABLE 並列出商品 id
- 其他：log 監看 POST /orders 的 500；前台之後可以依 details.productIds 標出要移除的品項
