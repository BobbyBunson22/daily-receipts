"""One-off listening test: the same story recorded with different settings, so the best one can be picked by ear.
Run from the Actions tab ("Voice comparison"). Writes compare/*.mp3 and compare/status.json."""
import json, os, sys, time, urllib.request, urllib.error, pathlib

ROOT = pathlib.Path(__file__).parent
cfg = json.loads((ROOT / "voice.json").read_text())
tests = json.loads((ROOT / "compare.json").read_text())
key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
out = ROOT / "compare"; out.mkdir(exist_ok=True)
results = []
for t in tests:
    body = {"text": t["text"], "model_id": t["model_id"], "voice_settings": t["voice_settings"]}
    if t["model_id"] != "eleven_v3":
        body["language_code"] = "en"
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{cfg['voice_id']}?output_format={cfg['output_format']}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            (out / f"{t['name']}.mp3").write_bytes(r.read())
        results.append({"name": t["name"], "ok": True, "chars": len(t["text"])})
        print("made", t["name"])
    except urllib.error.HTTPError as e:
        results.append({"name": t["name"], "ok": False, "error": f"HTTP {e.code} {e.read().decode(errors='replace')[:300]}"})
        print("failed", t["name"], e.code)
(out / "status.json").write_text(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "results": results}, indent=1))
