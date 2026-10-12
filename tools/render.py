"""Render Canvas frames and a procedural soundtrack into a local MP4."""
from __future__ import annotations

import argparse
import base64
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

from runtime import browser_options, campaign_id, local_server, output_dir, ready_page


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("campaign")
    parser.add_argument("--fps", type=int, default=0, help="0 uses campaign fps")
    parser.add_argument("--from", dest="t0", type=float, default=0)
    parser.add_argument("--to", dest="t1", type=float)
    parser.add_argument("--name", default="")
    parser.add_argument("--out", type=Path, help="override runtime output directory")
    parser.add_argument("--quality", type=float, default=0.93)
    parser.add_argument("--audio-only", action="store_true")
    args = parser.parse_args()
    try:
        campaign_id(args.campaign)
    except ValueError as error:
        parser.error(str(error))
    if args.fps < 0 or not math.isfinite(args.quality) or not 0 < args.quality <= 1:
        parser.error("fps must be nonnegative and quality must be in (0, 1]")
    name = args.name or time.strftime("%Y%m%d-%H%M%S")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
        parser.error("name must contain only letters, digits, underscores or hyphens")
    ffmpeg = os.environ.get("FFMPEG_EXECUTABLE") or shutil.which("ffmpeg")
    if not args.audio_only and not ffmpeg:
        parser.error("ffmpeg is required for video export")
    from playwright.sync_api import sync_playwright

    out = args.out or output_dir(args.campaign)
    encoder = None
    try:
        with local_server() as base, sync_playwright() as pw:
            browser = pw.chromium.launch(**browser_options())
            page, errors = ready_page(browser, base, args.campaign)
            spec = page.evaluate("window.__spec")
            t1 = spec["duration"] if args.t1 is None else args.t1
            fps = args.fps or spec["fps"]
            if not all(math.isfinite(t) for t in (args.t0, t1)) or not 0 <= args.t0 < t1 <= spec["duration"]:
                parser.error("render interval must satisfy 0 <= from < to <= duration")
            count = round((t1 - args.t0) * fps)
            if not args.audio_only and count < 1:
                parser.error("render interval must contain at least one frame")
            out.mkdir(parents=True, exist_ok=True)
            wav = out / f"{args.campaign}-{name}.wav"
            mp4 = out / f"{args.campaign}-{name}.mp4"
            print("rendering soundtrack ...", flush=True)
            wav.write_bytes(base64.b64decode(page.evaluate("window.__audio()")))
            if args.audio_only:
                if errors:
                    raise RuntimeError("campaign produced a page error")
                print(f"done -> {wav}")
                return 0
            print(f"rendering {count} frames @ {fps}fps, {spec['width']}x{spec['height']} ...", flush=True)
            encoder = subprocess.Popen([
                ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps),
                "-c:v", "mjpeg", "-i", "-", "-ss", str(args.t0), "-t", str(t1 - args.t0), "-i", str(wav),
                "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", str(mp4),
            ], stdin=subprocess.PIPE)
            for i in range(count):
                url = page.evaluate("([t, q]) => window.__frame(t, q)", [args.t0 + i / fps, args.quality])
                encoder.stdin.write(base64.b64decode(url.split(",", 1)[1]))
            encoder.stdin.close()
            encoder.wait()
            if encoder.returncode or errors:
                raise RuntimeError("encoder or campaign failed")
            browser.close()
            print(f"done -> {mp4}")
        return 0
    finally:
        if encoder is not None and encoder.poll() is None:
            encoder.kill()
            encoder.wait()


if __name__ == "__main__":
    raise SystemExit(main())
