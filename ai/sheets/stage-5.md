---
title: AI 應用開發 階段 5：上線：評估、安全、成本、可靠性與可觀測性
subtitle: 第 11～15 課一頁圖解：eval 與 CI 門檻、prompt injection 與最小權限、prompt caching 與批次、重試與 fallback、log、指標、追蹤、SSE
cols: 3
theme: shadcn
課程: AI 應用開發 第 11～15 課
---
上線的 AI 功能要證明沒變差、被說服也沒傷害、花費有上限。失敗時有設計好的結果，出事時查得到是哪一次。[回 AI 應用開發 學習地圖](../index.html)

## A Eval：AI 功能的單元測試
```kv cols=1
question: 輸入，來自真實問題、刁鑽案例和出過的事故；30～100 題起步
mustInclude: 必須包含的關鍵事實，不寫整句標準答案
mustCite: 必須引用的文件 id
shouldAbstain: 這題應不應該轉店員
severity: `critical`（價格、過敏原、退款）或 `normal`
```
先用程式評分：`normalize('NFKC')` 後做包含檢查、引用檢查、拒答判斷，列出所有不符原因。LLM 評審用具體標準、單一答案 pass／fail、structured outputs，被評的回答要跳脫；注意位置、長度、自我偏好，先用人工標記算一致率再相信它。

## B 分段評估與 CI 門檻
| 檢索 | 回答 | 先改什麼 |
|---|---|---|
| 沒找到 | 錯 | no 檢索：切塊、關鍵字那一路、embedding；改 prompt 救不了 |
| 找到了 | 錯 | warn 生成：prompt、context 組法、模型 |
| 找到了 | 對 | ok 沒問題；MRR 低代表相關的塊排在後面，context 縮小時可能出事 |

recall@k 除以相關總數；MRR 的名次從 1 開始；沒有相關資料的題目不計入。

```callout warn 輸出每次不同
每題跑 3 次：一般題目 2/3、critical 3/3。通過率下降超過幾個百分點或任何 critical 失敗就擋 PR；PR 跑小集、每晚跑完整集。
```

## C Prompt 擋不住，傷害範圍由程式決定 {span=2}
```flow LR
[system] -> *[模型：隨時可能被說服]
[顧客訊息] --> [模型：隨時可能被說服]: 直接 injection
[檢索到的文件、工具結果] --> [模型：隨時可能被說服]: 間接 injection
[模型：隨時可能被說服] -> [工具：程式檢查身分與權限]
[模型：隨時可能被說服] -> [輸出：過濾後才顯示]
```
虛線是不可信的輸入：只有 system 是你寫的。間接 injection 藏在文件、網頁、工具結果裡，受害者是無辜的顧客。偵測（輸入分類、log 與告警、injection 案例放進 eval）只是多一層。

## D 縱深防禦的四層
| 層 | 做法 |
|---|---|
| 最小權限的工具 | 身分來自 session、查詢帶擁有者條件、錯誤訊息一致、只回傳必要欄位；不給任意 SQL、任意網址抓取 |
| 輸出端過濾 | 移除圖片與 HTML；連結只允許 https 加完全相同的主機名稱；前端再加 CSP |
| 個資 | 不需要的不送；需要指涉用代號；顧客自己打的先遮蔽（卡號用 Luhn），log 也一樣 |
| 營運方指令 | mid-conversation `role: 'system'` 訊息：顧客偽造不了、不破壞快取；不能是第一則，接在 user 之後 |

外洩管道是會自動送出的東西：Markdown 圖片、連結、HTML、工具參數。

## E 帳單的四種 token
| usage 欄位 | 倍率 |
|---|---|
| `input_tokens` | 輸入單價 |
| `cache_creation_input_tokens` | 1.25 倍（5 分鐘）或 2 倍（1 小時） |
| `cache_read_input_tokens` | Opus 5.5／Sonnet 5.5 是 0.05 倍 |
| `output_tokens` | 輸出單價，含思考 |

Haiku 5.5 的 prompt 超過 10 萬 token，整個請求用高價。Message Batches 全部 5 折，並與快取疊加。

prompt caching 是逐位元的前綴比對，順序 tools → system → messages；工具要排序，日期放最後一則 user 訊息。斷點放在穩定部分的最後一個 block；頂層 `cache_control` 自動快取對話；最多 4 個斷點，前綴至少 512 token。

## F 省錢的順序
1. 先做免費優化：穩定的放前面、會變的放後面，用 usage 驗證命中。
2. 再用 eval 比較較低 effort（`output_config.effort`）或較小模型，看每完成一個任務的成本。
3. `countTokens` 在送出前估計輸入長度（可能跟實際差幾個 token），擋下太長的輸入。
4. 不急的工作用 Message Batches：用 `custom_id` 對應、輪詢到 `ended`、失敗的重送。
5. 每位顧客每天設上限：送出前用估計檢查，收到回應後扣實際值，超過時降級並告警。

## G 失敗時顧客看到什麼 {span=2}
```flow LR
(請求) -> [主要模型] -> *回答
[主要模型] --> [備用模型]: 暫時性錯誤
[備用模型] -> *回答
[備用模型] --> [固定回覆]: 暫時性錯誤或 deadline 到了
[主要模型] --> [丟錯，修程式]: 400、401、403、404
```
| 失敗 | 處理 |
|---|---|
| 429、529、5xx、連線、逾時 | ok 可以重試；重試只放一層 |
| 400、401、403、404 | no 不重試，修程式 |
| 拒答（HTTP 200） | warn 看 stop_reason；固定的中性訊息，不轉述 explanation，記錄 category 與訊息 id |

- SDK 1.3.0 預設 `maxRetries: 2`、`timeout: 600000` 毫秒，上線前調小；deadline 管整個操作的總時間。
- 用 `instanceof` 分類、子類別先判斷；串流中途的錯誤 status 是 undefined，看 `.type`。
- 換模型會失去快取，備用模型也要跑 eval。
- 每個租戶各自限制並發（排隊）與速率（token bucket，立刻拒絕）；即時與批次分開。
- 斷路器在持續失敗時直接走備案。

## H 可觀測性與 SSE
| 工具 | 回答 |
|---|---|
| log | 「那一次」：路由、prompt 版本、模型、status、延遲與 TTFT、request id、stop_reason、token 與費用、工具 |
| 指標 | 「最近」：p95 延遲與 TTFT、費用、錯誤率、拒答率、快取命中率 |
| 追蹤 | 「慢在哪一步」：檢索、模型呼叫、工具串成一棵 span 樹 |

內容先遮蔽再截斷。對錯誤率、TTFT、費用突增、快取命中率突降設告警。SDK 1.3.0 註冊 tracer provider 後自動產生 API 呼叫的 span，`contentMode` 預設不帶內容。

SSE 端點：`text/event-stream`、`no-cache`、事件以空行結尾、收到就送；事件只有 delta、done、error，error 不帶細節。前端斷線聽回應的 close，記 `client_aborted`；代理要關緩衝。Vue 用 fetch＋ReadableStream 讀 POST 的串流，不用 `v-html`。
