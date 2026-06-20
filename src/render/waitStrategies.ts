import type { Page } from "playwright";
import type { WaitUntil } from "../types.js";
import { logger } from "../utils/logger.js";

/** Map our public wait_until value to Playwright's goto load-state. */
export function toLoadState(
	waitUntil: WaitUntil,
): "load" | "domcontentloaded" | "networkidle" | "commit" {
	return waitUntil;
}

/**
 * Wait for the page to be "ready" according to the requested strategy, and
 * optionally for a specific selector to appear. Failures here are non-fatal:
 * we still try to extract whatever rendered.
 */
export async function waitForReady(
	page: Page,
	waitUntil: WaitUntil,
	timeoutMs: number,
	selector?: string,
): Promise<void> {
	// waitForLoadState has no "commit" state; fall back to domcontentloaded.
	const loadState = waitUntil === "commit" ? "domcontentloaded" : waitUntil;
	try {
		await page.waitForLoadState(loadState, { timeout: timeoutMs });
	} catch (err) {
		logger.debug({ err, waitUntil }, "waitForLoadState timed out (continuing)");
	}

	if (selector) {
		try {
			await page.waitForSelector(selector, {
				timeout: timeoutMs,
				state: "attached",
			});
		} catch (err) {
			logger.debug({ err, selector }, "waitForSelector timed out (continuing)");
		}
	}
}
