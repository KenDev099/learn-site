// 菜單 App（consumer）呼叫菜單 API 的程式（不用改）。練習 3 的契約測試要呼叫這裡的 fetchMenu
export const MENU_QUERY = 'query Menu { menu { id name priceTwd } }'
export type MenuItem = { id: string, name: string, priceTwd: number }

export async function fetchMenu(baseUrl: string): Promise<MenuItem[]> {
  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: MENU_QUERY }),
  })
  if (!res.ok) throw new Error(`菜單 API 回應 HTTP ${res.status}`)
  const body = await res.json() as { data?: { menu: MenuItem[] }, errors?: { message: string }[] }
  if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? '回應沒有 data')
  return body.data.menu
}
