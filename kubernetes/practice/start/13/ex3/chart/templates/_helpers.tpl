{{/* 物件名稱：直接用 release 名稱，最長 63 字元（Kubernetes 名稱的上限） */}}
{{- define "cafe.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/* selector 用：建立後不能改，只放不會變的 */}}
{{- define "cafe.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* 每個物件都帶的 labels */}}
{{- define "cafe.labels" -}}
{{ include "cafe.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
