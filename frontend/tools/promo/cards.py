#!/usr/bin/env python3
"""Render the demo film's captions and end card in the site's own visual language.

Colours come from frontend/src/index.css (--ink #3a2a18, --paper #fdf3dd) and the
brass trim used by the Data Deck (#a9773d); the type is the project's real
Fraunces and Nunito, instanced to static weights from the shipped variable fonts.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__import__("os").environ.get("PROMO_CARDS", "/home/ubuntu/gen/promo/cards"))
OUT.mkdir(parents=True, exist_ok=True)
ART = Path("/home/ubuntu/terratunes/frontend/public/art")

W, H = 1920, 1080
INK = (58, 42, 24)
PAPER = (253, 243, 221)
BRASS = (169, 119, 61)
AMBER = (247, 185, 85)

FONTS = __import__("os").environ.get("PROMO_FONTS", "/home/ubuntu/gen/promo/fonts")
SERIF = f"{FONTS}/Fraunces600.ttf"
SANS = f"{FONTS}/Nunito700.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=f) > maxw and cur:
            lines.append(cur)
            cur = w
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def caption(name, text, size=54, maxw=1420):
    """One subtitle card: a soft parchment pill, centred low like the film's own."""
    pad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(pad)
    f = font(SERIF, size)
    lines = wrap(d, text, f, maxw)
    lh = int(size * 1.28)
    tw = max(d.textlength(l, font=f) for l in lines)
    th = lh * len(lines)
    px, py = 54, 26
    bw, bh = int(tw + 2 * px), int(th + 2 * py)
    x0 = (W - bw) // 2
    y1 = H - 118
    y0 = y1 - bh
    # drop shadow, then the paper, then a brass hairline
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [x0 + 3, y0 + 8, x0 + bw + 3, y0 + bh + 8], 26, fill=(30, 20, 10, 130)
    )
    pad.alpha_composite(sh.filter(ImageFilter.GaussianBlur(9)))
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], 26, fill=PAPER + (232,), outline=BRASS + (255,), width=3)
    y = y0 + py
    for line in lines:
        lw = d.textlength(line, font=f)
        d.text((x0 + (bw - lw) / 2, y), line, font=f, fill=INK)
        y += lh
    pad.save(OUT / f"cap-{name}.png")
    return name, len(lines)


def label(name, text):
    """A small kicker in the top-left, styled like the site's own record chips."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(SANS, 30)
    tw = d.textlength(text, font=f)
    px, py = 26, 14
    x0, y0 = 44, 92
    d.rounded_rectangle(
        [x0, y0, x0 + tw + 2 * px, y0 + 30 + 2 * py], 999,
        fill=(28, 20, 12, 175), outline=AMBER + (220,), width=2,
    )
    d.text((x0 + px, y0 + py - 2), text, font=f, fill=(255, 240, 210))
    im.save(OUT / f"lab-{name}.png")


def endcard():
    im = Image.new("RGB", (W, H), PAPER)
    # warm radial glow behind the wordmark
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W / 2 - 700, 120, W / 2 + 700, 900], fill=90)
    im = Image.composite(Image.new("RGB", (W, H), AMBER), im, glow.filter(ImageFilter.GaussianBlur(160)))

    d = ImageDraw.Draw(im)
    # brass double frame, like the cabinet's arch
    d.rectangle([26, 26, W - 26, H - 26], outline=BRASS, width=6)
    d.rectangle([44, 44, W - 44, H - 44], outline=(196, 151, 92), width=2)

    disc = Image.open(ART / "discs/earth.webp").convert("RGBA")
    ds = 300
    disc = disc.resize((ds, ds), Image.LANCZOS)
    im.paste(disc, (int(W / 2 - ds / 2), 128), disc)

    def centred(text, f, y, fill, tracking=0):
        if tracking:
            text = (" " * 0) + text
        w = d.textlength(text, font=f)
        d.text(((W - w) / 2, y), text, font=f, fill=fill)

    centred("TERRA TUNES", font(SERIF, 132), 470, INK)
    centred("The Earth Information Jukebox", font(SERIF, 54), 630, (88, 62, 34))
    d.line([W / 2 - 300, 720, W / 2 + 300, 720], fill=BRASS, width=3)
    centred(
        "Nine records of real NASA data, played as music.",
        font(SANS, 34), 748, INK,
    )
    centred(
        "Measured data drives every note. The harmony is composed,",
        font(SANS, 30), 794, (96, 68, 36),
    )
    centred(
        "and the Data Deck says so.",
        font(SANS, 30), 832, (96, 68, 36),
    )
    centred(
        "NASA Space Apps Challenge  ·  Space Apps Cairo 2026",
        font(SANS, 30), 880, (110, 78, 40),
    )
    centred(
        "github.com/wearemasons/TerraTunes",
        font(SANS, 28), 940, (140, 100, 55),
    )
    im.save(OUT / "endcard.png")


if __name__ == "__main__":
    caps = [
        ("1", "Every day, NASA paints the whole planet."),
        ("2", "Terra Tunes plays those paintings as music."),
        ("3", "Nine records. Nine worlds."),
        ("4", "Drop the needle — a little algorithmic magic, and the Earth starts to sing."),
        ("5", "Terra Tunes. The Earth, on the turntable."),
        ("6", "The sound you are hearing is that same data, played as it was measured."),
        ("7", "Or bring a frame of your own."),
    ]
    for name, text in caps:
        print("caption", *caption(name, text))
    for name, text in [
        ("crate", "THE CRATE · 9 RECORDS"),
        ("deck", "DATA DECK"),
        ("scan", "SCAN ANY FRAME"),
        ("site", "THE LIVE SITE"),
    ]:
        label(name, text)
    endcard()
    print("cards written to", OUT)
