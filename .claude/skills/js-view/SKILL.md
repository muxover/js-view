---
name: js-view
description: Fetch and read JavaScript-rendered web pages with a real headless browser. Use when a URL returns empty or minimal raw HTML, is a SPA (React, Vue, Angular, Next.js), hides content behind client-side rendering, uses infinite scroll or "load more" buttons, or when a plain HTTP fetch is missing the real content. Returns clean markdown/text, links, metadata, optional screenshots with OCR, and captured network calls.
---

# JS-View

Loads a page in a real headless browser, runs its JavaScript, and hands back the content that actually rendered. Reach for it when a plain fetch comes back empty.

## When to use

Use this instead of a plain fetch when:

- Raw HTML is empty or just a loading shell / `<div id="root">`.
- The site is a SPA (React, Vue, Angular, Next.js, Svelte).
- Content loads via XHR/fetch after page load.
- The page uses infinite scroll or a "load more" / pagination button.
- You need a screenshot, OCR text, or to see the API calls a page makes.

## How it runs

The skill is self-contained. On the first render it installs its renderer (Playwright + Chromium) inside this folder, then renders right there in the same process. Later calls reuse what's installed and are fast. There's no separate service to start, no ports, and no environment variables to set, so it works wherever you copy the folder.

The first call downloads a browser, so it can take a minute. Everything after that is quick.

## Quick start

Render a page to markdown:

```bash
node scripts/render.mjs --url "https://example.com"
```

Render a SPA, wait for content, scroll for lazy-loaded items, and capture the network:

```bash
node scripts/render.mjs \
  --url "https://example.com/feed" \
  --wait-for ".feed-item" \
  --scroll 3 \
  --capture-network
```

Click "load more" then extract text:

```bash
node scripts/render.mjs --url "https://example.com" --click ".load-more" --format text
```

Take a screenshot with OCR:

```bash
node scripts/render.mjs --url "https://example.com" --screenshot --out result.json
```

## Workflow

1. Run `render.mjs` with the target `--url` and any interaction flags. The first call may take a minute while it installs the browser; later calls are fast.
2. Read the printed `title`, `content`, and `links` from the JSON result.
3. If content is still thin, add `--wait-for <selector>` or `--scroll <n>` and retry.

## Common flags

| Flag | Purpose |
|------|---------|
| `--url <url>` | Page to render (required) |
| `--format <markdown\|text\|html\|json>` | Output format (default markdown) |
| `--wait-until <load\|domcontentloaded\|networkidle\|commit>` | Navigation wait strategy |
| `--wait-for <selector>` | Wait for a CSS selector before extracting |
| `--scroll <n>` | Scroll to bottom `n` times (infinite scroll) |
| `--click <selector>` | Click an element (e.g. load more) |
| `--type <selector=text>` | Fill an input |
| `--session <id>` | Reuse cookies/localStorage across calls |
| `--capture-network` | Include observed XHR/fetch calls |
| `--screenshot` | Capture a full-page PNG and OCR its text |
| `--ocr-lang <lang>` | Tesseract language for OCR (default `eng`) |
| `--proxy <url>` | Route the browser through a proxy |
| `--timeout <ms>` | Per-render timeout |
| `--out <file>` | Write the full JSON result (incl. screenshot) to a file |

## Additional resources

- For the full request/response schema and advanced options, see [reference.md](reference.md).
