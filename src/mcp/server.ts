import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { render } from "../render/renderer.js";
import { closePool } from "../browser/pool.js";
import { closeOcrWorker } from "../render/screenshot.js";
import { extractLinkList } from "../extract/links.js";
import { parseProxyUrl } from "../browser/stealth.js";
import { header } from "../local/format.js";
import type { RenderAction, RenderRequest } from "../types.js";
import { logger } from "../utils/logger.js";
import { VERSION } from "../version.js";

// The browser stays warm between calls; after this long idle it is closed and
// relaunched on the next call.
const IDLE_CLOSE_MS = 5 * 60_000;
const DEFAULT_MAX_CHARS = 30_000;

const page = {
	url: z.string().describe("Page to open (http, https, or data URL)."),
	wait_for: z
		.string()
		.optional()
		.describe("CSS selector to wait for before reading, e.g. '.results li'."),
	wait_until: z
		.enum(["load", "domcontentloaded", "networkidle", "commit"])
		.optional()
		.describe("Navigation event to wait for. Default networkidle."),
	scroll: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe(
			"Scroll to the bottom this many times to load infinite-scroll content.",
		),
	click: z
		.array(z.string())
		.optional()
		.describe(
			"CSS selectors to click in order, e.g. a 'load more' or cookie button. Missing ones are skipped.",
		),
	type: z
		.array(
			z.object({
				selector: z.string(),
				text: z.string(),
				submit: z.boolean().optional(),
			}),
		)
		.optional()
		.describe("Inputs to fill before reading; submit presses Enter."),
	session: z
		.string()
		.optional()
		.describe(
			"Reuse cookies and storage saved under this name (see `npx @muxover/js-view login`).",
		),
	proxy: z
		.string()
		.optional()
		.describe("Proxy URL, e.g. http://user:pass@host:port."),
	timeout_ms: z.number().int().min(1000).max(120_000).optional(),
};

type PageArgs = {
	url: string;
	wait_for?: string;
	wait_until?: RenderRequest["wait_until"];
	scroll?: number;
	click?: string[];
	type?: { selector: string; text: string; submit?: boolean }[];
	session?: string;
	proxy?: string;
	timeout_ms?: number;
};

function toRequest(args: PageArgs): RenderRequest {
	const actions: RenderAction[] = [];
	for (const t of args.type ?? []) actions.push({ type: "type", ...t });
	for (const selector of args.click ?? []) {
		actions.push({ type: "click", selector, optional: true });
	}
	if (args.scroll) actions.push({ type: "scroll", count: args.scroll });
	return {
		url: args.url,
		wait_for_selector: args.wait_for,
		wait_until: args.wait_until,
		actions,
		session_id: args.session,
		proxy: args.proxy ? parseProxyUrl(args.proxy) : undefined,
		timeout_ms: args.timeout_ms,
	};
}

