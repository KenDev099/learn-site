// Elasticsearch（第 10、11、15 課）：每一課的索引與別名都用 t<NN>- 開頭，每個測試檔開始前刪掉這一課的索引
// 用法：const es = useEs(10)   // 索引名稱寫成 't10-menu'、't10-menu-v2'
import { after, before } from 'node:test'
import { Client, type ClientOptions } from '@elastic/elasticsearch'
import { notRunning } from './service.ts'

export const ES_URL = 'http://127.0.0.1:16492'

export function useEs(lesson: number, options: Omit<ClientOptions, 'node'> = {}) {
  const es = new Client({ node: ES_URL, requestTimeout: 10_000, maxRetries: 0, ...options })
  const prefix = `t${String(lesson).padStart(2, '0')}-`
  before(async () => {
    try {
      await es.cluster.health({ wait_for_status: 'yellow', timeout: '5s' })
    } catch (e) {
      throw notRunning('Elasticsearch（127.0.0.1:16492）', 'search', e)
    }
    // 預設不允許用萬用字元刪索引（action.destructive_requires_name），所以先列出名稱再刪
    const names = Object.keys(await es.indices.get({ index: `${prefix}*`, expand_wildcards: 'all' }))
    if (names.length) await es.indices.delete({ index: names })
  })
  after(() => es.close())
  return es
}
