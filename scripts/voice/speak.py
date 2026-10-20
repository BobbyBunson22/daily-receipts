"""Shared newsreader settings: what's read for a story, and how it's turned into a clip."""
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from normalise import normalise

RATE = 24000
SPEED = 1.1  # a newsreader's pace: about 160 words a minute
PAUSE_AFTER_HEADLINE = 0.75
PAUSE_BETWEEN_PARAGRAPHS = 0.5


def paragraphs(story: dict, use_spoken: bool = True, fix: bool = True) -> list[str]:
    """Headline, then the story written for the ear (or the written report), ready to read."""
    body = story.get("spoken") if use_spoken and story.get("spoken") else story["body"]
    body = body if isinstance(body, list) else [body]
    out = [story["head"].rstrip(".") + "."] + [p for p in body if p and p.strip()]
    sport = story.get("sec") == "sport"
    return [normalise(p, sport=sport) for p in out] if fix else out


def synth(pipe, voice: str, paras: list[str], speed: float = SPEED) -> np.ndarray:
    parts = []
    for i, p in enumerate(paras):
        for _, _, audio in pipe(p, voice=voice, speed=speed, split_pattern=None):
            parts.append(np.asarray(audio, dtype=np.float32))
        gap = PAUSE_AFTER_HEADLINE if i == 0 and len(paras) > 1 else PAUSE_BETWEEN_PARAGRAPHS
        if i < len(paras) - 1:
            parts.append(np.zeros(int(RATE * gap), dtype=np.float32))
    return np.concatenate(parts) if parts else np.zeros(RATE // 2, dtype=np.float32)


def duet(pipe, text: str, voices: list[str]) -> np.ndarray:
    """Several voices saying the same line at once: each stretched slightly to the same length, then blended."""
    import soundfile as sf

    takes = [synth(pipe, v, [text]) for v in voices]
    target = sum(len(t) for t in takes) / len(takes)
    with tempfile.TemporaryDirectory() as d:
        ins, chains = [], []
        for i, t in enumerate(takes):
            f = Path(d, f"{i}.wav")
            sf.write(f, t, RATE)
            ins += ["-i", str(f)]
            chains.append(f"[{i}]atempo={len(t) / target:.4f}[a{i}]")
        mix = "".join(f"[a{i}]" for i in range(len(takes))) + f"amix=inputs={len(takes)}:normalize=0,volume={1 / len(takes) ** 0.5:.3f}"
        out = Path(d, "mix.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(chains) + ";" + mix, str(out)], check=True)
        audio, _ = sf.read(out, dtype="float32")
        return audio


def mp3(audio: np.ndarray, rate: int = RATE, loud: bool = True) -> bytes:
    """Mono mp3. loud=True evens out volume to podcast level (-16 LUFS), so every clip matches."""
    import soundfile as sf

    with tempfile.TemporaryDirectory() as d:
        wav, out = Path(d, "a.wav"), Path(d, "a.mp3")
        sf.write(wav, audio, rate)
        af = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000"] if loud else []
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), *af, "-ac", "1", "-b:a", "48k", str(out)], check=True)
        return out.read_bytes()


def unknown_names(pipe, text: str) -> dict[str, str]:
    """Capitalised words Kokoro's dictionary doesn't know (it guesses those), with an example."""
    try:
        lex = pipe.g2p.lexicon
        known = set(lex.golds) | set(lex.silvers)
    except Exception:
        return {}
    out = {}
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        for w in re.findall(r"\b[A-Z][a-zA-Z'’-]{2,}\b", sentence):
            bare = re.sub(r"['’]s$", "", w)
            if bare not in known and bare.lower() not in known and bare.capitalize() not in known:
                out.setdefault(bare, sentence[:200])
    return out
