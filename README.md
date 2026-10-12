# Promo Studio

Code-driven promo videos: deterministic Canvas frames, procedural Web Audio music, a local review timeline, and Playwright + FFmpeg export. Includes two entirely synthetic campaigns with no captured personal or third-party content.

用代码制作宣传短片：字幕、场景和音效共用时间轴，修改脚本后可重新预览与导出，不必手工对齐每一帧。作者：`baigao417`。

## 核心机制

```text
campaigns/<id>/timeline.js + example.json（合成示例）
                 |
        engine/player.js 加载分镜
           /                     \
Canvas draw(t)              Web Audio score
逐帧画面                    OfflineAudioContext
           \                     /
      tools/review.html 本地时间轴审片
                 |
      Playwright 抽帧 + PCM WAV
                 |
      FFmpeg -> MP4（本地输出，不上传）
```

引擎提供时间插值、缓动、节拍、绘图和双语字幕。审片台支持场景跳转、逐帧检查、波形、批注和本地成片播放。音乐由振荡器、噪声、滤波器和混响合成，不使用音频采样。

## 快速开始

预览和单元测试需要 Node.js 20 或更高版本，无需安装 npm 依赖：

```sh
npm test
npm start
```

浏览器打开 `http://127.0.0.1:5178/`。第二个示例：`http://127.0.0.1:5178/tools/review.html?c=explore`。服务仅监听本机回环地址。

导出需要 Python 3.10 或更高版本、Playwright 的 Chromium，以及 PATH 中可用的 FFmpeg。以下为 Windows PowerShell 命令：

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m playwright install chromium
.\.venv\Scripts\python tools/render.py learning-workbench --from 0 --to 2 --fps 12 --name smoke
.\.venv\Scripts\python tools/render.py explore --name demo
.\.venv\Scripts\python tools/frames.py explore 1 9 17 25 43
```

macOS / Linux 使用 `.venv/bin/python` 替代上述解释器路径。也可使用已有的 Python 环境。依赖安装和浏览器安装需要联网；正常预览与导出不需要访问外部服务。

默认写入 `runtime/<campaign>/out/`，批注写入 `runtime/<campaign>/review.json`。这些文件均被 `.gitignore` 排除。渲染后的文件在审片台刷新后可选择播放。

## 配置

`.env.example` 仅列举配置项，程序不会自动读取 `.env`。请通过进程环境变量设置，不放入密钥或平台凭证。

| 配置 | 默认值 | 作用 |
| --- | --- | --- |
| `PORT` | `5178` | 审片台端口，也可用 `node tools/server.mjs 5180` 指定 |
| `PROMO_DATA_DIR` | `runtime` | 批注与成片根目录；相对路径以项目根为基准 |
| `CHROMIUM_EXECUTABLE` | 空 | 空值使用 Playwright 已安装的 Chromium，否则指定兼容浏览器可执行文件 |
| `FFMPEG_EXECUTABLE` | 空 | 空值从 PATH 查找 FFmpeg，否则指定可执行文件 |

```powershell
$env:PROMO_DATA_DIR = './runtime'
$env:PORT = '5180'
npm start
```

`render.py` 支持 `--from` / `--to` 截取区间、`--fps`、`--quality`、`--name`、`--out` 和 `--audio-only`。`--audio-only` 导出完整配乐，不按区间截取。`--out` 是一次性输出路径覆盖；审片台只检索 `PROMO_DATA_DIR/<campaign>/out/`。

## 示例与扩展

| Campaign | 默认格式 | 示例 |
| --- | --- | --- |
| `learning-workbench` | 1080 × 1920，60 fps，42 秒 | 虚构学习产品 Lumen Learning |
| `explore` | 1080 × 1920，60 fps，48 秒 | 虚构阅读产品 Signal Garden |

两者均有五段分镜、双语字幕和程序化配乐。`example.json` 显式标记 `synthetic`；数值与文案不代表实际业务效果。新增 campaign 时提供 `timeline.js` 默认导出，定义尺寸、时长、场景、字幕、score 和 `create(env).draw(ctx, t)`。绘制由时间 `t` 驱动，不使用实时随机数。

## 已知限制

- 逐帧导出并非实时编码，1080p / 60 fps 的整片导出需要较多 CPU 和内存；先用短区间验证。
- 系统字体和浏览器版本会影响文字排版与像素结果，不承诺跨平台逐像素一致。
- 示例仅演示机制，不包括真实截图、转写、AI 生成服务或外部项目的数据读取。
- 批注保存在本地，服务没有登录、多用户隔离或公网部署支持，不应暴露到公共网络。仅打开 HTML 文件无法使用模块加载和批注 API。
- FFmpeg 需包含 H.264 与 AAC 编码器；音量未针对所有平台做响度验收。需要自行检查字幕、安全区及整片效果。
- 渲染脚本只允许从本地预览服务器加载资源；自定义素材应先放入项目的素材目录。不要运行不可信 campaign 脚本。

## 素材与免责声明

素材登记见 [SOURCES.md](SOURCES.md)，外部运行工具说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。此仓库没有第三方素材下载器、账号连接或自动发布功能。引入新素材前自行确认隐私与逐项许可，不要把第三方内容的公开可访问性当作转载授权。

本工具按现状提供，不能保证生成视频满足所有平台规则或商业发布要求。公开发布、第三方素材权利及最终成片审核由使用者负责。

## 许可证

[MIT](LICENSE)，Copyright (c) 2026 baigao417。
