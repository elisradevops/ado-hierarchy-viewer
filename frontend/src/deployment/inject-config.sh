#!/bin/sh
set -eu

# Static VSIX variant — no nginx exec. Takes TARGET_DIR as first argument.
target_dir="${1:-$(pwd)/vsix-src}"

# -----------------------------
# Backend URL (required)
# -----------------------------
BFF_URL="${BFF_URL:-}"

if [ -z "$BFF_URL" ]; then
  echo "BFF_URL is not set; aborting." >&2
  exit 1
fi

echo "Using BFF_URL=$BFF_URL"
echo "Target dir: $target_dir"

# -----------------------------
# Generate runtime config.js
# -----------------------------
cat > "$target_dir/config.js" <<EOF
window.APP_CONFIG = {
  BFF_URL: "$BFF_URL"
};
EOF

echo "Generated runtime config.js in $target_dir"

# -----------------------------
# Inject config.js into index.html (idempotent)
# -----------------------------
if [ -f "$target_dir/index.html" ]; then
  if ! grep -q 'config.js' "$target_dir/index.html"; then
    sed -i 's|<head>|<head><script src="/config.js"></script>|' \
      "$target_dir/index.html"
    echo "Injected config.js script tag into index.html"
  else
    echo "config.js already present in index.html (idempotent)"
  fi
else
  echo "WARNING: index.html not found at $target_dir/index.html; skipping injection."
fi
