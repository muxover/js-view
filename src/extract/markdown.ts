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
	service.remove(["script", "style", "noscript"] as any);
	// icon-only links (vote arrows, share buttons) would come out as "[](url)"
	service.addRule("emptyLink", {
		filter: (node) =>
			node.nodeName === "A" &&
			!(node.textContent ?? "").trim() &&
			!node.querySelector("img"),
		replacement: () => "",
	});
	return service;
}

export function htmlToMarkdown(html: string): string {
	return getService()
		.turndown(html)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
