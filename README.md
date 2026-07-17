# Dashcam Tools

This repo contains tools for viewing Tesla Dashcam videos and extracting their associated metadata. This includes information such as vehicle speed, steering wheel angle, and self-driving state. Supported MP4 files can be found on the flash drive plugged into your Tesla (usually in the glovebox), or by downloading a clip via the Tesla mobile app's Dashcam Viewer.

This metadata also appears in the Dashcam Viewer during playback on supported vehicle displays and the Tesla App.

## Development Setup

The repository has two dependency-light development paths:

* A static browser explorer that needs a local HTTP server and a
  WebCodecs-capable browser.
* A Python extractor that needs generated protobuf bindings.

Set up both, including the project-local AI skills, with:

```bash
make setup
make test
```

`make setup` creates `.venv`, installs the pinned Python dependencies, generates
`dashcam_pb2.py`, and checks out the audited
[`mulka/ari-dai-skills`](https://github.com/mulka/ari-dai-skills) revision. No
packages are installed globally.

To run the browser explorer locally:

```bash
make serve PORT=8000
```

Then open <http://127.0.0.1:8000/sei_explorer.html>. Opening the file directly
through `file://` does not work because the explorer fetches `dashcam.proto`.

To run the Python extractor:

```bash
.venv/bin/python sei_extractor.py /path/to/dashcam-video.mp4 > metadata.csv
```

The extractor and explorer parse MP4/H.264 directly; `ffmpeg` is not required.
The automated suite uses deterministic parser fixtures. End-to-end playback
still requires private footage from a supported Tesla.

## Dataspheres Spec-Driven Workflow

This repository includes a Cursor Cloud environment and a valid `all-dai-sdd`
project skill. The setup pins the upstream skills revision in
[`scripts/dai-skills.env`](scripts/dai-skills.env), while the canonical workflow
state remains on Dataspheres AI.

For Cursor Cloud, add these values in the environment's **Secrets** settings:

```text
DATASPHERES_API_KEY=dsk_...
DATASPHERES_BASE_URL=https://dataspheres.ai
DATASPHERES_PUBLIC_URL=https://dataspheres.ai
DATASPHERES_DEFAULT_URI=your-datasphere-uri
```

For local development, copy [`.env.example`](.env.example) to
`~/.dataspheres.env`, replace the placeholders, and set the file mode to `0600`.
Never paste or commit the API key.

Check readiness with:

```bash
scripts/dai-sdd doctor
```

Then invoke `/all-dai-sdd` in Cursor. On a new project the skill collects
clarifications, confirms the target datasphere, publishes the board and
`tasks.yaml`, and stops at the human review gate before execution. The
repository cannot initialize that live board without your API key and target
datasphere.

The workflow follows the
[spec-driven development state-machine documentation](https://dataspheres.ai/pages/dataspheres-ai/spec-driven-development).
Cursor does not run the upstream Claude Code hooks, so the project adapter uses
the same `loop.mjs` and `sdd-conductor.mjs` gates explicitly.

## Dashcam SEI Explorer (Easiest)

**[Use the online SEI Explorer →](https://mulka.github.io/tesla-dashcam/sei_explorer.html)**

Just drag and drop your MP4 file to view the clip and associated SEI metadata. Works entirely in your browser - your files never leave your computer.

## GitHub Pages

This repo deploys to GitHub Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `master`.

One-time setup (repo admin only):

1. Open **Settings → Pages** for this repository.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Re-run the latest **Deploy GitHub Pages** workflow (or push a commit to `master`).

The site will be available at `https://mulka.github.io/tesla-dashcam/`.

## Files

* [`sei_explorer.html`](sei_explorer.html)
    * Web-based video player that displays SEI metadata alongside video playback. Uses [`dashcam-mp4.js`](dashcam-mp4.js) for MP4 parsing and SEI metadata extraction.
* [`sei_extractor.py`](sei_extractor.py)
    * Python-based metadata extractor. Command-line tool for extracting SEI data from MP4 files.
* [`dashcam.proto`](dashcam.proto)
    * The protobuf spec that is used to decode SEI data in the MP4 file(s).

## Troubleshooting

Not all Tesla-generated dashcam clips contain SEI data. Only clips recorded on Tesla firmware 2025.44.25 or later and HW3 or above contain SEI data. If car is parked, SEI data may not be present.

If no SEI metadata is found, ensure your dashcam footage meets these requirements.

The browser explorer additionally requires H.264 video, at least one keyframe,
and WebCodecs support. Dashcam metadata can include precise latitude and
longitude; keep source clips and CSV exports out of version control.
