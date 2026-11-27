// 練習 4：預測錯誤發生時回應的 data 長什麼樣子、errors[0].path 是什麼。
// 四個案例的 schema、查詢與會丟錯的 resolver 在頁面上，也在 ex4.test.ts 開頭（測試會真的執行它們，跟你的預測比對）。

export type CaseName = 'nullable-field' | 'non-null-child' | 'list-item' | 'root-non-null'
export type Prediction = { data: unknown, path: (string | number)[] }

export const predictions: Record<CaseName, Prediction> = {
  // note 可以是 null：錯誤停在 note 自己
  'nullable-field': {
    data: { order: { id: '1', note: null } },
    path: ['note'],
  },
  // customer 是 Customer!，不能放 null → 往上一層，order 可以是 null，停在 order
  'non-null-child': {
    data: { order: null },
    path: ['customer'],
  },
  // name 是 String! → Item! → [Item!]! 都不能是 null，一路冒到清單元素 [Order] 的那一格（可以是 null）
  'list-item': {
    data: { orders: [{ id: '1', items: [{ name: '拿鐵' }] }, null] },
    path: ['name'],
  },
  // name → customer → order 都是非空，Query.order 也是 Order!：冒到最上面，整個 data 變 null
  'root-non-null': {
    data: null,
    path: ['name'],
  },
}
