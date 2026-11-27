// 練習 1：建立菜單索引 createMenuIndex(es, index)
// 文件長這樣（_id 是商品 id，不放在文件裡）：
//   { name: '焦糖拿鐵', description: '自製焦糖醬加上濃縮咖啡與蒸奶', category: '咖啡', price: 130, available: true, sales: 260 }
// 要求：
//   name、description：中文全文搜尋，用 cjk 分析器；name 另外有一個 keyword 子欄位 name.keyword（排序、精確比對用）
//   category：只做精確篩選與分類統計
//   price：新台幣元，沒有小數；sales：近 30 天銷量，整數
//   available：有沒有供應
//   不允許寫入 mapping 以外的欄位
import type { Client } from '@elastic/elasticsearch'

export async function createMenuIndex(es: Client, index: string): Promise<void> {
  // 寫在這裡
}
