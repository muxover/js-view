# JS-View

<div align="center">

[![CI](https://github.com/muxover/js-view/actions/workflows/ci.yml/badge.svg)](https://github.com/muxover/js-view/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Renders JavaScript-heavy pages in a real browser so agents can read them.**

</div>

---

A plain `fetch` on a modern site usually hands you an empty `<div id="root">` and nothing else. The page is there, it just hasn't run its JavaScript yet. JS-View loads the URL in a headless Chromium, lets the scripts run, optionally pokes at the page (scroll, click, type), and gives you back the content that actually rendered as markdown, text, or HTML.

I built it for agents that need to read SPAs and infinite-scroll feeds without me writing a throwaway scraper every time. It comes two ways: a **self-contained skill** for Cursor and Claude Code that you copy into a project and it just works, and an optional **HTTP service** for when you want to host it once and scale it.

---

## Features

- Runs the page's JavaScript in Chromium and waits for it to settle.
- Returns markdown, plain text, raw HTML, or a JSON bundle. Markdown goes through Readability so you get the article, not the navbar.
- Drives the page when you need it to: scroll for lazy content, click "load more", fill a field, navigate.
- Optional extras: capture the XHR/fetch calls a page makes, grab a screenshot, run OCR over it.
- Keeps cookies and localStorage per session so a logged-in page stays logged in.
- Tries not to look like a bot: stealth launch, rotating user agents, jittered viewport, proxy support, headful fallback.
- Pools browsers and recycles them, and can hand renders off to Redis-backed workers when one process isn't enough.

---

## Use the skill (recommended)

The skill is self-contained. Copy the folder into your project — that's the whole install:

```bash
cp -r js-view/.cursor/skills/js-view your-project/.cursor/skills/js-view     # Cursor
cp -r js-view/.claude/skills/js-view your-project/.claude/skills/js-view     # Claude Code
```

Or drop it in your personal skills directory so it's available in every project:

```bash
cp -r js-view/.cursor/skills/js-view ~/.cursor/skills/js-view
```

Then open the project and ask the agent in plain language:

> Use the js-view skill to fetch https://news.ycombinator.com and list the top stories.

The first run installs its renderer (Playwright + Chromium) inside the skill folder and then renders in-process, so it can take a minute. Everything after that is fast. There's no service to start, no ports, and no environment variables — it works wherever you copy it. That's why a clone from GitHub "just works": the skill carries everything it needs and sets itself up on first use.

You can also run it directly:

```bash
node .cursor/skills/js-view/scripts/render.mjs --url "https://example.com" --scroll 3
```

Flags and output are documented in the [skill reference](.cursor/skills/js-view/reference.md).

---

## Run it as a service (optional)

If you'd rather host JS-View once and hit it over HTTP — or scale it across workers — run the server in this repo:

```bash
git clone https://github.com/muxover/js-view
cd js-view
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

That brings the API up on `http://localhost:8080`. Renders run in-process by default; set `REDIS_URL` and they get dispatched to a worker queue instead.

A page to markdown:

```bash
curl -s http://localhost:8080/render \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","output_format":"markdown"}'
```

Something heavier: wait for the feed to appear, scroll a few times, and capture the API calls that fire:

```bash
curl -s http://localhost:8080/render \
  -H "content-type: application/json" \
  -d '{
        "url":"https://example.com/feed",
        "wait_for_selector":".feed-item",
        "actions":[{"type":"scroll","count":3}],
        "capture_network":true
      }'
```

Prefer containers? This brings up the API, a worker, and Redis together:

```bash
docker compose up --build
```

And if one worker isn't keeping up:

```bash
docker compose up --scale worker=4
```

---

## Service API

| Endpoint | What it does |
|----------|--------------|
| `POST /render` | Render a page and return the content |
| `GET /health` | Status, role, queue state, pool stats |
| `GET /sessions` | List saved session ids |
| `DELETE /sessions/:id` | Drop a saved session |

The `/render` body uses the same field names as the skill options (`url`, `wait_until`, `output_format`, `actions`, and so on); the [skill reference](.cursor/skills/js-view/reference.md) documents each one and the response shape.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the service with reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled service |
| `npm run worker` | Run a queue worker (needs `REDIS_URL`) |
| `npm test` | Run the test suite |
| `npm run lint` | Run ESLint |
| `npm run format` | Format `src/` and `tests/` with Prettier |

---

## Configuration

Everything is set through environment variables; [.env.example](.env.example) has the complete list with comments. The ones you'll reach for most:

| Variable | Default | Description |
|----------|---------|-------------|
| `JSVIEW_ROLE` | `all` | `api`, `worker`, or `all` |
| `PORT` | `8080` | HTTP listen port |
| `RATE_LIMIT_MAX` | `60` | Requests per window per IP |
| `API_KEY` | - | Require this key on `/render` and `/sessions` (bearer or `x-api-key`); empty leaves them open |
| `BLOCK_PRIVATE_HOSTS` | `true` | Refuse to fetch localhost / private-network addresses (SSRF guard) |
| `DEFAULT_TIMEOUT_MS` | `15000` | Default per-render timeout |
| `MAX_TIMEOUT_MS` | `60000` | Hard ceiling on a render timeout |
| `BROWSER_POOL_SIZE` | `2` | Browser contexts per worker |
| `BROWSER_MAX_USES` | `50` | Renders before a browser is recycled |
| `HEADFUL` | `false` | Run a visible browser |
| `BROWSER_NO_SANDBOX` | `true` | Launch Chromium with `--no-sandbox` (needed as root in containers) |
| `STEALTH_ENABLED` | `true` | Apply stealth evasions |
| `RANDOMIZE_VIEWPORT` | `true` | Jitter the viewport per render |
| `PROXY_URL` | - | Default proxy, e.g. `http://user:pass@host:port` |
| `SESSION_DIR` | `./sessions` | Where session state is written |
| `REDIS_URL` | - | Set this to turn on the queue |
| `QUEUE_CONCURRENCY` | `2` | Concurrent jobs per worker |
| `OCR_LANG` | `eng` | Tesseract OCR language(s) |
| `IDLE_SHUTDOWN_MS` | `0` | Exit the service after this many ms idle (`0` disables) |

---

## Project Layout

```text
JSView/
├── src/
│   ├── index.ts              # Bootstrap: API and/or worker role, graceful shutdown
│   ├── config.ts             # Environment configuration
│   ├── types.ts              # Request/response contracts
│   ├── server/
│   │   ├── app.ts            # Express app + middleware wiring
│   │   ├── routes.ts         # /render, /health, /sessions routes
│   │   ├── schema.ts         # zod request validation
│   │   └── middleware/       # API-key auth, rate limiting, error handling
│   ├── browser/
│   │   ├── launch.ts         # Stealth Chromium launch
│   │   ├── pool.ts           # Bounded context pool with recycling
│   │   ├── stealth.ts        # UA rotation, viewport, proxy resolution
│   │   └── session.ts        # Persistent storage-state per session id
│   ├── render/
│   │   ├── renderer.ts       # Render orchestration
│   │   ├── dispatch.ts       # Inline vs queued dispatch
│   │   ├── waitStrategies.ts # Load-state and selector waits
│   │   ├── actions.ts        # scroll / click / type / wait / navigate
│   │   ├── network.ts        # XHR/fetch capture
│   │   ├── screenshot.ts     # Screenshot + OCR
│   │   └── tabs.ts           # Multi-tab tracking
│   ├── extract/
│   │   ├── index.ts          # Format dispatch (markdown/text/html/json)
│   │   ├── clean.ts          # Readability + chrome stripping
│   │   ├── markdown.ts       # HTML to markdown
│   │   ├── text.ts           # Text normalization
│   │   ├── links.ts          # Absolute link extraction
│   │   └── metadata.ts       # Title / description / OpenGraph
│   ├── security/
│   │   └── url.ts            # URL scheme allowlist + SSRF private-host guard
│   ├── queue/
│   │   ├── connection.ts     # Shared Redis connection
│   │   ├── queue.ts          # BullMQ producer
│   │   └── worker.ts         # BullMQ consumer
│   └── utils/
│       ├── logger.ts         # pino logger
│       └── errors.ts         # HttpError + timeout helper
├── tests/                    # vitest unit + guarded integration tests
├── .cursor/skills/js-view/   # Self-contained Cursor skill (own Playwright renderer)
├── .claude/skills/js-view/   # Self-contained Claude Code skill
├── Dockerfile                # Playwright-based runtime image
└── docker-compose.yml        # API + worker + Redis
```

---

## Limitations

- Some sites work hard to block headless browsers. Stealth and proxies help, but nothing wins every time.
- Heavy pages are slow. Expect a second or several per render.
- OCR is best-effort. It's handy for reading text baked into images, not a substitute for real extraction.
- Pages behind a login need a session seeded first.

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

---

<p align="center">Made with ❤️ by Jax (@muxover)</p>
