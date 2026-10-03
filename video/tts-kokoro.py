#!/usr/bin/env python3
"""Speaks the explainer video's lines with Kokoro: a small open neural voice that runs on this Mac.
Nothing is sent anywhere, and this script downloads nothing; the two model files go in video/models/ first.

Used by video/record.mjs when VOICE_ENGINE=kokoro (it passes a JSON list of {key, text, file}), or by hand:

    python3 video/tts-kokoro.py --samples video/voice/samples      # one sentence in several voices, to choose from
    python3 video/tts-kokoro.py --text "Hello there." --out hello.wav --voice bf_emma

One-time setup:
    pip install kokoro-onnx
    video/models/kokoro-v1.0.onnx     (the 310 MB model; the .fp16 or .int8 build of it also works)
    video/models/voices-v1.0.bin
Both model files come from the kokoro-onnx project's GitHub releases (model-files-v1.0).
"""
import argparse
import json
import re
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
MODEL_NAMES = ["kokoro-v1.0.onnx", "kokoro-v1.0.fp16.onnx", "kokoro-v1.0.int8.onnx"]
VOICES_NAME = "voices-v1.0.bin"

# Said the way the makers say them. Only the spoken sound changes; the subtitles keep the real spelling.
RESPELL = {
    r"\bLibre\b": "Leebray",
    r"\bAccu-Chek\b": "Accu-Check",
}

# A line to compare voices on: it has a rise, a fall, a question and a list, so a flat voice shows.
SAMPLE_TEXT = "After a meal, your blood sugar climbs. Then, an hour or two later, it crashes. Two chocolate biscuits? A whisky after the footy? Whatever the answer, it goes on the record."
SAMPLE_VOICES = ["af_heart", "af_bella", "af_nicole", "bf_emma", "bf_isabella", "am_michael", "bm_george"]


def load():
    try:
        from kokoro_onnx import Kokoro
    except ImportError:
        sys.exit("kokoro-onnx isn't installed. Run:  pip install kokoro-onnx")
    model = next((MODELS / n for n in MODEL_NAMES if (MODELS / n).exists()), None)
    voices = MODELS / VOICES_NAME
    if model is None or not voices.exists():
        sys.exit(f"Kokoro's model files are missing from {MODELS}. It needs one of {MODEL_NAMES} and {VOICES_NAME}.")
    return Kokoro(str(model), str(voices))


def spoken_form(text):
    for pattern, said in RESPELL.items():
        text = re.sub(pattern, said, text)
    return text


def trim(samples, rate, head_ms=40, tail_ms=140, floor=0.004):
    """Cut the silence the model leaves at either end, keeping a short breath, so the video decides every pause."""
    loud = np.flatnonzero(np.abs(samples) > floor)
    if loud.size == 0:
        return samples
    start = max(0, loud[0] - int(rate * head_ms / 1000))
    end = min(len(samples), loud[-1] + int(rate * tail_ms / 1000))
    return samples[start:end]


def write_wav(path, samples, rate):
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def speak(kokoro, text, voice, speed):
    lang = "en-gb" if voice.startswith("b") else "en-us"
    samples, rate = kokoro.create(spoken_form(text), voice=voice, speed=speed, lang=lang)
    return trim(np.asarray(samples, dtype=np.float32), rate), rate


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", help="JSON file: a list of {key, text, file}; writes each file")
    ap.add_argument("--samples", help="folder to write one sample per voice into")
    ap.add_argument("--text", help="speak this text")
    ap.add_argument("--out", help="where --text writes its WAV")
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.97)
    args = ap.parse_args()
    if not (args.list or args.samples or args.text):
        ap.error("give --list, --samples or --text")

    kokoro = load()
    known = set(kokoro.get_voices())

    def check(voice):
        if voice not in known:
            sys.exit(f"Unknown voice {voice!r}. Available: {', '.join(sorted(known))}")

    if args.list:
        check(args.voice)
        for item in json.loads(Path(args.list).read_text()):
            samples, rate = speak(kokoro, item["text"], args.voice, args.speed)
            write_wav(Path(item["file"]), samples, rate)
            print(f"  {len(samples) / rate:5.1f} s  {item['text'][:70]}")
    if args.samples:
        out = Path(args.samples)
        for voice in SAMPLE_VOICES:
            if voice not in known:
                continue
            samples, rate = speak(kokoro, SAMPLE_TEXT, voice, args.speed)
            write_wav(out / f"{voice}.wav", samples, rate)
            print(f"  {voice}: {len(samples) / rate:4.1f} s -> {out / (voice + '.wav')}")
    if args.text:
        if not args.out:
            ap.error("--text needs --out")
        check(args.voice)
        samples, rate = speak(kokoro, args.text, args.voice, args.speed)
        write_wav(Path(args.out), samples, rate)


if __name__ == "__main__":
    main()
