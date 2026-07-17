#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
VENV="$ROOT/.venv"
VIRTUALENV_BOOTSTRAP="$ROOT/.cache/virtualenv"
SKILLS_DIR="$ROOT/.cursor/skills/vendor/ari-dai-skills"

# shellcheck source=dai-skills.env
source "$ROOT/scripts/dai-skills.env"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command git
require_command node
require_command python3

NODE_MAJOR="$(node --version | tr -d 'v' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required by ari-dai-skills (found $(node --version))." >&2
  exit 1
fi

python3 -c 'import sys; assert sys.version_info >= (3, 9), "Python 3.9 or newer is required"'

venv_has_pip() {
  [ -x "$VENV/bin/python" ] &&
    "$VENV/bin/python" -m pip --version >/dev/null 2>&1
}

if ! venv_has_pip; then
  if ! python3 -m venv "$VENV" >/dev/null 2>&1 || ! venv_has_pip; then
    if ! python3 -m pip --version >/dev/null 2>&1; then
      echo "Python has neither ensurepip nor pip; install python3-venv or python3-pip." >&2
      exit 1
    fi
    echo "stdlib venv support is unavailable; using the rootless virtualenv fallback."
    mkdir -p "$VIRTUALENV_BOOTSTRAP"
    python3 -m pip install \
      --disable-pip-version-check \
      --upgrade \
      --target "$VIRTUALENV_BOOTSTRAP" \
      --requirement "$ROOT/requirements-bootstrap.txt"
    PYTHONPATH="$VIRTUALENV_BOOTSTRAP" \
      python3 -m virtualenv --clear "$VENV"
  fi
fi

"$VENV/bin/python" -m pip install \
  --disable-pip-version-check \
  --requirement "$ROOT/requirements-dev.txt"

"$VENV/bin/python" -m grpc_tools.protoc \
  --proto_path="$ROOT" \
  --python_out="$ROOT" \
  "$ROOT/dashcam.proto"

mkdir -p "$(dirname "$SKILLS_DIR")"
if [ ! -e "$SKILLS_DIR" ]; then
  git clone --no-checkout --quiet "$DAI_SKILLS_REPOSITORY" "$SKILLS_DIR"
elif [ ! -d "$SKILLS_DIR/.git" ]; then
  echo "$SKILLS_DIR exists but is not an ari-dai-skills clone." >&2
  exit 1
fi

if ! git -C "$SKILLS_DIR" cat-file -e "${DAI_SKILLS_COMMIT}^{commit}" 2>/dev/null; then
  git -C "$SKILLS_DIR" fetch --depth 1 origin "$DAI_SKILLS_COMMIT"
fi
git -C "$SKILLS_DIR" checkout --detach --quiet "$DAI_SKILLS_COMMIT"

ACTUAL_SKILLS_COMMIT="$(git -C "$SKILLS_DIR" rev-parse HEAD)"
if [ "$ACTUAL_SKILLS_COMMIT" != "$DAI_SKILLS_COMMIT" ]; then
  echo "ari-dai-skills checkout mismatch: expected $DAI_SKILLS_COMMIT, got $ACTUAL_SKILLS_COMMIT" >&2
  exit 1
fi

echo "Development environment ready."
echo "  Python: $("$VENV/bin/python" --version 2>&1)"
echo "  Node:   $(node --version)"
echo "  Skills: $ACTUAL_SKILLS_COMMIT"
