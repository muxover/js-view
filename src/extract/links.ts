import { JSDOM } from "jsdom";

export interface PageLink {
	url: string;
	text: string;
}

/**
 * Absolute, de-duplicated http(s) links in document order, resolved against
 * the page URL, with the longest anchor text any occurrence has.
 */
export function extractLinkList(html: string, baseUrl: string): PageLink[] {
	const dom = new JSDOM(html, { url: baseUrl });
	const anchors = dom.window.document.querySelectorAll("a[href]");
	const seen = new Map<string, string>();

	for (const a of anchors) {
		const href = a.getAttribute("href");
		if (!href) continue;
		try {
			const resolved = new URL(href, baseUrl);
			if (resolved.protocol === "http:" || resolved.protocol === "https:") {
				resolved.hash = "";
				const url = resolved.toString();
				const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
				if (!seen.has(url) || text.length > (seen.get(url) ?? "").length) {
					seen.set(url, text);
				}
			}
		} catch {
			/* skip malformed href */
		}
	}

	return [...seen].map(([url, text]) => ({ url, text }));
}

export function extractLinks(html: string, baseUrl: string): string[] {
	return extractLinkList(html, baseUrl).map((l) => l.url);
}
