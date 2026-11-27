{{/* 物件名稱的開頭：release 名稱（cafe），各物件再加 -api、-worker */}}
{{- define "cafe.fullname" -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end }}

{{/* selector 用：建立後不能改，只放不會變的。各物件再加 app.kubernetes.io/component */}}
{{- define "cafe.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cafe.labels" -}}
{{ include "cafe.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Pod 層級的安全設定（Pod Security restricted，第 12 課）：api 與 worker 共用 */}}
{{- define "cafe.podSecurity" -}}
runAsNonRoot: true
runAsUser: 1000          # node 映像裡 node 使用者的 UID
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/* 容器層級的安全設定 */}}
{{- define "cafe.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: [ALL]
readOnlyRootFilesystem: true
{{- end }}
