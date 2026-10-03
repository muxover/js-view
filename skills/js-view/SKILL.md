---
name: js-view
description: Read web pages that need JavaScript, using a real browser. Use when a plain fetch or WebFetch returns an empty shell, a loading spinner, "enable JavaScript", or is missing content the user can see; for SPAs (React, Vue, Angular, Next.js), infinite scroll, "load more" buttons, pages the user is signed in to, screenshots of a page, finding the API a page calls, or checking a local dev server.
---

# JS-View

Opens the page in headless Chromium, runs its JavaScript, and returns what actually rendered. Try a plain fetch first; switch to JS-View when the result is empty, a shell like `<div id="root"></div>`, or missing what the user describes.

## Tools

When the js-view MCP server is connected, use its tools:

| Tool | Use it for |
|------|------------|
| `render` | The page as markdown (or text/html). Main tool. |
| `screenshot` | Seeing the page: layout, charts, canvas, images, or checking a UI. |
| `links` | Finding the next pages to visit when navigation is built client-side. |
| `network` | The XHR/fetch calls a page makes, with JSON bodies. Often cleaner than scraping the HTML. |

All four accept `wait_for`, `scroll`, `click`, `type`, `session`, `proxy`, and `timeout_ms`.

Without the MCP server, run the CLI instead (Node 22+):

```bash
npx -y @muxover/js-view https://example.com
npx -y @muxover/js-view https://example.com/feed --scroll 3 --wait-for ".item"
npx -y @muxover/js-view https://example.com --links
npx -y @muxover/js-view https://example.com --network
npx -y @muxover/js-view https://example.com --screenshot page.png
```

`npx -y @muxover/js-view --help` lists every flag. Content goes to stdout; the title, URL, status, and notes go to stderr.

## Workflow

1. Call `render` with just the `url`.
2. Read the `Status:` line. `ok` means the content is the page. Anything else comes with a `Note:` saying what happened and what to try.
3. Content thin or missing items? Add `wait_for` with a selector for the thing you need, `scroll` for feeds, or `click` for "load more" and cookie banners.
4. Page too long? Pass `selector` to keep only the part you need, or lower `max_chars`. The default cap is 30,000 characters and the header says when content was cut.
5. Need structured data (prices, listings, search results)? Try `network` before parsing markdown: the page usually fetched it as JSON.

## Outcomes

| Status | Meaning | Next step |
|--------|---------|-----------|
| `ok` | Rendered content | Use it |
| `empty` | Almost no text rendered | `wait_for`, `scroll`, or `raw: true` |
| `blocked` | A bot check (Cloudflare, captcha) answered instead | Tell the user; a `proxy` or a signed-in `session` may get through |
| `login_required` | A sign-in page answered | Ask the user to run the login command below |
| `http_error` | The server returned 4xx/5xx | Check the URL |

Don't present a `blocked` or `login_required` page as the site's content.

## Signed-in pages

The user runs this once in a terminal; a browser window opens, they sign in, then close it:

```bash
npx -y @muxover/js-view login https://example.com --session example
```

Then pass `session: "example"` to any tool. Sessions live in `~/.js-view/sessions`.

## Limits

- The first run downloads the package; if no Chrome, Edge, or Chromium is installed, run `npx -y @muxover/js-view install` once.
- A render takes one to a few seconds. Prefer one `render` with the right options over many retries.
- Strong anti-bot sites can still block it.
