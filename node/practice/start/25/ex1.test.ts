import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { startServer } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const token = () => randomBytes(8).toString('hex')

// 用學習者的 image-server.ts 在暫存資料夾開一份：
//   public/images/          正常的圖片、子資料夾、一個不是圖片的檔案、指到外面的符號連結（一個檔案、一個資料夾）
//   public/images-private/  名稱開頭跟根目錄一樣的資料夾（startsWith 沒加分隔符號就會被讀到）
//   outside/                根目錄之外的祕密
async function start() {
  const code = await readFile(join(import.meta.dirname, 'image-server.ts'), 'utf8')
  const dir = await tmpProject({ 'image-server.ts': code })
  const images = join(dir, 'public', 'images')
  await mkdir(join(images, 'seasonal'), { recursive: true })
  await mkdir(join(dir, 'public', 'images-private'))
  await mkdir(join(dir, 'outside'))
  const files = { latte: token(), menu: token(), pumpkin: token(), notes: token(), privateJpg: token(), secretJpg: token(), secretTxt: token() }
  await writeFile(join(images, 'latte.jpg'), files.latte)
  await writeFile(join(images, 'menu.png'), files.menu)
  await writeFile(join(images, 'seasonal', 'pumpkin.webp'), files.pumpkin)
  await writeFile(join(images, 'notes.txt'), files.notes)
  await writeFile(join(dir, 'public', 'images-private', 'recipe.jpg'), files.privateJpg)
  await writeFile(join(dir, 'outside', 'secret.jpg'), files.secretJpg)
  await writeFile(join(dir, 'secret.txt'), files.secretTxt)
  await symlink(join(dir, 'outside', 'secret.jpg'), join(images, 'evil.jpg'))
  await symlink(join(dir, 'outside'), join(images, 'linked'))   // 資料夾的符號連結：檔案本身不是連結，路徑上的資料夾才是
  const server = await startServer(join(dir, 'image-server.ts'), { cwd: dir })
  return { server, files, dir }
}

// 用 node:net 送原始的請求列：fetch、URL 會先把 ../ 正規化掉，就測不到伺服器了
function rawGet(port: number, path: string): Promise<{ status: number, type: string, body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`)
    })
    let data = ''
    socket.setEncoding('latin1')
    socket.on('data', d => { data += d })
    socket.on('error', reject)
    socket.setTimeout(3_000, () => { socket.destroy(); reject(new Error(`GET ${path} 3 秒內沒有回應`)) })
    socket.on('end', () => {
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)
      const type = /\r\ncontent-type: ([^\r]*)/i.exec(data)?.[1] ?? ''
      resolve({ status, type, body: data.slice(data.indexOf('\r\n\r\n') + 4) })
    })
  })
}

test('正常的圖片回 200、內容正確、Content-Type 正確（子資料夾、查詢字串也可以）', opts, async () => {
  const { server, files } = await start()
  const cases: [string, string, string][] = [
    ['/images/latte.jpg', files.latte, 'image/jpeg'],
    ['/images/menu.png?v=3', files.menu, 'image/png'],
    ['/images/seasonal/pumpkin.webp', files.pumpkin, 'image/webp'],
    ['/images/seasonal%2Fpumpkin.webp', files.pumpkin, 'image/webp'],
  ]
  for (const [path, body, type] of cases) {
    const r = await rawGet(server.port, path)
    assert.equal(r.status, 200, `GET ${path} 是根目錄裡的圖片，要回 200（不要把正常的路徑也擋掉）`)
    assert.ok(r.body.includes(body), `GET ${path} 要回傳那個檔案的內容`)
    assert.equal(r.type, type, `GET ${path} 的 Content-Type 要是 ${type}`)
  }
})

test('跑出根目錄的路徑全部 404，回應裡沒有外面檔案的內容', opts, async () => {
  const { server, files, dir } = await start()
  const attacks: [string, string, string][] = [
    ['/images/../../outside/secret.jpg', files.secretJpg, '原始的 ../'],
    ['/images/..%2F..%2Foutside%2Fsecret.jpg', files.secretJpg, '..%2F：decodeURIComponent 之後才出現 ../，join 不會擋'],
    ['/images/%2e%2e%2f%2e%2e%2foutside%2fsecret.jpg', files.secretJpg, '%2e%2e%2f：點和斜線都編碼'],
    ['/images/..%2Fimages-private%2Frecipe.jpg', files.privateJpg, 'public/images-private：startsWith(root) 要加上路徑分隔符號'],
    ['/images/..%5C..%5Coutside%5Csecret.jpg', files.secretJpg, '反斜線：Windows 的分隔符號'],
    ['/images/evil.jpg', files.secretJpg, '符號連結指到根目錄外：先 realpath 再比對'],
    ['/images/linked/secret.jpg', files.secretJpg, 'linked 是指到根目錄外的資料夾符號連結：只用 lstat 檢查最後的檔案不夠，要 realpath 整條路徑再比對'],
  ]
  // 絕對路徑：解碼後變成 /…/outside/secret.jpg，resolve 會直接用它
  attacks.push([`/images/${encodeURIComponent(join(dir, 'outside', 'secret.jpg'))}`, files.secretJpg, '解碼後是絕對路徑'])
  for (const [path, secret, why] of attacks) {
    const r = await rawGet(server.port, path)
    assert.ok(!r.body.includes(secret), `GET ${path} 讀到了根目錄外的檔案（${why}）`)
    assert.equal(r.status, 404, `GET ${path} 要回 404（${why}），這次是 ${r.status}`)
  }
})

test('不是 .jpg／.png／.webp、NUL 字元、壞掉的編碼都回 404，伺服器不會掛掉', opts, async () => {
  const { server, files } = await start()
  const notes = await rawGet(server.port, '/images/notes.txt')
  assert.equal(notes.status, 404, 'notes.txt 在根目錄裡，但不是圖片：只允許 .jpg、.png、.webp（白名單）')
  assert.ok(!notes.body.includes(files.notes), 'notes.txt 的內容被送出去了')
  const nul = await rawGet(server.port, '/images/latte.jpg%00.png')
  assert.equal(nul.status, 404, '檔名裡有 NUL 字元（%00）要回 404')
  const bad = await rawGet(server.port, '/images/%E0%A4%A.jpg').catch(() => ({ status: 0 }))
  assert.equal(bad.status, 404, '/images/%E0%A4%A.jpg 是壞掉的百分比編碼：decodeURIComponent 會丟 URIError，要 catch 起來回 404，不能讓伺服器掛掉')
  const after = await rawGet(server.port, '/images/latte.jpg').catch(() => ({ status: 0 }))
  assert.equal(after.status, 200, '送過攻擊字串之後，正常的圖片還要能拿到（伺服器不能掛掉）')
})
