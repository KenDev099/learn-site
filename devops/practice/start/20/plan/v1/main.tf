# 練習 2 的「目前版本」：先把它 apply，再換成 v2/main.tf 看 plan。
# 這裡的資料庫用 trust 認證、不設密碼，只是為了讓練習不必傳變數；正式環境不可以這樣做
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

provider "docker" {}

resource "docker_network" "lab" {
  name = "ld-20-plan-net"
}

resource "docker_volume" "pgdata" {
  name = "ld-20-plan-pgdata"
}

resource "docker_volume" "uploads" {
  name = "ld-20-plan-uploads"
}

resource "docker_image" "postgres" {
  name         = "postgres:18.6-alpine3.24@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5"
  keep_locally = true
}

resource "docker_image" "nginx" {
  name         = "nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949"
  keep_locally = true
}

resource "docker_container" "db" {
  name  = "ld-20-plan-db"
  image = docker_image.postgres.image_id
  env   = ["POSTGRES_HOST_AUTH_METHOD=trust"]
  networks_advanced {
    name = docker_network.lab.name
  }
  volumes {
    volume_name    = docker_volume.pgdata.name
    container_path = "/var/lib/postgresql"
  }
}

resource "docker_container" "api" {
  name  = "ld-20-plan-api"
  image = docker_image.nginx.image_id
  env   = ["FEATURE_LOYALTY=0"]
  networks_advanced {
    name = docker_network.lab.name
  }
  volumes {
    volume_name    = docker_volume.uploads.name
    container_path = "/srv/uploads"
  }
}

resource "docker_container" "worker" {
  name    = "ld-20-plan-worker"
  image   = docker_image.nginx.image_id
  restart = "no"
  networks_advanced {
    name = docker_network.lab.name
  }
}

output "db_host" {
  value = docker_container.db.name
}
