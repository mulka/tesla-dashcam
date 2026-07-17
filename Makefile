VENV := .venv
PYTHON := $(VENV)/bin/python
PORT ?= 8000

.PHONY: setup proto test serve dai-doctor

setup:
	bash scripts/setup-dev.sh

proto:
	@test -x "$(PYTHON)" || (echo "Run 'make setup' first." >&2; exit 1)
	$(PYTHON) -m grpc_tools.protoc --proto_path=. --python_out=. dashcam.proto

test: proto
	$(PYTHON) -m unittest discover --start-directory tests --verbose
	node --check dashcam-mp4.js

serve:
	python3 -m http.server "$(PORT)"

dai-doctor:
	bash scripts/dai-sdd doctor
