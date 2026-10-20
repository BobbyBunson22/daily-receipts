"""Records the newest published edition in one newsreader voice, with Kokoro (free, Apache 2.0).

    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python scripts/voice/record.py george

For every story (most important first): the headline, then the full report, read in the voice,
saved as an mp3 in the public "voice" bucket and listed in voice_clips. Also the fixed bulletin
lines (intro, first, next, finally, outro, sample). Stories already recorded are skipped, so a
re-run only fills gaps. Clips older than the last two editions are deleted.

The words read must match readingScript() in src/lib/reader/bulletin.ts.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parents[2]
LINES = json.loads((ROOT / "src/lib/reader/voice-lines.json").read_text())
RATE = 24000
SETTINGS = f"long-v{LINES['version']}"  # change when the words or settings change, to re-record
KEEP_EDITIONS = 2

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def api(method: str, path: str, body=None, headers=None, raw: bytes | None = None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {**HEAD, **({"Content-Type": "application/json"} if raw is None else {}), **(headers or {})}
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL + path, data=data, method=method, headers=h), timeout=60) as r:
                txt = r.read().decode() or "null"
                return json.loads(txt) if txt.strip()[:1] in "[{n" else txt
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 3:
                raise SystemExit(f"{method} {path}: {e.code} {e.read().decode()[:300]}")
        except urllib.error.URLError:
            if attempt == 3:
                raise
        time.sleep(2 * (attempt + 1))


def spoken(t: str) -> str:
    t = re.sub(r"(\d)\s*[–-]\s*(\d)", r"\1 to \2", t)  # 3–1, 2024–25
    return re.sub(r"\s+", " ", t.replace("–", ", ").replace("—", ", ")).strip()


def reading_script(story: dict) -> str:
    body = story["body"] if isinstance(story["body"], list) else [story["body"]]
    return "\n\n".join([spoken(story["head"]).rstrip(".") + "."] + [spoken(p) for p in body if p and p.strip()])


def synth(pipe: KPipeline, voice: str, text: str) -> bytes:
    pause = np.zeros(int(RATE * 0.45), dtype=np.float32)
    parts = []
    for _, _, audio in pipe(text, voice=voice, speed=1.0, split_pattern=r"\n+"):
        parts += [np.asarray(audio, dtype=np.float32), pause]
    with tempfile.TemporaryDirectory() as d:
        wav, mp3 = Path(d, "a.wav"), Path(d, "a.mp3")
        sf.write(wav, np.concatenate(parts[:-1] or [pause]), RATE)
        # mono speech: 48 kbps is clear and keeps a day's clips small
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", "48k", str(mp3)], check=True)
        return mp3.read_bytes()


def upload(path: str, mp3: bytes) -> None:
    api("POST", f"/storage/v1/object/voice/{urllib.parse.quote(path)}", raw=mp3,
        headers={"Content-Type": "audio/mpeg", "x-upsert": "true", "Cache-Control": "max-age=86400"})


def cleanup(reader: str, keep: set[str]) -> None:
    folders = api("POST", "/storage/v1/object/list/voice", {"prefix": "kokoro/", "limit": 1000}) or []
    for f in folders:
        day = f["name"]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) or day in keep:
            continue
        files = api("POST", "/storage/v1/object/list/voice", {"prefix": f"kokoro/{day}/{reader}/", "limit": 1000}) or []
        names = [f"kokoro/{day}/{reader}/{x['name']}" for x in files if x.get("id")]
        for i in range(0, len(names), 100):
            api("DELETE", "/storage/v1/object/voice", {"prefixes": names[i : i + 100]})
        api("DELETE", f"/rest/v1/voice_clips?path=like.{urllib.parse.quote(f'kokoro/{day}/{reader}/*')}")
        print(f"deleted {len(names)} old clips from {day}")


def main() -> None:
    reader = sys.argv[1]
    voice = LINES["readers"][reader]["kokoro"]
    voice_id = f"kokoro:{voice}"
    eds = api("GET", f"/rest/v1/editions?status=eq.published&select=id,date&order=issue.desc&limit={KEEP_EDITIONS}")
    ed = eds[0]
    stories = api("GET", f"/rest/v1/stories?edition_id=eq.{ed['id']}&select=id,slug,head,body,sources,score")
    stories.sort(key=lambda s: -(s["sources"] * 10 + s["score"] / 10))
    done = {c["story_id"] for c in api("GET", f"/rest/v1/voice_clips?voice_id=eq.{urllib.parse.quote(voice_id)}&settings_hash=eq.{SETTINGS}"
                                         f"&story_id=in.({','.join(str(s['id']) for s in stories)})&select=story_id")}
    print(f"Edition {ed['date']}: {len(stories)} stories, {len(done)} already recorded in {reader}")

    pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")  # British English
    for key, text in LINES["parts"].items():
        upload(f"kokoro/{reader}/parts/v{LINES['version']}/{key}.mp3", synth(pipe, voice, text))

    t0 = time.time()
    for n, s in enumerate(stories, 1):
        if s["id"] in done:
            continue
        text = reading_script(s)
        path = f"kokoro/{ed['date']}/{reader}/{s['slug']}.mp3"
        upload(path, synth(pipe, voice, text))
        api("POST", "/rest/v1/voice_clips?on_conflict=story_id,voice_id,settings_hash",
            {"story_id": s["id"], "voice_id": voice_id, "settings_hash": SETTINGS, "path": path, "chars": len(text)},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        print(f"{n}/{len(stories)} {s['slug']} ({time.time() - t0:.0f}s)", flush=True)

    cleanup(reader, {e["date"] for e in eds})


if __name__ == "__main__":
    main()
