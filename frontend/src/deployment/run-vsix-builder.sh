#!/bin/sh
set -eu

root_dir="${VSIX_ROOT_DIR:-/opt/ado-extension}"
out_dir="${VSIX_OUT_DIR:-/opt/ado-extension/out}"
src_dist="${VSIX_SRC_DIST:-/work/dist}"
src_manifest="${VSIX_SRC_MANIFEST:-/work/vss-extension.json}"

if [ ! -d "$src_dist" ]; then
  echo "VSIX source dist not found at ${src_dist}"
  exit 1
fi

if [ ! -f "$src_manifest" ]; then
  echo "VSIX manifest not found at ${src_manifest}"
  exit 1
fi

mkdir -p "${root_dir}/dist"
mkdir -p "${out_dir}"

rm -rf "${root_dir}/dist"/*
cp -R "${src_dist}/." "${root_dir}/dist/"
cp "${src_manifest}" "${root_dir}/vss-extension.json"

exec /tmp/deployment/create-vsix.sh
