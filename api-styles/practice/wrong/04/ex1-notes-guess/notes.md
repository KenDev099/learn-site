# 練習 1：先量測再修

用 `node examples/measure.ts` 量出 naive.ts 執行下面這份查詢（資料庫有 8 張原本的訂單加 40 張隨機訂單，查最近 20 張）發出幾句 SQL，把數字填在冒號後面：

```graphql
{ orders(last: 20) { id total customer { name } items { quantity product { name price } } } }
```

N=20 的 SQL 句數：101
