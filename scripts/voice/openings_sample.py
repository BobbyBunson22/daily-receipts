"""Records the two-handed opening exactly as the voice job does (speak.opening).
    python scripts/voice/openings_sample.py out/"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from speak import mp3, opening  # noqa: E402

from kokoro import KPipeline  # noqa: E402

LINES = json.loads((HERE.parents[1] / "src/lib/reader/voice-lines.json").read_text())
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
(out / "opening.mp3").write_bytes(mp3(opening(pipe, LINES)))
