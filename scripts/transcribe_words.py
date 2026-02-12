#!/usr/bin/env python3
"""
Transcribe a 16 kHz mono WAV file with word-level timestamps and print JSON to stdout.

Output: { "words": [ { "word": "...", "start": 0.0, "end": 0.1 }, ... ] }
Requires: pip install faster-whisper
Exit: 0 on success, non-zero on failure (errors to stderr).
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: transcribe_words.py <path_to_wav>", file=sys.stderr)
        sys.exit(1)

    wav_path = sys.argv[1].strip()
    if not wav_path:
        print("Usage: transcribe_words.py <path_to_wav>", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper is not installed. Run: pip install faster-whisper", file=sys.stderr)
        sys.exit(2)

    try:
        model = WhisperModel("base.en", device="cpu", compute_type="int8")
        segments, info = model.transcribe(wav_path, language="en", word_timestamps=True)
        words = []
        for seg in segments:
            if seg.words:
                for w in seg.words:
                    words.append({
                        "word": w.word,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                    })
            else:
                if seg.text.strip():
                    words.append({
                        "word": seg.text.strip(),
                        "start": round(seg.start, 3),
                        "end": round(seg.end, 3),
                    })
        print(json.dumps({"words": words}))
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
