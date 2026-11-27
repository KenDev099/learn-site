import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface ReceiptModuleOptions {
  shopName: string
  footer?: string
}

// 一次產生 ReceiptModule.register() 與 registerAsync()，以及注入設定用的 token
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ReceiptModuleOptions>().build()
