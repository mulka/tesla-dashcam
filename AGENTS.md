# Dashcam Tools agent guidance

## Project shape

- `sei_explorer.html` and `dashcam-mp4.js` are a build-free browser explorer.
  Serve the repository over HTTP because the browser fetches `dashcam.proto`;
  opening the HTML through `file://` is not a supported development path.
- `sei_extractor.py` is the Python CLI. `dashcam_pb2.py` is generated from
  `dashcam.proto` and must not be edited or committed.
- The browser requires an H.264 Tesla clip and a browser with WebCodecs.
- SEI records contain GPS coordinates. Never commit real dashcam footage,
  extracted CSVs, or location data.

## Setup and verification

Run `make setup` once. Use the checked-in virtual environment commands rather
than installing Python packages globally.

```bash
make test
make serve PORT=8000
```

`make test` covers deterministic parser and static-site smoke checks. A passing
suite does not prove playback or metadata parity against a real Tesla clip.
Record real-media validation separately and keep the media private.

## Dataspheres spec-driven development

The Cursor environment installs the audited ari-dai-skills revision declared in
`scripts/dai-skills.env`. Use the `all-dai-sdd` skill for tracked project work
and `scripts/dai-sdd doctor` to inspect readiness.

The live workflow requires all of the following:

1. `DATASPHERES_API_KEY` supplied through Cursor Secrets or
   `~/.dataspheres.env`.
2. An explicitly selected datasphere.
3. A published project board and local `tasks.yaml`.
4. Human review before the workflow's `--greenlight` transition.

Do not invent remote state when any prerequisite is missing. Cursor does not
run the upstream Claude hooks, so execute conductor and loop gates explicitly.

## Cursor Cloud specific instructions

`.cursor/environment.json` runs `scripts/setup-dev.sh` on startup. The script is
idempotent: it creates `.venv`, generates Python protobuf bindings, and installs
the pinned skills checkout under `.cursor/skills/vendor/`.

If `DATASPHERES_API_KEY` is configured as a Cursor secret,
`scripts/configure-dataspheres.sh` materializes it in
`~/.dataspheres.env` with mode `0600`; the value must never be printed.
