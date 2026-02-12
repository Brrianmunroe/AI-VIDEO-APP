# Setting up transcription (Whisper + FFmpeg)

The app transcribes video/audio clips using **Whisper** (via whisper-node) and **FFmpeg** (to extract 16 kHz audio for Whisper). Follow these steps once per machine.

---

## 1. Install FFmpeg

FFmpeg is used to extract audio from video files and convert it to the format Whisper needs.

### macOS (Homebrew)

```bash
brew install ffmpeg
```

Confirm it’s on your PATH:

```bash
ffmpeg -version
```

If you use Apple Silicon and Homebrew is in `/opt/homebrew`, the app will look there automatically. If FFmpeg is only in `/usr/local/bin`, ensure that path is in your `PATH` when you run the app.

### Windows

1. Download FFmpeg from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html) (e.g. the “Windows builds” link).
2. Unzip to a folder such as `C:\ffmpeg`.
3. Add the `bin` folder (e.g. `C:\ffmpeg\bin`) to your system **PATH**.

The app looks for `C:\ffmpeg\bin\ffmpeg.exe` and `C:\Program Files\ffmpeg\bin\ffmpeg.exe` if FFmpeg isn’t in PATH.

### Linux

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg
```

---

## 2. Install Whisper (whisper-node)

### Step 1: Install the npm package

From the project root:

```bash
npm install
```

This installs `whisper-node` (listed in `package.json`).

### Step 2: Build the Whisper binary

The package ships with whisper.cpp; you need to compile the `main` binary:

**macOS / Linux (from project root):**

```bash
cd node_modules/whisper-node/lib/whisper.cpp && make && cd ../../../../..
```

**Windows:** You need a build environment (e.g. MinGW/MSYS2 or Visual Studio) and `make`. In an environment where `make` is available:

```bash
cd node_modules\whisper-node\lib\whisper.cpp
make
cd ..\..\..\..\..
```

### Step 3: Download the Whisper model

The app uses the default English model `ggml-base.en.bin` (~142 MB). From the project root, run:

**Option A (recommended)** — direct download:

```bash
curl -L -o node_modules/whisper-node/lib/whisper.cpp/models/ggml-base.en.bin \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
```

**Option B** — use the whisper.cpp script (requires `base.en` as argument):

```bash
cd node_modules/whisper-node/lib/whisper.cpp/models
bash download-ggml-model.sh base.en
cd ../../../../..
```

If Option B downloads a tiny file (e.g. &lt; 1 MB), the script’s URL may be outdated; use Option A instead.

---

## 3. Verify setup

1. **FFmpeg:** Run `ffmpeg -version` (and optionally `ffprobe -version`).
2. **Whisper binary:** Check that this file exists (from project root):
   - **macOS/Linux:** `node_modules/whisper-node/lib/whisper.cpp/main`
   - **Windows:** `node_modules\whisper-node\lib\whisper.cpp\main.exe`
3. **Whisper model:** Check that this file exists:
   - `node_modules/whisper-node/lib/whisper.cpp/models/ggml-base.en.bin`

Then run the app, open a project, add a video, and go to the Timeline (Interview Selects). Transcription should run in the background; open the Transcript tab for a clip to see the result. If something fails, the Transcript tab will show “Could not generate transcript” and the yellow banner may show “Transcription failed for some clips. Check Whisper/FFmpeg setup if this persists.”

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| “Whisper is not installed” | Run `npm install` from the project root so `whisper-node` is present. |
| “Whisper binary not built” | Run `make` inside `node_modules/whisper-node/lib/whisper.cpp` (see Step 2 above). On Mac you may need Xcode Command Line Tools: `xcode-select --install`. |
| “Whisper model not downloaded” | Run `npx whisper-node download` and ensure `ggml-base.en.bin` is in `whisper.cpp/models/`. |
| “No audio or could not extract” | Install FFmpeg and ensure `ffmpeg` is on your PATH (or in a path the app checks). Restart the app after installing FFmpeg. |
| Transcription very slow | The base model runs on CPU. Long videos can take several minutes. |

---

## 4. Optional: word-level transcript sync

For **word-by-word read-along** that stays in sync with the video, the app can use a Python script that produces word-level timestamps. Without it, transcripts still work but the highlight uses estimated word times within each phrase.

**Requirements:** Python 3 and faster-whisper.

```bash
pip install faster-whisper
```

Ensure `python3` (or `python` on Windows) is on your PATH. The app will try to run `scripts/transcribe_words.py` when transcribing; if it succeeds, the transcript is stored with real word timestamps. If Python or the script fails, the app falls back to Whisper (whisper-node) and stores segment-level data as before.

**Packaged app (no Python install needed):** When you build the app with the transcription bundle, Python and faster-whisper are included so recipients get word-level sync without installing anything. From the project root, run `npm run prepare:transcribe` (downloads standalone Python and installs faster-whisper into `resources/`), then `npm run build:electron`. Or run `npm run build:electron:full` to do both in one step. The first run of `prepare:transcribe` downloads Python and pip-installs faster-whisper; the first transcription in the packaged app may download the Whisper model if not already cached.
