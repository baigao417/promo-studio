"""Export selected campaign frames as JPEG files for visual inspection."""
from __future__ import annotations

import argparse
import base64
import math
from pathlib import Path

from runtime import browser_options, campaign_id, local_server, output_dir, ready_page


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("campaign")
    parser.add_argument("times", nargs="+", type=float)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        campaign_id(args.campaign)
    except ValueError as error:
        parser.error(str(error))
    from playwright.sync_api import sync_playwright

    out = args.out or output_dir(args.campaign) / "frames"
    with local_server() as base, sync_playwright() as pw:
        browser = pw.chromium.launch(**browser_options())
        page, errors = ready_page(browser, base, args.campaign)
        duration = page.evaluate("window.__spec.duration")
        if any(not math.isfinite(t) or not 0 <= t <= duration for t in args.times):
            parser.error("frame time must be within the campaign duration")
        out.mkdir(parents=True, exist_ok=True)
        for t in args.times:
            url = page.evaluate("t => window.__frame(t, 0.93)", t)
            (out / f"{t:06.2f}.jpg").write_bytes(base64.b64decode(url.split(",", 1)[1]))
        if errors:
            raise RuntimeError("campaign produced a page error")
        browser.close()
    print(f"frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
