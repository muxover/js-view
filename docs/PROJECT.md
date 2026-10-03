# JS-View — maintainer notes

## What this is

JS-View renders JavaScript-heavy pages in headless Chromium and returns what rendered, for AI agents that can't read SPAs with a plain fetch. It ships as one npm package (`@muxover/js-view`, command `js-view`) with a CLI, an MCP server, and a self-hostable HTTP service, plus plugin manifests and a skill for Claude Code, Codex, and Cursor.

## Stack & layout

- TypeScript on Node.js 22+, Playwright with playwright-extra stealth, Readability + Turndown for extraction, Express for the service, BullMQ/Redis for workers, the MCP TypeScript SDK for the server, Vitest for tests.
- `src/render/renderer.ts` is the single render path; the CLI (`src/cli.ts`), MCP server (`src/mcp/server.ts`), HTTP routes, and queue worker all call it.
- `src/render/assess.ts` decides the outcome (ok, empty, blocked, login_required, http_error) and truncates.
- `src/browser/launch.ts` resolves the browser: `CHROMIUM_PATH`, then Playwright's Chromium, then installed Chrome/Edge.
- Release: bump the version in `package.json`, `package-lock.json`, all three `plugin.json` files (the Claude Code one also pins the MCP server), and `mcp.json` (`tests/plugin.test.ts` checks they match), add `release-notes/vX.Y.Z.md` and the CHANGELOG entry, then push the tag. The release workflow publishes to npm through trusted publishing. Commits are signed with the maintainer's SSH signing key. The Dockerfile's Playwright image tag must equal the pinned `playwright` version.
- Plugin files: `.claude-plugin/` (Claude Code), `.cursor-plugin/` (Cursor), `.agents/plugins/marketplace.json` (Codex), root `plugin.json` + `mcp.json` (Agent Plugins, read by Codex and Cursor), `skills/js-view/`.

## Decisions

- 2026-06-25: Stealth launch, browser pool, and Redis queue so the same core serves one agent or a hosted fleet.
- 2026-09-28: One engine. The old skill carried its own renderer; the skill now calls the MCP tools or `npx @muxover/js-view`.
- 2026-09-28: MCP over stdio is the main integration, since every agent client speaks it; plugins wrap it with the skill.
- 2026-09-28: Plugin MCP configs pin `@muxover/js-view@<version>`; manual configs use `@latest`. `tests/plugin.test.ts` fails if a pinned version drifts from package.json.
- 2026-09-28: CLI and MCP allow private hosts (local dev servers); the HTTP service blocks them by default.
- 2026-09-28: Walls are reported, not hidden: a challenge or login page returns with an outcome and hints, and the CLI exits 3.
- 2026-09-28: Use the browser's real user agent instead of a fixed list, so the UA always matches the engine's client hints.
- 2026-09-28: The Claude Code marketplace is named `js-view`, not `muxover`, because deeptrace's repo already declares a `muxover` marketplace and two marketplaces can't share a name.
- 2026-09-28: npm refused the unscoped name `js-view` as too close to `jsview`, so the package is `@muxover/js-view`; the command is still `js-view`.
- 2026-09-28: The Claude Code plugin declares its MCP server inside `.claude-plugin/plugin.json` rather than a root `.mcp.json`, so opening this repo in Claude Code doesn't offer to start a server that can't run from its own source folder.
- 2026-09-28: Cursor's README button uses `https://cursor.com/en/install-mcp`, because GitHub and npm strip `cursor://` links.
- 2026-09-28: npm publishing runs from the release workflow with provenance (trusted publishing); it skips versions already on npm.
- 2026-09-30: History reset to a single v0.1.0. The earlier 0.2.0 to 0.2.3 npm versions were unpublished and npm never allows them again, so the next versions start at 0.3.0 or use 0.1.x.

## Status

- v0.1.0 is ready and not yet published; the first npm publish is manual (`npm publish --access public`), then trusted publishing is set up for the release workflow.
- The test suite covers the renderer against a real browser, all four MCP tools, every CLI command, the HTTP service, and the Redis queue. CI also builds the Docker image and renders through it.
- Checked on Windows against live sites (Hacker News, react.dev, JS-rendered and infinite-scroll pages, a login wall, a bot wall); the Claude Code plugin installs from GitHub and its MCP server connects; Codex adds the marketplace and the MCP server.
- Not yet tried for real: Cursor's install button (Cursor wasn't installed), and `js-view login` on Windows.

## Next

- A shared `muxover/plugins` marketplace listing js-view and deeptrace, so one `marketplace add` covers both.
- Consider making OCR (tesseract.js, the largest dependency) optional to speed up the first `npx` start.
- A `read` mode that follows pagination across several pages in one call.

## Open questions

- Whether to submit the plugin to Anthropic's plugin directory and the MCP registry.
