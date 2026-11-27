// 練習 1：建立菜單索引
// 欄位：name、description（中文全文搜尋）、category（分類，用來篩選與統計）、price（新台幣元，整數）、
//       available（有沒有供應）、sales（近 30 天銷量，整數）。不允許其他欄位
import type { Client } from '@elastic/elasticsearch'

export async function createMenuIndex(es: Client, index: string): Promise<void> {
  await es.indices.create({
    index,
    mappings: {
      dynamic: 'strict',
      properties: {
        name: { type: 'text', analyzer: 'cjk', fields: { keyword: { type: 'keyword' } } },
        description: { type: 'text', analyzer: 'cjk' },
        category: { type: 'text' },
        price: { type: 'integer' },
        available: { type: 'boolean' },
        sales: { type: 'integer' },
      },
    },
  })
}
