# 練習 1 筆記

把 kubectl describe pod 的 Events 裡，Pending 那個 Pod 的 FailedScheduling 訊息貼在下面：

0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient memory. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.

節點的 Allocatable（kubectl describe node learn-k8s-worker）：

- cpu：8
- memory：8024556Ki（約 7.65Gi，比 8Gi 小，所以一個 Pod 都放不下）
