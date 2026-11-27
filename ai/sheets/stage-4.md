---
title: AI 應用開發 階段 4：RAG：讓模型根據你的資料回答
subtitle: 第 8～10 課一頁圖解：切塊、embedding、cosine、top-k、pgvector、HNSW、pg_trgm、RRF、重排、引用驗證
cols: 3
theme: shadcn
課程: AI 應用開發 第 8～10 課
---
RAG 先檢索相關的資料，再讓模型根據它回答；回答品質的上限就是找到的那幾塊。檢索要兩路一起跑，引用由程式驗證，資料不夠就拒答。[回 AI 應用開發 學習地圖](../index.html)

## A RAG 的兩個階段 {span=2}
```flow LR
group 離線，文件改了才跑: 門市手冊, 切塊, 算 embedding
group 線上，每個問題都跑: 顧客問題, 問題的 embedding, 找最相近的 k 塊, 組 prompt
[門市手冊] -> [切塊] -> [算 embedding] -> [(資料庫：塊＋向量＋metadata)]
[顧客問題] -> [問題的 embedding] -> [找最相近的 k 塊] -> *[組 prompt]
[(資料庫：塊＋向量＋metadata)] --> [找最相近的 k 塊]
```
該找的沒找到，模型再強也只能說不知道或亂猜，所以重點在檢索，不在 prompt 的措辭。

## B 什麼時候用 RAG
| 做法 | 適合 |
|---|---|
| 整份放進 prompt 加快取 | ok 資料小、很少變 |
| RAG | ok 資料大、常變、要能引用來源 |
| 微調 | warn 要改語氣與格式才考慮；記住的事實無法指出出處 |

資料小也上 RAG，多了一整套會出錯的程式，回答反而不準。

## C 切塊
- 按標題切並保留標題路徑，例如 `門市手冊 › 過敏原 › 蛋糕`。
- 一節太長再切在換行處，相鄰塊重疊一小段。
- 每塊帶 docId、標題路徑、seq 等 metadata。
- 長度用 `Array.from` 算，用 `length`、`slice` 會把 emoji 切成兩半。

| 塊的大小 | 結果 |
|---|---|
| 太大 | no 相似度被稀釋、浪費 token |
| 太小 | no 失去上下文（「它含堅果」的「它」是誰） |

起點按結構切，再用 eval 調。

## D Embedding 與相似度
```kv cols=1
embedding: 把文字變成向量，意思相近的向量也相近
同一個模型: 查詢與文件用同一個模型與版本，記錄在資料庫；換模型就全部重算
Voyage AI: Anthropic 沒有 embedding 模型，官方文件推薦 Voyage AI（voyage-4，預設 1024 維）
input_type: 文件用 `'document'`、問題用 `'query'`
cosine: 內積 ÷ 兩個長度的乘積；正規化後內積就是 cosine
邊界: 零向量回 0，長度不同要丟錯
```
暴力 top-k：全部算一次、先過濾、由高到低排、同分依 docId 與 seq；資料多到幾十萬筆以上才需要向量索引。top-k 只保證相對最像，不保證相關。

## E 存進 PostgreSQL：pgvector
```kv cols=1
為什麼: 塊和商品、訂單在同一個資料庫，過濾、JOIN、交易、備份都是現成的；幾百萬筆以內先用它
vector(n): 維度寫在型別上；不用 `real[]`、`jsonb`
embed_model: 換模型或換維度就是一次 migration 加全部重算
內容雜湊: 只重算新的、雜湊變了的、模型不同的塊，一次批次呼叫 embed
交易: UPSERT 寫入、刪除多出來的塊放在同一個交易；embed 在交易外呼叫
```
| 運算子 | 意思 | 索引運算子類別 |
|---|---|---|
| `<=>` | cosine 距離，相似度 = 1 − 距離 | `vector_cosine_ops` |
| `<->` | L2 距離 | `vector_l2_ops` |
| `<#>` | 負的內積 | `vector_ip_ops` |

## F 查詢、HNSW 與過濾的陷阱
`ORDER BY embedding <=> $1 LIMIT k`，過濾寫在 WHERE，值一律用參數；寫成 `ORDER BY score DESC` 永遠用不到索引。

HNSW 是近似最近鄰索引，用一點召回率換速度。運算子類別要和查詢一致，用 EXPLAIN 確認；資料少時全表掃描是正確的選擇。

| 嚴格過濾讓結果太少時 | 適合 |
|---|---|
| `SET LOCAL hnsw.iterative_scan` | 繼續往下掃到湊滿 LIMIT |
| 部分索引 | 條件的值只有少數幾種 |
| 讓規劃器用 B-tree 做精確搜尋 | 條件夠嚴格、過濾欄位有 B-tree 索引時，規劃器常會這樣選 |

上線後用 EXPLAIN 和 eval 確認實際走哪一條。設定一律 `SET LOCAL`：`SET` 會留在連線上，連線池把它借給下一個請求。

## G 混合搜尋到回答 {span=2}
```flow LR
(問題) -> [向量 <=> 前 20 名] & [pg_trgm 前 20 名]
[向量 <=> 前 20 名] -> [RRF 合併]
[pg_trgm 前 20 名] -> [RRF 合併]
[RRF 合併] -> [重排取前 5 名] -> [組 context c1 到 cN] -> *[模型回答＋sources]
[模型回答＋sources] -> {程式驗證引用}
```
- 向量抓意思，對編號、專有名詞、很短的詞很弱；關鍵字相反。
- 中文關鍵字用 pg_trgm：`gin_trgm_ops` 的 GIN 索引、`$1 <% content` 篩選、`word_similarity` 排序；門檻預設 0.6，在交易裡 `SET LOCAL` 調低。
- RRF：每一路給 1／(k＋名次)，加總排序，k 常用 60；只能排序，不能當門檻。
- 重排只用在合併後的前 20 名左右，分數可以當拒答門檻。
- context：短 id 加標題路徑，內容跳脫，在 token 預算內整段放或不放。

## H 引用驗證：不夠就拒答
| 情況 | 處理 |
|---|---|
| 重排最高分低於門檻、一段都放不進 context | no 不呼叫 API，直接拒答 |
| `parsed_output` 是 null | no 拒答 |
| `sources` 是空的 | no 拒答 |
| `sources` 有任何一個不是這次的 id | no 整個拒答 |
| 每個 source 都在這次的 id 裡 | ok 回答 |

用結構化輸出要 `{ answer, sources }`；拒答時記錄問題、段落、分數與原因。

```callout info Claude 的 citations 功能
`search_result` block 的引用位置由 API 保證，但不能和 `output_config.format` 一起用。兩種做法都不保證回答內容正確。
```
