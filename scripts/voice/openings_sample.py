"""Records the two-handed opening as the app plays it (voice-lines.json: hello, welcome, then the
together line in both voices at once), with each newsreader leading.
    python scripts/voice/openings_sample.py out/"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from speak import RATE, duet, mp3, synth  # noqa: E402

from kokoro import KPipeline  # noqa: E402

LINES = json.loads((HERE.parents[1] / "src/lib/reader/voice-lines.json").read_text())
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
R = LINES["readers"]
gap = np.zeros(int(RATE * 0.25), dtype=np.float32)
together = duet(pipe, LINES["together"]["welcome"], [r["kokoro"] for r in R.values()])
for lead, other in [("emma", "george"), ("george", "emma")]:
    fill = lambda key, me, them: LINES["parts"][key].replace("{me}", R[me]["name"]).replace("{other}", R[them]["name"])  # noqa: E731
    audio = np.concatenate([
        synth(pipe, R[lead]["kokoro"], [fill("hello", lead, other)]), gap,
        synth(pipe, R[other]["kokoro"], [fill("welcome", other, lead)]), gap,
        together,
    ])
    (out / f"opening-{lead}-leads.mp3").write_bytes(mp3(audio))
