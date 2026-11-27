export type MenuItem = { name: string, price: number }

// 沒指定欄位：連 id 都抓回來
export async function fetchMenu(apiUrl: string, key: string): Promise<MenuItem[]> {
  const res = await fetch(new URL('/rest/v1/products?order=price.asc,name.asc', apiUrl), { headers: { apikey: key } })
  if (!res.ok) throw new Error(`讀菜單失敗：${res.status}`)
  return res.json()
}
