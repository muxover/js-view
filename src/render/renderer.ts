import type { RenderRequest, RenderResponse } from "../types.js";
import { config } from "../config.js";
import { getPool } from "../browser/pool.js";
import { saveSessionState } from "../browser/session.js";
import { waitForReady } from "./waitStrategies.js";
import { runActions } from "./actions.js";
import { captureNetwork } from "./network.js";
import { captureScreenshot } from "./screenshot.js";
import { trackTabs, collectTabUrls } from "./tabs.js";
import { assertPublicUrl, installUrlGuard } from "../security/url.js";
import { extractContent } from "../extract/index.js";
import { HttpError, withTimeout } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

function clampTimeout(requested?: number): number {
	const t = requested ?? config.defaults.timeoutMs;
	return Math.min(Math.max(t, 1000), config.defaults.maxTimeoutMs);
}

export async function render(req: RenderRequest): Promise<RenderResponse> {
	const started = Date.now();
	await assertPublicUrl(req.url);
	const timeoutMs = clampTimeout(req.timeout_ms);
	const waitUntil = req.wait_until ?? config.defaults.waitUntil;
	const outputFormat = req.output_format ?? config.defaults.outputFormat;
	const aggressiveClean = req.clean ?? true;

	const pool = getPool();
	const lease = await pool.acquireContext({
		sessionId: req.session_id,
		proxy: req.proxy,
	});

	try {
		return await withTimeout(
			runRender(req, lease, {
				timeoutMs,
				waitUntil,
				outputFormat,
				aggressiveClean,
				started,
			}),
			timeoutMs + 5000,
			"Render exceeded total time budget",
		);
	} finally {
		await lease.release();
	}
}

interface RenderOpts {
	timeoutMs: number;
	waitUntil: RenderRequest["wait_until"];
	outputFormat: NonNullable<RenderRequest["output_format"]>;
	aggressiveClean: boolean;
	started: number;
}

async function runRender(
	req: RenderRequest,
	lease: Awaited<ReturnType<ReturnType<typeof getPool>["acquireContext"]>>,
	opts: RenderOpts,
): Promise<RenderResponse> {
	const { context } = lease;
	await installUrlGuard(context);
	const page = await context.newPage();
	page.setDefaultTimeout(opts.timeoutMs);

	const getNetwork = req.capture_network ? captureNetwork(page) : undefined;
	const tabTracker = trackTabs(context, page);

	let statusCode: number | undefined;
	try {
		const response = await page.goto(req.url, {
			waitUntil: req.wait_until ?? "networkidle",
			timeout: opts.timeoutMs,
		});
		statusCode = response?.status();
	} catch (err) {
		logger.debug(
			{ err, url: req.url },
			"Navigation issue (continuing to extract)",
		);
	}

	await waitForReady(
		page,
		req.wait_until ?? "networkidle",
		opts.timeoutMs,
		req.wait_for_selector,
	);

	const actionStats = req.actions?.length
		? await runActions(page, req.actions, opts.timeoutMs)
		: { scrollEvents: 0, clickEvents: 0 };

	// Snapshot the fully-rendered DOM.
	const html = await page.content();
	const finalUrl = page.url();

	const extracted = extractContent(
		html,
		finalUrl,
		opts.outputFormat,
		opts.aggressiveClean,
	);

	// Fold in any extra tabs the page opened.
	const extraPages = tabTracker.stop();
	if (extraPages.length) {
		const extraUrls = await collectTabUrls(extraPages);
		const merged = new Set([...extracted.links, ...extraUrls]);
		extracted.links = [...merged];
		await Promise.all(extraPages.map((p) => p.close().catch(() => {})));
	}

	let screenshot: string | undefined;
	let ocrText: string | undefined;
	if (req.screenshot) {
		const shot = await captureScreenshot(page);
		screenshot = shot.screenshot;
		ocrText = shot.ocrText;
	}

	const network = getNetwork ? getNetwork() : undefined;

	// Persist session state for reuse if requested.
	let usedSession = false;
	if (req.session_id) {
		try {
			const state = await context.storageState();
			await saveSessionState(req.session_id, state);
			usedSession = true;
		} catch (err) {
			logger.warn({ err }, "Failed to persist session state");
		}
	}

	if (statusCode && statusCode >= 400 && !extracted.content) {
		throw new HttpError(502, `Upstream returned ${statusCode} with no content`);
	}

	const response: RenderResponse = {
		title: extracted.title,
		content: extracted.content,
		links: extracted.links,
		metadata: {
			render_time_ms: Date.now() - opts.started,
			js_execution: true,
			scroll_events: actionStats.scrollEvents,
			click_events: actionStats.clickEvents,
			status_code: statusCode,
			final_url: finalUrl,
			user_agent: lease.userAgent,
			viewport: lease.viewport,
			used_session: usedSession,
			used_proxy: lease.usedProxy,
		},
	};

	if (screenshot) response.screenshot = screenshot;
	if (ocrText) response.ocr_text = ocrText;
	if (network) response.network = network;

	return response;
}
