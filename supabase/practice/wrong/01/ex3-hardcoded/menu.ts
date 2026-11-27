export type MenuItem = { name: string, price: number }

// 打的是寫死的網址，不是傳進來的 apiUrl
export async function fetchMenu(apiUrl: string, key: string): Promise<MenuItem[]> {
  const res = await fetch('http://localhost:55421/rest/v1/products?select=name,price&order=price.asc,name.asc', { headers: { apikey: key } })
  if (!res.ok) throw new Error(`讀菜單失敗：${res.status}`)
  return res.json()
}
