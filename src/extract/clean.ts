import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { htmlToText } from "./text.js";

export interface CleanResult {
	title: string;
	/** Cleaned article HTML (readable content only). */
	contentHtml: string;
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

const BYLINE = /byline|author|dateline|writtenby|p-author/i;

function stripChrome(doc: Document): void {
	for (const sel of STRIP_SELECTORS) {
		doc.querySelectorAll(sel).forEach((el) => el.remove());
	}
}

// Readability lifts the first short "author"-looking element out of the content
// as a byline, which drops real data on listing pages (the first quote's author,
// the first product's seller). Unmark those elements so they stay in place.
function keepBylines(doc: Document): void {
	for (const el of doc.querySelectorAll("[class], [id], [rel], [itemprop]")) {
		const marked =
			BYLINE.test(`${el.getAttribute("class") ?? ""} ${el.id}`) ||
			el.getAttribute("rel") === "author" ||
			(el.getAttribute("itemprop") ?? "").includes("author");
		if (marked && (el.textContent ?? "").trim().length < 100) {
			for (const attr of ["class", "id", "rel", "itemprop"])
				el.removeAttribute(attr);
		}
	}
}

// aggressive: strip chrome and let Readability pick the article; otherwise
// keep the whole body minus scripts and styles
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
		keepBylines(doc);
		try {
			const article = new Readability(doc.cloneNode(true) as Document).parse();
			if (article && article.content) {
				return {
					title: article.title || docTitle,
					contentHtml: article.content,
					text: htmlToText(article.content),
					excerpt: article.excerpt || undefined,
				};
			}
		} catch {
			/* fall through to body extraction */
		}
	} else {
		doc
			.querySelectorAll("script, style, noscript")
			.forEach((el) => el.remove());
	}

	const contentHtml = doc.body ? doc.body.innerHTML : html;
	return { title: docTitle, contentHtml, text: htmlToText(contentHtml) };
}
