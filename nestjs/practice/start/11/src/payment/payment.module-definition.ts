import { ConfigurableModuleBuilder } from '@nestjs/common'

export interface PaymentModuleOptions {
  apiKey?: string   // 金流的 API 金鑰（secret）；本機沒有就用假的付款流程
  baseUrl: string
}

// 第 4 課：一次產生 PaymentModule.register() 與 registerAsync()
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<PaymentModuleOptions>().build()
