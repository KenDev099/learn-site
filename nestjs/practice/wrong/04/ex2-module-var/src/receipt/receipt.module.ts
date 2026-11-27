import { Module, type DynamicModule } from '@nestjs/common'
import { MODULE_OPTIONS_TOKEN, setOptions, type ReceiptModuleOptions } from './receipt.module-definition.js'
import { ReceiptService } from './receipt.service.js'

@Module({ providers: [ReceiptService], exports: [ReceiptService] })
export class ReceiptModule {
  static register(options: ReceiptModuleOptions): DynamicModule {
    setOptions(options)
    return { module: ReceiptModule, providers: [{ provide: MODULE_OPTIONS_TOKEN, useValue: options }] }
  }

  static registerAsync(options: { imports?: any[]; inject?: any[]; useFactory: (...args: any[]) => Promise<ReceiptModuleOptions> }): DynamicModule {
    return {
      module: ReceiptModule,
      imports: options.imports,
      providers: [{ provide: MODULE_OPTIONS_TOKEN, inject: options.inject, useFactory: async (...args: any[]) => { const o = await options.useFactory(...args); setOptions(o); return o } }],
    }
  }
}
