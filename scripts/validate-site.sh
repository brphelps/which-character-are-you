#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
site_root="${1:-"$repo_root"}"

for command in python3 node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required validation command is unavailable: $command" >&2
    exit 1
  fi
done

python3 - "$site_root" <<'PYTHON'
from __future__ import annotations

import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path(sys.argv[1]).resolve()
errors: list[str] = []
references: list[tuple[Path, str, Path, bool]] = []
scripts: list[tuple[Path, str, bool]] = []

for required in (
    "index.html", "muppets.html", "sesame-street.html", "credits.html",
    "results.html", "styles.css", "images",
):
    if not (root / required).exists():
        errors.append(f"Missing required site path: {required}")


def reference(source: Path, value: str, base: Path | None = None,
              module: bool = False) -> None:
    references.append((source, value, base or source.parent, module))


class SiteParser(HTMLParser):
    def __init__(self, source: Path) -> None:
        super().__init__(convert_charrefs=False)
        self.source = source
        self.inline_script: list[str] | None = None
        self.module = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        for attribute in ("href", "src", "poster"):
            if attributes.get(attribute):
                reference(self.source, attributes[attribute])
        if tag != "script" or attributes.get("src"):
            return
        script_type = (attributes.get("type") or "").lower()
        if script_type in {"", "text/javascript", "application/javascript", "module"}:
            self.inline_script = []
            self.module = script_type == "module"

    def handle_data(self, data: str) -> None:
        if self.inline_script is not None:
            self.inline_script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.inline_script is not None:
            scripts.append((self.source, "".join(self.inline_script), self.module))
            self.inline_script = None


html_files = sorted(root.glob("*.html"))
for html_file in html_files:
    parser = SiteParser(html_file)
    parser.feed(html_file.read_text(encoding="utf-8"))
    parser.close()

css_files = sorted(root.glob("*.css"))
if (root / "styles").is_dir():
    css_files += sorted((root / "styles").rglob("*.css"))
for css_file in css_files:
    content = re.sub(r"/\*.*?\*/", "", css_file.read_text(encoding="utf-8"), flags=re.S)
    for match in re.finditer(r"""url\(\s*["']?([^"')]+)["']?\s*\)""", content, re.I):
        reference(css_file, match.group(1))
    for match in re.finditer(r"""@import\s+["']([^"']+)["']""", content, re.I):
        reference(css_file, match.group(1))

for directory in ("js", "data"):
    for pattern in ("*.js", "*.mjs"):
        for script in sorted((root / directory).rglob(pattern)):
            scripts.append((script, script.read_text(encoding="utf-8"), True))

# Runtime modules use literal relative imports; variable imports require a
# separate browser test. Asset metadata is document-relative, unlike imports.
module_reference = re.compile(
    r"""\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']"""
    r"""|\bimport\s*\(\s*["']([^"']+)["']\s*\)""",
    re.M,
)
asset_reference = re.compile(r"""\b(?:href|src|image)\s*(?:=|:)\s*["']([^"'${}]+)["']""")
url_reference = re.compile(r"""\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)""")
for source, content, module in scripts:
    result = subprocess.run(
        ["node", "--input-type=module" if module else "--input-type=commonjs", "--check"],
        input=content, text=True, capture_output=True,
    )
    if result.returncode:
        errors.append(f"{source.relative_to(root)}: JavaScript syntax error\n{result.stderr}")
    for match in module_reference.finditer(content):
        reference(source, match.group(1) or match.group(2), module=True)
    for match in asset_reference.finditer(content):
        reference(source, match.group(1), root if source.suffix != ".html" else source.parent)
    for match in url_reference.finditer(content):
        reference(source, match.group(1))

checked: set[tuple[Path, str, Path, bool]] = set()
for source, value, base, module in references:
    value = value.strip()
    key = (source, value, base, module)
    if not value or key in checked:
        continue
    checked.add(key)
    split = urlsplit(value)
    if split.scheme or split.netloc:
        if module:
            errors.append(f"{source.relative_to(root)}: non-local runtime import: {value}")
        continue
    if not split.path:
        continue
    decoded_path = unquote(split.path)
    if decoded_path.startswith("/"):
        errors.append(f"{source.relative_to(root)}: root-relative reference breaks Pages subpaths: {value}")
        continue
    if module and not decoded_path.startswith(("./", "../")):
        errors.append(f"{source.relative_to(root)}: bare runtime import: {value}")
        continue
    target = (base / decoded_path).resolve()
    if not target.is_relative_to(root):
        errors.append(f"{source.relative_to(root)}: reference escapes site: {value}")
    elif not target.exists():
        errors.append(f"{source.relative_to(root)}: missing local reference: {value}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    raise SystemExit(1)

print(f"Checked {len(html_files)} HTML files, {len(css_files)} stylesheets, "
      f"{len(scripts)} scripts and {len(checked)} references")
PYTHON

echo "Static site validation passed"
