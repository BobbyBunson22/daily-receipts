"""The Daily Receipts jingle: four marimba notes for "Dai-ly Re-ceipts", a soft paper tear on the
last one, settling on a warm chord. Synthesised from scratch (no samples), so it's ours outright.

    python scripts/voice/jingle.py      (needs numpy, scipy and ffmpeg)

Writes public/audio/jingle.mp3 (trimmed, for the start of the roundup: the voice comes in on its
tail) and brand/sound/daily-receipts-jingle.mp3 (full length, for videos and anything else).
"""
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
rng = np.random.default_rng(3)
ROOT = Path(__file__).resolve().parents[2]


def hz(note):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = note[:-1], int(note[-1])
    return 440 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def t(d):
    return np.arange(int(SR * d)) / SR


def lp(x, f):
    return sosfilt(butter(2, f, btype="low", fs=SR, output="sos"), x)


def soft_attack(n, a=0.004):
    e = np.ones(n)
    k = int(SR * a)
    e[:k] = np.linspace(0, 1, k)
    return e


def marimba(f, d=0.9):
    tt = t(d)
    x = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 6) + 0.25 * np.sin(2 * np.pi * f * 3.93 * tt) * np.exp(-tt * 22)
    return x * soft_attack(len(tt), 0.003)


def epiano(f, d=1.4):
    """Rhodes-like: gentle FM, the bite fading fast to a round tone."""
    tt = t(d)
    index = 1.6 * np.exp(-tt * 5)
    x = np.sin(2 * np.pi * f * tt + index * np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 2.2)
    x += 0.08 * np.sin(2 * np.pi * f * 14 * tt) * np.exp(-tt * 30)  # tine
    return x * soft_attack(len(tt), 0.006)


def bell(f, d=1.8):
    tt = t(d)
    x = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * k) for r, a, k in [(1, 1, 2.2), (2.0, 0.35, 3.5), (2.76, 0.25, 5), (5.4, 0.08, 9)])
    return x * soft_attack(len(tt), 0.002)


def pad(fs, d=1.8):
    tt = t(d)
    x = sum(np.sin(2 * np.pi * f * (1 + det) * tt) for f in fs for det in (-0.003, 0, 0.003))
    e = np.minimum(1, tt / 0.35) * np.exp(-np.maximum(0, tt - 0.6) * 2.2)
    return lp(x * e, 2500) / (3 * len(fs))


def purr(d=0.7):
    """A very soft printer purr: rounded, low, like it's humming along."""
    tt = t(d)
    ph = 2 * np.pi * 220 * tt
    x = lp(np.sign(np.sin(ph)) * (0.6 + 0.4 * (np.sin(2 * np.pi * 24 * tt) > 0)), 900)
    return x * np.minimum(1, tt / 0.08) * np.minimum(1, (d - tt) / 0.15) * 0.25


def place(track, sound, at, gain=1.0):
    i = int(SR * at)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[: end - i] * gain


def reverb(x, size=1.4, mix=0.22):
    tt = t(size)
    ir = rng.standard_normal(len(tt)) * np.exp(-tt * 4.5)
    ir = lp(ir, 4000)
    wet = fftconvolve(x, ir)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return dry * (1 - mix) + wet * mix


def write_mp3(path: Path, x: np.ndarray, af: str, extra: list[str] | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    wav = path.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af", af, *(extra or ["-b:a", "128k"]), str(path)], check=True)
    wav.unlink()


def track(d):
    return np.zeros(int(SR * d))



def hp(x, f):
    return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)


def tear(d=0.34, level=0.55):
    """A soft paper tear: fibres snapping in a quick swell, warm rather than hissy, with a gentle final snap."""
    tt = t(d)
    shape = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 1.2
    grains = (rng.random(len(tt)) < 0.004 + 0.05 * shape).astype(float) * rng.uniform(0.2, 1, len(tt))
    click = np.exp(-np.arange(90) / 14.0)
    crackle = lp(hp(np.convolve(grains, click, "same"), 700), 4500)
    fibre = lp(hp(rng.standard_normal(len(tt)), 500), 2800) * shape * 0.18
    x = crackle + fibre
    x *= np.minimum(1, tt / 0.01) * np.minimum(1, (d - tt) / 0.04)
    snap = lp(hp(rng.standard_normal(int(SR * 0.03)), 600), 4000) * np.exp(-t(0.03) * 110) * 0.6
    y = np.concatenate([x, snap])
    return y / (np.max(np.abs(y)) + 1e-9) * level


def motif(x, start, inst=marimba, notes=("G4", "C5", "E5", "G5"), gaps=(0, 0.18, 0.36, 0.58), gain=1.0):
    for g, n in zip(gaps, notes):
        place(x, inst(hz(n)), start + g, gain)


def hp(x, f):
    return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)


def tear(d=0.34, level=0.55):
    """A soft paper tear: fibres snapping in a quick swell, warm rather than hissy, with a gentle final snap."""
    tt = t(d)
    shape = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 1.2
    grains = (rng.random(len(tt)) < 0.004 + 0.05 * shape).astype(float) * rng.uniform(0.2, 1, len(tt))
    click = np.exp(-np.arange(90) / 14.0)
    crackle = lp(hp(np.convolve(grains, click, "same"), 700), 4500)
    fibre = lp(hp(rng.standard_normal(len(tt)), 500), 2800) * shape * 0.18
    x = crackle + fibre
    x *= np.minimum(1, tt / 0.01) * np.minimum(1, (d - tt) / 0.04)
    snap = lp(hp(rng.standard_normal(int(SR * 0.03)), 600), 4000) * np.exp(-t(0.03) * 110) * 0.6
    y = np.concatenate([x, snap])
    return y / (np.max(np.abs(y)) + 1e-9) * level


def motif(x, start, inst=marimba, notes=("G4", "C5", "E5", "G5"), gaps=(0, 0.18, 0.36, 0.58), gain=1.0):
    for g, n in zip(gaps, notes):
        place(x, inst(hz(n)), start + g, gain)



x = track(2.3)
motif(x, 0.0)
place(x, tear(0.32), 0.56, 0.5)
place(x, pad([hz("C4"), hz("E4"), hz("G4")]), 0.55, 0.9)
x = reverb(x)
x = x / (np.max(np.abs(x)) + 1e-9) * 0.9

write_mp3(ROOT / "brand/sound/daily-receipts-jingle.mp3", x, "loudnorm=I=-16:TP=-1.5")
# for the roundup: stop where the voice comes in, fading the chord under it
cut = int(SR * 1.95)
fade = int(SR * 0.3)
short = x[:cut].copy()
short[-fade:] *= np.linspace(1, 0, fade)
# same format as the voice clips (24 kHz mono), so a roundup can be saved as one file
write_mp3(ROOT / "public/audio/jingle.mp3", short, "loudnorm=I=-16:TP=-1.5,aresample=24000", ["-ac", "1", "-b:a", "48k"])
