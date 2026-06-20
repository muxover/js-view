import { describe, it, expect } from "vitest";
import {
	parseProxyUrl,
	randomViewport,
	randomUserAgent,
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

describe("randomUserAgent", () => {
	it("returns a non-empty user agent string", () => {
		expect(randomUserAgent().length).toBeGreaterThan(10);
	});
});
