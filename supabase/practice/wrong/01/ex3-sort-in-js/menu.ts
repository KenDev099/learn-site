export type MenuItem = { name: string, price: number }

// 把整張表抓回來，在 JavaScript 裡排序
export async function fetchMenu(apiUrl: string, key: string): Promise<MenuItem[]> {
  const res = await fetch(new URL('/rest/v1/products?select=name,price', apiUrl), { headers: { apikey: key } })
  if (!res.ok) throw new Error(`讀菜單失敗：${res.status}`)
  const rows: MenuItem[] = await res.json()
  return rows.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
}
