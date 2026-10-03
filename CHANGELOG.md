# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-03

### Added

- `js-view` CLI: render a page to markdown, text, HTML, or JSON, list its links, capture its XHR/fetch calls, or save a screenshot.
- MCP server (`js-view mcp`) with `render`, `screenshot`, `links`, and `network` tools; the browser stays warm between calls.
- Plugins for Claude Code, Codex, and Cursor, a one-click Cursor MCP install, and a skill that installs in any agent with `npx skills add muxover/js-view`.
- Render outcomes: bot checks, login walls, HTTP errors, and empty pages come back labelled with hints instead of passed off as content.
- `selector` to keep only matching elements and `max_chars` to cut long content at a paragraph.
- Page actions: scroll, click, type, wait, and navigate.
- `js-view login` to sign in once in a visible browser and reuse the session.
- Uses Playwright's Chromium, or an installed Chrome or Edge; `js-view install` downloads Chromium when neither is present.
- Screenshots of the viewport, the full page, or one element, with optional OCR.
- Self-hosted HTTP service with a browser pool, API-key auth, rate limiting, an SSRF guard for private hosts, and Redis-backed workers.

[Unreleased]: https://github.com/muxover/js-view/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/muxover/js-view/releases/tag/v0.1.0
