// 練習 2：OpenTelemetry 的設定，api.ts 和 kitchen.ts 啟動時各呼叫一次
// 要做的事（看課程頁的練習 2）：
// 1. context manager：AsyncLocalStorageContextManager（@opentelemetry/context-async-hooks）
// 2. propagator：W3CTraceContextPropagator（@opentelemetry/core）
// 3. TracerProvider（@opentelemetry/sdk-trace）：resource 的 service.name 是 serviceName，
//    spanProcessors 用 BatchSpanProcessor 接 OTLPTraceExporter（@opentelemetry/exporter-trace-otlp-http）
// 4. 註冊成全域的 TracerProvider
import { TracerProvider } from '@opentelemetry/sdk-trace'

export function setupTracing(serviceName: string): TracerProvider {
  const provider = new TracerProvider()
  return provider
}
