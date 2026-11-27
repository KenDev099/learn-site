// 把物件連同裡面每一層都凍結：元件如果偷改 props／model，嚴格模式下會丟 TypeError
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}
