#!/bin/sh
# 啟動練習伺服器 ld-06-server（這個檔案不用改）：systemd 當 PID 1，只把 SSH 發布在 127.0.0.1:18060，
# 並把這一題資料夾裡的 authorized_keys 裝給 ubuntu 使用者。在 work/06 執行：sh server/up.sh
# 第一次要建置映像，大約一分鐘；之後幾秒鐘。用完可以 docker rm -f ld-06-server
set -eu
cd "$(dirname "$0")/.."
[ -f authorized_keys ] || { echo '找不到 authorized_keys：先完成練習 1，執行 sh keygen.sh' >&2; exit 1; }
docker build -q -t ld-06-server:1 server >/dev/null
docker rm -f ld-06-server >/dev/null 2>&1 || true
# systemd 要管理 cgroup，所以要 --privileged、--cgroupns=host 並掛入 /sys/fs/cgroup（只在練習環境這樣做）
docker run -d --name ld-06-server --hostname cafe-server --privileged --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw -p 127.0.0.1:18060:22 -p 127.0.0.1:18069:9000 ld-06-server:1 >/dev/null
docker exec ld-06-server systemctl is-system-running --wait >/dev/null || true
docker cp authorized_keys ld-06-server:/home/ubuntu/.ssh/authorized_keys
docker exec ld-06-server sh -c 'chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys && chmod 600 /home/ubuntu/.ssh/authorized_keys'
echo 'ld-06-server 已啟動：SSH 在 127.0.0.1:18060，使用者 ubuntu'
