// 練習 2：你寫的 test/orders.e2e-spec.ts 要抓到每一個改壞的版本
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

// 只帶這一題的 spec，別的 spec 還沒寫完也不影響
function stage(spec: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learn-nest10-'))
  cpSync(import.meta.dirname, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) && (!/\.(e2e-)?spec\.ts$/.test(f) || f.endsWith('/' + spec)) })
  return dir
}

// 判分時把真的 PaymentGateway 換成「被呼叫就留下記號、然後失敗」的版本：
// 不連網路，也抓得到「某個測試沒有換掉金流」（例如金流失敗的測試直接用真的金流讓它連不上）
function trapGateway(dir: string) {
  const marker = join(dir, 'REAL_GATEWAY_CALLED')
  writeFileSync(join(dir, 'src/payments/payment.gateway.ts'), `import { Injectable } from '@nestjs/common'
import { writeFileSync } from 'node:fs'
export type Charge = { chargeId: string }
@Injectable()
export class PaymentGateway {
  async charge(_amount: number, _reference: string): Promise<Charge> {
    writeFileSync(${JSON.stringify(marker)}, '')
    throw new Error('判分時不連真的金流')
  }
}
`)
  return marker
}

const swap = (file: string, from: string | RegExp, to: string) => ({ [file]: (code: string) => {
  const changed = code.replace(from, to)
  if (changed === code) throw new Error(`${file} 裡找不到「${from}」：這一題只寫測試，不要改 ${file}（練習 1 的 configureApp 要用 app.setGlobalPrefix('api')）`)
  return changed
} })

describe('練習 2：POST /api/orders 的 e2e 測試', () => {
  it('你的測試抓得到每一個改壞的版本', () => {
    const dir = stage('orders.e2e-spec.ts')
    try {
      expect(existsSync(join(dir, 'test/orders.e2e-spec.ts')), '找不到 test/orders.e2e-spec.ts').toBe(true)
      expect(existsSync(join(dir, 'src/app.setup.ts')), '先做練習 1：src/app.setup.ts 的 configureApp').toBe(true)
      const marker = trapGateway(dir)
      let r: ReturnType<typeof runMutants> | undefined, error: unknown
      try { r = runMutants(dir, {
        '成功時回 200 而不是 201': { 'src/orders/orders.controller.ts': (code: string) =>
          swap('src/orders/orders.controller.ts', '  @Post()\n', '  @Post()\n  @HttpCode(200)\n')['src/orders/orders.controller.ts'](code)
            .replace('import { Body, Controller, Post }', 'import { Body, Controller, HttpCode, Post }') },
        '庫存不足變成 400': swap('src/filters/domain-exception.filter.ts', 'OUT_OF_STOCK: 409', 'OUT_OF_STOCK: 400'),
        '金流失敗變成 500（沒包成 PaymentFailedError）': swap('src/orders/orders.service.ts', 'throw new PaymentFailedError(err)', 'throw err'),
        '金流失敗回 502 但 errorCode 不對': {
          ...swap('src/errors/domain-errors.ts', "readonly code = 'PAYMENT_FAILED'", "readonly code = 'PAYMENT_ERROR'"),
          ...swap('src/filters/domain-exception.filter.ts', 'PAYMENT_FAILED: 502', 'PAYMENT_ERROR: 502'),
        },
        '沒有全域前綴': swap('src/app.setup.ts', /app\.setGlobalPrefix\([^)]*\)/, 'void 0'),
        '沒有全域 ValidationPipe': swap('src/app.module.ts', /\{\s*provide: APP_PIPE,[\s\S]*?\}\),\s*\},/, ''),
      }) } catch (e) { error = e }
      expect(existsSync(marker), '你的測試呼叫了真的 PaymentGateway（會連外部的金流 API、真的扣款）。每個測試建 app 時都要 .overrideProvider(PaymentGateway).useValue(替身)，金流失敗也用替身的 mockRejectedValue 製造').toBe(false)
      if (!r) throw error
      expect(r.survived, `沒抓到的版本：${r.survived.join('、')}。這些故意改壞的程式，你的測試都沒有失敗。斷言要寫確切的狀態碼與 errorCode（不要 toBeLessThan(500)），測試的 app 要呼叫 configureApp、打 /api/orders；只換金流，OrdersService、ProductsService 要用真的`).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
