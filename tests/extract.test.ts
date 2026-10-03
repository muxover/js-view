import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/extract/markdown.js";
import { extractLinks } from "../src/extract/links.js";
import { extractMetadata } from "../src/extract/metadata.js";
import { extractContent } from "../src/extract/index.js";
import { normalizeText } from "../src/extract/text.js";

const SAMPLE = `<!doctype html>
<html>
  <head>
    <title>Sample Page</title>
    <meta name="description" content="A test page" />
    <meta property="og:title" content="OG Sample" />
    <link rel="canonical" href="https://example.com/canonical" />
  </head>
  <body>
    <nav><a href="/nav">nav link</a></nav>
    <article>
      <h1>Heading</h1>
      <p>Hello <strong>world</strong>.</p>
      <a href="/page1">Page 1</a>
      <a href="https://other.com/x#frag">External</a>
      <a href="/page1">Duplicate</a>
    </article>
    <script>console.log("noise")</script>
    <style>.x{color:red}</style>
  </body>
</html>`;

describe("htmlToMarkdown", () => {
	it("converts headings and emphasis", () => {
		const md = htmlToMarkdown(
			"<h1>Title</h1><p>Hello <strong>bold</strong></p>",
		);
		expect(md).toContain("# Title");
		expect(md).toContain("**bold**");
	});

	it("drops script and style content", () => {
		const md = htmlToMarkdown("<p>keep</p><script>drop()</script>");
		expect(md).toContain("keep");
		expect(md).not.toContain("drop()");
	});
});

describe("extractLinks", () => {
	it("returns absolute, de-duplicated http links without fragments", () => {
		const links = extractLinks(SAMPLE, "https://example.com/start");
		expect(links).toContain("https://example.com/page1");
		expect(links).toContain("https://other.com/x");
		expect(links.filter((l) => l === "https://example.com/page1")).toHaveLength(
			1,
		);
	});
});

describe("extractMetadata", () => {
	it("reads title, description, og and canonical", () => {
		const meta = extractMetadata(SAMPLE, "https://example.com");
		expect(meta.title).toBe("Sample Page");
		expect(meta.description).toBe("A test page");
		expect(meta.og.title).toBe("OG Sample");
		expect(meta.canonical).toBe("https://example.com/canonical");
	});
});

describe("normalizeText", () => {
	it("collapses whitespace and blank lines", () => {
		expect(normalizeText("a   b\n\n\n\nc   ")).toBe("a b\n\nc");
	});
});

describe("extractContent", () => {
	it("produces markdown with a title and links", () => {
		const out = extractContent(SAMPLE, "https://example.com", "markdown", true);
		expect(out.title.length).toBeGreaterThan(0);
		expect(out.content).toContain("Heading");
		expect(out.links.length).toBeGreaterThan(0);
	});

	it("produces parseable json output", () => {
		const out = extractContent(SAMPLE, "https://example.com", "json", false);
		const parsed = JSON.parse(out.content);
		expect(parsed.title).toBe("Sample Page");
		expect(Array.isArray(parsed.links)).toBe(true);
	});
});

describe("empty links", () => {
	it("drops icon-only links from markdown but keeps image links", () => {
		const md = htmlToMarkdown(
			'<p><a href="/vote"></a> <a href="/story">Story</a> <a href="/pic"><img src="/x.png" alt="pic"></a></p>',
		);
		expect(md).not.toContain("[](");
		expect(md).toContain("[Story](/story)");
		expect(md).toContain("![pic](/x.png)");
	});
});

describe("byline handling", () => {
	it("keeps the first author on a listing page", () => {
		const quotes = [
			"Albert Einstein",
			"J.K. Rowling",
			"Jane Austen",
			"Marilyn Monroe",
			"Andre Gide",
			"Thomas Edison",
		]
			.map(
				(name, i) =>
					`<div class="quote"><span class="text">Quote number ${i}, long enough that Readability treats the list as the article, with commas, clauses, and plenty of ordinary words in it.</span> <span>by <small class="author">${name}</small></span></div>`,
			)
			.join("");
		const html = `<html><head><title>Quotes</title></head><body><div class="col">${quotes}</div></body></html>`;
		const { content } = extractContent(
			html,
			"https://example.com/",
			"text",
			true,
		);
		expect(content).toContain("Albert Einstein");
		expect(content).toContain("Jane Austen");
	});
});
