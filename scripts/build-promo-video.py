#!/usr/bin/env python3
"""Builds the Kanakku promo videos from real app screenshots (fictional demo data).

  build-promo-video.py vertical  --voice DIR   -> 1080x1920 share video with narration
  build-promo-video.py landscape               -> 1920x1080 Play preview, captions only

Each scene is one captioned frame with a slow zoom; scenes crossfade. With --voice, scene lengths
follow narration files line1.mp3 ... lineN.mp3 (one per scene that speaks)."""
import json, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts/play/video"
STILLS = OUT / "stills"
FONTS = ROOT / "node_modules/@expo-google-fonts"
SERIF = str(FONTS / "fraunces/400Regular/Fraunces_400Regular.ttf")
SANS = str(FONTS / "dm-sans/400Regular/DMSans_400Regular.ttf")
SANS_BOLD = str(FONTS / "dm-sans/700Bold/DMSans_700Bold.ttf")
BG, INK, MUTED, ACCENT = (247, 245, 238), (32, 60, 49), (110, 118, 104), (52, 93, 69)
FADE = 0.5

# (still, title, subtitle, narration line or None, minimum seconds, highlight box on the screen)
SCENES = [
    ("still-welcome", "Meet Kanakku", "Your bank SMS, turned into a private spend journal.", 1, 4, None),
    ("still-lock", "Your phone, your rules", "Choose how Kanakku opens.", 2, 3.2, None),
    ("still-sources", "Bank SMS, and Gmail too", "Pick how far back to look.", None, 3.4, None),
    ("still-overview", "This month, at a glance", "No bank login. No account.", 3, 4, None),
    ("still-review-category", "Unsure? It just asks.", "Add a note, pick a category, done.", 4, 4, None),
    ("still-overview", "Card bills, on time", "See what's due before it's due.", 5, 3.4, (62, 1548, 1018, 1723)),
    ("still-insights-3", "Where it all goes", "Your spending mix, and what keeps coming back.", 6, 4, None),
    ("still-privacy", "Private by design", "Encrypted on your phone. No server. No ads.", 7, 4, None),
    ("end", "Kanakku", "Your bank SMS, turned into a private spend journal.", None, 3.2, None),
]


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line]


def phone(still, height, highlight):
    screen = Image.open(STILLS / f"{still}.png").convert("RGB")
    if highlight:
        d = ImageDraw.Draw(screen, "RGBA")
        x0, y0, x1, y1 = highlight
        d.rounded_rectangle((x0 - 14, y0 - 14, x1 + 14, y1 + 14), 54, outline=(214, 140, 74, 255), width=12)
    sh = height
    sw = int(screen.width * sh / screen.height)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    r, b = int(sh * 0.028), int(sh * 0.007)
    frame = Image.new("RGBA", (sw + 2 * b, sh + 2 * b), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), r + b, fill=(28, 44, 36, 255))
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), r, fill=255)
    frame.paste(screen, (b, b), mask)
    return frame


