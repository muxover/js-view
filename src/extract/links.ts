import { JSDOM } from "jsdom";

/**
 * Extract absolute, de-duplicated http(s) links from a page's HTML, resolved
 * against the page URL.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
	const dom = new JSDOM(html, { url: baseUrl });
	const anchors = dom.window.document.querySelectorAll("a[href]");
	const seen = new Set<string>();

	for (const a of anchors) {
		const href = a.getAttribute("href");
		if (!href) continue;
		try {
			const resolved = new URL(href, baseUrl);
			if (resolved.protocol === "http:" || resolved.protocol === "https:") {
				resolved.hash = "";
				seen.add(resolved.toString());
			}
		} catch {
			/* skip malformed href */
		}
	}

	return [...seen];
}
