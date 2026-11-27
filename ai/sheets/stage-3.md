---
title: AI 應用開發 階段 3：工具與 Agent
subtitle: 第 6～7 課一頁圖解：tool use、工具定義、is_error、平行呼叫、tool_choice、agent 迴圈、停止條件、人工確認、trace
cols: 3
theme: shadcn
課程: AI 應用開發 第 6～7 課
---
模型只提出要呼叫什麼，執行、權限、記錄都在你的程式。迴圈要一定會停、不超出預算，有副作用的操作只建立申請、經過人確認。[回 AI 應用開發 學習地圖](../index.html)

## A 一輪工具呼叫要兩次請求 {span=2}
```sequence
participants: 程式, Claude API, 資料庫
程式 -> Claude API: user「3 號好了嗎？」＋tools
Claude API --> 程式: stop_reason tool_use，tool_use 帶 name、input、id
程式 -> 程式: 用 zod 驗證 input
程式 -> 資料庫: 查訂單
資料庫 --> 程式: 結果
程式 -> Claude API: user、assistant 完整 content、user 全部 tool_result＋同樣的 tools
Claude API --> 程式: stop_reason end_turn，text「3 號可以取餐了」
note Claude API: 模型從頭到尾沒碰到資料庫
```
tool_result 用 `tool_use_id` 對應；每個 tool_use 都要有結果，漏掉會 400。只有 `stop_reason === 'tool_use'` 才執行工具，截斷時參數可能不完整。

## B 定義好工具
```kv cols=1
name: 英文的動詞＋名詞，例如 `get_order_status`
description: 寫清楚做什麼、什麼時候用與不用、參數意思、回傳什麼；官方說是影響工具表現最大的因素
input_schema: JSON Schema，type 一定是 `'object'`
strict: `true` 保證 input 符合 schema；需要 `additionalProperties: false`，不支援數值與長度限制
```
用同一個 zod schema 產生 `input_schema`，也在執行前驗證：strict 管形狀，zod 管範圍與業務規則。工具越少越好；固定、小的資料（營業時間、退款規則）放 prompt。

## C 錯誤是一種結果
| 情況 | 回給模型 |
|---|---|
| 參數不合法 | `is_error: true`「order_id 要是正整數」，不查資料庫 |
| 找不到訂單 | `is_error: true`「找不到 99 號訂單」，不回 null |
| 資料庫逾時 | `is_error: true`「查詢逾時，請稍後再試」 |
| 未知工具 | `is_error: true`「沒有 cancel_order 這個工具」 |

不丟例外、不省略 tool_result。說明寫給模型看、可行動；堆疊、SQL、連線字串不放進去，完整錯誤寫進自己的 log。

## D 平行呼叫與 tool_choice
- 一則回應有多個 tool_use：用 `Promise.all` 執行，每個工具自己 catch 轉成 `is_error`。
- 結果依 tool_use 的順序放在同一則 user 訊息；拆成多則會讓模型停止平行呼叫。

| tool_choice | Opus 5.5／Sonnet 5.5 |
|---|---|
| `auto` | ok 可以 |
| `none` | ok 可以 |
| `any`、`tool` | no 400 |

`auto` 不保證會呼叫，重要流程要檢查 stop_reason。只想要 JSON 就用結構化輸出，不假裝成工具。

## E Agent 迴圈 {span=2}
```flow LR
[送出完整對話＋tools] -> {stop_reason 是 tool_use}
{stop_reason 是 tool_use} -> [readAnswer]: 不是
{stop_reason 是 tool_use} -> {停止條件觸發}: 是
{停止條件觸發} -> *[回傳 status 並記 log]: 是
{停止條件觸發} -> [執行工具]: 否
[執行工具] --> [送出完整對話＋tools]: 加入 assistant 與全部 tool_result
```
agent 讓模型在迴圈裡決定下一步；workflow 由程式決定步驟、每一步呼叫一次模型。每輪都帶 tools；最後一輪不執行工具，結果送不出去。

## F 一定要會停
| 停止條件 | 做法 | 擋下什麼 |
|---|---|---|
| 最多輪數 | `maxTurns` | 任何原因的無限迴圈 |
| token 預算 | input＋output 累加，大於才停 | 輪數不多但每輪很大 |
| 重複偵測 | 同工具＋同 input 累計第 3 次就停 | 卡在同一個動作 |

每輪都重送整段對話，卡住的費用隨輪數快速放大。這課的示範：4 輪完成約 0.09 美元，卡住跑 50 輪約 8 美元。預算檢查在回應之後，實際可能多花一輪。停下時回傳 `max_turns`／`budget`／`loop`，不丟錯。

## G 有副作用的工具：只建立申請
```kv cols=1
身分: 來自 session，input_schema 裡沒有 customer_id
擁有者與狀態: 不存在和不是你的，回同一句「找不到這張訂單」
人工確認: 工具只寫入待確認的動作，人按下確認時再檢查一次狀態
冪等鍵: 同一件事同一個 key（`cancel:7`），資料庫用 UNIQUE 擋重複
```
模型能做的事，不能超過登入者自己在介面上能做到的範圍。

## H Trace 與該不該用 agent
trace 每一筆記輪數、工具名稱、是否錯誤、耗時、usage；停在上限的任務也要有，時間用注入的 `now()`。

SDK 的 Tool Runner 只有 `max_iterations`，預算、重複偵測、確認仍要自己做。

```callout info 用 agent 前先問四個問題
步驟事先寫不清楚嗎？值得更高的成本與延遲嗎？模型做得到嗎（先用 eval 試）？錯了能發現、能復原嗎？任何一題是否定的，就用 workflow。
```
