---
title: AI 應用開發 階段 1：LLM 基礎與第一個 API 呼叫
subtitle: 第 1～3 課一頁圖解：token、費用、context window、取樣、Messages API、stop_reason、對話歷史、串流
cols: 3
theme: shadcn
課程: AI 應用開發 第 1～3 課
---
模型一次接一個 token、每次輸出不同、API 不記得上一次請求。程式要自己算錢、送完整歷史、先看 stop_reason 再用文字，有人在等的畫面用串流。[回 AI 應用開發 學習地圖](../index.html)

## A 一次產生一個 token {span=2}
```flow LR
[讀進全部文字] -> [給出下一個 token 的機率] -> [抽一個接上去] -> {停下了嗎}
{停下了嗎} --> [讀進全部文字]: 還沒，重複
{停下了嗎} -> *end_turn: 模型判斷說完了
{停下了嗎} -> max_tokens: 碰到上限，句子可能斷在一半
{停下了嗎} -> stop_sequence: 產生了停止字串
```
token 不是字元，每家（甚至每代模型）的 tokenizer 都不同；不要拿別家的 tokenizer 算 Claude 的 token。準確數字看回應的 `usage`，送出前想知道就用 token counting API。

```callout warn 取樣讓每次輸出不同
API 版本 2026-10-21 起送 `temperature`、`top_p`、`top_k` 一律回 400。測試不比對整句，改用結構化輸出與 eval；必須一字不差的文字（價格、退款政策）由程式產生。
```

## B 費用怎麼算
費用 ＝ 輸入 token × 輸入單價 ＋ 輸出 token × 輸出單價，單價以每百萬 token（MTok）計。

| 模型 id | 輸入／MTok | 輸出／MTok |
|---|---|---|
| `claude-opus-5-5` | $4 | $20 |
| `claude-sonnet-5-5` | $2 | $10 |
| `claude-haiku-5-5` | $0.10 | $0.50 |

官方定價頁，2026-11-01 查詢。`claude-haiku-5-5` 的 prompt 超過 10 萬 token 時漲為 $0.50／$2.50。輸出是輸入的 5 倍價，思考算輸出。輸入包含 system、整段歷史、問題、附上的文件，每次都要重送；金額四捨五入到小數第 6 位。

## C 兩種放不下
| 情況 | API 的反應 |
|---|---|
| 輸入本身超過 context window | no HTTP 400，一個字都沒產生 |
| 輸入＋`max_tokens` 超過 | warn 照常接受，可能以 `model_context_window_exceeded` 被切斷 |
| 輸入＋`max_tokens` 不超過 | ok 最壞是用完 `max_tokens` 停下 |

context window 包含輸入和輸出。思考也吃 `max_tokens`：要短回答在 prompt 裡要求，不壓低 `max_tokens`。1M 不代表該塞滿，越長越貴、越慢。修剪歷史時一問一答一起丟，這次的問題一定留著。

## D 第一個請求與回應
```kv cols=1
端點: 所有功能都走 `POST /v1/messages`
SDK: `@anthropic-ai/sdk` 1.3.0 的 `client.messages.create({ model, max_tokens, system, messages })`
API key: 只放環境變數，不寫在程式碼裡、不 commit、不放前端
content: block 陣列；Opus 5.5 通常先有一個空字串的 thinking block，讀文字要過濾 `type === 'text'` 再 `join('')`
usage: `output_tokens` 包含思考，是計費依據，要記錄下來
client: `timeout` 單位是毫秒、預設 10 分鐘，`maxRetries` 預設 2；由一個地方建立 client 再傳給需要的程式
```
`content[0].text` 讀到的是 thinking block，結果是 `undefined`。練習用真 SDK 加上假 fetch 判分：檢查回傳值，也檢查送出去的請求。

## E 先看 stop_reason，再用文字
| stop_reason | 回答能不能用 |
|---|---|
| `end_turn` | ok 模型說完了 |
| `stop_sequence` | ok 產生了設定的停止字串 |
| `max_tokens` | no 被切斷 |
| `model_context_window_exceeded` | no 被切斷 |
| `refusal` | no 拒答，另外給使用者訊息 |
| `tool_use` | warn 還沒說完，第 6 課處理 |

截斷和拒答變成明確的錯誤；`default` 那一支丟錯，新的 stop_reason 不會被當成回答。

## F 多輪對話：API 沒有記憶 {span=2}
```sequence
participants: 程式, API
程式 -> API: user 拿鐵多少？
API --> 程式: assistant ①
note 程式: 存完整的 content，不是只存文字
程式 -> API: user、assistant ①、user 那大杯呢？
API --> 程式: assistant ②
程式 -> API: 前面全部，加上 user 我要一杯
note 程式, API: 每次送完整歷史，輸入 token 一輪比一輪多
```
失敗時把剛加的 user 訊息拿掉，否則下一次出現兩則連續的 user。歷史只往後加：改了前面的訊息或 system，Opus 5.5 後面的 thinking block 就失效。除了無狀態，模型還有知識截止日、會產生幻覺；有明確規則、錯了代價高又難發現的事（算金額、判斷營業時間），用程式做。

## G 串流的事件順序 {span=2}
```flow LR
message_start -> [content_block_start／delta／stop]: 每個 block 一組
[content_block_start／delta／stop] -> message_delta: stop_reason 與累計 usage
message_delta -> (message_stop)
```
- 中間可能有 `ping` 和 `error`；thinking 和 text 是不同的 block。
- SDK：`client.messages.stream(params, { signal })`，`on('text')` 邊收邊處理，`await finalMessage()` 拿完整 Message；文字自己過濾 text block 再接。
- TTFT 是送出請求到第一個 text delta 的時間，要看 p95；沒有文字時記 null。
- SDK 1.3.0 在 `max_tokens` 超過 21,333 又沒設 timeout 時，要求改用串流。

## H 串流的中斷與中途出錯
| 情況 | 做法 |
|---|---|
| 使用者離開 | ok `AbortSignal` 傳給 SDK 中斷上游，只接 `APIUserAbortError` |
| 中途收到 error 事件 | no 變成 `APIError`（`type` 有值、`status` 是 undefined）；回傳明確的失敗與已收到的文字 |
| 只在自己程式裡檢查 `signal.aborted` | no 連線沒關，模型繼續產生、繼續算錢 |

```callout warn 已經送出的文字收不回來
自動重試只在第一個字之前做。中斷或出錯的半截回答不當成功、不存成正式紀錄。
```
