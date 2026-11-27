import { Form, useLoaderData, useNavigation, type LoaderFunctionArgs, type RouteObject } from 'react-router'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export type MenuApi = Pick<FakeMenuApi, 'getMenu' | 'search'>

function menuLoader(api: MenuApi) {
  return async ({ url, request }: LoaderFunctionArgs) => {
    const q = (url.searchParams.get('q') ?? '').trim()
    const products = q
      ? await api.search(q, { signal: request.signal })
      : await api.getMenu({ signal: request.signal })
    return { q, products }
  }
}

function MenuSearch() {
  const { q, products } = useLoaderData<ReturnType<typeof menuLoader>>()
  const navigation = useNavigation()
  return (
    <section>
      <Form role="search">
        {/* key 跟著 q：網址的 q 變了（送出、上一頁），輸入框就重建成新的預設值 */}
        <input name="q" aria-label="搜尋商品" defaultValue={q} />
        <button>搜尋</button>
      </Form>
      {navigation.state === 'loading' && <p role="status">更新中…</p>}
      {products.length === 0
        ? <p>沒有符合的商品</p>
        : <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>}
    </section>
  )
}

export function menuRoute(api: MenuApi): RouteObject {
  return { loader: menuLoader(api), Component: MenuSearch }
}
