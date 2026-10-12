# Third-Party Notices

This distribution contains no vendored third-party source, downloaded media, font files, or third-party screenshots. The JavaScript modules, campaign illustrations and procedural sound definitions are distributed under the project MIT license.

Runtime tools are installed separately and are not redistributed here:

- Node.js runs the local server and the JavaScript tests.
- Python runs the rendering scripts.
- Playwright is declared in `requirements.txt`; its browser binaries are installed separately.
- Chromium renders Canvas and Web Audio in an isolated headless process.
- FFmpeg is resolved from PATH or an explicit environment variable.
- System fonts remain part of the user's operating system.

Consult the respective upstream distributions for their licenses and notices. A packaged application that bundles these components requires a separate redistribution review; this source-only repository makes no claim that the MIT license covers them.
