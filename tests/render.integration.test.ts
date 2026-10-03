import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startSite, type Site } from "./fixtures/site.js";

process.env.BLOCK_PRIVATE_HOSTS = "false";
process.env.LOG_LEVEL = "silent";

const { render } = await import("../src/render/renderer.js");
const { closePool } = await import("../src/browser/pool.js");
const { launchBrowser } = await import("../src/browser/launch.js");

async function browserAvailable(): Promise<boolean> {
	try {
		await (await launchBrowser()).close();
		return true;
	} catch {
		return false;
	}
}

const available = await browserAvailable();
if (!available && process.env.CI) {
	throw new Error(
		"Chromium is required in CI: npx playwright install chromium",
	);
}
const maybe = available ? describe : describe.skip;

maybe("render against a live browser", () => {
	let site: Site;

	beforeAll(async () => {
		site = await startSite();
	});
	afterAll(async () => {
		await closePool();
		await site.close();
	});

	it("runs the page's JavaScript and reads what it fetched", async () => {
		const res = await render({ url: site.url("/spa"), capture_network: true });
		expect(res.outcome).toBe("ok");
		expect(res.content).toContain("Apple");
		expect(res.links).toContain(site.url("/item/1"));
		expect(res.network?.[0].body_preview).toContain("Banana");
		expect(res.metadata.user_agent).not.toMatch(/Headless/);
	});

	it("scrolls an infinite feed", async () => {
		const res = await render({
			url: site.url("/feed"),
			output_format: "text",
			actions: [{ type: "scroll", count: 3, delay_ms: 300 }],
		});
		expect(res.content).toContain("Post 15");
		expect(res.content).toMatch(/Post 1\n+Post 2/);
	});

	it("clicks load more before reading", async () => {
		const res = await render({
			url: site.url("/more"),
			output_format: "text",
			actions: [{ type: "click", selector: ".load-more" }],
		});
		expect(res.content.split(/\n+/)).toEqual(["one", "two", "three"]);
	});

	it("reports a bot check instead of passing it off as content", async () => {
		const res = await render({ url: site.url("/challenge") });
		expect(res.outcome).toBe("blocked");
		expect(res.hints.length).toBeGreaterThan(0);
	});

	it("reports a login wall", async () => {
		expect((await render({ url: site.url("/login") })).outcome).toBe(
			"login_required",
		);
	});

	it("reports HTTP errors with the status", async () => {
		const res = await render({ url: site.url("/missing") });
		expect(res.outcome).toBe("http_error");
		expect(res.metadata.status_code).toBe(404);
	});

	it("returns only the selected elements", async () => {
		const res = await render({
			url: site.url("/docs"),
			selector: "main",
			output_format: "text",
		});
		expect(res.content).toContain("Install the tool");
		expect(res.content).not.toContain("footer text");
		expect(res.links).toEqual([]);
	});

	it("keeps each selected element on its own line", async () => {
		const res = await render({
			url: site.url("/more"),
			selector: "li",
			output_format: "text",
		});
		expect(res.content.split(/\n+/)).toEqual(["one"]);
		const many = await render({
			url: site.url("/tags"),
			selector: ".tag",
			output_format: "text",
		});
		expect(many.content.split(/\n+/)).toEqual(["alpha", "beta", "gamma"]);
	});

	it("says so when the selector matches nothing", async () => {
		const res = await render({ url: site.url("/docs"), selector: ".nope" });
		expect(res.hints.join(" ")).toContain("matched nothing");
		expect(res.content).toContain("Install the tool");
	});

	it("truncates long content and reports the full length", async () => {
		const res = await render({ url: site.url("/long"), max_chars: 2000 });
		expect(res.content.length).toBeLessThan(2200);
		expect(res.content).toContain("[truncated:");
		expect(res.total_chars).toBeGreaterThan(20_000);
	});

	it("captures a viewport screenshot without OCR", async () => {
		const res = await render({
			url: site.url("/docs"),
			screenshot: true,
			screenshot_format: "jpeg",
			full_page: false,
			ocr: false,
		});
		expect(Buffer.from(res.screenshot ?? "", "base64").subarray(0, 2)).toEqual(
			Buffer.from([0xff, 0xd8]),
		);
		expect(res.ocr_text).toBeUndefined();
	});
});
