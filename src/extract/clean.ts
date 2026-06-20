import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface CleanResult {
	title: string;
	/** Cleaned article HTML (readable content only). */
	contentHtml: string;
	/** Plain text of the cleaned content. */
	text: string;
	excerpt?: string;
}

const STRIP_SELECTORS = [
	"script",
	"style",
	"noscript",
	"iframe",
	"svg",
	"nav",
	"header",
	"footer",
	"aside",
	"[role='navigation']",
	"[role='banner']",
	"[role='contentinfo']",
	".ad",
	".ads",
	".advert",
	"[class*='advertisement']",
	"[id*='cookie']",
	"[class*='cookie-banner']",
];

/** Remove obvious chrome/ads/scripts from a document in place. */
function stripChrome(doc: Document): void {
	for (const sel of STRIP_SELECTORS) {
		doc.querySelectorAll(sel).forEach((el) => el.remove());
	}
}

/**
 * Produce readable content from raw HTML. When `aggressive` is true, ad/nav
 * chrome is stripped and Readability extracts the main article; otherwise the
 * full body (minus scripts/styles) is returned.
 */
export function cleanHtml(
	html: string,
	url: string,
	aggressive: boolean,
): CleanResult {
	const dom = new JSDOM(html, { url });
	const doc = dom.window.document;
	const docTitle = doc.title || "";

	if (aggressive) {
		// Clone before Readability mutates the DOM, then strip chrome.
		stripChrome(doc);
		try {
			const article = new Readability(doc.cloneNode(true) as Document).parse();
			if (article && article.content) {
				const contentDom = new JSDOM(article.content, { url });
				return {
					title: article.title || docTitle,
					contentHtml: article.content,
					text: (contentDom.window.document.body.textContent || "").trim(),
					excerpt: article.excerpt || undefined,
				};
			}
		} catch {
			/* fall through to body extraction */
		}
	} else {
		// Light cleaning only.
		doc
			.querySelectorAll("script, style, noscript")
			.forEach((el) => el.remove());
	}

	const body = doc.body;
	return {
		title: docTitle,
		contentHtml: body ? body.innerHTML : html,
		text: (body?.textContent || "").replace(/\s+\n/g, "\n").trim(),
	};
}
