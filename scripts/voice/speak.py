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


def trim(audio: np.ndarray, threshold: float = 0.01, pad: float = 0.03) -> np.ndarray:
    """Cuts the silence Kokoro leaves at the start and end of a take."""
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if not len(loud):
        return audio
    p = int(RATE * pad)
    return audio[max(0, loud[0] - p): loud[-1] + p]


OPENING_GAP = 0.12  # seconds between the first newsreader's hello and the second's reply


def opening(pipe, lines: dict) -> np.ndarray:
    """The two-handed opening as one clip: the lead's hello, a short beat, the other's reply."""
    readers = lines["readers"]
    lead = lines["duoLead"]
    other = next(k for k in readers if k != lead)
    fill = lambda key, me, them: lines["parts"][key].replace("{me}", readers[me]["name"]).replace("{other}", readers[them]["name"])  # noqa: E731
    return np.concatenate([
        trim(synth(pipe, readers[lead]["kokoro"], [fill("hello", lead, other)])),
        np.zeros(int(RATE * OPENING_GAP), dtype=np.float32),
        trim(synth(pipe, readers[other]["kokoro"], [fill("welcome", other, lead)])),
    ])


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
