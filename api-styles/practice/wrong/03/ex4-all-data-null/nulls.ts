// ✗ 以為任何錯誤都讓整個 data 變成 null
export type CaseName = 'nullable-field' | 'non-null-child' | 'list-item' | 'root-non-null'
export type Prediction = { data: unknown, path: (string | number)[] }

export const predictions: Record<CaseName, Prediction> = {
  'nullable-field': { data: null, path: ['order', 'note'] },
  'non-null-child': { data: null, path: ['order', 'customer'] },
  'list-item': { data: null, path: ['orders', 1, 'items', 1, 'name'] },
  'root-non-null': { data: null, path: ['order', 'customer', 'name'] },
}
