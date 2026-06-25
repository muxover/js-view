import type { Page, Response } from "playwright";
import type { CapturedRequest } from "../types.js";
import { logger } from "../utils/logger.js";

const MAX_CAPTURED = 200;
const MAX_BODY_PREVIEW = 4000;
const CAPTURED_TYPES = new Set(["xhr", "fetch"]);

/**
 * Attaches a response listener that records XHR/fetch traffic (lazy-loaded
 * data, API calls) seen while the page renders. Returns a getter for results.
 */
export function captureNetwork(page: Page): () => CapturedRequest[] {
	const captured: CapturedRequest[] = [];

	const onResponse = async (response: Response) => {
		if (captured.length >= MAX_CAPTURED) return;
		const request = response.request();
		const resourceType = request.resourceType();
		if (!CAPTURED_TYPES.has(resourceType)) return;

		const headers = response.headers();
		const contentType = headers["content-type"];
		const entry: CapturedRequest = {
			url: response.url(),
			method: request.method(),
			status: response.status(),
			resource_type: resourceType,
			content_type: contentType,
		};

		// Capture small JSON/text bodies for the agent to inspect. Skip ones that
		// advertise a large size so we don't buffer a whole asset for a 4KB preview.
		const declaredLength = Number(headers["content-length"]);
		const tooBig =
			Number.isFinite(declaredLength) && declaredLength > 1_000_000;
		if (contentType && !tooBig && /json|text|javascript/.test(contentType)) {
			try {
				const body = await response.text();
				entry.body_preview =
					body.length > MAX_BODY_PREVIEW
						? `${body.slice(0, MAX_BODY_PREVIEW)}…`
						: body;
			} catch (err) {
				logger.debug({ err, url: entry.url }, "Failed to read response body");
			}
		}

		captured.push(entry);
	};

	page.on("response", onResponse);

	return () => {
		page.off("response", onResponse);
		return captured;
	};
}
