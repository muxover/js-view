import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSite, type Site } from "./fixtures/site.js";

process.env.BLOCK_PRIVATE_HOSTS = "false";
process.env.LOG_LEVEL = "silent";
process.env.API_KEY = "test-key";
process.env.SESSION_DIR = mkdtempSync(join(tmpdir(), "jsview-sessions-"));
delete process.env.REDIS_URL;

const { createApp } = await import("../src/server/app.js");
const { closePool } = await import("../src/browser/pool.js");
const { launchBrowser } = await import("../src/browser/launch.js");

const available = await launchBrowser().then(
	(b) => b.close().then(() => true),
	() => false,
);

describe("http service", () => {
	let site: Site;
	let server: Server;
	let base: string;

	beforeAll(async () => {
		site = await startSite();
		server = createApp().listen(0, "127.0.0.1");
		await new Promise((r) => server.once("listening", r));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		await new Promise((r) => server.close(r));
		await closePool();
		await site.close();
	});

	const post = (body: unknown, key = "test-key") =>
		fetch(`${base}/render`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-api-key": key },
			body: JSON.stringify(body),
		});

	it("reports health without a key", async () => {
		const res = await fetch(`${base}/health`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			status: "ok",
			queue_enabled: false,
		});
	});

	it("refuses renders without the api key", async () => {
		expect((await post({ url: site.url("/docs") }, "wrong")).status).toBe(401);
	});

	it("rejects an invalid request body", async () => {
		const res = await post({ url: "ftp://example.com" });
		expect(res.status).toBe(400);
	});

	describe.skipIf(!available)("with a browser", () => {
		it("renders with selector and max_chars", async () => {
			const res = await post({
				url: site.url("/long"),
				selector: "article",
				max_chars: 1000,
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			expect(body.outcome).toBe("ok");
			expect(body.total_chars).toBeGreaterThan(1000);
		});

		it("saves, lists, and deletes a session", async () => {
			await post({ url: site.url("/docs"), session_id: "svc-test" });
			const list = await (
				await fetch(`${base}/sessions`, {
					headers: { "x-api-key": "test-key" },
				})
			).json();
			expect(list.sessions).toContain("svc-test");
			const del = await fetch(`${base}/sessions/svc-test`, {
				method: "DELETE",
				headers: { "x-api-key": "test-key" },
			});
			expect(await del.json()).toEqual({ deleted: true });
		});
	});
});
