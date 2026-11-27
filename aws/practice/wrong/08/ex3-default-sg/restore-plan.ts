// 練習 3：誤刪資料後，把 RDS 還原到某個時間點：檢查時間範圍、還原成新的執行個體、沿用原本的網路與參數設定
import { DescribeDBInstancesCommand, RDSClient, RestoreDBInstanceToPointInTimeCommand } from '@aws-sdk/client-rds'

const DAY = 24 * 60 * 60 * 1000

export async function restoreToPoint(rds: RDSClient, sourceId: string, time: Date): Promise<{ id: string, endpoint: string }> {
  const { DBInstances = [] } = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: sourceId }))
  const src = DBInstances[0]
  const retention = src.BackupRetentionPeriod ?? 0
  if (retention === 0) throw new Error(`${sourceId} 沒有開自動備份（BackupRetentionPeriod 是 0），不能還原到時間點`)

  const latest = src.LatestRestorableTime!.getTime()
  const earliest = Math.max(src.InstanceCreateTime!.getTime(), latest - retention * DAY)
  const t = time.getTime()
  if (t < earliest || t > latest) {
    throw new RangeError(`只能還原到 ${new Date(earliest).toISOString()} ～ ${new Date(latest).toISOString()} 之間`)
  }

  // 一律用 UTC：toISOString() 是 2026-11-20T06:05:00.000Z → 202611200605
  const id = `${sourceId}-pitr-${time.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
  const r = await rds.send(new RestoreDBInstanceToPointInTimeCommand({
    SourceDBInstanceIdentifier: sourceId,
    TargetDBInstanceIdentifier: id,          // 還原一定是新的執行個體，原本那台不動
    RestoreTime: time,
    DBInstanceClass: src.DBInstanceClass,
    DBSubnetGroupName: src.DBSubnetGroup?.DBSubnetGroupName,
    // 不指定的話，新執行個體用 VPC 的預設安全群組與預設參數群組

    DBParameterGroupName: src.DBParameterGroups?.[0]?.DBParameterGroupName,
    PubliclyAccessible: false,
  }))
  return { id, endpoint: r.DBInstance!.Endpoint!.Address! }
}
