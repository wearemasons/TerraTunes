"""Recorded orchestral instruments for the ensemble: VSCO-2 Community Edition (CC0, public domain).

`python -m app.cli samples` downloads only the notes the ensemble needs from
github.com/sgossner/VSCO-2-CE, trims leading silence, measures each note's real pitch (the library
mixes octave-naming conventions) and stores 16-bit stereo WAVs plus a manifest under
data/samples/vsco2/ (gitignored). The renderer pitch-shifts the nearest recorded note.
"""

import http.client
import io
import json
import logging
import re
import time
import urllib.parse
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from app.core.config import get_settings

log = logging.getLogger(__name__)

SAMPLE_SR = 44100
MAX_S = 9.0
REPO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"
FILES = Path(__file__).with_name("vsco2_files.json")  # pinned list (no GitHub API call needed)
NAMES = {
    "C": 0,
    "C#": 1,
    "D": 2,
    "D#": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "G": 7,
    "G#": 8,
    "A": 9,
    "A#": 10,
    "B": 11,
}


@dataclass(frozen=True)
class Source:
    folder: str
    pattern: str  # regex on the file name; group "note" = e.g. "C#4"
    lo: int  # MIDI range to keep (scientific pitch, C4 = 60)
    hi: int


SOURCES: dict[str, Source] = {
    "flute": Source("Woodwinds/Flute/susvib", r"_(?P<note>[A-G]#?\d)_v1_1\.wav$", 60, 98),
    "horn": Source("Brass/F Horn/sus", r"_(?P<note>[A-G]#?\d)_v1_1\.wav$", 45, 80),
    "cello": Source("Strings/Cello Section/susvib", r"_(?P<note>[A-G]#?\d)_v1_1\.wav$", 30, 64),
    "violins": Source("Strings/Violin Section/susVib", r"_(?P<note>[A-G]#?\d)_v1\.wav$", 52, 90),
    "harp": Source("Strings/Harp", r"_(?P<note>[A-G]#?\d)_(mf|f|mp)\.wav$", 38, 96),
    "clarinet": Source("Woodwinds/Clarinet/susLong", r"_(?P<note>[A-G]#?\d)_v2_rr1_sum\.wav$", 0, 127),
    "oboe": Source("Woodwinds/Oboe/Vib", r"_(?P<note>[A-G]#?\d)_v1_Main\.wav$", 0, 127),
    "bassoon": Source("Woodwinds/Bassoon/sus", r"_(?P<note>[A-G]#?\d)_v1_1\.wav$", 0, 127),
    "trumpet": Source("Brass/Trumpet/sus", r"_(?P<note>[A-G]#?\d)_v1_rr1\.wav$", 0, 127),
    "tuba": Source("Brass/Tuba/sus", r"_(?P<note>[A-G]#?\d)_v1_rr1_Mid\.wav$", 0, 127),
    "violas": Source("Strings/Viola Section/susvib", r"_(?P<note>[A-G]#?\d)_v1_1\.wav$", 0, 127),
    "contrabass": Source("Strings/Solo Contrabass/SusVib", r"_(?P<note>[A-G]#?\d)_v1_rr1\.wav$", 0, 127),
    "cello_pizz": Source("Strings/Cello Section/pizzT", r"_(?P<note>[A-G]#?\d)_v2_RR1\.wav$", 0, 127),
    "violin_pizz": Source("Strings/Violin Section/Pizz", r"_(?P<note>[A-G]#?\d)_v2_rr1\.wav$", 0, 127),
    "violin_trem": Source("Strings/Violin Section/Trem", r"_(?P<note>[A-G]#?\d)_v1\.wav$", 0, 127),
    "violin_spic": Source("Strings/Violin Section/Spic", r"_(?P<note>[A-G]#?\d)_v2_rr1\.wav$", 0, 127),
    "marimba": Source("Percussion/Marimba", r"_(?P<note>[A-G]#?\d)_loud_01\.wav$", 0, 127),
    "glock": Source("Percussion/Glock", r"_(?P<note>[A-G]#?\d)\.wav$", 0, 127),
}


def samples_dir() -> Path:
    return get_settings().data_dir / "samples" / "vsco2"


def _decode(raw: bytes) -> tuple[NDArray[np.float32], int]:
    with wave.open(io.BytesIO(raw)) as w:
        ch, width, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        data = w.readframes(n)
    if width == 3:
        b = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3)
        ints = b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16)
        ints = np.where(ints >= 1 << 23, ints - (1 << 24), ints)
        x = ints.astype(np.float32) / (1 << 23)
    elif width == 2:
        x = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768
    else:
        raise ValueError(f"Unsupported sample width {width}")
    x = x.reshape(-1, ch).T
    if ch == 1:
        x = np.vstack([x, x])
    return x[:2].astype(np.float32), sr


