// 資料儲存選型：Redis、MongoDB 與搜尋 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'data-stores-progress'
export const STAGES = [
  ['階段 1：選型的思路', [
    [1, '為什麼不只用 PostgreSQL：從存取模式選資料儲存', '01-choosing-a-store.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：Redis 不只是快取', [
    [2, 'Redis 的資料結構：string、hash、list、set、sorted set', '02-redis-data-structures.html'],
    [3, 'Redis 實戰模式：限流、session、計數器與冪等', '03-redis-patterns.html'],
    [4, '原子操作：pipeline、MULTI/WATCH 與 Lua 腳本', '04-redis-atomicity.html'],
    [5, '訊息：pub/sub 與 Streams', '05-redis-pubsub-streams.html'],
    [6, 'Redis 上線（資深）：記憶體、淘汰、持久化、大 key 與 Cluster', '06-redis-operations.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：MongoDB 與文件模型', [
    [7, 'MongoDB 入門：文件建模（內嵌還是參照）與 schema 驗證', '07-mongodb-modeling.html'],
    [8, 'MongoDB 查詢、索引、explain 與 aggregation pipeline', '08-mongodb-indexes-aggregation.html'],
    [9, 'MongoDB 交易與一致性（資深）：write concern、read concern 與何時不用 MongoDB', '09-mongodb-consistency.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：搜尋與檔案', [
    [10, '搜尋引擎入門：倒排索引、分析器、中文分詞與相關性', '10-search-engine.html'],
    [11, '讓搜尋跟資料庫同步（資深）：outbox、重建索引與別名切換', '11-search-sync.html'],
    [12, '物件儲存：S3、presigned URL 與生命週期', '12-object-storage.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：分析、規模與期末專題', [
    [13, '分析與時序資料：報表什麼時候該離開 OLTP 資料庫', '13-olap-analytics.html'],
    [14, '大規模 key-value（資深）：DynamoDB 的分區鍵與 single-table 設計', '14-dynamodb-design.html', '選修'],
    [15, '期末專題：咖啡店的資料儲存組合與一致性', '15-capstone.html'],
  ], 'sheets/stage-5.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
