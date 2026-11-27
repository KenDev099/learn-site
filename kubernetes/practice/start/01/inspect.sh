#!/bin/bash
# 練習 4：用 kubectl 讀出叢集的資訊，印出三行（每次都要即時查，不能寫死）
# 第 1 行：每個節點「名稱=可分配記憶體」，用空白隔開，例如 learn-k8s-worker=8024556Ki
# 第 2 行：kube-system 這個 namespace 裡 Pod 的數量
# 第 3 行：etcd 的映像名稱（含 tag）
# 只能讀，不能改叢集
set -euo pipefail

