---
title: AI 應用開發 階段 2：讓輸出可靠
subtitle: 第 4～5 課一頁圖解：system prompt、標籤與跳脫、穩定的請求、few-shot、structured outputs、業務驗證、回饋重試
cols: 3
theme: shadcn
課程: AI 應用開發 第 4～5 課
---
模型分不出規則和資料，結構要由你給；要程式使用的輸出交給 structured outputs 保證形狀，內容對不對由程式和資料庫決定。[回 AI 應用開發 學習地圖](../index.html)

## A 寫 system prompt：角色、規則、資料、格式
| 區塊 | 咖啡店的例子 |
|---|---|
| 角色與服務的人 | 官網的客服助理，顧客多半用手機看 |
| 規則 | 價格只根據 `<menu>`；不知道就說不知道；不承諾退款 |
| 資料 | `<menu>` 區塊 |
| 輸出格式 | 繁體中文、一到三句 |

寫行為，不寫形容詞：「`<menu>` 沒有的品項就說菜單上沒有」可以檢查，「非常專業、絕對不可以亂講」不行。不需要全大寫和重複強調，需要時附上原因。

## B 資料與指令分開
菜單用 `<menu>`、顧客輸入用 `<question>` 包起來，放進標籤前先跳脫：

| 順序 | 原字元 | 換成 |
|---|---|---|
| 1 | `&` | `&amp;` |
| 2 | `<` | `&lt;` |
| 3 | `>` | `&gt;` |

`&` 一定第一個換，否則同一個字元被跳脫兩次。不是你親手寫在程式裡的文字（包括後台打的品名）都要跳脫。

```callout warn 這是第一道防線，不是全部
標籤加跳脫擋掉假裝結束標籤的偽造，模型仍可能被內容說動。退款、改訂單、查別人的資料要靠程式擋（第 12 課）。
```

## C 穩定的請求與 few-shot
```kv cols=1
逐位元相同: 同樣的輸入產生同樣的請求；資料排序，system 不放時間戳記、請求 id、亂數
為什麼: 快取（第 13 課）是前綴比對，測試也要比對組出來的請求
變動的資訊: 放在這次的 user 訊息，只到需要的精度，例如日期不帶秒數
few-shot: 2～3 組不同的 user／assistant 範例，包含「不知道」或「菜單沒有」的情況
最後一則: 一定是 user；結尾放 assistant 預填會回 400
```

## D 輸出格式與 prompt 版本
| 格式 | 適合 | 代價 |
|---|---|---|
| 自由文字 | 直接給人看 | no 程式無法可靠地拆出欄位 |
| 固定標籤 `<answer>`、`<sources>` | 一段文字加少量附帶資訊 | warn 要自己寫容錯的解析器 |
| JSON＋結構化輸出 | 欄位多、給程式處理 | ok 要定義 schema（第 5 課） |

標籤解析器用非貪婪的 `[\s\S]*?`、處理多行，缺標籤回傳 null 不丟錯。prompt 放版本控制、有版本號（例如 `support-v7`）、log 記錄版本，改了就跑 eval。

## E 結構化輸出怎麼寫
```kv cols=1
請求: `output_config: { format: zodOutputFormat(Schema) }` 搭配 `client.messages.parse()`
結果: 有型別的 `parsed_output`；拒答時是 null
不要用: 頂層的 `output_format` 已經淘汰；預填 `{` 在 Opus 5.5 回 400
不知道的出口: `intent` 有 `'unclear'`，可能不知道的欄位用 `.nullable()`
不能一起用: 結構化輸出和 citations 同時用回 400
圖片與 PDF: `image`／`document` block 或 Files API 的 `file_id`，一樣搭配 structured outputs
```
沒有 `unclear` 時，模型只能在合法範圍裡猜，編出一張形狀正常的訂單。結構化輸出讓測試和 eval 可以比對欄位，不必比對句子。

## F 誰檢查什麼
| 誰 | 擋得住什麼 | 失敗時 |
|---|---|---|
| API 產生時限制 | 合法 JSON、物件形狀、必填欄位、型別、沒有多餘欄位 | ok 不會發生，除非被截斷或拒答 |
| SDK 在本機用 zod | 範圍、長度、enum（SDK 1.3.0 搬進 description）、refine | warn `parse()` 丟出 `AnthropicError` |
| 你的程式 | 今天有沒有賣、合併後的庫存、價格、能不能下單 | warn 回傳 Result，列出全部錯誤 |

schema 保證形狀，不保證內容。價格一律從資料庫來；查不到庫存當成 0，不是無限。

## G 從顧客訊息到訂單 {span=2}
```flow LR
(顧客訊息) -> [跳脫後包進 message 標籤] -> [create 加 output_config] -> {format.parse}
{format.parse} -> [業務驗證]: 通過
[業務驗證] -> *ok: 金額用資料庫的價格
[業務驗證] --> [ok false 加全部錯誤]: 下架、庫存不足
{format.parse} --> [回饋重試]: zod 失敗或截斷，還有次數
[回饋重試] --> [create 加 output_config]: 加上完整 content 與錯誤說明
```
要做回饋就要失敗那次的回應，所以拆成 `create()` 加 `format.parse()`。上限 2～3 次，用完回 `ok: false`；重試次數記進 log。

## H 哪些錯誤回饋重試
| 情況 | 處理 |
|---|---|
| zod 驗證失敗、JSON 被截斷 | ok 回饋重試，有上限 |
| `stop_reason: 'refusal'` | no 不重試，回傳失敗 |
| 400、401、403、額度用完 | no 不重試，往外丟 |
| 429、529、連線錯誤 | warn 往外丟，SDK 的 `maxRetries` 已經重試過 |

送一模一樣的請求，結果多半差不多；把錯誤路徑（例如 `items.0.quantity`）告訴模型才有用。
