# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

Tesla "Dashcam Tools" — two independent, self-contained tools that share `dashcam.proto`. There is **no backend, database, or long-running service**.

- **SEI Explorer (web)** — `sei_explorer.html` + `dashcam-mp4.js`, landing page `index.html`. Pure client-side; JS deps are vendored in `vendor/`. This is the primary/recommended tool.
- **SEI Extractor (CLI)** — `sei_extractor.py`, prints SEI metadata as CSV. Depends on the `protobuf` pip package and a generated `dashcam_pb2.py`.

There are no lint or automated-test suites in this repo.

### Running the web SEI Explorer

Serve the repo over HTTP and open the page (do **not** use `file://` — the page `fetch()`es `dashcam.proto` and uses the browser WebCodecs `VideoDecoder` API):

```
python3 -m http.server 8000   # then open http://localhost:8000/sei_explorer.html
```

Non-obvious details:
- Frame parsing walks `mdat` NAL length-prefixes directly and decodes via WebCodecs; it does **not** rely on the MP4 sample tables (`stsz`/`stco`), so a clip with valid `avcC` + `mdat` NALs plays even if those tables are inconsistent.
- The "Timestamp" column is derived from the Tesla filename pattern `YYYY-MM-DD_HH-MM-SS`; without that pattern only "Video Time" is shown.

### Running the Python CLI extractor

`dashcam_pb2.py` is **generated code** (not committed, git-ignored). It must exist before running the CLI. `protoc` (the `protobuf-compiler` system package) is preinstalled in the Cloud environment:

```
protoc --python_out=. dashcam.proto        # regenerate dashcam_pb2.py if missing
python3 sei_extractor.py path/to/clip.mp4  # prints CSV to stdout
```

### Testing note

No sample MP4 with SEI data is bundled. Real Tesla clips only contain SEI on firmware ≥ 2025.44.25, HW3+ (absent when parked). To exercise the tools without a real clip, you can synthesize an MP4 with Tesla-format SEI NAL units: each SEI NAL is `0x06 0x05 <size> 0x42 0x69 <serialized SeiMetadata> 0x80`, length-prefixed inside `mdat`. For the web tool, inject such NALs before each coded slice in a real (ffmpeg-produced) H.264 MP4.
