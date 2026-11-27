#!/usr/bin/env bash
# 期末專題的開發環境（課程提供，不用改）。用法：bash dev-up.sh [namespace]，預設 k8s-16
# 從零建立兩個 namespace：
#   <ns>       放咖啡店服務，套用 Pod Security restricted
#   <ns>-data  開發用的 postgres 與 redis，代表正式環境的 RDS 與 ElastiCache（第 11 課）
# 並在 <ns> 建立 Secret cafe-secrets（DATABASE_URL、DATABASE_URL_MIGRATOR、REDIS_URL），密碼每次隨機產生。
# 注意：會先刪掉這兩個 namespace，裡面的東西全部重來。
set -euo pipefail
NS="${1:-k8s-16}"
DATA="$NS-data"

kubectl delete namespace "$NS" "$DATA" --ignore-not-found --wait --timeout=180s
kubectl create namespace "$NS"
kubectl create namespace "$DATA"
kubectl label namespace "$NS" learn.course=kubernetes learn.task=16 \
  pod-security.kubernetes.io/enforce=restricted pod-security.kubernetes.io/enforce-version=latest
kubectl label namespace "$DATA" learn.course=kubernetes learn.task=16

pw() { openssl rand -hex 16; }
PG=$(pw) MIG=$(pw) APP=$(pw) RDS=$(pw)
kubectl create secret generic cafe-data -n "$DATA" \
  --from-literal=POSTGRES_PASSWORD="$PG" --from-literal=MIGRATOR_PASSWORD="$MIG" \
  --from-literal=APP_PASSWORD="$APP" --from-literal=REDIS_PASSWORD="$RDS"
PGHOST="postgres.$DATA.svc.cluster.local:5432"
kubectl create secret generic cafe-secrets -n "$NS" \
  --from-literal=DATABASE_URL="postgres://cafe_app:$APP@$PGHOST/cafe" \
  --from-literal=DATABASE_URL_MIGRATOR="postgres://cafe_migrator:$MIG@$PGHOST/cafe" \
  --from-literal=REDIS_URL="redis://:$RDS@redis.$DATA.svc.cluster.local:6379"

# 新 namespace 的 default ServiceAccount 由 controller 建立，出現之前不能建 Pod
for _ in $(seq 1 90); do kubectl get serviceaccount default -n "$DATA" >/dev/null 2>&1 && break; sleep 2; done

kubectl apply -n "$DATA" -f - <<'YAML'
# 兩個帳號：cafe_migrator 擁有資料表（跑 migration），cafe_app 只能讀寫資料（應用程式用）
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init
data:
  roles.sh: |
    psql -v ON_ERROR_STOP=1 --username postgres --dbname cafe <<SQL
    CREATE ROLE cafe_migrator LOGIN PASSWORD '$MIGRATOR_PASSWORD';
    CREATE ROLE cafe_app LOGIN PASSWORD '$APP_PASSWORD';
    ALTER DATABASE cafe OWNER TO cafe_migrator;
    GRANT CONNECT ON DATABASE cafe TO cafe_app;
    GRANT USAGE ON SCHEMA public TO cafe_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafe_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cafe_app;
    SQL
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels: { app.kubernetes.io/name: postgres }
  template:
    metadata:
      labels: { app.kubernetes.io/name: postgres }
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: postgres
          image: postgres:18.6-alpine3.24
          imagePullPolicy: IfNotPresent
          env:
            - { name: POSTGRES_DB, value: cafe }
          envFrom:
            - secretRef: { name: cafe-data }
          ports:
            - containerPort: 5432
          readinessProbe:
            exec:
              command: [pg_isready, -h, 127.0.0.1, -U, postgres]
            periodSeconds: 2
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql }
            - { name: init, mountPath: /docker-entrypoint-initdb.d }
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { memory: 256Mi }
      volumes:
        - name: data
          emptyDir: {}
        - name: init
          configMap: { name: postgres-init }
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector: { app.kubernetes.io/name: postgres }
  ports:
    - port: 5432
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels: { app.kubernetes.io/name: redis }
  template:
    metadata:
      labels: { app.kubernetes.io/name: redis }
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: redis
          image: redis:8.10.3-alpine
          imagePullPolicy: IfNotPresent
          args: [--requirepass, $(REDIS_PASSWORD)]
          env:
            - name: REDIS_PASSWORD
              valueFrom: { secretKeyRef: { name: cafe-data, key: REDIS_PASSWORD } }
          ports:
            - containerPort: 6379
          readinessProbe:
            exec:
              command: [sh, -c, 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping']
            periodSeconds: 2
          resources:
            requests: { cpu: 20m, memory: 16Mi }
            limits: { memory: 64Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector: { app.kubernetes.io/name: redis }
  ports:
    - port: 6379
YAML

kubectl rollout status deployment/postgres -n "$DATA" --timeout=240s
kubectl rollout status deployment/redis -n "$DATA" --timeout=120s
echo "開發環境準備好了：服務放在 $NS，資料庫與 Redis 在 $DATA，連線字串在 Secret $NS/cafe-secrets"
