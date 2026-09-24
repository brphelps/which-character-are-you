#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

for command in python3 node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required validation command is unavailable: $command" >&2
    exit 1
  fi
done

required_paths=(
  index.html
  muppets.html
  sesame-street.html
  styles.css
  images
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$repo_root/$path" ]]; then
    echo "Missing required site path: $path" >&2
    exit 1
  fi
done

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT

python3 - "$repo_root" "$temporary_dir" <<'PYTHON'
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path(sys.argv[1]).resolve()
script_output = Path(sys.argv[2]).resolve()
errors: list[str] = []
references: list[tuple[Path, str]] = []


class SiteParser(HTMLParser):
    def __init__(self, source: Path) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.inline_script: list[str] | None = None
        self.inline_script_count = 0

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)

        for attribute in ("href", "src"):
            value = attributes.get(attribute)
            if value:
                references.append((self.source, value))

        if tag != "script" or attributes.get("src"):
            return

        script_type = (attributes.get("type") or "").lower()
        if script_type in {"", "text/javascript", "application/javascript", "module"}:
            self.inline_script = []

    def handle_data(self, data: str) -> None:
        if self.inline_script is not None:
            self.inline_script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "script" or self.inline_script is None:
            return

        self.inline_script_count += 1
        output = script_output / (
            f"{self.source.stem}-inline-{self.inline_script_count}.js"
        )
        output.write_text("".join(self.inline_script), encoding="utf-8")
        self.inline_script = None


html_files = sorted(root.glob("*.html"))
if not html_files:
    errors.append("No root-level HTML files found")

literal_reference = re.compile(
    r"""\b(?:href|src|image)\s*(?:=|:)\s*["']([^"']+)["']""",
    re.IGNORECASE,
)

for html_file in html_files:
    content = html_file.read_text(encoding="utf-8")
    parser = SiteParser(html_file)
    parser.feed(content)
    parser.close()

    for match in literal_reference.finditer(content):
        references.append((html_file, match.group(1)))

css_reference = re.compile(r"""url\(\s*["']?([^"')]+)["']?\s*\)""", re.IGNORECASE)
for css_file in sorted(root.glob("*.css")):
    content = css_file.read_text(encoding="utf-8")
    for match in css_reference.finditer(content):
        references.append((css_file, match.group(1)))

external_schemes = {"data", "http", "https", "mailto", "tel", "javascript"}
checked: set[tuple[Path, str]] = set()

for source, reference in references:
    reference = reference.strip()
    key = (source, reference)
    if not reference or key in checked:
        continue
    checked.add(key)

    split = urlsplit(reference)
    if split.scheme.lower() in external_schemes or split.netloc:
        continue
    if not split.path:
        continue

    decoded_path = unquote(split.path)
    if decoded_path.startswith("/"):
        target = root / decoded_path.lstrip("/")
    else:
        target = source.parent / decoded_path

    target = target.resolve()
    try:
        target.relative_to(root)
    except ValueError:
        errors.append(
            f"{source.relative_to(root)}: reference escapes repository: {reference}"
        )
        continue

    if not target.exists():
        errors.append(
            f"{source.relative_to(root)}: missing local reference: {reference}"
        )

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    raise SystemExit(1)

print(
    f"Checked {len(html_files)} HTML files and "
    f"{len(checked)} unique local/external references"
)
PYTHON

while IFS= read -r -d '' script; do
  node --check "$script"
done < <(
  find "$repo_root" \
    -type f \
    -name '*.js' \
    -not -path "$repo_root/.git/*" \
    -not -path "$repo_root/_site/*" \
    -print0
)

while IFS= read -r -d '' script; do
  node --check "$script"
done < <(find "$temporary_dir" -type f -name '*.js' -print0)

echo "Static site validation passed"
