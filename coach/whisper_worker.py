# Local speech to text for the call coach. Keeps the Whisper model loaded and
# answers one job per line on stdin. Run by coach/server.ts, never by hand.
# Job in:  {"id": 1, "pcm": "<base64 16 kHz mono int16>", "prompt": "..."}
# Out:     {"id": 1, "text": "..."}
import base64
import json
import os
import sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")

import numpy as np  # noqa: E402
import mlx_whisper  # noqa: E402

MODEL = sys.argv[1] if len(sys.argv) > 1 else "mlx-community/whisper-large-v3-turbo"


def transcribe(audio: np.ndarray, prompt: str | None) -> str:
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=MODEL,
        language="en",
        condition_on_previous_text=False,
        initial_prompt=prompt or None,
        verbose=None,
    )
    # Drop segments Whisper itself thinks are not speech (it invents words on silence).
    kept = [s["text"] for s in result.get("segments", []) if s.get("no_speech_prob", 0.0) < 0.6]
    return "".join(kept).strip()


transcribe(np.zeros(16000, dtype=np.float32), None)  # load the model before the call starts
print(json.dumps({"ready": True, "model": MODEL}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    job = json.loads(line)
    try:
        pcm = np.frombuffer(base64.b64decode(job["pcm"]), dtype=np.int16).astype(np.float32) / 32768.0
        print(json.dumps({"id": job["id"], "text": transcribe(pcm, job.get("prompt"))}), flush=True)
    except Exception as err:  # keep the worker alive; the server shows the error
        print(json.dumps({"id": job["id"], "text": "", "error": str(err)}), flush=True)
