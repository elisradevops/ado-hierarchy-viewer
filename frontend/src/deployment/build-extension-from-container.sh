#!/bin/sh
set -eu

container_name="${1:-}"
bff_url="${2:-}"
dist_dir="${3:-$(pwd)/frontend/ado-extension/dist}"
placeholder="BACKEND-URL-PLACEHOLDER-Bff"

if [ -z "$container_name" ]; then
  echo "Usage: $0 <container-name-or-id> [bff-url] [dist-dir]" >&2
  exit 1
fi

echo "Copying frontend assets from container '$container_name' to '$dist_dir'"
rm -rf "$dist_dir"
mkdir -p "$dist_dir"
docker cp "${container_name}:/usr/share/nginx/html/." "$dist_dir"

if [ -n "$bff_url" ]; then
  echo "BFF URL (explicit): $bff_url"
  echo "Patching BFF URL in copied assets: $bff_url"
  escaped_bff_url=$(printf '%s\n' "$bff_url" | sed 's/[&|]/\\&/g')
  find "$dist_dir" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
    -exec sed -i "s|${placeholder}|${escaped_bff_url}|g" {} +
else
  echo "BFF URL: not provided to script; using baked-in container assets."
  env_bff_url="$(docker exec "$container_name" /bin/sh -c 'printenv BACKEND-URL-PLACEHOLDER-Bff' 2>/dev/null || true)"
  if [ -n "$env_bff_url" ]; then
    echo "BFF URL (container env): $env_bff_url"
  else
    echo "BFF URL (container env): not set"
  fi
  node - "$dist_dir" "$placeholder" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const placeholder = process.argv[3];

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/i.test(entry.name)) files.push(full);
  }
};

try {
  walk(root);
} catch (err) {
  console.error('Failed to scan assets:', err.message);
  process.exit(0);
}

let hasPlaceholder = false;
let detected = '';
const genericRegex = /(https?:\/\/[^\s"'\\]+)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(placeholder)) {
    hasPlaceholder = true;
    continue;
  }
  let g;
  while ((g = genericRegex.exec(content))) {
    const value = g[1];
    if (/ado-hierarchy|:8080\b|\/api\/health\b/i.test(value)) {
      detected = value;
      break;
    }
  }
  if (detected) break;
}

if (hasPlaceholder) {
  console.log('WARNING: placeholder still present in assets; BFF URL was not injected.');
} else if (detected) {
  console.log(`Detected BFF URL from assets: ${detected}`);
} else {
  console.log('BFF URL not detected in assets.');
}
NODE
fi

manifest_path="$(pwd)/frontend/ado-extension/vss-extension.json"
if [ -f "$manifest_path" ]; then
  node - "$manifest_path" <<'NODE'
const fs = require('fs');
const p = process.argv[2] || process.argv[1];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const raw = String(j.version || '0.0.0');
const base = raw.split('-')[0].split('+')[0];
const v = base.split('.').map((n) => parseInt(n, 10) || 0);
while (v.length < 3) v.push(0);
v[2] += 1;
// Azure DevOps extension version must be numeric only (x.y.z).
j.version = `${v.join('.')}`;
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('Bumped extension version to', j.version);
NODE
else
  echo "vss-extension.json not found at $manifest_path; skipping version bump."
fi

if command -v tfx >/dev/null 2>&1; then
  echo "tfx detected. To create the VSIX, run:"
  echo "  tfx extension create --manifest-globs frontend/ado-extension/vss-extension.json"
else
  echo "tfx not found. Install Azure DevOps CLI (tfx) to build a VSIX."
fi
