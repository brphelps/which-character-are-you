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

case "$staging_dir" in
  "$repo_root/_site") ;;
  "$repo_root/"*)
    echo "Use _site or a directory outside the repository for staging: $staging_dir" >&2
    exit 1
    ;;
esac

public_files=(
  index.html
  muppets.html
  sesame-street.html
  credits.html
  results.html
  styles.css
  js/quiz-engine.js
  js/quiz-controller.js
  js/results-view.js
  js/muppets-quiz.js
  js/sesame-quiz.js
  js/muppet-profile.js
  js/results-page.js
  js/result-sharing.js
  data/quiz-catalog.mjs
  data/quiz-content.mjs
  data/uhci-dimensions.mjs
  data/uhci-questions.mjs
  data/uhci-characters.mjs
  styles/quiz.css
  styles/results.css
)

# Only these named optional dependencies may join the artifact. Reference
# validation below still fails if an imported dependency is absent.
optional_files=(
  styles/sharing.css
)
for file in "${optional_files[@]}"; do
  if [[ -e "$repo_root/$file" ]]; then
    public_files+=("$file")
  fi
done

for directory in js data styles images; do
  if [[ -L "$repo_root/$directory" ]]; then
    echo "Refusing symbolic-link public directory: $directory" >&2
    exit 1
  fi
done

for file in "${public_files[@]}"; do
  if [[ ! -f "$repo_root/$file" || -L "$repo_root/$file" ]]; then
    echo "Missing or symbolic-link public site file: $file" >&2
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

for image in "${image_files[@]}"; do
  if [[ ! -f "$image" || -L "$image" ]]; then
    echo "Refusing non-regular public image: $image" >&2
    exit 1
  fi
done

if [[ -d "$staging_dir" && ! -f "$staging_dir/.nojekyll" ]] \
  && [[ -n "$(find "$staging_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to replace a nonempty directory without a Pages marker: $staging_dir" >&2
  exit 1
fi

rm -rf -- "$staging_dir"
mkdir -p -- "$staging_dir/images"

for file in "${public_files[@]}"; do
  mkdir -p -- "$staging_dir/$(dirname -- "$file")"
  install -m 0644 -- "$repo_root/$file" "$staging_dir/$file"
done

for image in "${image_files[@]}"; do
  install -m 0644 -- "$image" "$staging_dir/images/$(basename -- "$image")"
done

: > "$staging_dir/.nojekyll"

"$repo_root/scripts/validate-site.sh" "$staging_dir"

printf 'Staged %d public files in %s\n' \
  "$(( ${#public_files[@]} + ${#image_files[@]} + 1 ))" \
  "$staging_dir"
