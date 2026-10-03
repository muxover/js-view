import { describe, it, expect } from "vitest";
import { assessPage, truncate } from "../src/render/assess.js";
import { htmlToText } from "../src/extract/text.js";
import { extractLinkList } from "../src/extract/links.js";

const page = (over: Partial<Parameters<typeof assessPage>[0]>) =>
	assessPage({
		title: "Page",
		content: "A normal article with plenty of readable words in it.",
		html: "<p>A normal article</p>",
		statusCode: 200,
		finalUrl: "https://example.com/post",
		...over,
	});

describe("assessPage", () => {
	it("passes a normal page", () => {
		expect(page({})).toEqual({ outcome: "ok", hints: [] });
	});

	it("spots challenge titles and markup", () => {
		expect(page({ title: "Just a moment..." }).outcome).toBe("blocked");
		expect(page({ html: '<div class="g-recaptcha"></div>' }).outcome).toBe(
			"blocked",
		);
		expect(page({ statusCode: 403 }).outcome).toBe("blocked");
	});

	it("does not flag a long article that mentions a captcha", () => {
		const content = "word ".repeat(400);
		expect(
			page({ content, html: '<div class="g-recaptcha"></div>' }).outcome,
		).toBe("ok");
	});

	it("spots login walls by form or path", () => {
		expect(page({ html: '<input type="password">' }).outcome).toBe(
			"login_required",
		);
		expect(page({ finalUrl: "https://example.com/login?next=/" }).outcome).toBe(
			"login_required",
		);
	});

	it("reports HTTP errors and empty pages", () => {
		expect(page({ statusCode: 500 }).outcome).toBe("http_error");
		expect(page({ content: "Loading..." }).outcome).toBe("empty");
		expect(page({ content: "Apple Banana Cherry" }).outcome).toBe("empty");
		expect(page({ content: "Apple, Banana, Cherry, Date" }).outcome).toBe("ok");
	});
});

describe("truncate", () => {
	it("leaves short content alone", () => {
		expect(truncate("short", 1000)).toEqual({ content: "short" });
		expect(truncate("x".repeat(5000), 0)).toEqual({
			content: "x".repeat(5000),
		});
	});

	it("cuts at a paragraph break and notes the length", () => {
		const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.`).join(
			"\n\n",
		);
		const { content, total } = truncate(text, 200);
		expect(total).toBe(text.length);
		expect(content).toMatch(
			/Paragraph \d+\.\n\n\[truncated: \d+ of \d+ characters/,
		);
	});
});

describe("htmlToText", () => {
	it("breaks lines between block elements", () => {
		expect(
			htmlToText("<ul><li>one</li><li>two</li></ul><p>three<br>four</p>"),
		).toBe("one\n\ntwo\n\nthree\nfour");
	});

	it("keeps inline text together and skips scripts", () => {
		expect(
			htmlToText("<p>Hello <b>big</b> world<script>x()</script></p>"),
		).toBe("Hello big world");
	});
});

describe("extractLinkList", () => {
	it("keeps one entry per URL with its most descriptive text", () => {
		const links = extractLinkList(
			'<a href="/a">2h ago</a><a href="/b">B</a><a href="/a#x">63 comments</a><a href="mailto:x@y.z">Mail</a>',
			"https://example.com/",
		);
		expect(links).toEqual([
			{ url: "https://example.com/a", text: "63 comments" },
			{ url: "https://example.com/b", text: "B" },
		]);
	});
});
