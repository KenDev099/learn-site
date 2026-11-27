import { describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { useCouponCheck } from './useCouponCheck.ts'

function setup() {
  vi.useFakeTimers()
  const calls: { code: string; signal: AbortSignal; d: Deferred<boolean> }[] = []
  const check = vi.fn((code: string, { signal }: { signal: AbortSignal }) => {
    const d = deferred<boolean>()
    calls.push({ code, signal, d })
    return d.promise
  })
  const code = ref('')
  const scope = effectScope()
  const { status } = scope.run(() => useCouponCheck(code, check))!
  return { code, check, calls, status, scope }
}

// 模擬使用者一個字一個字打，每個字間隔 gap 毫秒
async function typeSlowly(code: { value: string }, text: string, gap = 100) {
  for (let i = 1; i <= text.length; i++) {
    code.value = text.slice(0, i)
    await vi.advanceTimersByTimeAsync(gap)
  }
}

describe('練習 3：useCouponCheck 防抖並丟棄過期的結果', () => {
  test('連續輸入只在停下來 400ms 後檢查一次', async () => {
    const { code, check, calls, status } = setup()
    await typeSlowly(code, 'LATTE10')
    expect(check, '每打一個字就呼叫了 check：要等停止輸入 400ms（用 setTimeout，輸入改變時清掉舊的計時器）').not.toHaveBeenCalled()
    expect(status.value, '輸入後、還沒有結果時，status 要是 checking').toBe('checking')
    await vi.advanceTimersByTimeAsync(299)
    expect(check, '還沒滿 400ms 不能呼叫').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check, '停止輸入 400ms 後要呼叫一次').toHaveBeenCalledTimes(1)
    expect(calls[0].code, '要檢查最後的完整輸入').toBe('LATTE10')
    calls[0].d.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, 'check 回 true 時 status 要是 valid').toBe('valid')
  })

  test('較早的請求較晚回來，不能蓋掉新的結果', async () => {
    const { code, calls, status } = setup()
    code.value = 'LATTE10'
    await vi.advanceTimersByTimeAsync(400)
    code.value = 'XMAS'
    await nextTick()
    expect(status.value, '輸入改變後要立刻變回 checking，不能停在上一個碼的狀態').toBe('checking')
    await vi.advanceTimersByTimeAsync(400)
    expect(calls.map(c => c.code)).toEqual(['LATTE10', 'XMAS'])
    expect(calls[0].signal.aborted, '輸入改變後，舊的請求要 abort（onWatcherCleanup 裡呼叫 controller.abort()）').toBe(true)
    calls[1].d.resolve(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value).toBe('invalid')
    calls[0].d.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, 'LATTE10 的舊結果較晚回來，把 XMAS 的結果蓋掉了：寫入前要確認這個請求沒有過期（signal.aborted）').toBe('invalid')
  })

  test('清空輸入回到 idle，不呼叫 check；錯誤時是 error', async () => {
    const { code, check, calls, status } = setup()
    code.value = '   '
    await vi.advanceTimersByTimeAsync(1000)
    expect(check, '只有空白時不要呼叫 check').not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
    code.value = 'BAD'
    await vi.advanceTimersByTimeAsync(400)
    calls[0].d.reject(new Error('網路錯誤'))
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, 'check 丟錯時 status 要是 error').toBe('error')
    code.value = 'BAD2'
    await vi.advanceTimersByTimeAsync(400)
    code.value = ''
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, '清空輸入要回到 idle').toBe('idle')
    expect(calls[1].signal.aborted, '清空時，進行中的請求要 abort').toBe(true)
    calls[1].d.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, '清空後，舊請求的結果不能把 status 改掉').toBe('idle')
  })

  test('scope 停止後清掉計時器、中止請求', async () => {
    const { code, check, calls, status, scope } = setup()
    code.value = 'LATTE10'
    await vi.advanceTimersByTimeAsync(400)
    code.value = 'XMAS'
    await vi.advanceTimersByTimeAsync(100)
    scope.stop()
    expect(vi.getTimerCount(), '停止後還留著計時器：清理函式裡要 clearTimeout').toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(check, '停止後不能再呼叫 check').toHaveBeenCalledTimes(1)
    expect(calls[0].signal.aborted, '停止時，進行中的請求要 abort').toBe(true)
    calls[0].d.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value, '停止後 status 不能再改變').toBe('checking')
  })
})
