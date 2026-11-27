// 在 Worker 裡跑 PGlite（瀏覽器的 module Worker 或 Node 的 worker_threads）。
// 等鎖時 PGlite 會永遠卡住、lock_timeout 也不會觸發，所以由 lab.js 的看門狗逾時後直接 terminate 這個 Worker。
// 訊息：{ id, op, ... } → { id, value } 或 { id, error }，都附上這次收到的 notices／通知（msgs）
const port = globalThis.self ?? (await import('node:worker_threads')).parentPort
const listen = f => port.on ? port.on('message', f) : port.addEventListener('message', e => f(e.data))

// 時間型別保留 PostgreSQL 的原始文字
const parsers = { 1082: v => v, 1083: v => v, 1114: v => v, 1184: v => v, 1186: v => v }
let db, msgs = []
const onNotice = n => msgs.push(`${n.severity}: ${n.message}${n.detail ? '\n' + n.detail : ''}`)
const plain = r => ({ rows: r.rows, fields: r.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })), rowCount: r.rowCount, command: r.command })
const flush = () => db.exec('SELECT pg_stat_force_next_flush()').catch(() => {})

const ops = {
  // base：PGlite dist 資料夾的網址（瀏覽器是 CDN，Node 是 tests/node_modules）
  async create({ base, seed, seedAfter, extensions, twoPc }) {
    const { PGlite } = await import(base + 'index.js')
    const ext = {}
    for (const name of (extensions ?? '').split(/[\s,]+/).filter(Boolean)) ext[name] = (await import(`${base}contrib/${name}.js`))[name]
    db = await PGlite.create({
      parsers,
      extensions: ext,
      ...(twoPc && { startParams: [...PGlite.defaultStartParams, '-c', 'max_prepared_transactions=10'] }),
    })
    db.onNotification((channel, payload) => msgs.push(`收到通知 ${channel}：${payload}`))
    await db.exec("SET TIME ZONE 'Asia/Taipei';" + (seed ?? ''))
    // seed-after：用只有 --;; 的一行分段，每段各自一次 exec（VACUUM 這類不能和別的句子放在一起）
    for (const part of (seedAfter ?? '').split(/^--;;[ \t]*$/m)) {
      if (!part.trim()) continue
      try { await db.exec(part) } catch (e) {
        if (!part.trimStart().startsWith('-- may fail')) throw e
        console.warn('seed-after（may fail）:', e.message)
      }
    }
    await flush()
    msgs = []
    return (await db.query('SHOW server_version')).rows[0].server_version
  },
  async exec({ sql, rowMode, stats }) {
    const res = (await db.exec(sql, { rowMode, onNotice })).map(plain)
    if (stats) await flush()
    return res
  },
  query: async ({ sql, params, rowMode }) => plain(await db.query(sql, params, { rowMode, onNotice })),
  inTx: () => db.isInTransaction(),
}

listen(async ({ id, op, ...args }) => {
  try {
    const value = await ops[op](args)
    port.postMessage({ id, value, msgs })
  } catch (e) {
    port.postMessage({ id, error: { message: e.message, code: e.code, detail: e.detail, hint: e.hint }, msgs })
  }
  msgs = []
})
