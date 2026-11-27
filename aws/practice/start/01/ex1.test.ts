// 練習 1：whoami.sh 先確認帳號，帳號對了才查可用區
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { EC2Client, DescribeAvailabilityZonesCommand } from '@aws-sdk/client-ec2'
import { awsVerb, client, isReadOnly, requireMoto, runCli, session, spyAws, type Session } from '../../helpers/aws.ts'

const dir = import.meta.dirname
let sess: Session
before(async () => { await requireMoto(); sess = await session(dir) })

// 用 SDK 查出某個 region 的可用區，當作標準答案
async function zones(region: string): Promise<string[]> {
  const ec2 = client(EC2Client, sess, { region })
  const r = await ec2.send(new DescribeAvailabilityZonesCommand({}))
  return r.AvailabilityZones!.map(z => `${z.ZoneName} ${z.ZoneId}`)
}

function run(expected: string, region?: string) {
  const spy = spyAws()
  try {
    const r = runCli(dir, 'whoami.sh', [expected], sess, { env: { ...spy.env, ...(region ? { AWS_REGION: region } : {}) } })
    return { ...r, calls: spy.calls() }
  } finally { spy.cleanup() }
}

test('帳號正確時：第 1 行是帳號 ID，之後每個可用區一行「名稱 AZ-ID」', async () => {
  const r = run(sess.account)
  assert.equal(r.code, 0, `帳號正確時要以 0 結束，實際是 ${r.code}：${r.stderr}`)
  const lines = r.stdout.split('\n')
  assert.equal(lines[0], sess.account, `第 1 行要是 aws sts get-caller-identity 查到的帳號 ID（${sess.account}），實際是 ${JSON.stringify(lines[0])}`)
  assert.deepEqual(lines.slice(1), await zones('ap-northeast-1'), '第 2 行開始每行一個可用區，格式是「ap-northeast-1a apne1-az4」（名稱、空白、AZ ID），順序照 describe-availability-zones 回傳的')
  assert.ok(r.calls.some(a => awsVerb(a).join(' ') === 'sts get-caller-identity'), '帳號要用 aws sts get-caller-identity 即時查，不能直接印出參數')
  assert.deepEqual(r.calls.filter(a => !isReadOnly(a)).map(a => a.join(' ')), [], '這個腳本只能讀，不能建立或修改任何東西')
})

test('region 換成 us-east-1 時，可用區跟著換（不能寫死 region）', async () => {
  const r = run(sess.account, 'us-east-1')
  assert.equal(r.code, 0, `應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  assert.deepEqual(r.stdout.split('\n').slice(1), await zones('us-east-1'), 'AWS_REGION=us-east-1 時要印出 us-east-1 的可用區：不要在指令裡寫 --region，讓 CLI 用設定的 region')
})

test('帳號不對時：印錯誤到 stderr、以 1 結束，而且查完帳號就停', () => {
  const r = run('999999999999')
  assert.equal(r.code, 1, `預期帳號是 999999999999、實際是 ${sess.account}，要 exit 1，實際是 ${r.code}`)
  assert.ok(r.stderr.length > 0, '要把錯誤訊息印到 stderr（echo "…" >&2），讓人知道為什麼停下來')
  assert.equal(r.stdout, '', '帳號不對時 stdout 不能印任何東西')
  const after = r.calls.filter(a => awsVerb(a).join(' ') !== 'sts get-caller-identity')
  assert.deepEqual(after.map(a => a.join(' ')), [], '帳號不對時，除了 sts get-caller-identity 以外不能再呼叫任何 aws 指令：先檢查，再動手')
})
