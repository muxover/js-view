import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startProxy, startSite, type Site } from "./fixtures/site.js";

process.env.BLOCK_PRIVATE_HOSTS = "false";
process.env.LOG_LEVEL = "silent";

const { createMcpServer } = await import("../src/mcp/server.js");
const { closePool } = await import("../src/browser/pool.js");
const { launchBrowser } = await import("../src/browser/launch.js");

const available = await launchBrowser().then(
	(b) => b.close().then(() => true),
	() => false,
);

type Content = {
	type: string;
	text?: string;
	data?: string;
	mimeType?: string;
};

describe("mcp server", () => {
	let client: Client;
	let site: Site;

	beforeAll(async () => {
		site = await startSite();
		const [a, b] = InMemoryTransport.createLinkedPair();
		await createMcpServer().connect(a);
		client = new Client({ name: "test", version: "0" });
		await client.connect(b);
	});
	afterAll(async () => {
		await client.close();
		await closePool();
		await site.close();
	});

	const call = async (name: string, args: Record<string, unknown>) => {
		const res = await client.callTool({ name, arguments: args });
		return { isError: res.isError, content: res.content as Content[] };
	};

	it("lists the four tools, all read-only", async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual([
			"links",
			"network",
			"render",
			"screenshot",
		]);
		for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
	});

	it("returns tool errors instead of throwing", async () => {
		const res = await call("render", { url: "not a url" });
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toContain("Invalid URL");
	});

	describe.skipIf(!available)("with a browser", () => {
		it("render returns a header and markdown", async () => {
			const { content } = await call("render", {
				url: site.url("/spa"),
				wait_for: "article",
			});
			expect(content[0].text).toMatch(
				/^Title: Store\nURL: .+\/spa\nStatus: 200 \| ok/,
			);
			expect(content[0].text).toContain("Banana");
		});

		it("render caps content at max_chars", async () => {
			const { content } = await call("render", {
				url: site.url("/long"),
				max_chars: 1000,
			});
			expect(content[0].text).toMatch(/Length: \d+ of \d+ characters/);
		});

		it("links filters by text and site", async () => {
			const { content } = await call("links", {
				url: site.url("/spa"),
				same_site: true,
			});
			expect(content[0].text).toContain(`[First item](${site.url("/item/1")})`);
			expect(content[0].text).not.toContain("other.test");
		});

		it("network shows the API call and its body", async () => {
			const { content } = await call("network", {
				url: site.url("/spa"),
				match: "/api/",
			});
			expect(content[0].text).toContain("Requests: 1");
			expect(content[0].text).toContain('{"items"');
		});

		it("render fills inputs, keeps the whole page with raw, and returns text", async () => {
			const { content } = await call("render", {
				url: site.url("/search"),
				type: [{ selector: "#q", text: "mcp", submit: true }],
				format: "text",
				raw: true,
			});
			expect(content[0].text).toContain("Results for mcp");
		});

		it("render goes through a proxy with credentials", async () => {
			const proxy = await startProxy(site, "jax", "s3cret");
			try {
				const { content } = await call("render", {
					url: "http://jsview.test/docs",
					proxy: proxy.url,
				});
				expect(content[0].text).toContain("Install the tool");
				expect(proxy.authorized()).toBeGreaterThan(0);
			} finally {
				await proxy.close();
			}
		});

		it("links narrows by selector and match", async () => {
			const { content } = await call("links", {
				url: site.url("/docs"),
				selector: "nav",
				match: "blog",
			});
			expect(content[0].text).toContain("Links: 1");
			expect(content[0].text).toContain(`[Blog](${site.url("/blog")})`);
		});

		it("screenshot captures one element or the full page", async () => {
			const one = await call("screenshot", {
				url: site.url("/docs"),
				selector: "main",
			});
			const full = await call("screenshot", {
				url: site.url("/long"),
				full_page: true,
			});
			expect(one.content[0].type).toBe("image");
			expect(full.content[0].data!.length).toBeGreaterThan(
				one.content[0].data!.length,
			);
		});

		it("screenshot returns an image", async () => {
			const { content } = await call("screenshot", { url: site.url("/docs") });
			expect(content[0]).toMatchObject({
				type: "image",
				mimeType: "image/jpeg",
			});
			expect(content[0].data?.length).toBeGreaterThan(1000);
		});
	});
});
