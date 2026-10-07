#!/bin/sh
# `pnpm deploy --legacy` links workspace packages (@sabeq/types …) back to the build tree
# (/app/packages/...). That path does not exist in the runtime image, so the API crashed with
# ERR_MODULE_NOT_FOUND. This replaces every link that points outside the deploy folder with a packed
# copy of the package — only its published files ("files" in package.json), never its sources or
# dev dependencies.
#
#   inline-workspace-deps.sh /prod/api
set -eu

target="$1"

find "$target/node_modules" -type l | while read -r link; do
  real=$(readlink -f "$link")
  case "$real" in
    "$target"/*) continue ;; # normal pnpm link inside the deploy folder
  esac
  [ -f "$real/package.json" ] || continue

  tmp=$(mktemp -d)
  (cd "$real" && pnpm pack --pack-destination "$tmp" >/dev/null)
  rm "$link"
  mkdir -p "$link"
  tar -xzf "$tmp"/*.tgz -C "$link" --strip-components=1
  rm -rf "$tmp"
  echo "inlined $(basename "$(dirname "$link")")/$(basename "$link")"
done
