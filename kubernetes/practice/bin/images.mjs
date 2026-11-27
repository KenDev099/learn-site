// 建置課程映像 learn-k8s/cafe-api:<tag> 並載入 kind 叢集：node kubernetes/practice/bin/images.mjs
// kind 節點跟主機同平台，所以用 --platform 指定主機的平台、建出單一平台的映像（kind load 遇到多平台 index 可能失敗）
import { join } from 'node:path'
import { dockerBuild, kindLoad, PRACTICE } from '../helpers/k8s.ts'

const app = join(PRACTICE, 'shared', 'cafe-api')
const images = [
  ['v1', { target: 'app', buildArgs: { VERSION: 'v1' } }],
  ['v2', { target: 'app', buildArgs: { VERSION: 'v2' } }],
  ['bad', { target: 'bad' }],
  ['slow-start', { target: 'slow-start' }],
  ['no-sigterm', { target: 'no-sigterm' }],
  ['distroless', { target: 'distroless' }],
]
for (const [tag, opts] of images) {
  console.log(`建置 learn-k8s/cafe-api:${tag}`)
  dockerBuild(app, `learn-k8s/cafe-api:${tag}`, opts)
}
console.log('載入 kind 叢集的每個節點（節點上已經有的會跳過）')
kindLoad(...images.map(([tag]) => `learn-k8s/cafe-api:${tag}`))
