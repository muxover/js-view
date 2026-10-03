import { JSDOM } from "jsdom";

const BLOCK_TAGS = new Set([
	"address",
	"article",
	"aside",
	"blockquote",
	"dd",
	"details",
	"div",
	"dl",
	"dt",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hr",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"pre",
	"section",
	"summary",
	"table",
	"tr",
	"ul",
]);
const SKIP_TAGS = new Set(["script", "style", "noscript", "template"]);

/** Collapse runs of spaces and blank lines. */
export function normalizeText(text: string): string {
	return text
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// textContent glues block elements together ("onetwothree"); walk the tree and
// break lines where a browser would.
export function htmlToText(html: string): string {
	const { document } = new JSDOM(`<body>${html}</body>`).window;
	const out: string[] = [];

	const walk = (node: Node): void => {
		if (node.nodeType === 3) {
			out.push((node.textContent ?? "").replace(/\s+/g, " "));
			return;
		}
		if (node.nodeType !== 1) return;
		const tag = (node as Element).tagName.toLowerCase();
		if (SKIP_TAGS.has(tag)) return;
		if (tag === "br") {
			out.push("\n");
			return;
		}
		if (tag === "pre") {
			out.push(`\n${node.textContent ?? ""}\n`);
			return;
		}
		const block = BLOCK_TAGS.has(tag);
		if (block) out.push("\n");
		node.childNodes.forEach(walk);
		if (block) out.push("\n");
		else if (tag === "td" || tag === "th") out.push(" ");
	};

	walk(document.body);
	return normalizeText(out.join(""));
}
