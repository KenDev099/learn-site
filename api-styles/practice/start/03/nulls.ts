// 練習 4：預測錯誤發生時回應的 data 長什麼樣子、errors[0].path 是什麼。
// 四個案例的 schema、查詢與會丟錯的 resolver 在頁面上，也在 ex4.test.ts 開頭（測試會真的執行它們，跟你的預測比對）。
// 現在的預測都是「只有出錯的那個欄位變成 null」，四個裡面有三個不對。

export type CaseName = 'nullable-field' | 'non-null-child' | 'list-item' | 'root-non-null'
export type Prediction = { data: unknown, path: (string | number)[] }

export const predictions: Record<CaseName, Prediction> = {
  'nullable-field': {
    data: { order: { id: '1', note: null } },
    path: ['order', 'note'],
  },
  'non-null-child': {
    data: { order: { id: '1', customer: null } },
    path: ['order', 'customer'],
  },
  'list-item': {
    data: { orders: [{ id: '1', items: [{ name: '拿鐵' }] }, { id: '2', items: [{ name: '可頌' }, { name: null }] }] },
    path: ['orders', 1, 'items', 1, 'name'],
  },
  'root-non-null': {
    data: { order: { id: '1', customer: { name: null } } },
    path: ['order', 'customer', 'name'],
  },
}
