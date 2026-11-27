// 伺服器渲染與 hydration（第 24 課、期末專題）
// serverRender：渲染時把 window、document 拿掉，模擬伺服器上沒有瀏覽器 API
// hydrate：把 HTML 放進容器，用 createSSRApp 接手，收集 Vue 的警告（hydration 不一致會出現在 warnings）
import { createSSRApp, type App, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { vi } from 'vitest'

type Props = Record<string, unknown>

export async function serverRender(component: Component, props?: Props, setup?: (app: App) => void): Promise<string> {
  const app = createSSRApp(component, props)
  setup?.(app)
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('document', undefined)
  try {
    return await renderToString(app)
  } finally {
    vi.unstubAllGlobals()
  }
}

export function hydrate(html: string, component: Component, props?: Props, setup?: (app: App) => void) {
  const warnings: string[] = []
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  const app = createSSRApp(component, props)
  app.config.warnHandler = msg => { warnings.push(msg) }
  setup?.(app)
  app.mount(container)
  return { app, container, warnings }
}
