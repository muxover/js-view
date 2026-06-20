import { describe, it, expect, afterAll } from "vitest";
import { render } from "../src/render/renderer.js";
import { closePool } from "../src/browser/pool.js";

async function browserAvailable(): Promise<boolean> {
	try {
		const { launchBrowser } = await import("../src/browser/launch.js");
		const browser = await launchBrowser();
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

const available = await browserAvailable();
const maybe = available ? describe : describe.skip;

const PAGE = `data:text/html,${encodeURIComponent(
	`<!doctype html><html><head><title>IT Page</title></head>
   <body><div id="root"></div>
   <script>
     const r = document.getElementById('root');
     const h = document.createElement('h1');
     h.textContent = 'Rendered Heading';
     const a = document.createElement('a');
     a.href = 'https://example.com/x';
     a.textContent = 'link';
     r.appendChild(h); r.appendChild(a);
   </script></body></html>`,
)}`;

maybe("render integration", () => {
	afterAll(async () => {
		await closePool();
	});

	it("executes JS and extracts the dynamically inserted content", async () => {
		const res = await render({
			url: PAGE,
			wait_until: "load",
			output_format: "markdown",
			clean: false,
			timeout_ms: 15_000,
		});
		expect(res.metadata.js_execution).toBe(true);
		expect(res.content).toContain("Rendered Heading");
		expect(res.links).toContain("https://example.com/x");
	});
});

if (!available) {
	describe("render integration", () => {
		it.skip("skipped: no Chromium available (run: npx playwright install chromium)", () => {});
	});
}
