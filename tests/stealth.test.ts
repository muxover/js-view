import { describe, it, expect } from "vitest";
import {
	parseProxyUrl,
	randomViewport,
	chromeUserAgent,
	pickUserAgent,
} from "../src/browser/stealth.js";

describe("parseProxyUrl", () => {
	it("splits credentials from the server", () => {
		const proxy = parseProxyUrl("http://user:pass@host:8080");
		expect(proxy?.server).toBe("http://host:8080");
		expect(proxy?.username).toBe("user");
		expect(proxy?.password).toBe("pass");
	});

	it("returns undefined for empty input", () => {
		expect(parseProxyUrl("")).toBeUndefined();
	});

	it("accepts a bare host:port", () => {
		expect(parseProxyUrl("host:8080")?.server).toBe("host:8080");
	});

	it("returns undefined for a malformed proxy", () => {
		expect(parseProxyUrl("not a proxy at all")).toBeUndefined();
	});
});

describe("randomViewport", () => {
	it("stays within reasonable bounds", () => {
		for (let i = 0; i < 20; i += 1) {
			const vp = randomViewport();
			expect(vp.width).toBeGreaterThan(1000);
			expect(vp.height).toBeGreaterThan(600);
		}
	});
});

describe("chromeUserAgent", () => {
	it("builds the reduced Chrome user agent for the engine version", () => {
		expect(chromeUserAgent("149.0.7827.55", "win32")).toBe(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
		);
	});

	it("never advertises a headless browser", () => {
		expect(pickUserAgent("149.0.7827.55")).not.toMatch(/Headless/);
	});
});
