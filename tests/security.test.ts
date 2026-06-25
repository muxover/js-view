import { describe, it, expect } from "vitest";
import { assertPublicUrl, parseAllowedUrl } from "../src/security/url.js";
import { renderRequestSchema } from "../src/server/schema.js";

describe("parseAllowedUrl", () => {
	it("accepts http and https", () => {
		expect(parseAllowedUrl("https://example.com").protocol).toBe("https:");
		expect(parseAllowedUrl("http://example.com").protocol).toBe("http:");
	});

	it("rejects file: and other schemes", () => {
		expect(() => parseAllowedUrl("file:///etc/passwd")).toThrow();
		expect(() => parseAllowedUrl("ftp://example.com")).toThrow();
		expect(() => parseAllowedUrl("not-a-url")).toThrow();
	});
});

describe("assertPublicUrl", () => {
	it("allows a public host", async () => {
		await expect(
			assertPublicUrl("https://example.com"),
		).resolves.toBeUndefined();
	});

	it("allows data URLs", async () => {
		await expect(
			assertPublicUrl("data:text/html,<h1>hi</h1>"),
		).resolves.toBeUndefined();
	});

	it("blocks localhost and loopback", async () => {
		await expect(assertPublicUrl("http://localhost:6379")).rejects.toThrow();
		await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
	});

	it("blocks the cloud metadata address", async () => {
		await expect(
			assertPublicUrl("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow();
	});

	it("blocks private ranges", async () => {
		await expect(assertPublicUrl("http://10.0.0.5/")).rejects.toThrow();
		await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toThrow();
		await expect(assertPublicUrl("http://172.16.0.1/")).rejects.toThrow();
	});
});

describe("renderRequestSchema scheme guard", () => {
	it("rejects a file: url", () => {
		const parsed = renderRequestSchema.safeParse({ url: "file:///etc/passwd" });
		expect(parsed.success).toBe(false);
	});

	it("accepts a data: url", () => {
		const parsed = renderRequestSchema.safeParse({
			url: "data:text/html,<h1>hi</h1>",
		});
		expect(parsed.success).toBe(true);
	});
});
