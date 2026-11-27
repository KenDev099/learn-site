export interface ReceiptModuleOptions {
  shopName: string
  footer?: string
}

// 錯：設定存在模組層級的變數，後註冊的會蓋掉先註冊的
export let currentOptions: ReceiptModuleOptions = { shopName: '' }
export const MODULE_OPTIONS_TOKEN = 'RECEIPT_OPTIONS'
export function setOptions(o: ReceiptModuleOptions) { currentOptions = o }
