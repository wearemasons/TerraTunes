"""Procedural natural sounds in NumPy (no samples, no licensing, fully data-controllable).

Every generator takes `c`, a per-sample control curve in 0..1 (the phenomenon's intensity), and
returns a mono float32 signal. Techniques follow classic procedural audio: spectrally shaped noise
for beds, Poisson-scheduled grains for drops/crackles/chirps, slow random LFOs for gusts and waves.
"""

import numpy as np
from numpy.typing import NDArray

SR = 22050
F = NDArray[np.float32]


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

    # --- phenomena ---
    def rain(self, c: F) -> F:
        bed = self.band_noise(500, 7000, tilt=-0.4) * (0.008 + 0.36 * c**0.8)  # dry = near silence
        rumble = self.band_noise(40, 250, tilt=-1.0) * 0.35 * np.clip((c - 0.5) / 0.5, 0, 1)
        out = (bed + rumble).astype(np.float32)
        for at in self.events(70 * c, 72):  # droplets only where it rains
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
        for at in self.events(115 * c**1.3, 115):  # crackles and pops
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
        for at in self.events(7 * c**1.2, 7.2):  # birdsong syllables
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
        for at in self.events(0.6 * cold, 0.6):  # ice creaks
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

    # --- cues ---
    def pluck(self, freq: float, dur: float = 0.35, gain: float = 0.1) -> F:
        k = np.arange(int(dur * SR), dtype=np.float32) / SR
        tone = np.sin(2 * np.pi * freq * k) + 0.3 * np.sin(4 * np.pi * freq * k)
        return (tone * np.exp(-k / (dur / 4)) * gain).astype(np.float32)

    def alert(self) -> F:
        """Two-tone rising earcon: 'a threshold was crossed here'."""
        a = self.pluck(880, 0.16, 0.22)
        b = self.pluck(1320, 0.22, 0.22)
        out = np.zeros(len(a) // 2 + len(b), dtype=np.float32)
        out[: len(a)] += a
        out[len(a) // 2 :] += b
        return out
