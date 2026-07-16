# Dashcam Tools

This repo contains tools for viewing Tesla Dashcam videos and extracting their associated metadata. This includes information such as vehicle speed, steering wheel angle, and self-driving state. Supported MP4 files can be found on the flash drive plugged into your Tesla (usually in the glovebox), or by downloading a clip via the Tesla mobile app's Dashcam Viewer.

This metadata also appears in the Dashcam Viewer during playback on supported vehicle displays and the Tesla App.

## Multi-camera Clip Editor

**[Use the online Multi-camera Clip Editor →](https://mulka.github.io/tesla-dashcam/clip_editor.html)**

Select the synchronized camera files from one Tesla recording, choose a clip range up to 30 seconds, and add camera
switches at any point on the timeline. Preview and export the edited clip entirely in your browser; source videos are
never uploaded. The exported container is MP4 when the browser supports it, with WebM used as a fallback.

## Dashcam SEI Explorer (Easiest)

**[Use the online SEI Explorer →](https://mulka.github.io/tesla-dashcam/sei_explorer.html)**

Just drag and drop your MP4 file to view the clip and assocaited SEI metadata. Works entirely in your browser - your files never leave your computer.

## GitHub Pages

This repo deploys to GitHub Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `master`.

One-time setup (repo admin only):

1. Open **Settings → Pages** for this repository.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Re-run the latest **Deploy GitHub Pages** workflow (or push a commit to `master`).

The site will be available at `https://mulka.github.io/tesla-dashcam/`.

## Files

* [`clip_editor.html`](clip_editor.html)
    * Browser-based multi-camera clip editor. Aligns Tesla camera files by their filename timestamps and exports a
      locally rendered clip with user-defined camera switches.
* [`sei_explorer.html`](sei_explorer.html)
    * Web-based video player that displays SEI metadata alongside video playback. Uses [`dashcam-mp4.js`](dashcam-mp4.js) for MP4 parsing and SEI metadata extraction.
* [`sei_extractor.py`](sei_extractor.py)
    * Python-based metadata extractor. Command-line tool for extracting SEI data from MP4 files.
* [`dashcam.proto`](dashcam.proto)
    * The protobuf spec that is used to decode SEI data in the MP4 file(s).

## Troubleshooting

Not all Tesla-generated dashcam clips contain SEI data. Only clips recorded on Tesla firmware 2025.44.25 or later and HW3 or above contain SEI data. If car is parked, SEI data may not be present.

If no SEI metadata is found, ensure your dashcam footage meets these requirements.
