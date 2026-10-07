"""Turn today's Daily Receipts script into MP3s in your cloned ElevenLabs voice.

Reads scripts/edition.json (written each morning by the Daily Receipts edition job),
writes audio/<issue>/*.mp3 plus audio/<issue>/manifest.json, and skips any clip that
already exists, so re-runs only pay for what is missing.
Needs the ELEVENLABS_API_KEY secret. Settings live in voice.json.
"""
import json, os, sys, time, hashlib, urllib.request, urllib.error, pathlib

ROOT = pathlib.Path(__file__).parent

def report(ok, msg, **extra):
    """Leave a note in the repo about this run, so problems can be read without the Actions log."""
    note = {"ok": ok, "message": msg, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **extra}
    (ROOT / "status.json").write_text(json.dumps(note, indent=1))
    print(("OK: " if ok else "FAILED: ") + msg)
    if not ok:
        sys.exit(1)
cfg = json.loads((ROOT / "voice.json").read_text())
key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
if not key:
    report(False, "ELEVENLABS_API_KEY secret is missing. Add it in the repo's Settings > Secrets and variables > Actions.")

ed = json.loads((ROOT / "scripts" / "edition.json").read_text())
issue = ed["issue"]
out = ROOT / "audio" / str(issue)
fixed_dir = ROOT / "audio" / "fixed"
out.mkdir(parents=True, exist_ok=True)
fixed_dir.mkdir(parents=True, exist_ok=True)
used = 0

def tts(text, dest):
    """Create one clip. The file name carries a hash of the words so edited text is re-recorded."""
    global used
    if dest.exists() and dest.stat().st_size > 1000:
        return
    url = os.environ.get("ELEVENLABS_BASE", "https://api.elevenlabs.io") + f"/v1/text-to-speech/{cfg['voice_id']}?output_format={cfg['output_format']}"
    body = json.dumps({"text": text, "model_id": cfg["model_id"], "voice_settings": cfg["voice_settings"],
                       "language_code": "en"}).encode()
    for attempt in range(5):
        req = urllib.request.Request(url, data=body, method="POST",
                                     headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                dest.write_bytes(r.read())
            used += len(text)
            print(f"  made {dest.relative_to(ROOT)} ({len(text)} chars)")
            return
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 502, 503) and attempt < 4:
                wait = 5 * (attempt + 1)
                print(f"  {e.code}, retrying in {wait}s: {msg}")
                time.sleep(wait)
                continue
            report(False, f"ElevenLabs refused {dest.name}: HTTP {e.code} {msg}", made_chars=used)
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(5); continue
            report(False, f"Could not reach ElevenLabs: {e}", made_chars=used)

SETTINGS = json.dumps([cfg["model_id"], cfg["voice_settings"]], sort_keys=True)
def name_for(prefix, text):
    """New words or new voice settings give a new file name, so the clip is re-recorded."""
    return f"{prefix}-{hashlib.sha1((text + SETTINGS).encode()).hexdigest()[:8]}.mp3"

print(f"Edition {issue}, {len(ed['stories'])} stories")
manifest = {"issue": issue, "date": ed["date"], "name": cfg.get("name", ""), "parts": {}, "clips": {}}
# phrases that never change are recorded once and reused every day
for part, text in ed["fixed"].items():
    f = fixed_dir / name_for(part, text)
    tts(text, f)
    manifest["parts"][part] = f"audio/fixed/{f.name}"
if ed.get("intro"):  # older scripts had a dated intro; it is now a fixed phrase recorded once
    f = out / name_for("intro", ed["intro"])
    tts(ed["intro"], f)
    manifest["intro"] = f"audio/{issue}/{f.name}"
limit = int(os.environ.get("MAX_STORIES", "0") or 0) or int(cfg.get("max_stories", 0) or 0)
for n, s in enumerate(ed["stories"]):
    if limit and n >= limit:
        break
    f = out / name_for(s["id"], s["text"])
    tts(s["text"], f)
    manifest["clips"][s["id"]] = f"audio/{issue}/{f.name}"
(out / "manifest.json").write_text(json.dumps(manifest, indent=1))
# tidy up clips this edition no longer uses (for example after a wording or settings change)
keep = {pathlib.Path(p).name for p in [*manifest["clips"].values(), *manifest["parts"].values(), manifest.get("intro", "")] if p}
for d in (out, fixed_dir):
    for f in d.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
report(True, f"Edition {issue}: {len(manifest['clips'])} story clips ready. Characters used this run: {used}", issue=issue, clips=len(manifest["clips"]), made_chars=used)
