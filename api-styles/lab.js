// API 風格與整合：GraphQL、gRPC 與契約 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'api-styles-progress'
export const STAGES = [
  ['階段 1：選擇 API 風格', [
    [1, '同一間咖啡店，四種 API：REST、GraphQL、gRPC 與事件', '01-choosing-api-styles.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：GraphQL 基礎', [
    [2, 'GraphQL 入門：schema、SDL 與第一個查詢', '02-graphql-schema-queries.html'],
    [3, 'Resolver 與 mutation：每個欄位都是一個函式', '03-resolvers-mutations.html'],
    [4, 'N+1 與 DataLoader：一次請求不能發出一百句 SQL（資深）', '04-n-plus-1-dataloader.html'],
    [5, '分頁與錯誤：cursor connection、錯誤遮罩與錯誤代碼', '05-pagination-errors.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：GraphQL 上線：防護與客戶端', [
    [6, '授權與防護：欄位層級授權、深度與成本限制、persisted operations（資深）', '06-authz-limits-persisted.html'],
    [7, '從 Vue 使用 GraphQL：codegen、客戶端快取與 HTTP 快取的難題', '07-graphql-client-caching.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：gRPC 與 Protobuf', [
    [8, 'Protobuf：訊息、程式碼產生與相容規則', '08-protobuf-codegen.html'],
    [9, 'gRPC 服務：unary、串流、deadline 與狀態碼', '09-grpc-services.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：契約與整合架構', [
    [10, '契約演進與契約測試：deprecation、破壞性變更檢查、Pact 與 schema registry（資深）', '10-contract-evolution-testing.html'],
    [11, 'API gateway、BFF 與把 gRPC 開放給瀏覽器（資深）', '11-gateway-bff.html'],
    [12, '期末專題：咖啡店的 GraphQL 菜單與訂單歷史、gRPC 庫存服務與契約測試', '12-capstone.html'],
  ], 'sheets/stage-5.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
