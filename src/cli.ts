#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage: js-view <url> [options]
       js-view <command>

Render a page in a real browser and print what rendered.

Commands:
  mcp                    Run the MCP server over stdio
  login <url>            Open a browser to sign in; saves the session (--session)
  install                Download Playwright's Chromium (--with-deps on Linux)
  serve                  Run the HTTP service (see README for its env vars)
  worker                 Run a queue worker (needs REDIS_URL)

Options:
  -f, --format <fmt>     markdown (default), text, html, or json
  -w, --wait-for <css>   Wait for a selector before reading
      --wait-until <e>   load, domcontentloaded, networkidle (default), commit
      --scroll <n>       Scroll to the bottom n times
      --click <css>      Click an element first (repeatable)
      --type <css=text>  Fill an input and press Enter (repeatable)
  -s, --select <css>     Only return elements matching a selector
      --max-chars <n>    Cut the content at n characters
      --raw              Keep nav, header, and footer (skip main-content extraction)
      --session <name>   Reuse a saved session
      --proxy <url>      Route through a proxy
      --timeout <ms>     Render timeout (default 15000)
      --links            Print the page's links instead of its content
      --network          Print the XHR/fetch calls instead of its content
      --screenshot <f>   Also save a full-page PNG to a file
      --json             Print the full result as JSON
      --headful          Show the browser window
  -v, --version          Print the version
  -h, --help             Show this help

Exit codes: 0 rendered, 1 failed, 2 bad usage, 3 rendered but blocked,
behind a login, an HTTP error, or empty.`;

type Values = Record<string, string | boolean | string[] | undefined>;

// Config reads the environment when first imported, so local defaults must be
// in place before any other module loads.
function localDefaults(command: string): void {
	const set = (k: string, v: string) => {
		if (process.env[k] === undefined) process.env[k] = v;
	};
	set("SESSION_DIR", join(homedir(), ".js-view", "sessions"));
	// root in a container can't sandbox; everywhere else keep Chrome's sandbox
	set("BROWSER_NO_SANDBOX", process.getuid?.() === 0 ? "true" : "false");
	if (command !== "serve" && command !== "worker") {
		// a local agent reading its own dev server is the point
		set("BLOCK_PRIVATE_HOSTS", "false");
		set("LOG_LEVEL", "warn");
	}
}

function fail(message: string, code = 1): never {
	process.stderr.write(`js-view: ${message}\n`);
	process.exit(code);
}

function installChromium(extra: string[]): number {
	// playwright doesn't export its cli, so find it next to its package.json
	const require = createRequire(import.meta.url);
	const cli = join(
		dirname(require.resolve("playwright/package.json")),
		"cli.js",
	);
	// Playwright warns about "npx playwright install" whenever its script path is
	// inside the npx cache, which ours always is; start it under a neutral name.
	const boot = `process.argv.splice(1, 0, "playwright"); require(${JSON.stringify(cli)});`;
	const res = spawnSync(
		process.execPath,
		["-e", boot, "install", "chromium", ...extra],
		{
			stdio: "inherit",
		},
	);
	return res.status ?? 1;
}

// "example.com" and "localhost:3000" are what people type; give them a scheme.
function withScheme(raw: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^localhost:\d/i.test(raw))
		return raw;
	const local = /^(localhost|127\.|\[::1\])/i.test(raw);
	return `${local ? "http" : "https"}://${raw}`;
}

