import type { Page } from "playwright";
import type { RenderAction } from "../types.js";
import { assertPublicUrl } from "../security/url.js";
import { logger } from "../utils/logger.js";

export interface ActionStats {
	scrollEvents: number;
	clickEvents: number;
}

/** Scroll the page to the bottom repeatedly to trigger infinite-scroll loads. */
async function performScroll(
	page: Page,
	count: number,
	delayMs: number,
): Promise<number> {
	let done = 0;
	for (let i = 0; i < count; i += 1) {
		await page.evaluate(() => {
			window.scrollTo(0, document.body.scrollHeight);
		});
		await page.waitForTimeout(delayMs);
		done += 1;
	}
	return done;
}

/**
 * Execute a sequence of agent-requested interactions against the page.
 * Each action is best-effort; non-optional failures throw, optional ones log.
 */
export async function runActions(
	page: Page,
	actions: RenderAction[],
	timeoutMs: number,
): Promise<ActionStats> {
	const stats: ActionStats = { scrollEvents: 0, clickEvents: 0 };

	for (const action of actions) {
		switch (action.type) {
			case "scroll": {
				stats.scrollEvents += await performScroll(
					page,
					action.count ?? 1,
					action.delay_ms ?? 800,
				);
				break;
			}
			case "click": {
				try {
					await page.click(action.selector, { timeout: timeoutMs });
					stats.clickEvents += 1;
					// Allow content triggered by the click to settle.
					await page.waitForTimeout(500);
				} catch (err) {
					if (action.optional) {
						logger.debug(
							{ selector: action.selector },
							"Optional click skipped",
						);
					} else {
						throw err;
					}
				}
				break;
			}
			case "type": {
				await page.fill(action.selector, action.text, { timeout: timeoutMs });
				if (action.submit) {
					await page.press(action.selector, "Enter");
					await page.waitForTimeout(500);
				}
				break;
			}
			case "wait": {
				if (action.selector) {
					await page.waitForSelector(action.selector, { timeout: timeoutMs });
				} else if (action.ms) {
					await page.waitForTimeout(action.ms);
				}
				break;
			}
			case "navigate": {
				await assertPublicUrl(action.url);
				await page.goto(action.url, {
					waitUntil: action.wait_until ?? "networkidle",
					timeout: timeoutMs,
				});
				break;
			}
			default: {
				const _exhaustive: never = action;
				void _exhaustive;
			}
		}
	}

	return stats;
}
