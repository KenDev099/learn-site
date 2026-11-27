# 第 20 課的 OpenTofu 映像。OpenTofu 1.10 起官方映像不支援直接執行，
# 官方文件的做法是從 -minimal 映像把 tofu 執行檔複製到自己的映像裡
FROM ghcr.io/opentofu/opentofu:1.13.2-minimal AS tofu

FROM alpine:3.24
COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu
# 建置時先把 kreuzwerker/docker 4.6.0 下載到映像裡（filesystem mirror），
# 之後 tofu init 只從這裡安裝，不必連 registry.opentofu.org
RUN mkdir -p /tmp/m && cd /tmp/m \
 && printf 'terraform {\n  required_providers {\n    docker = {\n      source  = "kreuzwerker/docker"\n      version = "4.6.0"\n    }\n  }\n}\n' > main.tf \
 && tofu providers mirror /usr/local/share/tofu/mirror \
 && cd / && rm -rf /tmp/m
RUN printf 'provider_installation {\n  filesystem_mirror {\n    path = "/usr/local/share/tofu/mirror"\n  }\n}\n' > /root/.tofurc
WORKDIR /work
ENTRYPOINT ["tofu"]