export function createMcpServer(onActivity: () => void = () => {}): McpServer {
	const server = new McpServer({ name: "js-view", version: VERSION });

	const run = async (fn: () => Promise<CallToolResult>) => {
		onActivity();
		try {
			return await fn();
		} catch (err) {
			logger.debug({ err }, "tool call failed");
			const message = err instanceof Error ? err.message : String(err);
			return {
				isError: true,
				content: [{ type: "text" as const, text: message }],
			};
		} finally {
			onActivity();
		}
	};

	server.registerTool(
		"render",
		{
			title: "Render page",
			description:
				"Open a URL in a real headless browser, run its JavaScript, and return the rendered content as markdown. Use it when a plain fetch returns an empty shell, a SPA, or content that loads after the page does. Can scroll, click, and fill inputs first. Reports when a site answers with a bot check, a login wall, or an error page instead of content.",
			inputSchema: {
				...page,
				format: z
					.enum(["markdown", "text", "html"])
					.optional()
					.describe("Output format. Default markdown."),
				selector: z
					.string()
					.optional()
					.describe("Only return the elements matching this CSS selector."),
				raw: z
					.boolean()
					.optional()
					.describe(
						"Return the whole page, navigation and footer included, instead of just the main content.",
					),
				max_chars: z
					.number()
					.int()
					.min(100)
					.optional()
					.describe(
						`Cut the content at this length. Default ${DEFAULT_MAX_CHARS}.`,
					),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(args) =>
			run(async () => {
				const res = await render({
					...toRequest(args),
					output_format: args.format,
					selector: args.selector,
					clean: !args.raw,
					max_chars: args.max_chars ?? DEFAULT_MAX_CHARS,
				});
				return {
					content: [{ type: "text", text: `${header(res)}\n\n${res.content}` }],
				};
			}),
	);

	server.registerTool(
		"screenshot",
		{
			title: "Screenshot page",
			description:
				"Render a URL and return a screenshot you can look at: layout, charts, images, canvas, or anything text extraction misses. Captures the viewport unless full_page is set, or one element with selector.",
			inputSchema: {
				...page,
				full_page: z
					.boolean()
					.optional()
					.describe("Capture the whole scrollable page."),
				selector: z
					.string()
					.optional()
					.describe(
						"Capture only the first element matching this CSS selector.",
					),
				ocr: z
					.boolean()
					.optional()
					.describe("Also return the text OCR reads from the image."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(args) =>
			run(async () => {
				const res = await render({
					...toRequest(args),
					screenshot: true,
					screenshot_format: "jpeg",
					full_page: args.full_page ?? false,
					ocr: args.ocr ?? false,
					max_chars: 500,
				});
				const summary = res.ocr_text
					? `${header(res)}\n\nOCR text:\n${res.ocr_text}`
					: header(res);
				return {
					content: [
						{
							type: "image",
							data: res.screenshot ?? "",
							mimeType: "image/jpeg",
						},
						{ type: "text", text: summary },
					],
				};
			}),
	);

	server.registerTool(
		"links",
		{
			title: "List links",
			description:
				"Render a URL and list the links on the page with their anchor text, after JavaScript has run. Use it to find the next pages to visit on a site whose navigation is built client-side.",
			inputSchema: {
				...page,
				selector: z
					.string()
					.optional()
					.describe(
						"Only list links inside elements matching this CSS selector.",
					),
				match: z
					.string()
					.optional()
					.describe(
						"Only keep links whose URL or text contains this string (case-insensitive).",
					),
				same_site: z
					.boolean()
					.optional()
					.describe("Only keep links on the page's own host."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(args) =>
			run(async () => {
				const res = await render({
					...toRequest(args),
					output_format: "html",
					selector: args.selector,
					clean: false,
				});
				const host = new URL(res.metadata.final_url).host;
				const needle = args.match?.toLowerCase();
				const links = extractLinkList(
					res.content,
					res.metadata.final_url,
				).filter(
					(l) =>
						(!args.same_site || new URL(l.url).host === host) &&
						(!needle ||
							l.url.toLowerCase().includes(needle) ||
							l.text.toLowerCase().includes(needle)),
				);
				const list = links.map((l) =>
					l.text ? `- [${l.text}](${l.url})` : `- ${l.url}`,
				);
				const head = header({ ...res, total_chars: undefined });
				return {
					content: [
						{
							type: "text",
							text: `${head}\nLinks: ${links.length}\n\n${list.join("\n")}`,
						},
					],
				};
			}),
	);

	server.registerTool(
		"network",
		{
			title: "Capture API calls",
			description:
				"Render a URL and list the XHR/fetch requests the page made, with status, content type, and a preview of each JSON or text body. Often the fastest way to get a site's data in structured form: find the API call, then read it directly.",
			inputSchema: {
				...page,
				match: z
					.string()
					.optional()
					.describe("Only keep requests whose URL contains this string."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		(args) =>
			run(async () => {
				const res = await render({
					...toRequest(args),
					capture_network: true,
					max_chars: 500,
				});
				const calls = (res.network ?? []).filter(
					(c) => !args.match || c.url.includes(args.match),
				);
				const body = calls
					.map((c) =>
						[
							`${c.method} ${c.url}`,
							`status ${c.status} | ${c.content_type ?? "unknown type"}`,
							c.body_preview ? c.body_preview : "",
						]
							.filter(Boolean)
							.join("\n"),
					)
					.join("\n\n");
				return {
					content: [
						{
							type: "text",
							text: `${header(res)}\nRequests: ${calls.length}\n\n${body}`,
						},
					],
				};
			}),
	);

	return server;
}

export async function runMcpServer(): Promise<void> {
	let timer: NodeJS.Timeout | undefined;
	const onActivity = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			void closePool();
			void closeOcrWorker();
		}, IDLE_CLOSE_MS);
		timer.unref();
	};

	const server = createMcpServer(onActivity);
	await server.connect(new StdioServerTransport());

	const shutdown = async () => {
		clearTimeout(timer);
		await server.close().catch(() => {});
		await closePool();
		await closeOcrWorker();
		process.exit(0);
	};
	process.stdin.on("close", () => void shutdown());
	process.on("SIGINT", () => void shutdown());
	process.on("SIGTERM", () => void shutdown());
}
