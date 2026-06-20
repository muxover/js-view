# JS-View Reference

The skill renders a page in a headless browser and prints a JSON result. It runs
entirely from this folder — the first call installs Playwright + Chromium here,
then every call renders in-process. No service, ports, or environment variables.

## Command

```bash
node scripts/render.mjs --url "<url>" [flags]
```

`stdout` is always clean JSON (the result summary). Progress and one-time setup
messages go to `stderr`, so you can safely parse `stdout`.

## Flags

| Flag | Maps to | Default | Description |
|------|---------|---------|-------------|
| `--url <url>` | `url` | required | Page to render |
| `--format <markdown\|text\|html\|json>` | `output_format` | `markdown` | Format of `content` |
| `--wait-until <load\|domcontentloaded\|networkidle\|commit>` | `wait_until` | `networkidle` | Navigation wait strategy |
| `--wait-for <selector>` | `wait_for_selector` | - | Wait for a CSS selector before extracting |
| `--timeout <ms>` | `timeout_ms` | `15000` | Per-render timeout (1000-120000) |
| `--scroll <n>` | `actions[].scroll` | - | Scroll to bottom `n` times (infinite scroll) |
| `--click <selector>` | `actions[].click` | - | Click an element (optional click; won't fail the render) |
| `--type <selector=text>` | `actions[].type` | - | Fill an input and press Enter |
| `--session <id>` | `session_id` | - | Persist/reuse cookies + localStorage in `sessions/<id>.json` |
| `--capture-network` | `capture_network` | `false` | Include observed XHR/fetch responses |
| `--screenshot` | `screenshot` | `false` | Capture a full-page PNG and OCR its text |
| `--ocr-lang <lang>` | `ocr_lang` | `eng` | Tesseract language for OCR |
| `--proxy <url>` | `proxy.server` | - | Route the browser through a proxy |
| `--no-clean` | `clean: false` | clean on | Skip Readability cleanup; keep raw page markup |
| `--headful` | `headful` | headless | Run with a visible browser window (debugging) |
| `--out <file>` | - | - | Write the full JSON result (including the base64 screenshot) to a file |

The screenshot's base64 is omitted from `stdout` to keep it readable; pass
`--out <file>` to capture the complete result.

## Actions

`--scroll`, `--click`, and `--type` build the action list for common cases. The
underlying engine (`scripts/engine.mjs`) supports these action shapes if you call
it directly:

```json
{ "type": "scroll", "count": 3, "delay_ms": 800 }
{ "type": "click", "selector": ".load-more", "optional": true }
{ "type": "type", "selector": "#q", "text": "hello", "submit": true }
{ "type": "wait", "selector": ".ready" }
{ "type": "wait", "ms": 1000 }
{ "type": "navigate", "url": "https://example.com/next", "wait_until": "networkidle" }
```

Actions run in order. A failing non-optional `click` aborts the render.

## Output

```json
{
  "title": "Page Title",
  "content": "Clean extracted markdown/text...",
  "links": ["https://example.com/page1"],
  "metadata": {
    "render_time_ms": 1320,
    "js_execution": true,
    "scroll_events": 3,
    "click_events": 0,
    "status_code": 200,
    "final_url": "https://example.com",
    "user_agent": "Mozilla/5.0 ...",
    "viewport": { "width": 1366, "height": 768 },
    "used_session": false,
    "used_proxy": false
  },
  "screenshot": "<base64 PNG, when --screenshot + --out>",
  "ocr_text": "<text from screenshot, when --screenshot>",
  "network": [
    {
      "url": "https://example.com/api/items",
      "method": "GET",
      "status": 200,
      "resource_type": "fetch",
      "content_type": "application/json",
      "body_preview": "{...}"
    }
  ]
}
```

`screenshot`, `ocr_text`, and `network` only appear when requested.

## Sessions

Pass `--session <id>` to persist cookies and localStorage between calls. State is
written to `sessions/<id>.json` next to the skill. Reuse the same id to continue a
logged-in session; delete the file to start fresh.

## Notes

- The first run installs dependencies and downloads Chromium into this folder, so
  it can take a minute. Later runs are fast.
- Need a long-running HTTP service, a job queue, or Docker instead of a per-call
  browser? The full JS-View server in the repo root provides that; the skill here
  is the standalone, copy-and-go path.
