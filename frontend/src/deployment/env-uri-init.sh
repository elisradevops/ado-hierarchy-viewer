#!/bin/sh
set -eu

target_dir="/usr/share/nginx/html"

# -----------------------------
# Backend URL (required)
# -----------------------------
BFF_URL="${BFF_URL:-}"

if [ -z "$BFF_URL" ]; then
  echo "BFF_URL is not set; aborting." >&2
  exit 1
fi

echo "Using BFF_URL=$BFF_URL"

# -----------------------------
# Generate runtime config.js
# -----------------------------
cat > "$target_dir/config.js" <<EOF
window.APP_CONFIG = {
  BFF_URL: "$BFF_URL"
};
EOF

echo "Generated runtime config.js"

# -----------------------------
# Inject config.js into index.html (idempotent)
# -----------------------------
if ! grep -q 'config.js' "$target_dir/index.html"; then
  sed -i 's|<head>|<head><script src="/config.js"></script>|' \
    "$target_dir/index.html"
fi

# -----------------------------
# Start nginx
# -----------------------------
echo "Starting nginx"
exec nginx -g "daemon off;"
