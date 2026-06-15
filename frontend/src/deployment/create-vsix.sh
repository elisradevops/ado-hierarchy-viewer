#!/bin/sh
set -eu

root_dir="${VSIX_ROOT_DIR:-/opt/ado-extension}"
out_dir="${VSIX_OUT_DIR:-/opt/ado-extension/out}"
manifest_path="${root_dir}/vss-extension.json"
debug_file="${out_dir}/vsix-build-info.txt"

if [ ! -f "$manifest_path" ]; then
  echo "VSIX manifest not found at ${manifest_path}; skipping VSIX build."
  exit 0
fi

if ! command -v tfx >/dev/null 2>&1; then
  echo "tfx is not installed; skipping VSIX build."
  exit 0
fi

mkdir -p "$out_dir"
backend_env_value="$(printenv 'BACKEND-URL-PLACEHOLDER-Bff' 2>/dev/null || true)"
vite_env_value="$(printenv 'VITE_BFF_BASE_URL' 2>/dev/null || true)"

node - "$manifest_path" <<'NODE'
const fs = require('fs');
const p = process.argv[2] || process.argv[1];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
// Use numeric-only timestamp-based version: YYYY.MMDD.REV (segments <= 65535)
// REV is HHMM (UTC) to keep it within 0-2359.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const mmdd = parseInt(`${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`, 10);
const rev = parseInt(`${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`, 10);
j.version = `${now.getUTCFullYear()}.${mmdd}.${rev}`;
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('Bumped extension version to', j.version);
NODE

echo "Building VSIX from ${manifest_path} (root=${root_dir})"
rm -f "${out_dir}"/*.vsix || true
tfx extension create \
  --manifest-globs "${manifest_path}" \
  --root "${root_dir}" \
  --output-path "${out_dir}"

version_value="$(node -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));console.log(j.version||'');" "$manifest_path" 2>/dev/null || true)"
{
  echo "VSIX build timestamp (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "VSIX version: ${version_value:-<unknown>}"
  echo "BACKEND-URL-PLACEHOLDER-Bff: ${backend_env_value:-<not set>}"
  echo "VITE_BFF_BASE_URL: ${vite_env_value:-<not set>}"
  echo "VSIX_ROOT_DIR: ${root_dir}"
  echo "VSIX_OUT_DIR: ${out_dir}"
} > "$debug_file"

echo "VSIX written to ${out_dir}"
echo "Debug info written to ${debug_file}"
