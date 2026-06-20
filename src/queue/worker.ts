import { Worker } from "bullmq";
import type { RenderRequest } from "../types.js";
import { config } from "../config.js";
import { getRedis } from "./connection.js";
import { render } from "../render/renderer.js";
import { logger } from "../utils/logger.js";

let worker: Worker | null = null;

export function startWorker(): Worker {
	if (worker) return worker;

	worker = new Worker(
		config.queue.name,
		async (job) => render(job.data as RenderRequest),
		{
			connection: getRedis() as any,
			concurrency: config.queue.concurrency,
		},
	);

	worker.on("completed", (job) => {
		logger.debug({ jobId: job.id }, "Render job completed");
	});
	worker.on("failed", (job, err) => {
		logger.warn({ jobId: job?.id, err: err?.message }, "Render job failed");
	});

	logger.info(
		{ queue: config.queue.name, concurrency: config.queue.concurrency },
		"Render worker started",
	);
	return worker;
}

export async function stopWorker(): Promise<void> {
	if (worker) {
		await worker.close();
		worker = null;
	}
}
