import { describe, expect, test, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { deferred } from '../../helpers/deferred.ts'
import { ValidationError } from './errors.ts'
import PickupForm from './PickupForm.vue'

const VALID = { name: '王小明', phone: '0912345678', pickupTime: '10:30', note: '少冰' }

type Submit = (values: Record<string, string>, idempotencyKey: string) => Promise<void>

function setup(submit = vi.fn<Submit>(async () => {})) {
  let n = 0
  const newKey = vi.fn(() => `key-${++n}`)
  const wrapper = mount(PickupForm, { props: { submit, newKey }, attachTo: document.body })
  return { wrapper, submit, newKey }
}

const input = (w: VueWrapper, name: string) => w.get(`[name="${name}"]`)

async function fill(w: VueWrapper, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) await input(w, name).setValue(value)
}

// 這個欄位現在顯示的錯誤訊息：從 aria-describedby 找到說明元素（找不到就是沒有錯誤）
function errorOf(w: VueWrapper, name: string): string | null {
  const el = input(w, name).element
  const ref = el.getAttribute('aria-describedby')
  const visible = w.findAll('.error').map(e => e.text())
  if (!ref) {
    expect(el.getAttribute('aria-invalid') === 'true' && visible.length > 0, `「${name}」標成 aria-invalid，卻沒有 aria-describedby：要指向顯示錯誤訊息的元素`).toBe(false)
    return null
  }
  const target = document.getElementById(ref)
  expect(target, `「${name}」的 aria-describedby="${ref}" 找不到對應的元素：id 要跟錯誤訊息的 <p> 一樣`).toBeTruthy()
  expect(el.getAttribute('aria-invalid'), `「${name}」有錯誤時要加 aria-invalid="true"，螢幕報讀器才知道這格有錯`).toBe('true')
  return target!.textContent!.trim()
}

describe('練習 2：PickupForm 的錯誤顯示與送出', () => {
  test('打字時不顯示錯誤，離開欄位後才顯示；沒碰過的欄位不顯示', async () => {
    const { wrapper } = setup()
    await input(wrapper, 'phone').setValue('09')
    expect(wrapper.findAll('.error').length, '使用者還在打字就出現錯誤：要等欄位 blur（touched）或按過送出才顯示').toBe(0)
    expect(input(wrapper, 'phone').attributes('aria-invalid'), '還沒離開欄位，不要標 aria-invalid').toBeUndefined()

    await input(wrapper, 'phone').trigger('blur')
    expect(errorOf(wrapper, 'phone'), '離開手機欄位後，要顯示手機的錯誤').toBe('手機要是 09 開頭的 10 位數字')
    expect(errorOf(wrapper, 'name'), '姓名沒碰過，不能顯示錯誤').toBeNull()
    expect(wrapper.findAll('.error').length, '只有碰過的欄位顯示錯誤').toBe(1)

    await input(wrapper, 'phone').setValue('0912345678')
    expect(errorOf(wrapper, 'phone'), '改成正確的值之後，錯誤要消失，aria-invalid 與 aria-describedby 也要拿掉').toBeNull()
  })

  test('按送出：顯示所有錯誤、不呼叫 submit、焦點移到第一個錯誤欄位', async () => {
    const { wrapper, submit } = setup()
    await input(wrapper, 'name').setValue('王小明')
    await input(wrapper, 'pickupTime').setValue('9點')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(submit, '前端驗證沒過時不要呼叫 submit').not.toHaveBeenCalled()
    expect(errorOf(wrapper, 'phone'), '按過送出後，沒碰過的欄位也要顯示錯誤').toBe('手機要是 09 開頭的 10 位數字')
    expect(errorOf(wrapper, 'pickupTime')).toBe('時間格式要是 HH:mm')
    expect(errorOf(wrapper, 'name'), '姓名填好了，不能有錯誤').toBeNull()
    expect(document.activeElement, '送出失敗要把焦點移到第一個有錯誤的欄位（這裡是手機）：nextTick 之後對它呼叫 focus()').toBe(input(wrapper, 'phone').element)
  })

  test('送出進行中，再觸發 submit 事件不會重送', async () => {
    const pending = deferred()
    const { wrapper, submit } = setup(vi.fn<Submit>(() => pending.promise))
    await fill(wrapper, VALID)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(submit, '送出中又觸發 submit 時呼叫了第二次：按鈕 disabled 只擋得住點按鈕，要在送出函式開頭檢查 submitting 就 return').toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0], '送出的資料不對').toEqual(VALID)
    pending.resolve()
    await flushPromises()
    expect(wrapper.find('.done').exists(), '成功後要顯示「已收到訂單」').toBe(true)
  })

  test('失敗重送沿用同一個冪等鍵，成功後下一筆訂單換新的', async () => {
    const submit = vi.fn<Submit>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(undefined)
    const { wrapper } = setup(submit)
    await fill(wrapper, VALID)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.form-error').exists(), '非 422 的失敗要在 .form-error 顯示表單層級的訊息').toBe(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(submit, '三次嘗試都要真的送出').toHaveBeenCalledTimes(3)
    const keys = submit.mock.calls.map(c => c[1])
    expect(keys[1], '同一筆訂單失敗後重送，冪等鍵要跟第一次一樣：不然第一次其實成功時，伺服器會建立第二筆訂單').toBe(keys[0])
    expect(keys[2], '第三次（成功的那次）也要沿用同一個 key').toBe(keys[0])
    expect(wrapper.find('.form-error').exists(), '成功後要清掉表單層級的錯誤訊息').toBe(false)
    expect((input(wrapper, 'name').element as HTMLInputElement).value, '成功後要清空表單').toBe('')

    await fill(wrapper, { ...VALID, name: '陳美華' })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(4)
    expect(submit.mock.calls[3][1], '下一筆訂單要換新的冪等鍵：沿用舊的 key，伺服器會把它當成重送，直接回第一筆的結果').not.toBe(keys[0])
    expect(wrapper.findAll('.error').length, '成功後清空表單，新的一筆不能一開始就顯示錯誤（touched 與「按過送出」也要重設）').toBe(0)
  })

  test('422：伺服器的欄位錯誤顯示在對應欄位下面，焦點移過去', async () => {
    const submit = vi.fn<Submit>(async () => { throw new ValidationError({ pickupTime: ['這個時段已額滿'], phone: ['這支手機號碼已停用'] }) })
    const { wrapper } = setup(submit)
    await fill(wrapper, VALID)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(errorOf(wrapper, 'phone'), '422 的 fieldErrors.phone 要顯示在手機欄位下面（aria-describedby 指向它）').toBe('這支手機號碼已停用')
    expect(errorOf(wrapper, 'pickupTime'), '422 的 fieldErrors.pickupTime 要顯示在取餐時間下面').toBe('這個時段已額滿')
    expect(errorOf(wrapper, 'name')).toBeNull()
    expect(document.activeElement, '422 之後焦點要移到第一個有錯誤的欄位（依欄位順序是手機）').toBe(input(wrapper, 'phone').element)
    expect(wrapper.find('.form-error').exists(), '422 已經對應到欄位，不需要再顯示籠統的表單錯誤').toBe(false)

    await input(wrapper, 'pickupTime').setValue('11:00')
    expect(errorOf(wrapper, 'pickupTime'), '使用者改了取餐時間，伺服器對舊值的「這個時段已額滿」就要清掉：在欄位的 input 事件裡刪掉那一格的伺服器錯誤').toBeNull()
    expect(errorOf(wrapper, 'phone'), '只清掉被修改的那一格，手機的伺服器錯誤要留著').toBe('這支手機號碼已停用')
  })
})
