import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { PriceAdmin } from './PriceAdmin.tsx'
import { reject, resolve, resolvePending, settle, setup } from './test-utils.tsx'

async function open(productId = 2) {
  const t = setup(api => <PriceAdmin api={api} productId={productId} />)
  await resolvePending(t.api, 'getProducts')
  await resolvePending(t.api, 'getProduct')
  const input = screen.getByLabelText('新價格')
  const button = () => screen.getByRole('button', { name: /儲存/ })
  const submit = async (price: string) => {
    await t.user.clear(input)
    await t.user.type(input, price)
    await t.user.click(button())
    await settle()
  }
  const counts = () => ({ list: t.api.callsOf('getProducts').length, detail: t.api.callsOf('getProduct').length })
  return { ...t, input, button, submit, counts }
}

describe('練習 1：PriceEditor 用 useMutation 改價，成功後讓快取失效', () => {
  test('送出時呼叫 api.updatePrice(productId, 價格)，價格是數字', async () => {
    const { api, submit } = await open(2)
    await submit('120')
    expect(api.callsOf('updatePrice').map(c => c.args), '按「儲存」要呼叫 api.updatePrice(2, 120)：第二個參數要是數字，不是字串').toEqual([[2, 120]])
  })

  test('送出中按鈕 disabled、顯示「儲存中…」，連按也只送出一次', async () => {
    const { api, user, button, submit } = await open(2)
    await submit('120')
    expect(button(), '送出之後、伺服器還沒回應：按鈕要 disabled（用 mutation.isPending）').toBeDisabled()
    expect(button(), '送出中按鈕文字要是「儲存中…」').toHaveTextContent('儲存中…')
    await user.click(button())
    expect(api.callsOf('updatePrice').length, '送出中又按了一次，不能再送出第二次').toBe(1)
  })

  test('伺服器還沒存好之前，不要讓快取失效', async () => {
    const { submit, counts } = await open(2)
    const before = counts()
    await submit('120')
    expect(counts(), 'updatePrice 還沒完成就重抓了：這時伺服器還是舊價格，重抓只會拿到舊資料。在 onSuccess（或 onSettled）才 invalidateQueries，不要在 onMutate 或送出前').toEqual(before)
  })

  test('成功後列表和售價都重抓，顯示伺服器的新價格', async () => {
    const { api, submit, counts } = await open(2)
    const before = counts()
    await submit('125')
    await resolve(api.pendingOf('updatePrice')[0])
    const after = counts()
    expect(after.list, '改價成功後要重抓菜單列表：queryClient.invalidateQueries({ queryKey: [\'products\'] })，不要加 exact: true').toBe(before.list + 1)
    expect(after.detail, '改價成功後售價（[\'products\', \'detail\', 2]）也要重抓：invalidateQueries 的 queryKey 是前綴比對，用 [\'products\'] 就會同時選到列表和詳細').toBe(before.detail + 1)
    await resolvePending(api, 'getProducts')
    await resolvePending(api, 'getProduct')
    expect(screen.getByRole('list', { name: '菜單' }), '重抓之後菜單要顯示新價格').toHaveTextContent('拿鐵 $125')
    expect(screen.getByLabelText('目前售價'), '重抓之後售價要顯示新價格').toHaveTextContent('拿鐵 目前售價 $125')
  })

  test('重抓完成之前仍是「儲存中…」，重抓完才恢復', async () => {
    const { api, button, submit } = await open(5)
    await submit('75')
    await resolve(api.pendingOf('updatePrice')[0])
    expect(button(), 'updatePrice 成功了但列表還沒重抓完，按鈕就恢復了：在 onSuccess 裡 return queryClient.invalidateQueries(…)，mutation 會等這個 Promise 才結束').toBeDisabled()
    await resolvePending(api, 'getProducts')
    await resolvePending(api, 'getProduct')
    expect(button(), '重抓完成後按鈕要恢復可以按').toBeEnabled()
    expect(button(), '重抓完成後按鈕文字回到「儲存」').toHaveTextContent(/^儲存$/)
    expect(screen.getByLabelText('目前售價')).toHaveTextContent('可頌 目前售價 $75')
  })

  test('失敗時顯示錯誤訊息，再送出成功後訊息消失', async () => {
    const { api, button, submit } = await open(2)
    await submit('0')
    await resolve(api.pendingOf('updatePrice')[0])   // 伺服器拒絕：價格必須是正整數
    expect(screen.getByRole('alert'), '失敗時要顯示 <p role="alert">儲存失敗：錯誤訊息</p>，訊息用 mutation.error.message').toHaveTextContent('儲存失敗：價格必須是正整數')
    expect(button(), '失敗之後按鈕要恢復，讓店長修改後再送出').toBeEnabled()
    await submit('130')
    await reject(api.pendingOf('updatePrice')[0], new Error('網路連線中斷'))
    expect(screen.getByRole('alert'), '錯誤訊息要是這一次的錯誤').toHaveTextContent('儲存失敗：網路連線中斷')
    await submit('130')
    await resolve(api.pendingOf('updatePrice')[0])
    await resolvePending(api, 'getProducts')
    await resolvePending(api, 'getProduct')
    expect(screen.queryByRole('alert'), '成功之後錯誤訊息要消失').toBeNull()
    expect(screen.getByLabelText('目前售價')).toHaveTextContent('拿鐵 目前售價 $130')
  })
})
