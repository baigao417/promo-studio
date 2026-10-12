"""Shared local renderer setup; does not import Playwright until rendering."""
from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import re
import socket
import subprocess
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def campaign_id(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9-]+", value) or not (ROOT / "campaigns" / value / "timeline.js").is_file():
        raise ValueError("unknown campaign id")
    return value


def output_dir(campaign: str) -> Path:
    data = Path(os.environ.get("PROMO_DATA_DIR") or "runtime")
    if not data.is_absolute():
        data = ROOT / data
    return data / campaign / "out"


def browser_options() -> dict:
    result = {"headless": True, "args": ["--autoplay-policy=no-user-gesture-required"]}
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    if executable:
        result["executable_path"] = executable
    return result


@contextmanager
def local_server():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        ["node", str(ROOT / "tools" / "server.mjs"), str(port)], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("preview server exited before readiness")
            try:
                with urlopen(f"{base}/engine/render.html", timeout=0.5) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("preview server readiness timed out")
        yield base
    finally:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def ready_page(browser, base: str, campaign: str):
    page = browser.new_page(viewport={"width": 1080, "height": 1920})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Only the loopback server may provide resources, including for custom campaigns.
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
    page.goto(f"{base}/engine/render.html?c={campaign}")
    page.wait_for_function("window.__ready === true || Boolean(window.__failed)", timeout=120_000)
    if errors or page.evaluate("Boolean(window.__failed)"):
        raise RuntimeError("campaign failed to initialize")
    return page, errors
