// 練習 3：用原生 fetch 從 Data API 讀菜單。apiUrl、key 由呼叫的人傳進來（測試會傳 Project URL 與 publishable key）
export type MenuItem = { name: string, price: number }

export async function fetchMenu(apiUrl: string, key: string): Promise<MenuItem[]> {
  const url = new URL('/rest/v1/products', apiUrl)
  url.searchParams.set('select', 'name,price')
  url.searchParams.set('order', 'price.asc,name.asc')
  const res = await fetch(url, { headers: { apikey: key } })
  if (!res.ok) throw new Error(`讀菜單失敗：${res.status} ${await res.text()}`)
  return res.json()
}
