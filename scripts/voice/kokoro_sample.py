"""Records sample newsreader clips with Kokoro (open-source, Apache 2.0), for comparing voices.

    python scripts/voice/kokoro_sample.py data/edition-2026-10-20.json out/ id1 id2 id3

Each clip reads the story's headline, then its full text (the long version), in each voice.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICES = {"george": "bm_george", "emma": "bf_emma"}
RATE = 24000


def script(story: dict) -> str:
    # headline, a short pause, then each paragraph of the full report
    return story["head"].rstrip(".") + ".\n\n" + "\n\n".join(story["body"])


def main() -> None:
    edition, out, ids = sys.argv[1], Path(sys.argv[2]), sys.argv[3:]
    out.mkdir(parents=True, exist_ok=True)
    stories = {s["id"]: s for s in json.load(open(edition))["stories"]}
    pipe = KPipeline(lang_code="b")  # British English
    pause = np.zeros(int(RATE * 0.45), dtype=np.float32)
    for name, voice in VOICES.items():
        for sid in ids:
            parts = []
            for _, _, audio in pipe(script(stories[sid]), voice=voice, speed=1.0, split_pattern=r"\n+"):
                parts += [np.asarray(audio, dtype=np.float32), pause]
            wav = out / f"{name}-{sid}.wav"
            sf.write(wav, np.concatenate(parts), RATE)
            mp3 = wav.with_suffix(".mp3")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "96k", str(mp3)], check=True)
            wav.unlink()
            print(f"{mp3.name}: {sum(len(p) for p in parts) / RATE:.1f}s")


if __name__ == "__main__":
    main()
