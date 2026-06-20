import { chromium } from "playwright";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_DIR = join(SKILL_ROOT, "sessions");

const USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
	{ width: 1366, height: 768 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 },
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const LAUNCH_ARGS = [
	"--no-sandbox",
	"--disable-setuid-sandbox",
	"--disable-dev-shm-usage",
	"--disable-blink-features=AutomationControlled",
	"--disable-gpu",
];

function loadStateFor(waitUntil) {
	return waitUntil === "commit" ? "domcontentloaded" : waitUntil;
}

function sanitizeSession(id) {
	return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

async function sessionPath(id) {
	await fs.mkdir(SESSION_DIR, { recursive: true });
	return join(SESSION_DIR, `${sanitizeSession(id)}.json`);
}

async function runActions(page, actions, timeout) {
	const stats = { scrollEvents: 0, clickEvents: 0 };
	for (const action of actions) {
		if (action.type === "scroll") {
			const count = action.count ?? 1;
			const delay = action.delay_ms ?? 800;
			for (let i = 0; i < count; i += 1) {
				await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
				await page.waitForTimeout(delay);
				stats.scrollEvents += 1;
			}
		} else if (action.type === "click") {
			try {
				await page.click(action.selector, { timeout });
				stats.clickEvents += 1;
				await page.waitForTimeout(500);
			} catch (err) {
				if (!action.optional) throw err;
			}
		} else if (action.type === "type") {
			await page.fill(action.selector, action.text, { timeout });
			if (action.submit) {
				await page.press(action.selector, "Enter");
				await page.waitForTimeout(500);
			}
		} else if (action.type === "wait") {
			if (action.selector) await page.waitForSelector(action.selector, { timeout });
			else if (action.ms) await page.waitForTimeout(action.ms);
		} else if (action.type === "navigate") {
			await page.goto(action.url, {
				waitUntil: loadStateFor(action.wait_until ?? "networkidle"),
				timeout,
			});
		}
	}
	return stats;
}

function cleanHtml(html, url, aggressive) {
	const dom = new JSDOM(html, { url });
	const doc = dom.window.document;
	const title = doc.title || "";
	if (aggressive) {
		const strip = [
			"script", "style", "noscript", "iframe", "svg", "nav", "header",
			"footer", "aside", "[role='navigation']", "[role='banner']",
			"[role='contentinfo']", ".ad", ".ads", "[class*='advertisement']",
			"[id*='cookie']", "[class*='cookie-banner']",
		];
		for (const sel of strip) doc.querySelectorAll(sel).forEach((el) => el.remove());
		try {
			const article = new Readability(doc.cloneNode(true)).parse();
			if (article && article.content) {
				const body = new JSDOM(article.content, { url }).window.document.body;
				return {
					title: article.title || title,
					contentHtml: article.content,
					text: (body.textContent || "").trim(),
				};
			}
		} catch {
			/* fall through */
		}
	} else {
		doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
	}
	const body = doc.body;
	return {
		title,
		contentHtml: body ? body.innerHTML : html,
		text: (body?.textContent || "").trim(),
	};
}

function toMarkdown(html) {
	const service = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
	});
	service.remove(["script", "style", "noscript"]);
	return service.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

function extractLinks(html, baseUrl) {
	const doc = new JSDOM(html, { url: baseUrl }).window.document;
	const seen = new Set();
	for (const a of doc.querySelectorAll("a[href]")) {
		try {
			const u = new URL(a.getAttribute("href"), baseUrl);
			if (u.protocol === "http:" || u.protocol === "https:") {
				u.hash = "";
				seen.add(u.toString());
			}
		} catch {
			/* skip */
		}
	}
	return [...seen];
}

function buildContent(html, url, format, aggressive) {
	const cleaned = cleanHtml(html, url, aggressive);
	const links = extractLinks(html, url);
	let content;
	if (format === "html") content = cleaned.contentHtml;
	else if (format === "text") content = cleaned.text.replace(/[ \t]+\n/g, "\n").trim();
	else if (format === "json") {
		content = JSON.stringify(
			{ title: cleaned.title, text: cleaned.text, links },
			null,
			2,
		);
	} else content = toMarkdown(cleaned.contentHtml);
	return { title: cleaned.title, content, links };
}

