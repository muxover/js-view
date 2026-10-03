# JS-View

<div align="center">

[![CI](https://github.com/muxover/js-view/actions/workflows/ci.yml/badge.svg)](https://github.com/muxover/js-view/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/muxover/js-view)](https://github.com/muxover/js-view/releases/latest)
[![npm](https://img.shields.io/npm/v/@muxover/js-view)](https://www.npmjs.com/package/@muxover/js-view)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-8B5CF6.svg)](#installation)

**Renders JavaScript-heavy pages in a real browser so agents can read them.**

</div>

---

A plain fetch of a modern site usually returns an empty `<div id="root">` and nothing else. The page is there, it just hasn't run its JavaScript yet. JS-View loads the URL in headless Chromium, lets the scripts run, scrolls or clicks when asked, and hands back what actually rendered as clean markdown. It plugs into Claude Code, Codex, and Cursor as an MCP server with a skill that tells the agent when to reach for it, runs as a CLI, and self-hosts as an HTTP service.

---

## Features

- Renders SPAs, infinite-scroll feeds, and "load more" pages, then extracts the main content as markdown, text, or HTML.
- Four MCP tools: `render`, `screenshot`, `links`, and `network` (the XHR/fetch calls a page makes, with JSON bodies).
- Says when a page isn't the page: bot checks, login walls, HTTP errors, and empty renders come back labelled, with what to try next.
- Keeps agents inside their context budget: pick part of the page with a CSS selector, and long content is cut at a paragraph with the full length reported.
- Signed-in pages: sign in once in a real browser window and reuse the session in every render.
- Uses the Chrome or Edge already on the machine when Playwright's Chromium isn't installed, and keeps the browser warm between tool calls.
- Reads local dev servers from the CLI and MCP server; the HTTP service blocks private hosts by default.
- Self-hosted service with a browser pool, API-key auth, rate limiting, and Redis-backed workers for scale.

---

## Installation

JS-View needs Node.js 22 or newer. The first start downloads the package, so it can take a minute; if your agent reports that the server failed to start, run `npx -y @muxover/js-view@latest --version` once and restart the agent.

**Claude Code** — installs the MCP server and the skill:

```text
/plugin marketplace add muxover/js-view
/plugin install js-view@js-view
```

**Codex** — add the plugin marketplace, then install js-view from `/plugins`:

```bash
codex plugin marketplace add muxover/js-view
```

Or add only the MCP server to `~/.codex/config.toml`:

```toml
[mcp_servers.js-view]
command = "npx"
args = ["-y", "@muxover/js-view@latest", "mcp"]
startup_timeout_sec = 120
```

**Cursor** — one click adds the MCP server:

[![Add js-view to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=js-view&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBtdXhvdmVyL2pzLXZpZXdAbGF0ZXN0IiwibWNwIl19)

For the skill, run `npx skills add muxover/js-view` in your project, or copy [skills/js-view](skills/js-view) into `.cursor/skills/`.

**Any other agent** — install the skill with [skills](https://github.com/vercel-labs/skills):

```bash
npx skills add muxover/js-view
```

**Any other MCP client** — run the server over stdio:

```json
{
  "mcpServers": {
    "js-view": {
      "command": "npx",
      "args": ["-y", "@muxover/js-view@latest", "mcp"]
    }
  }
}
```

**No browser installed?** JS-View uses Playwright's Chromium, or else Chrome or Edge. If none is present:

```bash
npx -y @muxover/js-view install
```

---

## Quick Start

Ask your agent:

- "Read https://news.ycombinator.com and list the top five stories."
- "What API does https://example.com/products call to load its listings?"
- "Screenshot localhost:3000 and tell me what's broken in the layout."

From a terminal:

```bash
npx -y @muxover/js-view https://example.com
npx -y @muxover/js-view https://example.com/feed --scroll 3 --wait-for ".item"
npx -y @muxover/js-view localhost:3000 --screenshot home.png
```

---

## Usage

### MCP tools

| Tool | Returns |
|------|---------|
| `render` | The rendered page as markdown, text, or HTML, capped at 30,000 characters by default |
| `screenshot` | A JPEG of the viewport, the full page, or one element, with optional OCR text |
| `links` | Links on the page with their anchor text, filtered by selector, substring, or same site |
| `network` | XHR/fetch calls with method, status, content type, and a body preview |

Every tool takes `url` plus `wait_for`, `wait_until`, `scroll`, `click`, `type`, `session`, `proxy`, and `timeout_ms`. `render` adds `format`, `selector`, `raw`, and `max_chars`.

Each result starts with a header the agent reads first:

```text
Title: Hacker News
URL: https://news.ycombinator.com/
Status: 200 | ok | 1240 ms
```

The status is one of `ok`, `empty`, `blocked`, `login_required`, or `http_error`; anything but `ok` comes with `Note:` lines on what happened and what to try.

### Signed-in pages

Sign in once in a real browser window, then close it:

```bash
npx -y @muxover/js-view login https://example.com --session example
```

Pass `session: "example"` to any tool, or `--session example` to the CLI. Sessions are saved in `~/.js-view/sessions` and updated after each render.

---

## Commands

| Command | Description |
|---------|-------------|
| `js-view <url>` | Render a page and print its content |
| `js-view mcp` | Run the MCP server over stdio |
| `js-view login <url> --session <name>` | Open a browser to sign in and save the session |
| `js-view install` | Download Playwright's Chromium |
| `js-view serve` | Run the HTTP service |
| `js-view worker` | Run a queue worker (needs `REDIS_URL`) |

---

## Flags

| Flag | Description |
|------|-------------|
| `-f, --format <fmt>` | `markdown` (default), `text`, `html`, or `json` |
| `-w, --wait-for <css>` | Wait for a selector before reading |
| `--wait-until <event>` | `load`, `domcontentloaded`, `networkidle` (default), or `commit` |
| `--scroll <n>` | Scroll to the bottom `n` times |
| `--click <css>` | Click an element first; repeatable |
| `--type <css=text>` | Fill an input and press Enter; repeatable |
| `-s, --select <css>` | Only return elements matching a selector |
| `--max-chars <n>` | Cut the content at `n` characters |
| `--raw` | Keep navigation, header, and footer |
| `--session <name>` | Reuse a saved session |
| `--proxy <url>` | Route through a proxy |
| `--timeout <ms>` | Render timeout, default 15000 |
| `--links` | Print links instead of content |
| `--network` | Print XHR/fetch calls instead of content |
| `--screenshot <file>` | Also save a full-page PNG |
| `--json` | Print the full result as JSON |
| `--headful` | Show the browser window |

Content goes to stdout and the header to stderr. The exit code is `0` for a rendered page, `3` when the page was a bot check, login wall, HTTP error, or empty, `2` for bad usage, and `1` for failures.

---

## HTTP Service

Host JS-View once and call it over HTTP, or scale renders across workers:

```bash
docker compose up --build
docker compose up --scale worker=4
```

Without Docker, `npx -y @muxover/js-view serve` starts the API on port 8080 with renders in-process. Set `REDIS_URL` and they go through a BullMQ queue instead.

```bash
curl -s http://localhost:8080/render \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com/feed","wait_for_selector":".feed-item","actions":[{"type":"scroll","count":3}]}'
```

| Endpoint | Description |
|----------|-------------|
| `POST /render` | Render a page; returns `title`, `content`, `links`, `outcome`, `hints`, and `metadata` |
| `GET /health` | Status, role, queue state, and pool stats |
| `GET /sessions` | Saved session ids |
| `DELETE /sessions/:id` | Delete a saved session |

`/render` accepts `url`, `output_format`, `wait_until`, `wait_for_selector`, `timeout_ms`, `actions` (`scroll`, `click`, `type`, `wait`, `navigate`), `selector`, `max_chars`, `clean`, `session_id`, `proxy`, `capture_network`, `screenshot`, `full_page`, `ocr`, and `screenshot_format`.

---

## Configuration

Environment variables; [.env.example](.env.example) lists them all with comments.

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROMIUM_PATH` | - | Browser binary to use instead of auto-detection |
| `BROWSER_CHANNELS` | `chrome,msedge` | Installed browsers to fall back to, in order; `none` disables |
| `HEADFUL` | `false` | Show the browser window |
| `STEALTH_ENABLED` | `true` | Apply stealth evasions |
| `PROXY_URL` | - | Default proxy, e.g. `http://user:pass@host:port` |
| `SESSION_DIR` | `~/.js-view/sessions` | Saved sessions; `./sessions` for `npm start`, `/app/sessions` in Docker |
| `BLOCK_PRIVATE_HOSTS` | `true` | Refuse localhost and private networks; the CLI and MCP server default to `false` |
| `MAX_CHARS` | `0` | Default cap on content length for the CLI and service; `0` is no cap (the MCP server caps at 30,000) |
| `DEFAULT_TIMEOUT_MS` | `15000` | Per-render timeout |
| `PORT` | `8080` | HTTP port |
| `API_KEY` | - | Require this key on `/render` and `/sessions` (bearer or `x-api-key`) |
| `RATE_LIMIT_MAX` | `60` | Requests per window per IP |
| `BROWSER_POOL_SIZE` | `2` | Browsers per process |
| `REDIS_URL` | - | Turns on the render queue |
| `QUEUE_CONCURRENCY` | `2` | Jobs per worker |
| `OCR_LANG` | `eng` | Tesseract language for screenshot OCR |
| `LOG_LEVEL` | `info` | Log level; logs go to stderr |

---

## Project Layout

```text
js-view/
├── src/
│   ├── cli.ts                # js-view command: render, mcp, login, install, serve, worker
│   ├── index.ts              # Service entry for npm start and Docker
│   ├── service.ts            # HTTP API and/or worker role, graceful shutdown
│   ├── config.ts             # Environment configuration
│   ├── types.ts              # Request/response contracts
│   ├── mcp/
│   │   └── server.ts         # MCP tools: render, screenshot, links, network
│   ├── local/
│   │   ├── format.ts         # Result header for CLI and MCP output
│   │   └── login.ts          # Visible-browser sign-in that saves a session
│   ├── browser/
│   │   ├── launch.ts         # Chromium / Chrome / Edge resolution, stealth launch
│   │   ├── pool.ts           # Bounded browser pool with recycling
│   │   ├── stealth.ts        # User agent, viewport, proxy
│   │   └── session.ts        # Saved cookies and storage per session
│   ├── render/
│   │   ├── renderer.ts       # Render orchestration
│   │   ├── assess.ts         # Outcome detection and truncation
│   │   ├── actions.ts        # scroll / click / type / wait / navigate
│   │   ├── network.ts        # XHR/fetch capture
│   │   ├── screenshot.ts     # Screenshots and OCR
│   │   ├── dispatch.ts       # Inline vs queued renders
│   │   ├── tabs.ts           # Popup and new-tab tracking
│   │   └── waitStrategies.ts # Load-state and selector waits
│   ├── extract/              # Readability cleanup, markdown, text, links, metadata
│   ├── server/               # Express app, routes, validation, auth, rate limit
│   ├── queue/                # BullMQ producer and worker
│   ├── security/url.ts       # URL scheme allowlist and private-host guard
│   └── utils/                # Logger and errors
├── skills/js-view/SKILL.md   # Agent skill: when and how to use the tools
├── .claude-plugin/           # Claude Code plugin (with its MCP server) and marketplace
├── .cursor-plugin/           # Cursor plugin and marketplace
├── .agents/plugins/          # Codex plugin marketplace
├── plugin.json, mcp.json     # Agent Plugins manifest and MCP server
├── tests/                    # Unit, browser, MCP, and CLI tests
├── release-notes/            # Notes for each GitHub release
├── Dockerfile                # Playwright-based service image
├── docker-compose.yml        # API, worker, and Redis
└── docs/PROJECT.md           # Maintainer notes
```

---

## Limitations

- Sites with strong bot protection can still block it. JS-View reports the block rather than returning the challenge page as content.
- A render takes one to a few seconds; heavy pages take longer.
- OCR is best-effort, for text baked into images.
- Signing in needs a desktop with a display, since the login window is a real browser.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Licensed under the [MIT](LICENSE) license.

---

## Links

- Repository: https://github.com/muxover/js-view
- Issues: https://github.com/muxover/js-view/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- npm: https://www.npmjs.com/package/@muxover/js-view

---

<p align="center">Made with ❤️ by Jax (@muxover)</p>
