// 練習 2：在資料庫端驗證 stores 集合
// 規則（用 $jsonSchema 寫在 validator 裡）：
// - 只允許這些欄位：_id、name、status、address、photos、featured，其他欄位一律拒絕
// - name：必填，字串，1～50 字
// - status：必填，只能是 'open'、'closed'、'renovating'
// - address：物件（選填）
// - photos：陣列（選填），最多 20 張；每張是物件，url 必填且是字串
// - featured：陣列（選填）；每個元素的 price 必須是 decimal（Decimal128）
// - 不合法的寫入要直接失敗（錯誤碼 121），不是只記警告
import type { Db } from 'mongodb'

export async function createStoresCollection(db: Db): Promise<void> {
  await db.createCollection('stores', {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'status'],
        additionalProperties: false,
        properties: {
          name: { bsonType: 'string', minLength: 1, maxLength: 50 },
          status: { enum: ['open', 'closed', 'renovating'] },
          address: { bsonType: 'object' },
          photos: {
            bsonType: 'array',
            maxItems: 20,
            items: { bsonType: 'object', required: ['url'], properties: { url: { bsonType: 'string' } } },
          },
          featured: {
            bsonType: 'array',
            items: { bsonType: 'object', required: ['price'], properties: { price: { bsonType: 'decimal' } } },
          },
        },
      },
    },
    validationLevel: 'strict',
    validationAction: 'error',
  })
}
