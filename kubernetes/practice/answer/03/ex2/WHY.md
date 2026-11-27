兩個 Deployment 的 selector 都只有 app.kubernetes.io/name=cafe-api，會選到對方的 Pod；每個 selector 要再加上 app.kubernetes.io/instance，讓 label 組合各自唯一。
