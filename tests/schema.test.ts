import { describe, it, expect } from "vitest";
import { renderRequestSchema } from "../src/server/schema.js";

describe("renderRequestSchema", () => {
	it("accepts a minimal valid request", () => {
		const parsed = renderRequestSchema.safeParse({
			url: "https://example.com",
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts actions and options", () => {
		const parsed = renderRequestSchema.safeParse({
			url: "https://example.com",
			output_format: "markdown",
			wait_until: "networkidle",
			actions: [
				{ type: "scroll", count: 3 },
				{ type: "click", selector: ".more", optional: true },
				{ type: "type", selector: "#q", text: "hi", submit: true },
			],
			capture_network: true,
			screenshot: true,
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects a non-URL", () => {
		const parsed = renderRequestSchema.safeParse({ url: "not-a-url" });
		expect(parsed.success).toBe(false);
	});

	it("rejects an unknown action type", () => {
		const parsed = renderRequestSchema.safeParse({
			url: "https://example.com",
			actions: [{ type: "teleport" }],
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects out-of-range timeout", () => {
		const parsed = renderRequestSchema.safeParse({
			url: "https://example.com",
			timeout_ms: 10,
		});
		expect(parsed.success).toBe(false);
	});
});
