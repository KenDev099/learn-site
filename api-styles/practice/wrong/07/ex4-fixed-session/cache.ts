// 練習 4：伺服器端的回應快取（@graphql-yoga/plugin-response-cache）
import { useResponseCache, type Cache } from '@graphql-yoga/plugin-response-cache'

export function cachePlugin({ cache }: { cache: Cache }) {
  return useResponseCache({
    cache,
    // 快取鍵一定包含 session：同一份查詢，不同的人各存一份
    session: () => 'coffee-shop',
    ttl: 0,                          // 預設不快取：沒列在下面的查詢都不存
    ttlPerSchemaCoordinate: {
      'Query.menu': 60_000,          // 公開的菜單：60 秒
      'Query.me': 10_000,            // 個人資料：10 秒，而且依 session 分開
    },
    invalidateViaMutation: true,     // mutation 回傳的 Product:3 會讓含 Product:3 的快取失效
  })
}
