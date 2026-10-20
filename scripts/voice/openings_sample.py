"""Records candidate two-handed openings (scripts/voice/openings.json), each with Emma leading and
George second, so they can be compared by ear.   python scripts/voice/openings_sample.py out/"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from speak import RATE, mp3, synth  # noqa: E402

from kokoro import KPipeline  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
for n, c in enumerate(json.loads((HERE / "openings.json").read_text()), 1):
    for lead, second, lv, sv in [("Emma", "George", "bf_emma", "bm_george"), ("George", "Emma", "bm_george", "bf_emma")]:
        a = synth(pipe, lv, [c["lead"].replace("{me}", lead)])
        b = synth(pipe, sv, [c["second"].replace("{me}", second)])
        audio = np.concatenate([a, np.zeros(int(RATE * 0.3), dtype=np.float32), b])
        (out / f"opening-{n}-{lead.lower()}-leads.mp3").write_bytes(mp3(audio))
