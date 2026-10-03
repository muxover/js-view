import type { OutputFormat } from "../types.js";
import { cleanHtml } from "./clean.js";
import { htmlToMarkdown } from "./markdown.js";
import { extractLinks } from "./links.js";
import { extractMetadata } from "./metadata.js";

export interface ExtractionResult {
	title: string;
	content: string;
	/** Plain text of the extracted content, whatever the output format. */
	text: string;
	links: string[];
}

export function extractContent(
	html: string,
	url: string,
	format: OutputFormat,
	aggressiveClean: boolean,
): ExtractionResult {
	const meta = extractMetadata(html, url);
	const links = extractLinks(html, url);
	const cleaned = cleanHtml(html, url, aggressiveClean);
	const title = cleaned.title || meta.title || "";

	let content: string;
	switch (format) {
		case "html":
			content = cleaned.contentHtml;
			break;
		case "text":
			content = cleaned.text;
			break;
		case "json":
			content = JSON.stringify(
				{
					title,
					text: cleaned.text,
					excerpt: cleaned.excerpt,
					metadata: meta,
					links,
				},
				null,
				2,
			);
			break;
		case "markdown":
		default:
			content = htmlToMarkdown(cleaned.contentHtml);
			break;
	}

	return { title, content, text: cleaned.text, links };
}
