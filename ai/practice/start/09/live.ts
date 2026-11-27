// 用真的 embedding 跑一次（選用，不影響判分）。先做完練習 1～3，在 ai/practice 執行：
//   node --env-file-if-exists=.env work/09/live.ts
// .env 裡有 VOYAGE_API_KEY 就用 Voyage AI 的 voyage-4（1024 維，費用很低，見 Voyage 定價頁）；沒有就退回 toyEmbed（64 維，只看字面）
import { readFileSync } from 'node:fs'
import { openVectorDb } from '../../helpers/pg.ts'
import { DOCS } from '../../helpers/coffee.ts'
import { toyEmbed } from '../../helpers/toy-embed.ts'
import { upsertDoc, type ChunkInput } from './ex2.ts'
import { search } from './ex3.ts'

const key = process.env.VOYAGE_API_KEY
const model = key ? 'voyage-4' : 'toy-64'
const dim = key ? 1024 : 64
if (!key) console.log('沒有 VOYAGE_API_KEY：改用 toyEmbed（不懂語意，只比字面）\n')

async function voyage(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const res = await fetch('https://ai.mongodb.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: texts, model: 'voyage-4', input_type: inputType }),
  })
  if (!res.ok) throw new Error(`Voyage API ${res.status}：${await res.text()}`)
  const json = await res.json() as { data: Array<{ embedding: number[]; index: number }> }
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}
const embed = (inputType: 'document' | 'query') => async (texts: string[]) =>
  key ? voyage(texts, inputType) : texts.map(t => toyEmbed(t, dim))

// 簡單切塊：每個 ## 小節一塊（第 8 課的 chunkMarkdown 做得更完整）；只收店家自己寫的文件
const db = await openVectorDb({ seed: false })
await db.exec(readFileSync(new URL('./ex1.sql', import.meta.url), 'utf8').replace('vector(64)', `vector(${dim})`))
for (const doc of DOCS.filter(d => d.trust === 'official')) {
  const chunks: ChunkInput[] = doc.markdown.split(/^## /m).slice(1).map((section, seq) => {
    const [heading, ...body] = section.split('\n')
    return { seq, headingPath: [doc.title, heading.trim()], content: body.join('\n').trim() }
  })
  const r = await upsertDoc(db, doc.id, chunks, embed('document'), model)
  console.log(`${doc.id}：${chunks.length} 塊，重算 ${r.embedded} 塊`)
}

for (const q of ['起司蛋糕有堅果嗎', '星期天幾點開', '咖啡可以換植物奶嗎', '集點怎麼算']) {
  const [v] = await embed('query')([q])
  const hits = await search(db, v, { k: 3 })
  console.log(`\n問：${q}`)
  for (const h of hits) console.log(`  ${h.score.toFixed(3)}  ${h.docId}#${h.seq}  ${h.content.split('\n')[0]}`)
}
await db.close()
