import { Module, type DynamicModule } from '@nestjs/common'
import { MODULE_OPTIONS_TOKEN, type ReceiptModuleOptions } from './receipt.module-definition.js'
import { ReceiptService } from './receipt.service.js'

// 錯：自己手寫 register／registerAsync，沒有用 ConfigurableModuleBuilder 產生的 ConfigurableModuleClass
@Module({ providers: [ReceiptService], exports: [ReceiptService] })
export class ReceiptModule {
  static register(options: ReceiptModuleOptions): DynamicModule {
    return { module: ReceiptModule, providers: [{ provide: MODULE_OPTIONS_TOKEN, useValue: options }] }
  }

  static registerAsync(options: { imports?: any[]; inject?: any[]; useFactory: (...args: any[]) => Promise<ReceiptModuleOptions> }): DynamicModule {
    return {
      module: ReceiptModule,
      imports: options.imports,
      providers: [{ provide: MODULE_OPTIONS_TOKEN, inject: options.inject, useFactory: options.useFactory }],
    }
  }
}
