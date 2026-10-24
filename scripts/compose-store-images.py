#!/usr/bin/env python3
"""Frames real app screenshots for the Play listing: 1080x1920 PNG, headline + subline in brand
fonts above the screen in a rounded frame. Usage: compose-store-images.py SPEC.json OUT_DIR
SPEC is a list of {"shot": path, "title": str, "subtitle": str}."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules/@expo-google-fonts"
SERIF = str(FONTS / "fraunces/400Regular/Fraunces_400Regular.ttf")
SANS = str(FONTS / "dm-sans/400Regular/DMSans_400Regular.ttf")
BG, INK, MUTED, ACCENT = (247, 245, 238), (32, 60, 49), (110, 118, 104), (52, 93, 69)
W, H = 1080, 1920


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def compose(shot, title, subtitle, out):
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)
    serif, sans = ImageFont.truetype(SERIF, 76), ImageFont.truetype(SANS, 38)
    y = 120
    for line in wrap(draw, title, serif, W - 160):
        draw.text((W / 2, y), line, font=serif, fill=INK, anchor="ma")
        y += 92
    y += 14
    for line in wrap(draw, subtitle, sans, W - 200):
        draw.text((W / 2, y), line, font=sans, fill=MUTED, anchor="ma")
        y += 50
    top = y + 50
    screen = Image.open(shot).convert("RGB")
    sh = H - top + 120  # the bottom of the phone bleeds off the canvas
    sw = int(screen.width * sh / screen.height)
    if sw > W - 180:
        sw = W - 180
        sh = int(screen.height * sw / screen.width)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    radius, border = 56, 14
    frame = Image.new("RGBA", (sw + border * 2, sh + border * 2), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius + border, fill=(28, 44, 36, 255))
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius, fill=255)
    frame.paste(screen, (border, border), mask)
    shadow = Image.new("RGBA", (frame.width + 120, frame.height + 120), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((60, 80, frame.width + 60, frame.height + 80), radius + border, fill=(32, 60, 49, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    x = (W - frame.width) // 2
    canvas.paste(shadow, (x - 60, top - 60), shadow)
    canvas.paste(frame, (x, top), frame)
    canvas.save(out, optimize=True)


if __name__ == "__main__":
    spec, out_dir = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(spec, 1):
        target = out_dir / f"{i:02d}.png"
        compose(item["shot"], item["title"], item["subtitle"], target)
        print(target)
