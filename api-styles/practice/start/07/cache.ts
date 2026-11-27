// 練習 4：伺服器端的回應快取（@graphql-yoga/plugin-response-cache）
// 現在的設定很危險：沒有 ttl（預設 Infinity，什麼都存、永遠不過期）、session 對每個人都一樣、也沒用傳進來的 cache
import { useResponseCache, type Cache } from '@graphql-yoga/plugin-response-cache'

export function cachePlugin({ cache }: { cache: Cache }) {
  return useResponseCache({
    session: () => null,
  })
}
