import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startSite, type Site } from "./fixtures/site.js";

// Runs when REDIS_URL points at a Redis server (CI starts one).
const redisUrl = process.env.REDIS_URL;
process.env.BLOCK_PRIVATE_HOSTS = "false";
process.env.LOG_LEVEL = "silent";
process.env.QUEUE_NAME = `jsview-test-${process.pid}`;

describe.skipIf(!redisUrl)("render queue", () => {
	let site: Site;
	let mods: {
		dispatchRender: typeof import("../src/render/dispatch.js").dispatchRender;
		stopWorker: () => Promise<void>;
		closeQueue: () => Promise<void>;
		closeRedis: () => Promise<void>;
		closePool: () => Promise<void>;
	};

	beforeAll(async () => {
		site = await startSite();
		const { dispatchRender } = await import("../src/render/dispatch.js");
		const { startWorker, stopWorker } = await import("../src/queue/worker.js");
		const { closeQueue } = await import("../src/queue/queue.js");
		const { closeRedis } = await import("../src/queue/connection.js");
		const { closePool } = await import("../src/browser/pool.js");
		startWorker();
		mods = { dispatchRender, stopWorker, closeQueue, closeRedis, closePool };
	});
	afterAll(async () => {
		await mods.stopWorker();
		await mods.closeQueue();
		await mods.closeRedis();
		await mods.closePool();
		await site.close();
	});

	it("renders through a worker", async () => {
		const res = await mods.dispatchRender({
			url: site.url("/spa"),
			wait_for_selector: "article",
		});
		expect(res.outcome).toBe("ok");
		expect(res.content).toContain("Banana");
	});
});
