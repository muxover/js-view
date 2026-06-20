import { Queue, QueueEvents } from "bullmq";
import type { RenderRequest, RenderResponse } from "../types.js";
import { config } from "../config.js";
import { getRedis } from "./connection.js";
import { logger } from "../utils/logger.js";

// BullMQ bundles its own ioredis; the shared connection is passed as `any` to
// avoid a duplicate-package type clash. It is a real ioredis client at runtime.
let queue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

function getQueue(): Queue {
	if (!queue) {
		queue = new Queue(config.queue.name, {
			connection: getRedis() as any,
			defaultJobOptions: {
				attempts: 1,
				removeOnComplete: 100,
				removeOnFail: 200,
			},
		});
	}
	return queue;
}

function getQueueEvents(): QueueEvents {
	if (!queueEvents) {
		queueEvents = new QueueEvents(config.queue.name, {
			connection: getRedis() as any,
		});
	}
	return queueEvents;
}

/** Enqueue a render job and await its result via the queue. */
export async function enqueueRender(
	req: RenderRequest,
): Promise<RenderResponse> {
	const q = getQueue();
	const events = getQueueEvents();
	await events.waitUntilReady();

	const job = await q.add("render", req);
	logger.debug({ jobId: job.id }, "Enqueued render job");

	// Bound the wait so the HTTP request cannot hang forever.
	const maxWait = (req.timeout_ms ?? config.defaults.timeoutMs) + 30_000;
	return (await job.waitUntilFinished(events, maxWait)) as RenderResponse;
}

export async function closeQueue(): Promise<void> {
	if (queueEvents) {
		await queueEvents.close();
		queueEvents = null;
	}
	if (queue) {
		await queue.close();
		queue = null;
	}
}
