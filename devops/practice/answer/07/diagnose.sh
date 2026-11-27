#!/bin/sh
# 練習 3：sh diagnose.sh
# ld-07-a、ld-07-b、ld-07-c 三個容器各有一個問題，每次測試隨機分配，數值也每次不同：
#   oom            被核心因為記憶體上限殺掉     → 印出記憶體上限，單位 MB（整數）
#   missing-env    少了某個環境變數就結束       → 印出那個環境變數的名稱
#   not-published  程式聽的 port 跟發布的不一樣 → 印出程式在容器裡聽的 port
# 每個容器印一行：<容器名稱> <原因> <數值>，例如 ld-07-a oom 128
#
# 用得到的指令：
#   docker inspect -f '{{.State.OOMKilled}}' 名稱     true／false
#   docker inspect -f '{{.State.Running}}' 名稱       true／false
#   docker inspect -f '{{.HostConfig.Memory}}' 名稱   記憶體上限，單位是 byte
#   docker logs 名稱 2>&1                             容器的 stdout 和 stderr
#   sed -n 's/.*某段文字 //p'                          印出「某段文字 」後面的部分

for c in ld-07-a ld-07-b ld-07-c; do
  if [ "$(docker inspect -f '{{.State.OOMKilled}}' "$c")" = true ]; then
    bytes=$(docker inspect -f '{{.HostConfig.Memory}}' "$c")
    echo "$c oom $((bytes / 1024 / 1024))"
  elif [ "$(docker inspect -f '{{.State.Running}}' "$c")" = false ]; then
    name=$(docker logs "$c" 2>&1 | sed -n 's/.*environment variable //p' | head -n 1)
    echo "$c missing-env $name"
  else
    port=$(docker logs "$c" 2>&1 | sed -n 's/.*listening on port //p' | head -n 1)
    echo "$c not-published $port"
  fi
done
