// 計算每個元件（依 __name，也就是 .vue 的檔名）掛載與更新的次數（第 23 課）
// 用法：const counter = countUpdates(); mount(App, { global: { mixins: [counter.mixin] } }); counter.updated('OrderRow')
import type { ComponentOptions } from 'vue'

export function countUpdates() {
  const mounted = new Map<string, number>()
  const updated = new Map<string, number>()
  const bump = (m: Map<string, number>, name?: string) => { if (name) m.set(name, (m.get(name) ?? 0) + 1) }
  const mixin: ComponentOptions = {
    mounted() { bump(mounted, this.$.type.__name ?? this.$.type.name) },
    updated() { bump(updated, this.$.type.__name ?? this.$.type.name) },
  }
  return {
    mixin,
    mounted: (name: string) => mounted.get(name) ?? 0,
    updated: (name: string) => updated.get(name) ?? 0,
    reset() { mounted.clear(); updated.clear() },
  }
}
