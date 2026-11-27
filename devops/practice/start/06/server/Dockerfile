# 練習用的「伺服器」：Ubuntu 24.04，systemd 是 PID 1，跑 sshd 和一個只聽 127.0.0.1:9000 的 admin 服務（這個資料夾不用改）
FROM node:24.22.2-trixie-slim AS node

FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus openssh-server sudo curl rsync ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/bin/node
# 容器裡用不到、開機時會出錯的 unit 先關掉
RUN systemctl mask systemd-logind.service getty.target console-getty.service systemd-firstboot.service \
      systemd-udevd.service systemd-udev-trigger.service systemd-resolved.service \
 && systemctl enable ssh.socket
# ubuntu 是映像內建的使用者（uid 1000）：只能用金鑰登入，可以免密碼 sudo（雲端主機的預設也是這樣）
RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu && chmod 440 /etc/sudoers.d/ubuntu \
 && install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/.ssh \
 && useradd --system --no-create-home --shell /usr/sbin/nologin cafe \
 && install -d -o ubuntu -g ubuntu -m 755 /opt/cafe-api
COPY sshd-hardening.conf /etc/ssh/sshd_config.d/10-hardening.conf
COPY cafe-admin.mjs /usr/local/lib/cafe-admin.mjs
COPY cafe-admin.service /etc/systemd/system/cafe-admin.service
RUN systemctl enable cafe-admin.service
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
