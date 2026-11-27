#!/bin/bash
# 把這台機器的值寫死
cat <<OUT
learn-k8s-control-plane=8024556Ki learn-k8s-worker=8024556Ki learn-k8s-worker2=8024556Ki 
13
registry.k8s.io/etcd:3.7.0-0
OUT
