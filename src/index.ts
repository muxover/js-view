import type { Server } from "node:http";
import { config } from "./config.js";
import { createApp } from "./server/app.js";
import { ensureSessionDir } from "./browser/session.js";
import { closePool, getPool } from "./browser/pool.js";
import { closeOcrWorker } from "./render/screenshot.js";
import { idleMs } from "./server/activity.js";
import { logger } from "./utils/logger.js";

async function startApi(): Promise<Server> {
	const app = createApp();
	return new Promise<Server>((resolve) => {
		const server = app.listen(config.port, config.host, () => {
			logger.info(
				{ host: config.host, port: config.port, role: config.role },
				"JS-View API listening",
			);
			resolve(server);
		});
	});
}

async function main(): Promise<void> {
	await ensureSessionDir();

	const runApi = config.role === "api" || config.role === "all";
	const runWorker = config.role === "worker" || config.role === "all";

	if (config.role !== "api" && !config.queue.enabled && runWorker && !runApi) {
		logger.warn(
			"Worker role selected but REDIS_URL is not set; nothing to consume.",
		);
	}

	let server: Server | undefined;
	if (runApi) {
		server = await startApi();
	}

	let stopWorker: (() => Promise<void>) | undefined;
	if (runWorker && config.queue.enabled) {
		const { startWorker, stopWorker: stop } = await import("./queue/worker.js");
		startWorker();
		stopWorker = stop;
	}

	const shutdown = async (signal: string) => {
		logger.info({ signal }, "Shutting down JS-View");
		try {
			if (server) await new Promise<void>((r) => server!.close(() => r()));
			if (stopWorker) await stopWorker();
			if (config.queue.enabled) {
				const { closeQueue } = await import("./queue/queue.js");
				const { closeRedis } = await import("./queue/connection.js");
				await closeQueue();
				await closeRedis();
			}
			await closePool();
			await closeOcrWorker();
		} catch (err) {
			logger.error({ err }, "Error during shutdown");
		} finally {
			process.exit(0);
		}
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));

	// When auto-started by the skill, the service closes itself once it has been
	// idle (no requests, no in-flight renders) for the configured window.
	if (runApi && config.idleShutdownMs > 0) {
		const checkEvery = Math.min(config.idleShutdownMs, 15_000);
		const timer = setInterval(() => {
			if (idleMs() >= config.idleShutdownMs && getPool().stats.busy === 0) {
				clearInterval(timer);
				void shutdown("idle");
			}
		}, checkEvery);
		timer.unref();
		logger.info(
			{ idleShutdownMs: config.idleShutdownMs },
			"Idle auto-shutdown armed",
		);
	}
}

main().catch((err) => {
	logger.error({ err }, "Fatal startup error");
	process.exit(1);
});
