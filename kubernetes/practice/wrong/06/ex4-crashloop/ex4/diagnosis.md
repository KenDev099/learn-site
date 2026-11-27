# 練習 4：診斷紀錄

## Pod 卡在什麼狀態（kubectl get pods 的 STATUS 欄）

CrashLoopBackOff

## 用哪個指令看到原因、原因是什麼

kubectl describe pod -n k8s-06-ex4 -l app.kubernetes.io/name=cafe-api

Events 寫著 Error: couldn't find key db-password in Secret k8s-06-ex4/cafe-db。
Deployment 的 secretKeyRef 要的 key 是 db-password，但 Secret cafe-db 裡的 key 叫 password。

## 怎麼修

把 deployment.yaml 的 secretKeyRef.key 改成 password。Secret 不是我們管的，不改它；也不加 optional: true，缺密碼就應該起不來。
