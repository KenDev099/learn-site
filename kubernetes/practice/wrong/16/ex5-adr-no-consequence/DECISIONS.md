# 部署設計的決策紀錄（ADR）

## ADR-001：migration 用獨立的 Job，由 deploy.sh 排在 helm upgrade 之前

### 背景

v2 起每一版都可能帶 migration。放在應用程式啟動時或 initContainer，每個副本、每次擴展都會跑一次，滾動更新時新舊 Pod 同時搶鎖，應用程式還得拿著能改表的帳號。

### 決策

每個版本一個 Job cafe-migrate-<版本>，用 migrator 帳號；deploy.sh 等它 Complete 才 helm upgrade，看到 Failed 就停。migration 只做 expand，contract 留到下一版。

### 後果

部署多一個步驟、要維護 deploy.sh；好處是 migration 失敗時線上的應用完全沒動，log 跟部署分開好查。代價是 migration 不能依賴新版程式，回滾不會還原資料庫，所以每個 migration 都要讓舊版還能跑。

### 在 EKS 上

做法相同，Job 跑在同一個叢集，migrator 的密碼從 AWS Secrets Manager 經 External Secrets 同步成 Secret；改用 Argo CD 時，Job 標成 PreSync hook（或用 sync wave 排在 Deployment 之前）。

## ADR-002：資料庫用 RDS，不放在叢集裡

### 背景

本機用 dev-up.sh 在 k8s-16-data 跑 postgres，資料放 emptyDir，Pod 一重建資料就沒了。正式環境要備份、時間點還原、跨可用區容錯與版本升級。

### 決策

正式環境用 Amazon RDS for PostgreSQL（Multi-AZ），叢集裡只保存連線字串；Redis 用 ElastiCache。chart 不包含任何資料庫元件。

### 後果

多一筆 AWS 費用，網路要規劃安全群組；換來不用自己維運 StatefulSet、備份與故障轉移。開發環境與正式環境的差異要靠 migration 與煙霧測試補足。

### 在 EKS 上

RDS 放在私有子網路，安全群組只允許 EKS 節點（或 Pod 的安全群組）連 5432；NetworkPolicy 的 egress 改用 RDS 子網路的 ipBlock。

## ADR-003：HPA 用 CPU 使用率，最少 2、最多 4

### 背景

尖峰是平常的 3 倍，cafe-api 的瓶頸是 CPU（JSON 處理），記憶體穩定。任何時候都要能壞一個 Pod 而不中斷。

### 決策

autoscaling/v2，CPU averageUtilization 70%，minReplicas 2、maxReplicas 4；縮容穩定視窗正式環境 300 秒、本機 60 秒；Deployment 不輸出 replicas。

### 在 EKS 上

HPA 只建立 Pod，節點不夠時要靠 Karpenter 或 EKS Auto Mode 加節點；之後可以改用請求數等自訂指標（Prometheus Adapter 或 KEDA）。
