"""Records the newest published edition in one newsreader voice, with Kokoro (free, Apache 2.0).

    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python scripts/voice/record.py george [shard shards]

With "1 3", this job records every third story starting from the second (most important first),
so three jobs per voice share the edition and finish together. Shard 0 also records the fixed
lines and tidies old clips.

For every story (most important first): the headline, then the full report, read in the voice,
saved as an mp3 in the public "voice" bucket and listed in voice_clips. Also the fixed bulletin
lines (intro, first, next, finally, outro, sample). Stories already recorded are skipped, so a
re-run only fills gaps. Clips older than the last two editions are deleted.

The words read must match readingScript() in src/lib/reader/bulletin.ts.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from kokoro import KPipeline

sys.path.insert(0, str(Path(__file__).parent))
from speak import mp3, paragraphs, synth, unknown_names  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LINES = json.loads((ROOT / "src/lib/reader/voice-lines.json").read_text())
SETTINGS = f"long-v{LINES['version']}"  # bump "version" in voice-lines.json when the words or settings change, to re-record
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
    shard, shards = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (0, 1)
    voice = LINES["readers"][reader]["kokoro"]
    voice_id = f"kokoro:{voice}"
    eds = api("GET", f"/rest/v1/editions?status=eq.published&select=id,date&order=issue.desc&limit={KEEP_EDITIONS}")
    ed = eds[0]
    stories = api("GET", f"/rest/v1/stories?edition_id=eq.{ed['id']}&select=id,slug,sec,head,body,spoken,sources,score")
    stories.sort(key=lambda s: (-(s["sources"] * 10 + s["score"] / 10), s["id"]))
    stories = stories[shard::shards]
    done = {c["story_id"] for c in api("GET", f"/rest/v1/voice_clips?voice_id=eq.{urllib.parse.quote(voice_id)}&settings_hash=eq.{SETTINGS}"
                                         f"&story_id=in.({','.join(str(s['id']) for s in stories)})&select=story_id")}
    print(f"Edition {ed['date']}, part {shard + 1} of {shards}: {len(stories)} stories, {len(done)} already recorded in {reader}")

    pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")  # British English
    me = LINES["readers"][reader]["name"]
    other = next(r["name"] for k, r in LINES["readers"].items() if k != reader)
    for key, text in (LINES["parts"].items() if shard == 0 else []):
        text = text.replace("{me}", me).replace("{other}", other)
        upload(f"kokoro/{reader}/parts/v{LINES['version']}/{key}.mp3", mp3(synth(pipe, voice, [text])))

    t0 = time.time()
    names: dict[str, str] = {}
    for n, s in enumerate(stories, 1):
        if s["id"] in done:
            continue
        paras = paragraphs(s)
        text = "\n\n".join(paras)
        names.update(unknown_names(pipe, text))
        path = f"kokoro/{ed['date']}/{reader}/{s['slug']}.{SETTINGS}.mp3"  # new settings, new URL: no stale caches
        upload(path, mp3(synth(pipe, voice, paras)))
        api("POST", "/rest/v1/voice_clips?on_conflict=story_id,voice_id,settings_hash",
            {"story_id": s["id"], "voice_id": voice_id, "settings_hash": SETTINGS, "path": path, "chars": len(text)},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        print(f"{n}/{len(stories)} {s['slug']} ({time.time() - t0:.0f}s)", flush=True)

    if names and reader == "george":
        # for checking by ear: names the dictionary doesn't know (add fixes to lexicon.json)
        rows = [{"word": w, "last_seen": ed["date"], "example": ex} for w, ex in sorted(names.items())]
        api("POST", "/rest/v1/voice_names?on_conflict=word", rows, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        print(f"{len(rows)} names not in the dictionary: {', '.join(sorted(names))[:500]}")
    if shard == 0:
        cleanup(reader, {e["date"] for e in eds})


if __name__ == "__main__":
    main()
