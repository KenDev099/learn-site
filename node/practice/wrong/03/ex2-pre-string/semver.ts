// 練習 2：npm 判斷「這個版本符不符合範圍」的規則（只做精確版本、^、~）
type Version = { core: [number, number, number], pre: string[] }

function parse(text: string): Version {
  const dash = text.indexOf('-')
  const core = dash === -1 ? text : text.slice(0, dash)
  const pre = dash === -1 ? [] : text.slice(dash + 1).split('.')
  const [major, minor, patch] = core.split('.').map(Number)
  return { core: [major, minor, patch], pre }
}

// 三段數字逐段用「數字」比，不能用字串比（'10' < '9'）
function compareCore(a: number[], b: number[]) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

// prerelease 一段一段比：數字比大小、數字小於英文、英文照字母順序；前面都一樣時段數少的比較小
function comparePre(a: string[], b: string[]) {
  if (!a.length || !b.length) return b.length - a.length   // 沒有 prerelease 的正式版比較大
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    if (a[i] === b[i]) continue
    const an = /^\d+$/.test(a[i]), bn = /^\d+$/.test(b[i])
        if (an !== bn) return an ? -1 : 1
    return a[i] < b[i] ? -1 : 1
  }
  return 0
}

function compare(a: Version, b: Version) {
  return compareCore(a.core, b.core) || comparePre(a.pre, b.pre)
}

export function satisfies(version: string, range: string): boolean {
  const v = parse(version)
  const op = range[0] === '^' || range[0] === '~' ? range[0] : ''
  const base = parse(range.slice(op.length))
  if (op === '') return compare(v, base) === 0

  const [major, minor, patch] = base.core
  const upper = op === '~' ? [major, minor + 1, 0]
    : major > 0 ? [major + 1, 0, 0]
    : minor > 0 ? [0, minor + 1, 0]
    : [0, 0, patch + 1]
  if (compare(v, base) < 0 || compareCore(v.core, upper) >= 0) return false

  // prerelease 只有在範圍本身寫了「同一個 major.minor.patch」的 prerelease 時才算數
  return v.pre.length === 0 || (base.pre.length > 0 && compareCore(v.core, base.core) === 0)
}

export function maxSatisfying(versions: string[], range: string): string | null {
  let best: string | null = null
  for (const v of versions) {
    if (satisfies(v, range) && (best === null || compare(parse(v), parse(best)) > 0)) best = v
  }
  return best
}
