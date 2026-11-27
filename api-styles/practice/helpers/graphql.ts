// 不開 port 呼叫 GraphQL 伺服器：yoga.fetch 收一個 Request、回一個 Response，跟真的 HTTP 請求走同一條路（Yoga 官方的測試方式）
import { mock } from 'node:test'
type Fetchable = { fetch(url: string, init?: RequestInit): Response | Promise<Response> }
type Body = { data?: any, errors?: { message: string, extensions?: Record<string, any>, path?: (string | number)[] }[] }

export async function gql(yoga: Fetchable, query: string, variables?: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await yoga.fetch('http://yoga/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/graphql-response+json', ...headers },
    body: JSON.stringify({ query, variables }),
  })
  const text = await res.text()
  let body: Body
  try { body = JSON.parse(text) } catch { throw new Error(`回應不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`) }
  return { status: res.status, headers: res.headers, body }
}

// Yoga 6 預設每個請求印一段 INF「Request processed」log（用 console.info），測試輸出會被洗版。
// 測試檔開頭呼叫一次就安靜；console.log、console.error（包括被遮罩的錯誤）照常印出
export function quietYogaLogs() {
  mock.method(console, 'info', () => {})
}
