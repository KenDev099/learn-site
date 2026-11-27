---
title: 產品交付實戰 階段 3：錢與資料
subtitle: 第 8～10 課一頁圖解：串接付款服務、正式資料修復與回填、依賴升級與分批上線
cols: 3
theme: shadcn
課程: 產品交付實戰 第 8～10 課
---
動到錢和正式資料時，每一步都要假設會重來、會中斷、會出錯。重試不能重複扣款，修復要能續跑和撤回，升級要能改一筆資料就退回。[回 產品交付實戰 學習地圖](../index.html)

## A 付款有四種狀態，「不知道」是其中一種 {span=2}
```flow LR
(pending) -> unknown: 逾時、連線中斷、5xx，回 202
(pending) -> *paid: CafePay 回答成功
(pending) -> failed: 卡片被拒絕，回 402
unknown -> paid: 重試、webhook、補單說成功
unknown -> failed: 補單查到失敗或查無付款
failed -> paid: CafePay 說成功
```
沒拿到回應時，CafePay 可能根本沒收到，也可能已經扣款。當成失敗會讓客人重付、扣兩次；當成成功會讓沒付錢的訂單出餐。前台看到 unknown 顯示「付款確認中，請勿重新付款」。paid 是終點，之後收到任何 failed 都不改。

## B 冪等鍵：重試時讓對方認出同一筆
| key | 重試同一張訂單 | 兩張不同的訂單 |
|---|---|---|
| `randomUUID()`、加上時間 | no 每次不同，重複扣款 | ok 不同 |
| 固定字串 `'payment'` | ok 相同 | no 回 422 `idempotency_key_reused` |
| `payment:${orderId}` | ok 只扣一次 | ok 各扣各的 |

key 從代表意圖、重試時不會變的資料推出來。已經有 pending 或 unknown 的付款就沿用，用同一把 key 再問一次。

## C Webhook 的兩道檢查與補單
| 情況 | 哪一道擋 |
|---|---|
| 同一個事件 id 來第二次 | 事件去重：`processed_events` 主鍵，`ON CONFLICT DO NOTHING` 影響 0 列就略過 |
| 晚到的舊 failed、webhook 和補單都說成功 | 狀態只往前走：`updateMany` 把允許的舊狀態寫進 WHERE，count 0 就不做事 |

至少一次送達、不保證順序。記事件、改付款、改訂單、加點數放同一個交易，失敗回 5xx 讓對方重送；處理過的重複通知回 2xx。通知會漏，補單找 pending 或 unknown 超過 10 分鐘的付款去查，結果交給跟 webhook 同一個 `applyPaymentResult()`。

## D 修正帳務資料：補償紀錄
| 做法 | 能追溯 | 能撤回 |
|---|---|---|
| DELETE 重複的紀錄 | no 紀錄消失 | no 只能從備份撈 |
| 顧客表的點數欄位直接改小 | no 點數不再等於紀錄加總 | no 不知道原本多少 |
| 每筆重複新增一筆補償紀錄 | ok `reversal_of` 指向原紀錄 | ok 移除那次 `run_id` 的紀錄 |

先備份、在副本上看清楚資料。manual 和 order_paid 點數一樣也不算重複；一張訂單三筆時要的是第二筆以後的每一筆（`row_number()`）。

## E 可續跑的修復流程
```kv cols=1
試跑: 只計算、不寫入，跟套用共用找資料的 SQL；數字給負責的人審核
套用: 依 id 分批（keyset），每批一個交易，游標 `last_id` 和那一批一起提交
重跑不重複: `reversal_of` 唯一約束加上排除已處理的查詢
核對: 獨立的 SQL，修復前要找得到問題，修復後回傳 0 列
撤回: 只刪這次 `run_id` 的補償紀錄；找不到 run 要失敗
```
這課的示範資料：試跑算出 299 筆重複、118 位顧客、扣回 8443 點，8 位顧客不扣回、列給店長聯繫。

## F 回填新欄位的安全順序
```timeline v
1 | 加欄位 | 可為 NULL，不重寫整張表
2 | 部署雙寫 | 新資料都有值
3 | 分批回填 | 只補舊資料，`WHERE channel IS NULL`
4 | 核對 | NULL 剩 0 筆
*5 | 加 NOT NULL | PostgreSQL 18 可先 `NOT VALID`，再 `VALIDATE CONSTRAINT`
```
先回填再雙寫，中間的新訂單又是 NULL；先加 NOT NULL，舊資料讓它加不上去。回填用獨立腳本，不放進 migration。每一步都假設上一版程式還在線上。

## G 依賴升級：先讀 changelog {span=2}
| 破壞性變更 | 1.4.2 → 2.0.0 | 不改會怎樣 |
|---|---|---|
| amount-unit | 元 `110` → 分 `11000` | no 編譯和只看成功的測試都會過，CafePay 只扣 1.10 元 |
| create-api | `createPayment(…)` → `payments.create(…)` | warn TypeScript 直接報錯，最容易發現 |
| error-throw | 回傳 `{ ok, error }` → 丟出 `CafePayError` | no 沒有 try/catch 的地方，卡片被拒絕變成 500 |

主版號增加代表有東西會壞。從目前的版本讀到目標版本。每條破壞性變更都用 grep 找出位置：先搜尋 import 確定有哪些檔案（`scripts/daily-check.ts` 繞過了共用的包裝），再搜尋特徵。元換分集中在 `toMinor()`：`Math.round(yuan * 100)`，換不成整數就丟錯，測試要有 19.9、0.07。

## H 轉接層、功能旗標與分批上線
```flow TB
PaymentsService -> [CafePayClient SDK 1.4.2]: payments.sdk = v1
PaymentsService -> [CafePayV2Client SDK 2.0.0]: payments.sdk = v2
```
- 兩個轉接層實作同一個 `PaymentGateway`，金額單位和錯誤形狀在這一層換成同一種。
- 旗標放資料庫、每次讀，退回是 `npm run flag -- payments.sdk_v2 0`，不用部署。
- 不用 `Math.random()`：用「旗標名稱＋訂單 id」的 sha256 算桶子，`bucket < percent`。建立付款時把版本寫進 `payments.sdk`，重試和補單照它走。
- 第一步 ≤ 5%，依 sdk 分組看成功率，退回條件寫成數字；到 100% 後移除舊版、轉接層和旗標。
