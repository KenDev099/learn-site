// 練習 3：誤刪資料後，把 RDS 還原到某個時間點：檢查時間範圍、還原成新的執行個體、沿用原本的網路與參數設定
import { RDSClient } from '@aws-sdk/client-rds'

export async function restoreToPoint(rds: RDSClient, sourceId: string, time: Date): Promise<{ id: string, endpoint: string }> {
  // 1. DescribeDBInstances 讀來源：BackupRetentionPeriod 是 0（沒開自動備份）就丟錯
  // 2. 可還原範圍：最晚是 LatestRestorableTime；最早是「建立時間」與「LatestRestorableTime 往前推保留天數」較晚的那個
  //    time 不在範圍內就丟 RangeError
  // 3. 新名稱：<sourceId>-pitr-<UTC 的 年月日時分>，例如 cafe-db-pitr-202611200605
  // 4. RestoreDBInstanceToPointInTime：RestoreTime 用 time；沿用來源的 DBInstanceClass、DBSubnetGroupName、
  //    VpcSecurityGroupIds、DBParameterGroupName；PubliclyAccessible: false
  // 5. 回傳 { id, endpoint }（endpoint 是新執行個體的 Endpoint.Address）
  throw new Error('還沒寫')
}
