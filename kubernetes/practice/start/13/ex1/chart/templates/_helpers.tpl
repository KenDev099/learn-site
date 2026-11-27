{{/* 物件名稱：直接用 release 名稱，最長 63 字元（Kubernetes 名稱的上限） */}}
{{- define "cafe.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/*
TODO 1：定義 "cafe.selectorLabels"：Deployment 的 selector 與 Service 的 selector 用。
  只放建立後不會變的兩個：
    app.kubernetes.io/name: chart 名稱（.Chart.Name）
    app.kubernetes.io/instance: release 名稱（.Release.Name）
*/}}

{{/*
TODO 2：定義 "cafe.labels"：每個物件的 metadata.labels 與 Pod 範本的 labels 用。
  先 include "cafe.selectorLabels"，再加上：
    app.kubernetes.io/version: .Chart.AppVersion（加 quote）
    app.kubernetes.io/managed-by: .Release.Service
    helm.sh/chart: chart 名稱-chart 版本（例如 cafe-api-0.1.0）
*/}}
