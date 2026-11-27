import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; productId: number }

export function ProductList({ api }: { api: ShopApi }) {
  const { data } = useQuery({ queryKey: ['products', 'list'], queryFn: () => api.getProducts() })
  if (!data) return <p>菜單載入中…</p>
  return (
    <ul aria-label="菜單">
      {data.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}

export function ProductPrice({ api, productId }: Props) {
  const { data } = useQuery({ queryKey: ['products', 'detail', productId], queryFn: () => api.getProduct(productId) })
  return <p aria-label="目前售價">{data ? `${data.name} 目前售價 $${data.price}` : '載入中…'}</p>
}

// 錯在：只讓列表失效，售價（['products', 'detail', id]）還是舊的
export function PriceEditor({ api, productId }: Props) {
  const [price, setPrice] = useState('')
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (newPrice: number) => api.updatePrice(productId, newPrice),
    // 回傳 Promise：重抓完成之前 mutation 都還是 pending
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products', 'list'] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate(Number(price))
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        新價格
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} />
      </label>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '儲存中…' : '儲存'}
      </button>
      {mutation.isError && <p role="alert">儲存失敗：{mutation.error.message}</p>}
    </form>
  )
}

export function PriceAdmin({ api, productId }: Props) {
  return (
    <>
      <ProductList api={api} />
      <ProductPrice api={api} productId={productId} />
      <PriceEditor api={api} productId={productId} />
    </>
  )
}
