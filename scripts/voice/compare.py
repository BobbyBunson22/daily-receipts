"""Records the same stories several ways, to compare by ear.

    python scripts/voice/compare.py kokoro out/        (versions 1 to 3)
    python scripts/voice/compare.py chatterbox out/ ref.wav   (version 4)

1 today: Kokoro George as recorded this morning (written report, no fixes)
2 fixed: + numbers, dates and names said properly, newsreader pace, even volume
3 spoken: + the story rewritten for the ear
4 chatterbox: the spoken script in Chatterbox (open source, MIT), copying George's voice
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from speak import RATE, mp3, paragraphs, synth  # noqa: E402

EDITION = ROOT / "data/edition-2026-10-20.json"
SPOKEN = json.loads((ROOT / "src/lib/__tests__/fixtures/spoken-2026-10-20.json").read_text())


def stories():
    ed = json.loads(EDITION.read_text())
    for s in ed["stories"]:
        if s["id"] in SPOKEN:
            yield {**s, "spoken": SPOKEN[s["id"]]}


def kokoro(out: Path):
    from kokoro import KPipeline

    pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
    for s in stories():
        versions = {
            "1-today": mp3(synth(pipe, "bm_george", paragraphs(s, use_spoken=False, fix=False), speed=1.0), loud=False),
            "2-fixed": mp3(synth(pipe, "bm_george", paragraphs(s, use_spoken=False))),
            "3-spoken": mp3(synth(pipe, "bm_george", paragraphs(s))),
        }
        for name, data in versions.items():
            (out / f"{name}-{s['id']}.mp3").write_bytes(data)
        # the text each version read, for checking
        (out / f"text-{s['id']}.txt").write_text("\n\n".join(["FIXED:", *paragraphs(s, use_spoken=False), "SPOKEN:", *paragraphs(s)]))


def chatterbox(out: Path, ref: str):
    import numpy as np
    import torch
    import torchaudio
    from chatterbox.tts import ChatterboxTTS

    torch.set_num_threads(max(1, torch.get_num_threads()))
    model = ChatterboxTTS.from_pretrained(device="cpu")
    log = []
    for s in stories():
        t0 = time.time()
        parts = []
        for i, p in enumerate(paragraphs(s)):
            # a sentence or two at a time keeps Chatterbox steady
            for chunk in [x for x in __import__("re").split(r"(?<=[.!?])\s+", p) if x.strip()]:
                wav = model.generate(chunk, audio_prompt_path=ref, exaggeration=0.6, cfg_weight=0.4)
                parts.append(wav.squeeze(0).numpy())
                parts.append(np.zeros(int(model.sr * 0.2), dtype=np.float32))
            parts.append(np.zeros(int(model.sr * (0.55 if i == 0 else 0.35)), dtype=np.float32))
        audio = np.concatenate(parts)
        secs = time.time() - t0
        (out / f"4-chatterbox-{s['id']}.mp3").write_bytes(mp3(audio, rate=model.sr))
        log.append(f"{s['id']}: {len(audio) / model.sr:.0f}s of audio took {secs:.0f}s to make ({secs / (len(audio) / model.sr):.1f}x real time)")
        print(log[-1], flush=True)
    (out / "chatterbox-timing.txt").write_text("\n".join(log) + "\n")


if __name__ == "__main__":
    mode, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    kokoro(out) if mode == "kokoro" else chatterbox(out, sys.argv[3])
