// 練習 3：用原生 fetch 從 Data API 讀菜單。apiUrl、key 由呼叫的人傳進來（測試會傳 Project URL 與 publishable key）
export type MenuItem = { name: string, price: number }

export async function fetchMenu(apiUrl: string, key: string): Promise<MenuItem[]> {
  // 1. 組出 GET <apiUrl>/rest/v1/products 的網址：只要 name、price 兩欄，先依價格、再依名稱排序（交給 API 排）
  // 2. 帶上 apikey header
  // 3. 回應不是 2xx 時丟出 Error（訊息帶上狀態碼與回應內容）
  return []
}
