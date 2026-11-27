# 已知問題

發現了先記在這裡，交給團隊排優先序；不要順手修。每一個問題一節，固定三行。

### 下架商品

- 重現指令：curl -X POST http://localhost:3100/orders/create -H 'Content-Type: application/json' -d '{"customerId":1,"items":[{"productId":7,"quantity":1}]}'
- 影響：購物車裡有已下架商品的顧客送出訂單時得到 500，畫面只顯示 Internal server error，不知道要移除哪一項，訂單送不出去
- 優先序：P1

### 數量 0

- 重現指令：curl -X POST http://localhost:3100/orders/create -H 'Content-Type: application/json' -d '{"customerId":1,"items":[{"productId":1,"quantity":0}]}'
- 影響：會建立 0 元、沒有實際品項的訂單，廚房與帳務會看到空單；目前畫面送不出 0，要直接打 API 才會發生
- 優先序：P3