def _resample(x: NDArray[np.float32], ratio: float) -> NDArray[np.float32]:
    """Read x at `ratio` speed (ratio > 1 = higher pitch, shorter)."""
    n = int(x.shape[1] / ratio)
    pos = np.arange(n, dtype=np.float64) * ratio
    return np.stack([np.interp(pos, np.arange(x.shape[1]), c) for c in x]).astype(np.float32)


def _f0(x: NDArray[np.float32], sr: int) -> float:
    """Fundamental by autocorrelation on a steady part of the note."""
    m = x.mean(0)
    seg = m[int(0.4 * sr) : int(1.6 * sr)]
    seg = seg - seg.mean()
    size = 1 << (2 * len(seg) - 1).bit_length()
    spec = np.fft.rfft(seg, size)
    ac = np.fft.irfft(spec * np.conj(spec))[: len(seg)]
    lo, hi = int(sr / 2200), int(sr / 25)
    lag = lo + int(np.argmax(ac[lo:hi]))
    # Prefer the shortest lag with a near-maximal peak (avoid octave-low errors).
    for div in (4, 3, 2):
        cand = round(lag / div)
        win = ac[max(lo, cand - 2) : cand + 3]
        if cand > lo and win.size and win.max() > 0.85 * ac[lag]:
            lag = max(lo, cand - 2) + int(np.argmax(win))
            break
    if 1 <= lag < len(ac) - 1:  # parabolic interpolation
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        lag = lag + 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    return float(sr / lag)


