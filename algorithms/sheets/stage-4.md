---
title: 演算法 階段 4：線性結構
subtitle: 第 12～14 課一頁圖解：堆疊與佇列、鏈結串列、快慢指標
cols: 3
theme: shadcn
課程: 演算法 第 12～14 課
---
堆疊和佇列是限制只能從哪一端拿；鏈結串列靠 `next` 參考串起來，改指標前先確認後半段還有變數指著。[回 演算法 學習地圖](../index.html)

## A 堆疊還是佇列
| | 堆疊 | 佇列 |
|---|---|---|
| 順序 | 後進先出 | 先進先出 |
| 放進去 | push：頂端 | enqueue：尾端 |
| 拿出來 | pop：頂端 | dequeue：前端 |
| 題目說 | 最近的、配對、撤銷 | 依序、一層一層 |

JavaScript 用陣列當堆疊：`push`／`pop` 攤銷 O(1)，頂端用 `at(-1)`。空的時候 `pop` 回傳 `undefined`，不會報錯。

## B 佇列不要用 shift
```flow LR
[enqueue：items.push] -> [(items)]
[(items)] -> [dequeue：回傳 items 的 head 格，head++]
```
- `shift` 是 O(n)，一個一個叫完 n 人是 O(n²)。
- `size = items.length - head`，叫過的不算。
- 佇列會活很久時偶爾整理：`items = items.slice(head)`、`head = 0`，仍是攤銷 O(1)。

## C 括號是否成對 {span=2}
```flow LR
(讀下一個字元) -> {哪一種?}
{哪一種?} -> [push 進堆疊]: 左括號
{哪一種?} -> {頂端是對應的左括號?}: 右括號
{哪一種?} -> [跳過]: 其他文字
{頂端是對應的左括號?} -> [pop，配對完成]: 是
{頂端是對應的左括號?} -> *不成對: 不是或堆疊是空的
```
| 失敗 | 例子 | 在哪裡發現 |
|---|---|---|
| 種類或順序不對 | `(]`、`([)]` | 右括號時，頂端不對 |
| 多了右括號 | `())`、`)(` | 右括號時，堆疊是空的 |
| 多了左括號 | `((` | 讀完時，堆疊還有剩 |

只數數量不夠。右括號要配最近一個還沒配對的左括號，那就是堆疊頂端。O(n) 時間、O(n) 空間。

## D 自己做的結構與成本
| 結構 | 放進去 | 拿出來 | 空間 |
|---|---|---|---|
| 陣列 + `shift` 當佇列 | 攤銷 O(1) | no O(n) | O(n) |
| head 索引佇列（含整理） | 攤銷 O(1) | ok 攤銷 O(1) | O(n) |
| 兩個堆疊做佇列 | O(1) | 攤銷 O(1)，單次最壞 O(n) | O(n) |
| 最小值堆疊 | O(1) | O(1)，getMin O(1) | O(n)，多一倍 |

- 兩個堆疊：outbox 空了才把 inbox 倒過去；每個元素只搬一次。
- 最小值堆疊：多一個堆疊記錄每一層為止的最小值，pop 時兩個一起 pop。

## E 陣列還是鏈結串列
| 操作 | 陣列 | 鏈結串列 |
|---|---|---|
| 讀第 k 個 | ok O(1) | no O(k)，從 head 走 |
| 拿到前一個節點後插入、刪除 | no O(n)，後面全部要搬 | ok O(1)，改一兩個 `next` |
| 額外空間 | 只有值 | 每個節點多一個參考 |

走訪寫 `for (let cur = head; cur !== null; cur = cur.next)`；指定變數不改串列，指定 `.next` 才改。dummy 讓第一個節點也有前一個，刪除、合併都只剩一種情況，最後回傳 `dummy.next`。合併兩條排序串列：dummy + tail，每次接比較小的，相同取 a，剩下的整段接上，O(n + m)。

## F 原地反轉：每步四件事 {span=2}
```flow LR
(prev = null，cur = head) -> {cur 是 null?}
{cur 是 null?} -> [① next = cur.next 先存]: 否
{cur 是 null?} -> *回傳 prev: 是
[① next = cur.next 先存] -> [② cur.next = prev 轉向]
[② cur.next = prev 轉向] -> [③ prev = cur]
[③ prev = cur] -> [④ cur = next]
[④ cur = next] -> {cur 是 null?}
```
O(n) 時間、O(1) 空間。空串列時迴圈不跑，直接回傳 null。手算時畫兩段：已反轉、還沒處理，兩段加起來永遠是全部的節點。

```callout warn 長串列不用遞迴
遞迴每個節點佔一層呼叫，太深丟 `RangeError`。
```

## G LRU：最久沒用的先丟
```flow LR
[head dummy] -> [最久沒用] -> [最近用過] -> [tail dummy]
```
- Map 版：使用一筆時 `delete` 再 `set`；`keys().next().value` 是最久沒用的。
- 不依賴 Map 順序時：雜湊表 + 雙向鏈結串列，頭尾各一個 dummy。Map 存 id → 節點，O(1) 找到節點；圖上只畫 `next`，每個節點同時有 `prev` 和 `next`。用過的移到 tail 前面，滿了丟 `head.next`。
- get、put 都是 O(1)（平均）。

## H 快慢指標與間距指標 {span=2}
| 題目 | 怎麼走 | 停下時 |
|---|---|---|
| 找中間節點 | `slow` 1 步、`fast` 2 步 | `fast` 到底，`slow` 在中間（偶數個時是第二個中間） |
| 判斷有沒有環 | `slow` 1 步、`fast` 2 步 | 有環時每一輪追近 1 步，一定相遇 |
| 環的起點 | 相遇後一個回 head，兩個都走 1 步 | 碰到的地方就是起點 |
| 倒數第 k 個 | 從 dummy 出發，`fast` 先走 k 步，再一起走 | `fast.next === null` 時，`slow` 在倒數第 k 個的前一個 |

迴圈條件 `while (fast !== null && fast.next !== null)`：先確認 `fast`，再確認 `fast.next`。這四個做法都是 O(n) 時間、O(1) 額外空間。判斷環：快慢指標 O(n) 時間、O(1) 空間；Set 版也是 O(n) 時間，但要 O(n) 空間。比較節點用 `===`。
