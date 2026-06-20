import TurndownService from "turndown";

let service: TurndownService | null = null;

function getService(): TurndownService {
	if (service) return service;
	service = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
		emDelimiter: "*",
	});
	// Drop any leftover non-content nodes.
	service.remove(["script", "style", "noscript"] as any);
	return service;
}

export function htmlToMarkdown(html: string): string {
	return getService()
		.turndown(html)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
