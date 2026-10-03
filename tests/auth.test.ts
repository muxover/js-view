import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request, Response } from "express";

function mockRes() {
	const res = {
		statusCode: 0,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(payload: unknown) {
			this.body = payload;
			return this;
		},
	};
	return res as unknown as Response & { statusCode: number; body: unknown };
}

function mockReq(headers: Record<string, string>): Request {
	return {
		header: (name: string) => headers[name.toLowerCase()],
	} as unknown as Request;
}

async function loadAuth(apiKey: string) {
	vi.resetModules();
	process.env.API_KEY = apiKey;
	return import("../src/server/middleware/auth.js");
}

afterEach(() => {
	delete process.env.API_KEY;
	vi.resetModules();
});

describe("requireApiKey", () => {
	it("passes through when no key is configured", async () => {
		const { requireApiKey } = await loadAuth("");
		const next = vi.fn();
		requireApiKey(mockReq({}), mockRes(), next);
		expect(next).toHaveBeenCalledOnce();
	});

	it("accepts a matching bearer token", async () => {
		const { requireApiKey } = await loadAuth("secret");
		const next = vi.fn();
		requireApiKey(mockReq({ authorization: "Bearer secret" }), mockRes(), next);
		expect(next).toHaveBeenCalledOnce();
	});

	it("accepts a matching x-api-key header", async () => {
		const { requireApiKey } = await loadAuth("secret");
		const next = vi.fn();
		requireApiKey(mockReq({ "x-api-key": "secret" }), mockRes(), next);
		expect(next).toHaveBeenCalledOnce();
	});

	it("rejects a missing or wrong key with 401", async () => {
		const { requireApiKey } = await loadAuth("secret");
		const next = vi.fn();
		const res = mockRes();
		requireApiKey(mockReq({ authorization: "Bearer nope" }), res, next);
		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(401);
	});
});