async function renderCommand(url: string, v: Values): Promise<number> {
	const { render } = await import("./render/renderer.js");
	const { closePool } = await import("./browser/pool.js");
	const { closeOcrWorker } = await import("./render/screenshot.js");
	const { header } = await import("./local/format.js");
	const { extractLinkList } = await import("./extract/links.js");
	const { parseProxyUrl } = await import("./browser/stealth.js");
	type Req = import("./types.js").RenderRequest;
	type Action = import("./types.js").RenderAction;

	const actions: Action[] = [];
	for (const t of (v.type as string[] | undefined) ?? []) {
		const eq = t.indexOf("=");
		if (eq < 1) fail(`--type expects selector=text, got "${t}"`, 2);
		actions.push({
			type: "type",
			selector: t.slice(0, eq),
			text: t.slice(eq + 1),
			submit: true,
		});
	}
	for (const selector of (v.click as string[] | undefined) ?? []) {
		actions.push({ type: "click", selector, optional: true });
	}
	if (v.scroll)
		actions.push({ type: "scroll", count: toInt(v.scroll, "--scroll") });

	const format = (v.format as string | undefined) ?? "markdown";
	if (!["markdown", "text", "html", "json"].includes(format)) {
		fail(`unknown format "${format}"`, 2);
	}
	const req: Req = {
		url: withScheme(url),
		output_format: v.links ? "html" : (format as Req["output_format"]),
		wait_for_selector: v["wait-for"] as string | undefined,
		wait_until: v["wait-until"] as Req["wait_until"],
		actions,
		selector: v.select as string | undefined,
		max_chars: v["max-chars"]
			? toInt(v["max-chars"], "--max-chars")
			: undefined,
		clean: v.links ? false : !v.raw,
		session_id: v.session as string | undefined,
		proxy: v.proxy ? parseProxyUrl(v.proxy as string) : undefined,
		timeout_ms: v.timeout ? toInt(v.timeout, "--timeout") : undefined,
		capture_network: Boolean(v.network),
		screenshot: Boolean(v.screenshot),
		ocr: false,
	};

	try {
		const res = await render(req);
		if (v.screenshot && res.screenshot) {
			writeFileSync(
				v.screenshot as string,
				Buffer.from(res.screenshot, "base64"),
			);
			delete res.screenshot;
		}

		let out: string;
		if (v.json) {
			out = JSON.stringify(res, null, 2);
		} else if (v.links) {
			out = extractLinkList(res.content, res.metadata.final_url)
				.map((l) => (l.text ? `${l.url}\t${l.text}` : l.url))
				.join("\n");
		} else if (v.network) {
			out = (res.network ?? [])
				.map((c) => `${c.method} ${c.status} ${c.url}`)
				.join("\n");
		} else {
			out = res.content;
		}
		process.stdout.write(`${out}\n`);
		if (!v.json) process.stderr.write(`${header(res)}\n`);
		return res.outcome === "ok" ? 0 : 3;
	} finally {
		await closePool();
		await closeOcrWorker();
	}
}

function toInt(raw: unknown, flag: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) fail(`${flag} expects a whole number`, 2);
	return n;
}

async function main(): Promise<void> {
	// install hands its flags (--with-deps, --dry-run, ...) straight to Playwright
	if (process.argv[2] === "install") {
		process.exit(installChromium(process.argv.slice(3)));
	}

	let parsed;
	try {
		parsed = parseArgs({
			allowPositionals: true,
			options: {
				format: { type: "string", short: "f" },
				"wait-for": { type: "string", short: "w" },
				"wait-until": { type: "string" },
				scroll: { type: "string" },
				click: { type: "string", multiple: true },
				type: { type: "string", multiple: true },
				select: { type: "string", short: "s" },
				"max-chars": { type: "string" },
				raw: { type: "boolean" },
				session: { type: "string" },
				proxy: { type: "string" },
				timeout: { type: "string" },
				links: { type: "boolean" },
				network: { type: "boolean" },
				screenshot: { type: "string" },
				json: { type: "boolean" },
				headful: { type: "boolean" },
				port: { type: "string" },
				version: { type: "boolean", short: "v" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (err) {
		fail(`${(err as Error).message}\n\n${USAGE}`, 2);
	}
	const { values: v, positionals } = parsed;
	const [first, second] = positionals;

	if (v.help) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}
	if (v.version) {
		const { VERSION } = await import("./version.js");
		process.stdout.write(`${VERSION}\n`);
		return;
	}
	if (!first) fail(USAGE, 2);

	const command =
		/^[a-z]+$/.test(first) && !first.includes(".") ? first : "render";
	localDefaults(command);
	if (v.headful) process.env.HEADFUL = "true";
	if (v.port) process.env.PORT = v.port;

	switch (command) {
		case "mcp": {
			const { runMcpServer } = await import("./mcp/server.js");
			await runMcpServer();
			break;
		}
		case "login": {
			if (!second)
				fail("login needs a URL: js-view login <url> --session <name>", 2);
			if (!v.session) fail("login needs --session <name> to save under", 2);
			const { login } = await import("./local/login.js");
			process.stderr.write("Sign in in the browser window, then close it.\n");
			await login(second, v.session);
			process.stderr.write(`Saved session "${v.session}".\n`);
			break;
		}
		case "serve":
		case "worker": {
			if (command === "worker") {
				if (!process.env.REDIS_URL)
					fail("worker needs REDIS_URL pointing at Redis", 2);
				process.env.JSVIEW_ROLE = "worker";
			}
			const { startService } = await import("./service.js");
			await startService();
			break;
		}
		case "render":
			process.exit(await renderCommand(first, v));
			break;
		default:
			fail(`unknown command "${first}"\n\n${USAGE}`, 2);
	}
}

main().catch((err: unknown) => {
	fail(err instanceof Error ? err.message : String(err));
});
