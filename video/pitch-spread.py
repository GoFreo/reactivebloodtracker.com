"""How much does the pitch of a spoken clip move? A flat voice is measured here instead of guessed at.

    python3 video/pitch-spread.py clip1.wav clip2.wav ...

A crude pitch (F0) tracker: autocorrelation over 40 ms frames, 70-400 Hz. Prints, per file, the share of the clip
that is voiced, the median pitch, the spread (standard deviation, in semitones) and the range (5th to 95th percentile).
Natural conversational speech is about 2-4 semitones of spread and an 8-12 semitone range; a flat read is nearer 1-1.5.
Measured 3 Oct 2026: the Mac's Karen voice reads 1.8 / 5.7. Use it to compare any candidate voice (Kokoro, Suno) on the
same sentence. It reads PCM WAV only (convert first: ffmpeg -i in.mp3 -ac 1 out.wav). Needs numpy.
"""
import sys, wave
import numpy as np


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        raw = w.readframes(w.getnframes())
        sw = w.getsampwidth()
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    x = np.frombuffer(raw, dtype=dt).astype(np.float64)
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    x /= np.max(np.abs(x)) + 1e-9
    return sr, x


def f0_track(x, sr, fmin=70, fmax=400, frame_ms=40, hop_ms=10):
    n = int(sr * frame_ms / 1000)
    hop = int(sr * hop_ms / 1000)
    lo, hi = int(sr / fmax), int(sr / fmin)
    out = []
    energy_floor = 0.02
    for start in range(0, len(x) - n, hop):
        f = x[start:start + n]
        f = f - f.mean()
        if np.sqrt(np.mean(f * f)) < energy_floor:
            out.append(np.nan)
            continue
        f = f * np.hanning(n)
        ac = np.correlate(f, f, mode="full")[n - 1:]
        if ac[0] <= 0:
            out.append(np.nan)
            continue
        ac = ac / ac[0]
        seg = ac[lo:hi]
        k = int(np.argmax(seg))
        if seg[k] < 0.45:
            out.append(np.nan)
            continue
        out.append(sr / (k + lo))
    return np.array(out)


def summarise(path):
    sr, x = read_wav(path)
    f0 = f0_track(x, sr)
    v = f0[~np.isnan(f0)]
    if len(v) < 20:
        return None
    # Octave jumps are an artefact of the tracker; fold anything far from the median back toward it.
    med = np.median(v)
    st = 12 * np.log2(v / med)
    st = st[np.abs(st) < 9]
    return {
        "voiced": len(v) / len(f0),
        "median_hz": float(med),
        "std_st": float(np.std(st)),
        "range_st": float(np.percentile(st, 95) - np.percentile(st, 5)),
    }


if __name__ == "__main__":
    for p in sys.argv[1:]:
        r = summarise(p)
        if r is None:
            print(f"{p}: too little voiced speech to measure")
        else:
            print(f"{p.split('/')[-1]:42s} voiced {r['voiced']*100:4.0f}%  median {r['median_hz']:5.0f} Hz  std {r['std_st']:.2f} st  range {r['range_st']:.1f} st")
