# 練習 1：用 OpenTofu 建出咖啡店的本機環境（規格看課程頁的練習 1）
# 自己試（在 work/20 裡）：
#   docker build -t learn-devops/cafe-api:20 app
#   export TF_VAR_db_password=至少16個字元的隨機字串 TF_VAR_api_image=learn-devops/cafe-api:20
#   sh tofu.sh init && sh tofu.sh plan && sh tofu.sh apply
#   curl -i http://127.0.0.1:18200/health/ready
# 收掉：sh tofu.sh destroy

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

provider "docker" {}

resource "docker_network" "cafe" {
  name = "ld-20-net"
}

# TODO：variable db_password、variable api_image
# TODO：docker_volume ld-20-pgdata、docker_image（postgres，用 digest 指定）
# TODO：docker_container ld-20-db（healthcheck）、docker_container ld-20-api（只發布在 127.0.0.1:18200）
# TODO：output api_url
