// 給 TypeScript 看的型別說明：legacy-tax.cjs 匯出一個物件（不要改這個檔）
declare const api: {
  rate: number
  calcTax(price: number): number
}
export = api
