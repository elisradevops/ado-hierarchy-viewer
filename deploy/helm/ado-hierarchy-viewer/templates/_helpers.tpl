{{/*
Expand the name of the chart.
*/}}
{{- define "ado-hierarchy-viewer.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ado-hierarchy-viewer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "ado-hierarchy-viewer.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{ include "ado-hierarchy-viewer.selectorLabels" . }}
{{- end }}

{{- define "ado-hierarchy-viewer.selectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
