import { JSDOM } from "jsdom";

export interface PageMeta {
	title: string;
	description?: string;
	author?: string;
	canonical?: string;
	og: Record<string, string>;
}

/** Pull common <meta>/OpenGraph/title info from page HTML. */
export function extractMetadata(html: string, baseUrl: string): PageMeta {
	const dom = new JSDOM(html, { url: baseUrl });
	const doc = dom.window.document;

	const attr = (selector: string, attribute: string): string | undefined =>
		doc.querySelector(selector)?.getAttribute(attribute) ?? undefined;

	const og: Record<string, string> = {};
	doc.querySelectorAll("meta[property^='og:']").forEach((el) => {
		const prop = el.getAttribute("property");
		const content = el.getAttribute("content");
		if (prop && content) og[prop.replace(/^og:/, "")] = content;
	});

	return {
		title: doc.title || og.title || "",
		description: attr("meta[name='description']", "content") ?? og.description,
		author: attr("meta[name='author']", "content"),
		canonical: attr("link[rel='canonical']", "href"),
		og,
	};
}
