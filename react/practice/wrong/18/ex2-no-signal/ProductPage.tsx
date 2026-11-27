import { data, isRouteErrorResponse, Link, useLoaderData, useRouteError, type LoaderFunctionArgs, type RouteObject } from 'react-router'
import { NotFoundError, type FakeMenuApi } from '../../helpers/fake-api.ts'

export type ProductApi = Pick<FakeMenuApi, 'getProduct'>

function productLoader(api: ProductApi) {
  return async ({ params, request }: LoaderFunctionArgs) => {
    const id = params.id ?? ''
    if (!/^\d+$/.test(id)) throw data('找不到商品', { status: 404 })
    try {
      return await api.getProduct(Number(id))
    } catch (error) {
      if (error instanceof NotFoundError) throw data('找不到商品', { status: 404 })
      throw error
    }
  }
}

function ProductPage() {
  const product = useLoaderData<ReturnType<typeof productLoader>>()
  return (
    <article>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </article>
  )
}

function ProductError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) && error.status === 404
    ? '找不到商品'
    : `載入失敗：${error instanceof Error ? error.message : '未知的錯誤'}`
  return (
    <div role="alert">
      <p>{message}</p>
      <Link to="/menu">回菜單</Link>
    </div>
  )
}

export function productRoute(api: ProductApi): RouteObject {
  return { loader: productLoader(api), Component: ProductPage, ErrorBoundary: ProductError }
}
