// 錯誤寫法：把 SDL 一行一行比對，不用 findSchemaChanges
export type CheckResult = { ok: boolean, breaking: string[], unusedRemovals: string[] }

const fields = (sdl: string) => new Set([...sdl.matchAll(/type (\w+) \{([^}]*)\}/g)].flatMap(([, type, body]) =>
  [...body.matchAll(/(\w+)(\([^)]*\))?: ([\w!\[\]]+)/g)].map(([, name, args, t]) => `${type}.${name}${args ?? ''}: ${t}`)))

export function checkSchema(oldSdl: string, newSdl: string, operations: string[]): CheckResult {
  const before = fields(oldSdl), after = fields(newSdl)
  const text = operations.join(' ')
  const breaking: string[] = [], unusedRemovals: string[] = []
  for (const line of before) {
    if (after.has(line)) continue
    const coord = line.split(/[(:]/)[0]
    const field = coord.split('.')[1]
    const stillThere = [...after].some(l => l.startsWith(coord + ':') || l.startsWith(coord + '('))
    if (!stillThere && !new RegExp(`\\b${field}\\b`).test(text)) unusedRemovals.push(coord)
    else breaking.push(line)
  }
  return { ok: breaking.length === 0, breaking, unusedRemovals: unusedRemovals.sort() }
}
