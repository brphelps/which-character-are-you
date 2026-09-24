#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
staging_dir="${1:-"$repo_root/_site"}"

if [[ "$staging_dir" != /* ]]; then
  staging_dir="$repo_root/$staging_dir"
fi

if [[ -L "$staging_dir" ]]; then
  echo "Refusing to replace a symbolic-link staging directory: $staging_dir" >&2
  exit 1
fi

if [[ -d "$staging_dir" ]]; then
  staging_dir="$(cd -- "$staging_dir" && pwd -P)"
elif [[ -e "$staging_dir" ]]; then
  echo "Staging path exists and is not a directory: $staging_dir" >&2
  exit 1
else
  staging_parent="$(dirname -- "$staging_dir")"
  mkdir -p -- "$staging_parent"
  staging_parent="$(cd -- "$staging_parent" && pwd -P)"
  staging_dir="$staging_parent/$(basename -- "$staging_dir")"
fi

case "$staging_dir" in
  /|"$repo_root")
    echo "Refusing to use an unsafe staging directory: $staging_dir" >&2
    exit 1
    ;;
esac

case "$repo_root/" in
  "$staging_dir/"*)
    echo "Refusing to replace a parent of the repository: $staging_dir" >&2
    exit 1
    ;;
esac

public_files=(
  index.html
  muppets.html
  sesame-street.html
  credits.html
  styles.css
)

for file in "${public_files[@]}"; do
  if [[ ! -f "$repo_root/$file" ]]; then
    echo "Missing public site file: $file" >&2
    exit 1
  fi
done

shopt -s nullglob
image_files=(
  "$repo_root"/images/*.jpg
  "$repo_root"/images/*.jpeg
  "$repo_root"/images/*.png
  "$repo_root"/images/*.webp
  "$repo_root"/images/*.svg
)
shopt -u nullglob

if (( ${#image_files[@]} == 0 )); then
  echo "No character images found in images/" >&2
  exit 1
fi

rm -rf -- "$staging_dir"
mkdir -p -- "$staging_dir/images"

for file in "${public_files[@]}"; do
  install -m 0644 -- "$repo_root/$file" "$staging_dir/$file"
done

for image in "${image_files[@]}"; do
  install -m 0644 -- "$image" "$staging_dir/images/$(basename -- "$image")"
done

: > "$staging_dir/.nojekyll"

printf 'Staged %d public files in %s\n' \
  "$(( ${#public_files[@]} + ${#image_files[@]} + 1 ))" \
  "$staging_dir"
