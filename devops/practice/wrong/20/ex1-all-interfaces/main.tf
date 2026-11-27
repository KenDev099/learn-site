terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.6.0"
    }
  }
}

provider "docker" {}

variable "db_password" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.db_password) >= 16
    error_message = "db_password 至少要 16 個字元。"
  }
}

variable "api_image" {
  type = string
  validation {
    condition     = !endswith(var.api_image, ":latest") && strcontains(var.api_image, ":")
    error_message = "api_image 要寫明確的標籤或 digest，不能用 latest。"
  }
}

locals {
  prefix = "ld-20"
}

resource "docker_network" "cafe" {
  name = "${local.prefix}-net"
}

resource "docker_volume" "pgdata" {
  name = "${local.prefix}-pgdata"
}

resource "docker_image" "postgres" {
  name         = "postgres:18.6-alpine3.24@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5"
  keep_locally = true
}

resource "docker_container" "db" {
  name  = "${local.prefix}-db"
  image = docker_image.postgres.image_id
  env = [
    "POSTGRES_USER=cafe",
    "POSTGRES_DB=cafe",
    "POSTGRES_PASSWORD=${var.db_password}",
  ]
  networks_advanced {
    name = docker_network.cafe.name
  }
  volumes {
    volume_name    = docker_volume.pgdata.name
    container_path = "/var/lib/postgresql"
  }
  healthcheck {
    test           = ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U cafe -d cafe"]
    interval       = "10s"
    timeout        = "5s"
    retries        = 5
    start_period   = "30s"
    start_interval = "1s"
  }
  wait = true
}

resource "docker_container" "api" {
  name  = "${local.prefix}-api"
  image = var.api_image
  env = [
    "DATABASE_URL=postgres://cafe:${var.db_password}@${docker_container.db.name}:5432/cafe",
  ]
  networks_advanced {
    name = docker_network.cafe.name
  }
  ports {
    internal = 3000
    external = 18200
  }
}

output "api_url" {
  value = "http://127.0.0.1:${docker_container.api.ports[0].external}"
}