async function ocr(buffer, lang) {
	try {
		const { createWorker } = await import("tesseract.js");
		const worker = await createWorker(lang || "eng");
		try {
			const { data } = await worker.recognize(buffer);
			return data.text.trim() || undefined;
		} finally {
			await worker.terminate();
		}
	} catch {
		return undefined;
	}
}

export async function renderPage(opts) {
	const started = Date.now();
	const timeout = Math.min(Math.max(opts.timeout_ms ?? 15000, 1000), 120000);
	const waitUntil = opts.wait_until ?? "networkidle";
	const format = opts.output_format ?? "markdown";
	const aggressive = opts.clean ?? true;
	const userAgent = pick(USER_AGENTS);
	const viewport = pick(VIEWPORTS);

	const browser = await chromium.launch({
		headless: !opts.headful,
		args: LAUNCH_ARGS,
	});

	try {
		let storageState;
		if (opts.session_id) {
			const path = await sessionPath(opts.session_id);
			try {
				await fs.access(path);
				storageState = path;
			} catch {
				/* no saved session yet */
			}
		}

		const context = await browser.newContext({
			userAgent,
			viewport,
			storageState,
			ignoreHTTPSErrors: true,
			locale: "en-US",
			proxy: opts.proxy,
		});
		const page = await context.newPage();
		page.setDefaultTimeout(timeout);

		const captured = [];
		if (opts.capture_network) {
			page.on("response", async (response) => {
				if (captured.length >= 200) return;
				const req = response.request();
				const type = req.resourceType();
				if (type !== "xhr" && type !== "fetch") return;
				const ct = response.headers()["content-type"];
				const entry = {
					url: response.url(),
					method: req.method(),
					status: response.status(),
					resource_type: type,
					content_type: ct,
				};
				if (ct && /json|text|javascript/.test(ct)) {
					try {
						const body = await response.text();
						entry.body_preview =
							body.length > 4000 ? `${body.slice(0, 4000)}…` : body;
					} catch {
						/* ignore */
					}
				}
				captured.push(entry);
			});
		}

		let statusCode;
		try {
			const res = await page.goto(opts.url, {
				waitUntil: loadStateFor(waitUntil),
				timeout,
			});
			statusCode = res?.status();
		} catch {
			/* extract whatever rendered */
		}

		try {
			await page.waitForLoadState(loadStateFor(waitUntil), { timeout });
		} catch {
			/* non-fatal */
		}
		if (opts.wait_for_selector) {
			try {
				await page.waitForSelector(opts.wait_for_selector, { timeout });
			} catch {
				/* non-fatal */
			}
		}

		const actionStats = opts.actions?.length
			? await runActions(page, opts.actions, timeout)
			: { scrollEvents: 0, clickEvents: 0 };

		const html = await page.content();
		const finalUrl = page.url();
		const extracted = buildContent(html, finalUrl, format, aggressive);

		let screenshot;
		let ocrText;
		if (opts.screenshot) {
			const buffer = await page.screenshot({ fullPage: true, type: "png" });
			screenshot = buffer.toString("base64");
			ocrText = await ocr(buffer, opts.ocr_lang);
		}

		let usedSession = false;
		if (opts.session_id) {
			try {
				const state = await context.storageState();
				const path = await sessionPath(opts.session_id);
				await fs.writeFile(path, JSON.stringify(state), "utf8");
				usedSession = true;
			} catch {
				/* ignore */
			}
		}

		const result = {
			title: extracted.title,
			content: extracted.content,
			links: extracted.links,
			metadata: {
				render_time_ms: Date.now() - started,
				js_execution: true,
				scroll_events: actionStats.scrollEvents,
				click_events: actionStats.clickEvents,
				status_code: statusCode,
				final_url: finalUrl,
				user_agent: userAgent,
				viewport,
				used_session: usedSession,
				used_proxy: Boolean(opts.proxy),
			},
		};
		if (screenshot) result.screenshot = screenshot;
		if (ocrText) result.ocr_text = ocrText;
		if (opts.capture_network) result.network = captured;
		return result;
	} finally {
		await browser.close();
	}
}
