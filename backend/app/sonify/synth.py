"""Procedural acoustic instruments and a Schroeder hall in NumPy — no samples, fully deterministic.

The reference is NASA's ocean-colour / phytoplankton sonification: three polyphonic lines, one per
measured channel, entering one at a time, with chords emerging from the lines sounding together.
Nothing else: no drones, no pads, no percussion, no environmental noise, no earcons.

  * `plucked_bass` low string (upright bass / cello pizzicato): band-limited partial bank with a
    pick-position comb that mutes the harmonics that have a node under the finger, two body
    formants (≈250 Hz and ≈400 Hz) plus a bridge resonance near 1 kHz, a short band-passed string
    scrape at the attack, and per-partial decay so the top end rolls off as the note fades.
  * `harp` three slightly detuned strings per note, harmonically stretched (string stiffness), a
    bright hammer transient and a long ring, so consecutive plucks overlap into a chord.
  * `flute` fundamental plus weak 2nd and 3rd partials, a soft attack, a *steady* sustain (no
    swell), vibrato that only arrives about 0.25 s into the note, a slight pitch droop as the note
    starts, and breath noise only at the attack and the release.
  * `hall_reverb` (below): four damped feedback comb filters in parallel into three all-pass
    diffusers — Schroeder's topology, measured to an impulse response by driving it with an
    impulse, then convolved with the mix. ~2.2 s RT60, 26 ms pre-delay, HF damping inside the comb
    loop so the tail darkens as it fades, and per-channel delay jitter drawn from the seed so the
    two ears receive different reflections while the image itself never moves.

Every grain is synthesised at unity peak, starts with a >=5 ms exponential fade (no clicks) and
ends decayed to about -80 dB (never truncated). Randomness exists only inside these instruments;
each grain draws from its own RNG stream keyed on (seed, instrument, pitch), so the result cannot
depend on the order the notes are scheduled in.
"""

import hashlib

import numpy as np
from numpy.typing import NDArray

SR = 22050
F = NDArray[np.float32]

#: Notes and reverb tails fade to this fraction of their peak (-80 dB).
_FLOOR = 1e-4
NYQUIST = SR * 0.45

# --- hall parameters (Schroeder topology) ---
T60_S = 2.2  # reverberation time, -60 dB
PREDDELAY_S = 0.026
COMB_MS = (29.7, 37.1, 41.1, 43.7)  # parallel comb delays, tuned to spread their echo trains
COMB_LEVEL = (1.0, 0.86, 0.80, 0.74)
ALLPASS_MS = (5.0, 1.7, 3.1)  # series diffusion
ALLPASS_G = 0.55
IR_S = 2.6  # impulse response length actually measured


