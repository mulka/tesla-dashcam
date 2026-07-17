#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATASPHERES_API_KEY:-}" ]; then
  echo "Dataspheres credentials not configured (DATASPHERES_API_KEY is unset)."
  echo "Add the key as a Cursor secret or create ~/.dataspheres.env from .env.example."
  exit 0
fi

TARGET="${DATASPHERES_ENV_FILE:-$HOME/.dataspheres.env}"
mkdir -p "$(dirname "$TARGET")"

python3 - "$TARGET" <<'PY'
import os
from pathlib import Path
import tempfile
import sys

target = Path(sys.argv[1]).expanduser()
existing = target.read_text(encoding="utf-8").splitlines() if target.exists() else []

provided = {
    "DATASPHERES_API_KEY": os.environ["DATASPHERES_API_KEY"],
    "DATASPHERES_BASE_URL": os.environ.get("DATASPHERES_BASE_URL"),
    "DATASPHERES_PUBLIC_URL": os.environ.get("DATASPHERES_PUBLIC_URL"),
    "DATASPHERES_DEFAULT_URI": os.environ.get("DATASPHERES_DEFAULT_URI"),
}
defaults = {
    "DATASPHERES_BASE_URL": "https://dataspheres.ai",
    "DATASPHERES_PUBLIC_URL": "https://dataspheres.ai",
}

for name, value in provided.items():
    if value is not None and ("\n" in value or "\r" in value):
        raise SystemExit(f"{name} must be a single-line value")

managed = set(provided)
seen = set()
output = []
for line in existing:
    candidate = line.strip()
    name = candidate.partition("=")[0].strip() if "=" in candidate else ""
    if name not in managed:
        output.append(line)
        continue
    if name in seen:
        continue
    seen.add(name)
    if provided[name]:
        output.append(f"{name}={provided[name]}")
    else:
        output.append(line)

for name in (
    "DATASPHERES_API_KEY",
    "DATASPHERES_BASE_URL",
    "DATASPHERES_PUBLIC_URL",
    "DATASPHERES_DEFAULT_URI",
):
    if name in seen:
        continue
    value = provided[name] or defaults.get(name)
    if value:
        output.append(f"{name}={value}")

target.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(
    mode="w",
    encoding="utf-8",
    dir=target.parent,
    prefix=f".{target.name}.",
    delete=False,
) as handle:
    handle.write("\n".join(output) + "\n")
    temporary = Path(handle.name)

temporary.chmod(0o600)
temporary.replace(target)
target.chmod(0o600)
PY

echo "Dataspheres credentials written securely to $TARGET."
