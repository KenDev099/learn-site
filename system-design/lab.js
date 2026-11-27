// 系統設計與資深工程實踐 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'system-design-progress'
export const STAGES = [
  ['階段 1：基本功：需求、估算與效能指標', [
    [1, '系統設計在想什麼：需求、限制與取捨', '01-what-is-system-design.html'],
    [2, '估算：用數字做決定', '02-estimation.html'],
    [3, '延遲、吞吐量與百分位數', '03-latency-percentiles.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：擴展：冗餘、快取與資料', [
    [4, '冗餘與負載平衡：可用性的算術', '04-redundancy-load-balancing.html'],
    [5, '快取：命中率、失效與擊穿', '05-caching.html'],
    [6, '複寫與一致性：讀副本、複寫延遲與 CAP', '06-replication-consistency.html'],
    [7, '分片與一致性雜湊', '07-sharding-consistent-hashing.html', '選修'],
  ], 'sheets/stage-2.html'],
  ['階段 3：可靠性：失敗是常態', [
    [8, '逾時、重試與退避：失敗之後怎麼辦', '08-timeouts-retries-backoff.html'],
    [9, '冪等性：重試也不會重複扣款', '09-idempotency.html'],
    [10, '限流：保護服務，也保護其他客戶', '10-rate-limiting.html'],
    [11, '斷路器、隔艙與負載卸除：不被依賴拖垮', '11-circuit-breaker-bulkhead.html'],
    [12, '佇列、送達語意與 outbox', '12-queues-outbox.html'],
    [13, 'Saga：跨服務的流程與補償', '13-saga.html'],
    [14, '分散式鎖、租約與 fencing token', '14-distributed-locks-leases.html', '選修'],
  ], 'sheets/stage-3.html'],
  ['階段 4：架構：服務、事件與即時推送', [
    [15, '單體、模組化單體與微服務', '15-monolith-microservices.html'],
    [16, '事件驅動與 webhook', '16-events-webhooks.html'],
    [17, '即時推送：輪詢、SSE 與 WebSocket 的規模化', '17-realtime-push.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：資深工程實踐：決策、演進、審查與除錯', [
    [18, '設計文件與 ADR：把決定和理由寫下來', '18-design-docs-adr.html'],
    [19, '演進：API 相容性、功能旗標與 strangler fig', '19-evolution-compatibility.html'],
    [20, 'Code review 與技術債', '20-code-review-tech-debt.html'],
    [21, '除錯方法論：從 bug 到線上事故', '21-debugging-incidents.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：期末專題', [
    [22, '期末專題：咖啡店線上點餐系統', '22-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