class Synth:
    def __init__(self, n: int, seed: int) -> None:
        self.n = n
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.t = np.arange(n, dtype=np.float32) / SR

    # ---------------------------------------------------------------- helpers
    def _stream(self, tag: str, freq: float) -> np.random.Generator:
        """Per-note RNG stream: deterministic in (seed, tag, pitch), independent of note order."""
        key = f"{self.seed}:{tag}:{freq:.3f}".encode()
        return np.random.default_rng(int.from_bytes(hashlib.sha256(key).digest()[:8], "little"))

    def band_noise(self, rng: np.random.Generator, lo: float, hi: float, n: int) -> F:
        """Band-limited noise with soft edges, taken from the given stream."""
        spec = np.fft.rfft(rng.standard_normal(n).astype(np.float32))
        freqs = np.fft.rfftfreq(n, 1 / SR)
        shape = 1 / (1 + (lo / np.maximum(freqs, 1)) ** 4) / (1 + (freqs / hi) ** 4)
        out = np.fft.irfft(spec * shape, n=n).astype(np.float32)
        return (out / (np.abs(out).max() + 1e-9)).astype(np.float32)

    @staticmethod
    def formants(x: F, peaks: list[tuple[float, float, float]]) -> F:
        """Apply resonant body peaks (frequency Hz, gain, quality factor)."""
        n = len(x)
        spec = np.fft.rfft(x.astype(np.float32))
        f = np.fft.rfftfreq(n, 1 / SR)
        shape = np.ones_like(f, dtype=np.float32)
        for fc, gain, q in peaks:
            shape *= 1 + (gain - 1) * np.exp(-(((f - fc) / (fc / max(q, 0.3))) ** 2))
        return np.fft.irfft(spec * shape, n=n).astype(np.float32)

    @staticmethod
    def envelope(
        k: F,
        attack: float,
        total: float,
        decay: float | None = None,
        release: float | None = None,
        sustain: bool = False,
    ) -> F:
        """Exponential attack, then either a pluck decay or a steady sustain, then a release.

        Every ramp is exponential and every attack and release is at least 5 ms, so no note can
        move the gain by more than 6 dB per 100 ms (the audio-safety rule in AGENTS.md) and no
        grain can start or stop on a discontinuity.
        """
        att = max(5e-3, attack)
        env = np.where(k < att, _FLOOR * (1.0 / _FLOOR) ** np.minimum(1.0, k / att), 1.0).astype(
            np.float32
        )
        if decay is not None and not sustain:
            env = (env * (1.0 / _FLOOR) ** (-np.maximum(0.0, k - att) / max(1e-3, decay))).astype(
                np.float32
            )
        if release is not None:
            rel = max(5e-3, release)
            start = max(att, total - rel)
            env = (
                env * np.where(k <= start, 1.0, _FLOOR ** np.minimum(1.0, (k - start) / rel)).astype(
                    np.float32
                )
            ).astype(np.float32)
        return env

    @staticmethod
    def _partials(
        k: F,
        freq: float,
        levels: list[float],
        taus: list[float],
        phases: NDArray[np.float64],
        stretch: float = 0.0,
    ) -> F:
        """Sum of harmonic (optionally stiffened) partials, each with its own e-folding time."""
        out = np.zeros(len(k), dtype=np.float32)
        for idx, (level, tau) in enumerate(zip(levels, taus, strict=True), start=1):
            f = freq * idx * (1.0 + stretch * idx * idx)
            if f >= NYQUIST:
                break
            out += (
                level * np.sin(2 * np.pi * f * k + phases[idx - 1]) * np.exp(-k / max(1e-3, tau))
            ).astype(np.float32)
        return out

    # ---------------------------------------------------------------- the voices
    def plucked_bass(self, freq: float, dur: float = 0.6) -> F:
        """Low plucked string: pick comb, body formants, bridge resonance, string scrape."""
        n = max(64, int(dur * SR))
        k = (np.arange(n, dtype=np.float32) / SR).astype(np.float32)
        rng = self._stream("bass", freq)
        nh = 22
        comb = np.abs(np.sin(np.pi * np.arange(1, nh + 1) * 0.13)) + 0.06
        levels = [float(c / h**1.05) for h, c in zip(range(1, nh + 1), comb, strict=True)]
        taus = [(dur / 4.0) / (1.0 + 0.55 * (h - 1)) for h in range(1, nh + 1)]  # darker as it fades
        phases = rng.uniform(0, 2 * np.pi, nh)
        body = self.formants(
            self._partials(k, freq, levels, taus, phases),
            [(250.0, 2.1, 2.0), (400.0, 1.5, 2.5), (1000.0, 1.7, 3.0)],
        )
        scrape = self.band_noise(rng, 1200.0, 5200.0, n) * np.exp(-k / 0.010) * 0.09
        out = (body + scrape).astype(np.float32) * self.envelope(k, 0.008, dur)
        return (out / (np.abs(out).max() + 1e-9)).astype(np.float32)

    def harp(self, freq: float, dur: float = 1.6) -> F:
        """Harp: three detuned strings, inharmonic stretch, bright hammer, long overlapping ring."""
        n = max(64, int(dur * SR))
        k = (np.arange(n, dtype=np.float32) / SR).astype(np.float32)
        rng = self._stream("harp", freq)
        nh = 18
        levels = [1.0 / h**0.95 for h in range(1, nh + 1)]
        taus = [(dur / 4.5) / (1.0 + 0.42 * (h - 1)) for h in range(1, nh + 1)]
        mix = np.zeros(n, dtype=np.float32)
        for cents in (-3.5, 0.0, 4.0):
            f = freq * 2.0 ** (cents / 1200.0)
            phases = rng.uniform(0, 2 * np.pi, nh)
            mix += self._partials(k, f, levels, taus, phases, stretch=4e-6)
        mix /= 3.0
        hammer = self.band_noise(rng, 2200.0, 7000.0, n) * np.exp(-k / 0.007) * 0.06
        out = (mix + hammer).astype(np.float32) * self.envelope(k, 0.006, dur)
        return (out / (np.abs(out).max() + 1e-9)).astype(np.float32)

    def flute(self, freq: float, dur: float = 0.6) -> F:
        """Flute: soft attack, steady sustain, late vibrato, slight droop, breath at the ends."""
        n = max(64, int(dur * SR))
        k = (np.arange(n, dtype=np.float32) / SR).astype(np.float32)
        rng = self._stream("flute", freq)
        vib_on = np.clip((k - 0.25) / 0.3, 0.0, 1.0)  # the player's vibrato arrives late
        vib = 1.0 + 0.0045 * vib_on * np.sin(2 * np.pi * 5.0 * k + rng.uniform(0, 2 * np.pi))
        droop = 1.0 - 0.010 * np.exp(-k / 0.045)  # the note sags a little as it is struck
        phase = 2 * np.pi * np.cumsum(freq * vib * droop) / SR
        tone = np.sin(phase) + 0.2 * np.sin(2 * phase) + 0.06 * np.sin(3 * phase)
        trem = 1.0 + 0.04 * vib_on * np.sin(2 * np.pi * 3.6 * k)
        env = self.envelope(k, attack=0.05, total=dur, sustain=True, release=0.14)
        air = (0.8 * np.exp(-np.maximum(0.0, k - 0.01) / 0.06) + 0.4 * (k > dur - 0.14)).astype(
            np.float32
        )
        breath = self.band_noise(rng, 1600.0, 4800.0, n) * air * 0.07
        out = (tone * trem * env + breath * env).astype(np.float32)
        return (out / (np.abs(out).max() + 1e-9)).astype(np.float32)

    # ----------------------------------------------------------------- the hall
    @staticmethod
    def _fft_convolve(x: F, h: F, keep: int | None = None) -> F:
        """Linear convolution in the FFT domain, truncated to `keep` samples (default: full)."""
        size = 1 << (len(x) + len(h) - 1).bit_length()
        y = np.fft.irfft(np.fft.rfft(x.astype(np.float32), size) * np.fft.rfft(h, size), size)
        return y[: keep if keep is not None else len(x) + len(h) - 1].astype(np.float32)

    @classmethod
    def _comb(cls, x: F, m: int, g: float, damp: float, n: int) -> F:
        """Damped feedback comb y[n] = x[n-m] + g*lp(y[n-m]), written out as its impulse response.

        Each round trip multiplies the echo by `g` (which sets RT60) *and* by one more pole, so
        high frequencies die out first and the tail darkens — a hall rather than a bathroom.
        """
        ir = np.zeros(n, dtype=np.float32)
        trips = int(np.ceil(n / m))
        for trip in range(1, trips):
            pos = trip * m
            tau = max(1e-4, damp * trip / SR)  # the kernel of `trip` cascaded one-pole stages
            length = min(n - pos, max(8, int(6 * tau * SR)))
            t = np.arange(length, dtype=np.float32) / SR
            kernel = np.exp(-t / tau) / np.sqrt(length)
            ir[pos : pos + length] += (g**trip) * kernel
        return cls._fft_convolve(x, ir, keep=n)

    @classmethod
    def _allpass(cls, x: F, m: int, g: float, n: int) -> F:
        """All-pass diffuser y[n] = -g*x[n] + x[n-m] + g*y[n-m], as its impulse train.

        H(z) = (-g + z^-m) / (1 - g z^-1), so h[0] = -g and h[k*m] = (1 - g^2)*g^(k-1) for k >= 1.
        It changes the timing of the reflections without changing the spectrum: this is what turns
        four separate echo trains into one dense tail.
        """
        ir = np.zeros(n, dtype=np.float32)
        ir[0] = -g
        ks = np.arange(1, int(np.ceil(n / m)))
        pos = ks * m
        pos = pos[pos < n]
        ir[pos] = (1.0 - g * g) * g ** (ks[: len(pos)] - 1)
        return cls._fft_convolve(x, ir, keep=n)

    def impulse_response(self, channel: int = 0) -> F:
        """Measure the hall to an impulse response by driving it with a pre-delayed impulse.

        `channel=-1` is the room itself; channel 0/1 is that room mixed 70:30 with a variation
        whose comb and all-pass delays are jittered. Both ears therefore hear the *same* hall — the
        image never swims or moves — while the reflections differ enough to feel wide.
        """
        base = self._room("common")
        if channel < 0:
            return base
        ir = 0.7 * base + 0.3 * self._room(f"ch{channel}")
        return (ir / (np.sqrt((ir.astype(np.float64) ** 2).sum()) + 1e-12)).astype(np.float32)

    def _room(self, tag: str) -> F:
        """The Schroeder chain (four damped combs into three all-pass diffusers), as an impulse."""
        rng = self._stream(f"reverb:{tag}", 0.0)
        n = int(IR_S * SR)
        x = np.zeros(n, dtype=np.float32)
        x[min(int(PREDDELAY_S * SR), n - 1)] = 1.0
        wet = np.zeros(n, dtype=np.float32)
        for ms, level in zip(COMB_MS, COMB_LEVEL, strict=True):
            m = max(8, int(ms / 1000 * SR * (1.0 + rng.uniform(-0.008, 0.008))))
            g = float(10 ** (-3.0 * m / (SR * T60_S)))
            wet += level * self._comb(x, m, g, damp=0.55, n=n)
        for ms in ALLPASS_MS:
            m = max(8, int(ms / 1000 * SR * (1.0 + rng.uniform(-0.01, 0.01))))
            wet = self._allpass(wet, m, ALLPASS_G, n)
        return (wet / (np.abs(wet).max() + 1e-9)).astype(np.float32)

    def reverb(self, stereo: NDArray[np.float32], wet: float = 0.30) -> NDArray[np.float32]:
        """Hall reverb across the whole mix, returning dry + wet including the ringing tail.

        The two channels use differently tuned rooms (seeded), which decorrelates the reflections
        and makes the space feel wide, while the *sources* stay exactly where they were placed: no
        image movement, no panning.
        """
        n = stereo.shape[1]
        irs = [self.impulse_response(ch) for ch in range(2)]
        m = n + len(irs[0]) - 1
        out = np.zeros((2, m), dtype=np.float32)
        for ch, ir in enumerate(irs):
            # a unit-energy impulse response: `wet` is then the wet-to-dry RMS ratio, so the hall
            # sits at a predictable level under the notes instead of dominating them.
            out[ch, :n] += stereo[ch]
            out[ch] += self._fft_convolve(stereo[ch], ir, keep=m) * wet
        return out.astype(np.float32)