def _prepare(raw: bytes, name_note: str) -> tuple[NDArray[np.float32], float] | None:
    x, sr = _decode(raw)
    if sr != SAMPLE_SR:
        x = _resample(x, sr / SAMPLE_SR)
        sr = SAMPLE_SR
    env = np.abs(x).max(0)
    start = int(np.argmax(env > env.max() * 10 ** (-45 / 20)))
    x = x[:, max(0, start - int(0.004 * sr)) : start + int(MAX_S * sr)]
    fade = min(x.shape[1] // 4, int(0.4 * sr))
    x[:, -fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    x /= np.abs(x).max() + 1e-9
    # Pitch: the file name gives the pitch class; the measured f0 decides octave and fine tuning.
    m = re.fullmatch(r"([A-G]#?)(-?\d)", name_note)
    assert m
    pc = NAMES[m.group(1)]
    measured = 69 + 12 * np.log2(_f0(x, sr) / 440)
    # Names use scientific (C4 = 60) or Yamaha (C3 = 60) octaves; the measured pitch must agree with
    # one of them, otherwise the detection (or the file) is unreliable and the note is skipped.
    named = (pc + 12 * (int(m.group(2)) + 1), pc + 12 * (int(m.group(2)) + 2))
    midi = min(named, key=lambda c: abs(c - measured))
    cents = measured - midi
    if abs(cents) > 0.5:
        log.warning("Skipping sample %s: measured MIDI %.2f matches neither octave name", name_note, measured)
        return None
    return x, float(midi + cents)


def fetch(force: bool = False) -> Path:
    """Download and prepare the ensemble's samples. Idempotent; returns the samples folder."""
    out = samples_dir()
    manifest_path = out / "manifest.json"
    if manifest_path.exists() and not force:
        return out
    tree: list[str] = json.loads(FILES.read_text(encoding="utf-8"))
    jobs: list[tuple[str, str, str]] = []
    for inst, src in SOURCES.items():
        for path in tree:
            if not path.startswith(src.folder + "/") or "/" in path[len(src.folder) + 1 :]:
                continue
            m = re.search(src.pattern, path)
            if m:
                jobs.append((inst, path, m.group("note")))

    def work(job: tuple[str, str, str]) -> tuple[str, float, str] | None:
        inst, path, note = job
        cached = out / "_raw" / path
        if cached.exists():
            raw = cached.read_bytes()
        else:
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(REPO + urllib.parse.quote(path), timeout=180) as r:
                        raw = r.read()
                    break
                except (OSError, http.client.HTTPException) as err:
                    log.warning("Download %s failed (%s), attempt %d", path, err, attempt + 1)
                    time.sleep(2 + 4 * attempt)
            else:
                failed.append(path)
                return None
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(raw)
        prepared = _prepare(raw, note)
        if prepared is None:
            return None
        x, midi = prepared
        src = SOURCES[inst]
        if not src.lo <= midi <= src.hi:
            return None
        dest = out / inst / f"{midi:.2f}.wav"
        dest.parent.mkdir(parents=True, exist_ok=True)
        pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").T.reshape(-1)
        with wave.open(str(dest), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_SR)
            w.writeframes(pcm.tobytes())
        log.info("%s %s → MIDI %.2f", inst, Path(path).name, midi)
        return inst, midi, dest.name

    failed: list[str] = []
    with ThreadPoolExecutor(4) as pool:
        done = [r for r in pool.map(work, jobs) if r]
    manifest: dict[str, list[dict[str, float | str]]] = {i: [] for i in SOURCES}
    for inst, midi, name in sorted(done):
        manifest[inst].append({"midi": midi, "file": name})
    if failed:
        raise RuntimeError(
            f"{len(failed)} sample downloads failed; run `python -m app.cli samples --force` again"
        )
    missing = [i for i, v in manifest.items() if len(v) < 3]
    if missing:
        raise RuntimeError(f"Sample download incomplete for {missing}; run `python -m app.cli samples` again")
    manifest["_license"] = [{"midi": 0, "file": "VSCO-2 Community Edition, CC0 1.0 (Versilian Studios)"}]
    out.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    return out


@dataclass(frozen=True)
class Recorded:
    midi: float
    audio: NDArray[np.float32]  # (2, n) at SAMPLE_SR


@cache
def bank(inst: str) -> tuple[Recorded, ...]:
    folder = samples_dir()
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    out = []
    for item in manifest[inst]:
        with wave.open(str(folder / inst / item["file"])) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        out.append(Recorded(float(item["midi"]), np.ascontiguousarray(x.reshape(-1, 2).T, dtype=np.float32)))
    if not out:
        raise FileNotFoundError(f"No samples for {inst}; run `python -m app.cli samples`")
    return tuple(out)


def available() -> bool:
    return (samples_dir() / "manifest.json").exists()


def play(inst: str, midi: float, dur: float, release: float = 0.35) -> NDArray[np.float32]:
    """Nearest recorded note, pitch-shifted to `midi`, held `dur` s then released."""
    rec = min(bank(inst), key=lambda r: abs(r.midi - midi))
    ratio = 2 ** ((midi - rec.midi) / 12)
    want = int((dur + release) * SAMPLE_SR)
    need = int(want * ratio) + 2
    src = rec.audio[:, :need]
    x = _resample(src, ratio)[:, :want]
    hold = min(x.shape[1], int(dur * SAMPLE_SR))
    rel = x.shape[1] - hold
    if rel > 0:
        x[:, hold:] *= np.exp(-np.arange(rel, dtype=np.float32) / (release * SAMPLE_SR / 5))
    tail = min(x.shape[1], int(0.01 * SAMPLE_SR))
    if tail:
        x[:, -tail:] *= np.linspace(1, 0, tail, dtype=np.float32)
    return x


# --- web export: small mono MP3s the browser loads for the live orchestra ----------------------

WEB_MAX_S = 5.0
WEB_BITRATE = 96_000


def web_dir() -> Path:
    return get_settings().data_dir / "samples" / "web"


def _encode_mp3_mono(x: NDArray[np.float32]) -> bytes:
    import av  # bundled ffmpeg (already a backend dependency for video ingest)

    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).reshape(1, -1)
    buf = io.BytesIO()
    with av.open(buf, "w", format="mp3") as container:
        stream = container.add_stream("libmp3lame", rate=SAMPLE_SR, layout="mono")
        stream.bit_rate = WEB_BITRATE
        chunk = 1152 * 16
        for start in range(0, pcm.shape[1], chunk):
            frame = av.AudioFrame.from_ndarray(
                np.ascontiguousarray(pcm[:, start : start + chunk]), format="s16", layout="mono"
            )
            frame.sample_rate = SAMPLE_SR
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return buf.getvalue()


def export_web(force: bool = False) -> Path:
    """Mono, ≤ 5 s MP3 per recorded note + web/manifest.json {instrument: [{midi, file}]}."""
    fetch()
    out = web_dir()
    manifest_path = out / "manifest.json"
    if manifest_path.exists() and not force:
        return out
    manifest: dict[str, list[dict[str, float | str]]] = {}
    for inst in SOURCES:
        items: list[dict[str, float | str]] = []
        for rec in bank(inst):
            mono = rec.audio.mean(0)[: int(WEB_MAX_S * SAMPLE_SR)].copy()
            fade = min(len(mono) // 4, int(0.35 * SAMPLE_SR))
            mono[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
            mono /= float(np.abs(mono).max()) + 1e-9
            name = f"{rec.midi:.2f}.mp3"
            dest = out / inst / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(_encode_mp3_mono(mono * 0.9))
            items.append({"midi": round(rec.midi, 2), "file": f"{inst}/{name}"})
        manifest[inst] = items
    manifest_path.write_text(
        json.dumps({"license": "VSCO-2 Community Edition, CC0 1.0", "instruments": manifest}),
        encoding="utf-8",
    )
    return out