def paste_shadowed(canvas, frame, x, y):
    pad = 70
    shadow = Image.new("RGBA", (frame.width + 2 * pad, frame.height + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((pad, pad + 24, frame.width + pad, frame.height + pad + 24), 60, fill=(32, 60, 49, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas.paste(shadow, (x - pad, y - pad), shadow)
    canvas.paste(frame, (x, y), frame)


def end_card(size):
    W, H = size
    canvas = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(canvas)
    icon = Image.open(ROOT / "assets/icon.png").convert("RGBA").resize((int(H * 0.16),) * 2, Image.LANCZOS)
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, icon.width - 1, icon.height - 1), int(icon.width * 0.22), fill=255)
    cy = int(H * 0.36)
    canvas.paste(icon, ((W - icon.width) // 2, cy - icon.height // 2), mask)
    d.text((W / 2, cy + icon.height * 0.75), "Kanakku", font=ImageFont.truetype(SERIF, int(H * 0.075)), fill=INK, anchor="mm")
    sub = ImageFont.truetype(SANS, int(H * 0.026))
    y = cy + icon.height * 1.25
    for line in wrap(d, "Your bank SMS, turned into a private spend journal.", sub, W * 0.8):
        d.text((W / 2, y), line, font=sub, fill=MUTED, anchor="mm")
        y += sub.size * 1.4
    pill = ImageFont.truetype(SANS_BOLD, int(H * 0.026))
    label = "Get it on Google Play"
    tw = d.textlength(label, font=pill)
    px, py = (W - tw) / 2 - 40, y + H * 0.05
    d.rounded_rectangle((px, py, px + tw + 80, py + pill.size * 2.3), pill.size * 1.15, fill=ACCENT)
    d.text((W / 2, py + pill.size * 1.15), label, font=pill, fill=(255, 255, 255), anchor="mm")
    return canvas


def scene_frame(layout, still, title, subtitle, highlight):
    if still == "end":
        return end_card((1080, 1920) if layout == "vertical" else (1920, 1080))
    if layout == "vertical":
        W, H = 1080, 1920
        canvas = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(canvas)
        serif, sans = ImageFont.truetype(SERIF, 78), ImageFont.truetype(SANS, 40)
        y = 150
        for line in wrap(d, title, serif, W - 140):
            d.text((W / 2, y), line, font=serif, fill=INK, anchor="ma")
            y += 94
        y += 10
        for line in wrap(d, subtitle, sans, W - 180):
            d.text((W / 2, y), line, font=sans, fill=MUTED, anchor="ma")
            y += 54
        frame = phone(still, H - (y + 60) + 140, highlight)
        paste_shadowed(canvas, frame, (W - frame.width) // 2, y + 60)
        return canvas
    W, H = 1920, 1080
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    serif, sans = ImageFont.truetype(SERIF, 92), ImageFont.truetype(SANS, 44)
    lines = wrap(d, title, serif, 860)
    sub = wrap(d, subtitle, sans, 820)
    y = H / 2 - (len(lines) * 108 + 30 + len(sub) * 60) / 2
    for line in lines:
        d.text((150, y), line, font=serif, fill=INK)
        y += 108
    y += 30
    for line in sub:
        d.text((150, y), line, font=sans, fill=MUTED)
        y += 60
    frame = phone(still, H - 120, highlight)
    paste_shadowed(canvas, frame, W - frame.width - 230, 60)
    return canvas


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


def main():
    layout = sys.argv[1]
    voice = Path(sys.argv[sys.argv.index("--voice") + 1]) if "--voice" in sys.argv else None
    out = OUT / (f"kanakku-share-{voice.name}.mp4" if voice else f"kanakku-{layout}.mp4")
    tmp = Path(tempfile.mkdtemp())
    W, H = (1080, 1920) if layout == "vertical" else (1920, 1080)
    clips, durations, audio_parts = [], [], []
    for i, (still, title, subtitle, line, minimum, highlight) in enumerate(SCENES):
        frame = scene_frame(layout, still, title, subtitle, highlight)
        png = tmp / f"s{i}.png"
        frame.save(png)
        speech = voice / f"line{line}.mp3" if voice and line else None
        secs = max(minimum, duration(speech) + 0.9) if speech and speech.exists() else minimum
        frames = int(secs * 30)
        clip = tmp / f"s{i}.mp4"
        # Gentle push-in: 1.00 -> 1.035 over the scene.
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(png), "-vf",
            f"scale={W*2}:{H*2},zoompan=z='1+0.035*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps=30,format=yuv420p",
            "-frames:v", str(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "20", str(clip)], check=True)
        clips.append(clip)
        durations.append(secs)
        audio_parts.append((speech if speech and speech.exists() else None, secs))
    # Crossfade the scenes together.
    inputs, filters, last, offset = [], [], "0:v", 0.0
    for clip in clips:
        inputs += ["-i", str(clip)]
    for i in range(1, len(clips)):
        offset += durations[i - 1] - FADE
        label = f"v{i}"
        filters.append(f"[{last}][{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{label}]")
        last = label
    video = tmp / "video.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", f"[{last}]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", str(video)], check=True)
    if not voice:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-c", "copy", "-movflags", "+faststart", str(out)], check=True)
        print(out, duration(out))
        return
    # Narration: each line starts 0.35 s into its scene (scene starts shift by the crossfades).
    a_inputs, a_filters, start = [], [], 0.0
    for i, (speech, secs) in enumerate(audio_parts):
        if speech:
            n = len(a_inputs) // 2 + 1
            a_inputs += ["-i", str(speech)]
            a_filters.append(f"[{n}:a]adelay={int((start + 0.35) * 1000)}:all=1[a{n}]")
        start += secs - FADE
    mix = "".join(f"[a{k}]" for k in range(1, len(a_inputs) // 2 + 1))
    a_filters.append(f"{mix}amix=inputs={len(a_inputs)//2}:normalize=0,apad[aout]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), *a_inputs, "-filter_complex", ";".join(a_filters),
        "-map", "0:v", "-map", "[aout]", "-shortest", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)], check=True)
    print(out, duration(out))


if __name__ == "__main__":
    main()
