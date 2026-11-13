"""Procedural natural sounds & upstream Web Audio instruments in NumPy (no samples, deterministic).

Rebuilds the exact upstream pre-frontend-swap instruments (`engine.ts` + `timbres.ts` + `player.ts`:
lowpass-filtered `sine`/`triangle`/`sawtooth`/`square` `pluck`, 3-partial inharmonic `bell`,
`"noise"`/`"tick"` rhythm `hit`, and 3-oscillator `[root, fifth, tension]` `drone`) alongside the
upstream `synth.py` natural phenomena.
"""

from typing import Literal

import numpy as np
from numpy.typing import NDArray

SR = 22050
F = NDArray[np.float32]
WaveType = Literal["sine", "triangle", "sawtooth", "square"]


class Synth:
    def __init__(self, n: int, seed: int) -> None:
        self.n = n
        self.rng = np.random.default_rng(seed)
        self.t = np.arange(n, dtype=np.float32) / SR

    # --- building blocks ---
    def band_noise(self, lo: float, hi: float, tilt: float = 0.0) -> F:
        """White noise band-limited to lo..hi Hz with soft edges; tilt<0 darkens (pink-ish)."""
        spec = np.fft.rfft(self.rng.standard_normal(self.n).astype(np.float32))
        freqs = np.fft.rfftfreq(self.n, 1 / SR)
        edge_lo = 1 / (1 + (lo / np.maximum(freqs, 1)) ** 4)
        edge_hi = 1 / (1 + (freqs / hi) ** 4)
        shape = edge_lo * edge_hi * np.maximum(freqs, 20) ** (tilt / 2)
        out = np.fft.irfft(spec * shape, n=self.n).astype(np.float32)
        return out / (np.abs(out).max() + 1e-9)

    def slow_random(self, period_s: float, lo: float, hi: float) -> F:
        """Smooth random curve (gusts, swells) between lo and hi."""
        points = max(2, int(self.n / SR / period_s) + 2)
        knots = self.rng.uniform(lo, hi, points)
        x = np.linspace(0, self.n, points)
        return np.interp(np.arange(self.n), x, knots).astype(np.float32)

    def events(self, rate: F, max_rate: float) -> NDArray[np.int64]:
        """Poisson event times whose density follows `rate` (events/s), via thinning."""
        expected = int(max_rate * self.n / SR * 1.2) + 1
        times = np.sort(self.rng.uniform(0, self.n, expected)).astype(np.int64)
        keep = self.rng.uniform(0, max_rate, len(times)) < rate[np.clip(times, 0, self.n - 1)]
        return times[keep]

    def add_grain(self, out: F, at: int, grain: F) -> None:
        end = min(self.n, at + len(grain))
        if end > at:
            out[at:end] += grain[: end - at]

    # --- upstream phenomena ---
    def rain(self, c: F) -> F:
        bed = self.band_noise(500, 7000, tilt=-0.4) * (0.008 + 0.36 * c**0.8)
        rumble = self.band_noise(40, 250, tilt=-1.0) * 0.35 * np.clip((c - 0.5) / 0.5, 0, 1)
        out = (bed + rumble).astype(np.float32)
        for at in self.events(70 * c, 72):
            f = self.rng.uniform(1800, 4500)
            k = np.arange(int(0.025 * SR), dtype=np.float32) / SR
            drop = np.sin(2 * np.pi * f * k * (1 - 0.35 * k / k[-1])) * np.exp(-k / 0.006)
            self.add_grain(out, int(at), (drop * self.rng.uniform(0.04, 0.14)).astype(np.float32))
        thunder_rate = np.where(c > 0.85, 0.12, 0.0).astype(np.float32)
        for at in self.events(thunder_rate, 0.12):
            k = np.arange(int(2.5 * SR), dtype=np.float32) / SR
            boom = self.rng.standard_normal(len(k)).astype(np.float32)
            boom = np.convolve(boom, np.ones(60) / 60, mode="same") * np.exp(-k / 0.7) * 2.2
            self.add_grain(out, int(at), boom.astype(np.float32))
        return out

    def wind(self, c: F) -> F:
        bands = [self.band_noise(lo, lo * 2.2, tilt=-0.5) for lo in (120, 260, 560, 1200)]
        pos = np.clip(c, 0, 1) * 3
        mix = np.zeros(self.n, dtype=np.float32)
        for i, b in enumerate(bands):
            mix += b * np.clip(1 - np.abs(pos - i), 0, 1)
        gust = self.slow_random(0.8, 0.55, 1.45)
        out = mix * (0.02 + 0.46 * c) * gust
        howl_gain = np.clip((c - 0.55) / 0.45, 0, 1) * 0.12
        freq = 380 + 700 * c + 40 * self.slow_random(0.4, -1, 1)
        howl = np.sin(2 * np.pi * np.cumsum(freq) / SR).astype(np.float32)
        return (out + howl * howl_gain * gust).astype(np.float32)

    def fire(self, c: F) -> F:
        roar = self.band_noise(35, 300, tilt=-1.2) * (0.01 + 0.45 * c) * self.slow_random(0.5, 0.7, 1.3)
        out = roar.astype(np.float32)
        hiss = self.band_noise(2500, 9000) * 0.05 * c
        out += hiss
        for at in self.events(115 * c**1.3, 115):
            length = int(self.rng.uniform(0.002, 0.009) * SR)
            k = np.arange(length, dtype=np.float32)
            grain = self.rng.standard_normal(length).astype(np.float32) * np.exp(-k / (length / 3))
            self.add_grain(out, int(at), grain * self.rng.uniform(0.05, 0.3))
        return out.astype(np.float32)

    def surf(self, presence: F, warmth: F) -> F:
        bright = self.band_noise(900, 6000, tilt=-0.3)
        dark = self.band_noise(120, 1400, tilt=-0.8)
        tone = dark * warmth + bright * (1 - warmth)
        phase = self.rng.uniform(0, 2 * np.pi)
        wave = (0.5 + 0.5 * np.sin(2 * np.pi * self.t / 7.5 + phase)) ** 2
        wave = 0.25 + 0.75 * wave * self.slow_random(7.5, 0.6, 1.2)
        return (tone * wave * 0.4 * presence).astype(np.float32)

    def biophony(self, c: F) -> F:
        insects = self.band_noise(4200, 7500) * (0.5 + 0.5 * np.sin(2 * np.pi * 28 * self.t)) * 0.05 * c
        out = insects.astype(np.float32)
        for at in self.events(7 * c**1.2, 7.2):
            syllables = int(self.rng.integers(1, 5))
            f0 = self.rng.uniform(2200, 5200)
            for s in range(syllables):
                dur = self.rng.uniform(0.05, 0.13)
                k = np.arange(int(dur * SR), dtype=np.float32) / SR
                sweep = f0 * (1 + self.rng.uniform(-0.35, 0.35) * k / dur)
                vib = 1 + 0.03 * np.sin(2 * np.pi * self.rng.uniform(20, 60) * k)
                chirp = np.sin(2 * np.pi * np.cumsum(sweep * vib) / SR) * np.sin(np.pi * k / dur)
                self.add_grain(out, int(at + s * (dur + 0.04) * SR), (chirp * 0.09).astype(np.float32))
        return out

    def temperature(self, heat: F, cold: F) -> F:
        pulse = (np.sin(2 * np.pi * 48 * self.t) > 0.2).astype(np.float32)
        pulse = np.convolve(pulse, np.ones(30) / 30, mode="same").astype(np.float32)
        swell = self.slow_random(3.0, 0.5, 1.0)
        cicada = np.sin(2 * np.pi * 4600 * self.t) * pulse * swell * 0.13 * heat
        icy = self.band_noise(2200, 5000) * self.slow_random(0.9, 0.4, 1.2) * 0.16 * cold
        out = (cicada + icy).astype(np.float32)
        for at in self.events(0.6 * cold, 0.6):
            k = np.arange(int(0.18 * SR), dtype=np.float32) / SR
            f = self.rng.uniform(70, 140)
            creak = np.sign(np.sin(2 * np.pi * f * k)) * np.exp(-k / 0.06) * 0.12
            self.add_grain(out, int(at), creak.astype(np.float32))
        return out

    def haze(self, c: F) -> F:
        f = 55.0
        saw = sum(np.sin(2 * np.pi * f * h * self.t) / h for h in range(1, 9))
        saw2 = sum(np.sin(2 * np.pi * f * 1.012 * h * self.t) / h for h in range(1, 9))
        drone = (saw + saw2) / 4
        rough = 1 - 0.75 * c * (0.5 + 0.5 * np.sin(2 * np.pi * 33 * self.t))
        return (drone * rough * (0.015 + 0.25 * c)).astype(np.float32)

    def traffic(self, c: F) -> F:
        rumble = self.band_noise(40, 220, tilt=-0.8) * self.slow_random(1.5, 0.6, 1.3)
        hum = np.sin(2 * np.pi * 100 * self.t) * 0.3
        swish = self.band_noise(400, 1800) * self.slow_random(0.6, 0.0, 1.0) ** 3 * 0.6
        return ((rumble + hum + swish) * (0.01 + 0.33 * c)).astype(np.float32)

    # --- upstream Web Audio instruments (rebuilt from frontend/apps/web/src/audio/engine.ts) ---
    def _osc_lowpass(self, freq: float, k: F, wave: WaveType, cutoff: float) -> F:
        """Band-limited oscillator with 2nd-order lowpass rolloff at `cutoff` Hz."""
        w = 2 * np.pi * freq * k
        if wave == "sine":
            sig = np.sin(w)
        elif wave == "triangle":
            sig = np.zeros_like(k)
            for h_idx, h in enumerate((1, 3, 5, 7, 9)):
                fh = freq * h
                if fh >= SR * 0.45:
                    break
                lp = 1.0 / np.sqrt(1.0 + (fh / max(80.0, cutoff)) ** 4)
                sign = -1.0 if h_idx % 2 == 1 else 1.0
                sig += sign * (8.0 / (np.pi**2 * h * h)) * np.sin(h * w) * lp
        elif wave == "square":
            sig = np.zeros_like(k)
            for h in (1, 3, 5, 7, 9, 11):
                fh = freq * h
                if fh >= SR * 0.45:
                    break
                lp = 1.0 / np.sqrt(1.0 + (fh / max(80.0, cutoff)) ** 4)
                sig += (4.0 / (np.pi * h)) * np.sin(h * w) * lp
            sig *= 0.7
        else:  # sawtooth
            sig = np.zeros_like(k)
            for h in range(1, 13):
                fh = freq * h
                if fh >= SR * 0.45:
                    break
                lp = 1.0 / np.sqrt(1.0 + (fh / max(80.0, cutoff)) ** 4)
                sig += (2.0 / (np.pi * h)) * ((-1) ** (h + 1)) * np.sin(h * w) * lp
            sig *= 0.65
        return sig.astype(np.float32)

    def pluck(
        self,
        freq: float,
        dur: float = 0.35,
        gain: float = 0.1,
        wave: WaveType = "sine",
        cutoff: float = 2000.0,
    ) -> F:
        """Upstream AudioEngine.pluck: 12 ms attack ramp + exponential decay to 0.0001 + lowpass."""
        n = max(16, int(dur * SR))
        k = (np.arange(n, dtype=np.float32) / SR).astype(np.float32)
        att = 0.012
        peak = max(0.0002, float(gain))
        env = np.where(
            k < att,
            0.0001 * (peak / 0.0001) ** np.minimum(1.0, k / max(1e-5, att)),
            peak * (0.0001 / peak) ** np.maximum(0.0, (k - att) / max(0.01, dur - att)),
        ).astype(np.float32)
        if wave == "sine":
            tone = np.sin(2 * np.pi * freq * k) + 0.3 * np.sin(4 * np.pi * freq * k)
        else:
            tone = self._osc_lowpass(freq, k, wave, cutoff)
        return (tone * env).astype(np.float32)

    def bell(self, freq: float, strength: float = 0.5) -> F:
        """Upstream AudioEngine.bell: 3 inharmonic partials [1, 2.76, 5.4] for hotspots."""
        dur = 2.2
        n = int(dur * SR)
        k = np.arange(n, dtype=np.float32) / SR
        out = np.zeros(n, dtype=np.float32)
        partials = ((1.0, 1.0, 2.2), (2.76, 0.4, 1.4), (5.4, 0.18, 0.8))
        att = 0.005
        for ratio, level, decay in partials:
            f = freq * ratio
            if f >= SR * 0.46:
                continue
            m = min(n, int(decay * SR))
            km = k[:m]
            pk = max(0.0002, 0.16 * level * (0.5 + float(strength)))
            env = np.where(
                km < att,
                0.0001 * (pk / 0.0001) ** np.minimum(1.0, km / att),
                pk * (0.0001 / pk) ** np.maximum(0.0, (km - att) / max(0.01, decay - att)),
            ).astype(np.float32)
            out[:m] += np.sin(2 * np.pi * f * km).astype(np.float32) * env
        return out

    def hit(self, kind: Literal["noise", "tick"], gain: float = 0.07) -> F:
        """Upstream AudioEngine.hit: highpass 6 kHz noise hat or 1800→600 Hz sine tick."""
        dur = 0.09 if kind == "noise" else 0.05
        n = max(16, int(dur * SR))
        k = np.arange(n, dtype=np.float32) / SR
        att = 0.003
        pk = max(0.0002, float(gain))
        env = np.where(
            k < att,
            0.0001 * (pk / 0.0001) ** np.minimum(1.0, k / att),
            pk * (0.0001 / pk) ** np.maximum(0.0, (k - att) / max(0.005, dur - att)),
        ).astype(np.float32)
        if kind == "noise":
            raw = self.rng.standard_normal(n + 2).astype(np.float32)
            hp = np.diff(raw, n=2)  # 2nd-order highpass (>6 kHz emphasis)
            hp /= np.abs(hp).max() + 1e-9
            return (hp * env).astype(np.float32)
        # "tick": 1800 Hz -> 600 Hz exponential sweep over 40 ms
        t_sw = np.minimum(0.04, k)
        freq = 1800.0 * (600.0 / 1800.0) ** (t_sw / 0.04)
        phase = 2 * np.pi * np.cumsum(freq) / SR
        return (np.sin(phase) * env).astype(np.float32)

    def drone_slice(
        self,
        root_midi: int,
        dur: float,
        wave: WaveType,
        level: float,
        brightness: float,
        tension: float,
    ) -> F:
        """Upstream AudioEngine.startDrone/updateDrone: [root, root+7 (+4c), root+1 (tension)]."""
        n = max(32, int(dur * SR))
        k = (np.arange(n, dtype=np.float32) / SR).astype(np.float32)
        cutoff = 250.0 + float(brightness) * 1400.0
        f0 = float(440.0 * 2 ** ((root_midi - 69) / 12.0))
        f5 = float(440.0 * 2 ** ((root_midi + 7 + 0.04 - 69) / 12.0))
        ft = float(440.0 * 2 ** ((root_midi + 1 - 69) / 12.0))
        osc0 = self._osc_lowpass(f0, k, wave, cutoff) * 0.6
        osc5 = self._osc_lowpass(f5, k, wave, cutoff) * 0.35
        osct = self._osc_lowpass(ft, k, wave, cutoff) * min(0.5, float(tension) * 0.6)
        env = np.sin(np.pi * k / dur) ** 0.45
        return ((osc0 + osc5 + osct) * env * float(level)).astype(np.float32)

    def alert(self) -> F:
        """Two-tone rising earcon: 'a threshold was crossed here'."""
        a = self.pluck(880, 0.16, 0.22)
        b = self.pluck(1320, 0.22, 0.22)
        out = np.zeros(len(a) // 2 + len(b), dtype=np.float32)
        out[: len(a)] += a
        out[len(a) // 2 :] += b
        return out
