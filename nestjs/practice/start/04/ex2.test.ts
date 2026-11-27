// 練習 2：用 ConfigurableModuleBuilder 做出可設定的 ReceiptModule
import { describe, expect, it } from 'vitest'
import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ReceiptModule } from './src/receipt/receipt.module.js'
import { ReceiptService } from './src/receipt/receipt.service.js'

const definition: Record<string, any> = await import('./src/receipt/receipt.module-definition.js')
const M = ReceiptModule as any
const order = { productId: 2, name: '拿鐵', quantity: 3, unitPrice: 110, total: 330 }

async function build(module: unknown) {
  return Test.createTestingModule({ imports: [module as any] }).compile()
}

describe('練習 2：ReceiptModule.register 與 registerAsync', () => {
  it('receipt.module-definition.ts export MODULE_OPTIONS_TOKEN，ReceiptModule 有 register 與 registerAsync', () => {
    expect(definition.MODULE_OPTIONS_TOKEN, 'receipt.module-definition.ts 要 export ConfigurableModuleBuilder 產生的 MODULE_OPTIONS_TOKEN').toBeDefined()
    expect(typeof M.register, 'ReceiptModule 要有 register()：讓它 extends ConfigurableModuleBuilder 產生的 ConfigurableModuleClass').toBe('function')
    expect(typeof M.registerAsync, 'ReceiptModule 要有 registerAsync()').toBe('function')
    expect(typeof definition.ConfigurableModuleClass, 'receipt.module-definition.ts 要 export ConfigurableModuleBuilder 產生的 ConfigurableModuleClass').toBe('function')
    expect(M.prototype instanceof definition.ConfigurableModuleClass, 'ReceiptModule 要 extends ConfigurableModuleClass，register／registerAsync 由 ConfigurableModuleBuilder 產生，不要自己手寫').toBe(true)
  })

  it('register 的設定透過 MODULE_OPTIONS_TOKEN 注入', async () => {
    expect(typeof M.register, '先讓 ReceiptModule 有 register()').toBe('function')
    const options = { shopName: '小明咖啡 信義店' }
    const ref = await build(M.register(options))
    expect(ref.get(definition.MODULE_OPTIONS_TOKEN, { strict: false }), '用 MODULE_OPTIONS_TOKEN 拿到的要是傳給 register 的設定').toEqual(options)
  })

  it('render 照格式產生收據；沒有 footer 就不印那一行', async () => {
    expect(typeof M.register, '先讓 ReceiptModule 有 register()').toBe('function')
    const plain = (await build(M.register({ shopName: '小明咖啡' }))).get(ReceiptService)
    expect(plain.render(order), '格式：店名、品項 x數量 小計、合計 金額，用 \\n 連接').toBe('小明咖啡\n拿鐵 x3 330\n合計 330')
    const withFooter = (await build(M.register({ shopName: '小明咖啡', footer: '謝謝光臨' }))).get(ReceiptService)
    expect(withFooter.render({ ...order, name: '可頌', quantity: 2, unitPrice: 70, total: 140 }), '有 footer 時加在最後一行').toBe('小明咖啡\n可頌 x2 140\n合計 140\n謝謝光臨')
  })

  it('兩個模組用不同設定註冊，各自的 ReceiptService 印出自己的店名', async () => {
    expect(typeof M.register, '先讓 ReceiptModule 有 register()').toBe('function')
    const a = (await build(M.register({ shopName: '信義店' }))).get(ReceiptService)
    const b = (await build(M.register({ shopName: '板橋店' }))).get(ReceiptService)
    const msg = '設定要從注入的 options 讀：寫在模組層級的變數或 process.env，兩次註冊會互相蓋掉'
    expect(a.render(order).split('\n')[0], msg).toBe('信義店')
    expect(b.render(order).split('\n')[0], msg).toBe('板橋店')
  })

  it('registerAsync({ imports, inject, useFactory }) 可以從別的 provider 算出設定', async () => {
    expect(typeof M.registerAsync, '先讓 ReceiptModule 有 registerAsync()').toBe('function')
    @Injectable() class ShopSettings { name = '非同步分店' }
    @Module({ providers: [ShopSettings], exports: [ShopSettings] }) class SettingsModule {}
    const ref = await build(M.registerAsync({
      imports: [SettingsModule],
      inject: [ShopSettings],
      useFactory: async (s: ShopSettings) => ({ shopName: s.name, footer: '下次見' }),
    }))
    expect(ref.get(ReceiptService).render(order), 'registerAsync 用 useFactory 回傳的設定').toBe('非同步分店\n拿鐵 x3 330\n合計 330\n下次見')
  })
})
