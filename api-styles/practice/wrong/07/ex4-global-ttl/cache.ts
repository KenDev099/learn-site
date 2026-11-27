// 練習 4：伺服器端的回應快取（@graphql-yoga/plugin-response-cache）
import { useResponseCache, type Cache } from '@graphql-yoga/plugin-response-cache'

export function cachePlugin({ cache }: { cache: Cache }) {
  return useResponseCache({
    cache,
    // 快取鍵一定包含 session：同一份查詢，不同的人各存一份
    session: request => request.headers.get('x-customer-id'),
    ttl: 60_000,                     // ✗ 全部 60 秒，me 也是
    invalidateViaMutation: true,     // mutation 回傳的 Product:3 會讓含 Product:3 的快取失效
  })
}
