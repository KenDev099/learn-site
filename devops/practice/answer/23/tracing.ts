// 練習 2：OpenTelemetry 的設定，api.ts 和 kitchen.ts 啟動時各呼叫一次
import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

export function setupTracing(serviceName: string): TracerProvider {
  // 1. 用 AsyncLocalStorage 記住「現在是哪個 span」，await 之後也找得回來
  context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  // 2. 用 W3C 的 traceparent 標頭跨服務傳遞
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  // 3. span 收集起來分批送到 OTLP/HTTP（網址讀 OTEL_EXPORTER_OTLP_ENDPOINT，沒設是 http://localhost:4318）
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
  })
  trace.setGlobalTracerProvider(provider)
  return provider
}
