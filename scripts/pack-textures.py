#!/usr/bin/env python3
"""
pack-textures.py — build the HD texture set for the 3D scene
---------------------------------------------------------------------------
The base set in `public/assets/textures/*.webp` is deliberately small (1024–2048
wide) so the whole deliverable fits in a few megabytes. This script builds the
*HD* companions from the original masters in `assets-src/textures/`, which the
engine prefers when they are present:

    moon-color-4k.webp      4096×2048   LROC WAC colour (NASA SVS CGI Moon Kit)
    moon-normal-4k.webp     4096×2048   LOLA-derived normal map
    earth-2k.webp           2048×1024   Blue Marble day side
    earth-normal-2k.webp    2048×1024   Earth relief (land only, applied in-shader)
    earth-clouds-2k.webp    2048×1024   cloud field (alpha)
    earth-lights-2k.webp    2048×1024   VIIRS city radiance
    earth-specular-2k.webp  2048×1024   ocean mask for the sun glint

Nothing is upscaled: each output is written at its master's native size, so the
HD files carry real detail and not interpolated noise. If a master is missing
the script says so and skips it — the engine then falls back to the base file.

Usage: python3 scripts/pack-textures.py [--quality 88]
"""
import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "textures")
OUT = os.path.join(ROOT, "public", "assets", "textures")

# (master, output, max width, keep alpha)
JOBS = [
    ("moon-color.jpg", "moon-color-4k.webp", 4096, False),
    ("moon-normal.png", "moon-normal-4k.webp", 4096, False),
    ("earth.jpg", "earth-2k.webp", 2048, False),
    ("earth-normal.jpg", "earth-normal-2k.webp", 2048, False),
    ("earth-clouds.png", "earth-clouds-2k.webp", 2048, True),
    ("earth-lights.png", "earth-lights-2k.webp", 2048, False),
    ("earth-specular.jpg", "earth-specular-2k.webp", 2048, False),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", type=int, default=88)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    total = 0
    missing = []
    for master, out_name, max_w, alpha in JOBS:
        src = os.path.join(SRC, master)
        if not os.path.exists(src):
            missing.append(master)
            continue
        im = Image.open(src)
        if im.width > max_w:
            im = im.resize((max_w, max_w // 2), Image.LANCZOS)
        elif im.width < max_w:
            # Never upscale: report it so the manifest cannot claim detail
            # that does not exist.
            print(f"  note  {master} is {im.width}px wide (< {max_w}) — written as-is, not upscaled")
        if alpha:
            im = im.convert("RGBA")
        else:
            im = im.convert("RGB")
        dst = os.path.join(OUT, out_name)
        im.save(dst, "WEBP", quality=args.quality, method=6)
        size = os.path.getsize(dst)
        total += size
        print(f"  {out_name:26s} {im.width:5d}×{im.height:<5d} {size / 1024:8.0f} KB  (from {master})")

    print(f"\n  {len(JOBS) - len(missing)} files, {total / 1048576:.1f} MB total")
    if missing:
        print("  skipped (no master): " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
