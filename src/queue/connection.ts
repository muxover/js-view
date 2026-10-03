import IORedis from "ioredis";
import { config } from "../config.js";

let connection: IORedis | null = null;

/** Shared Redis connection for BullMQ (requires maxRetriesPerRequest: null). */
export function getRedis(): IORedis {
	if (!connection) {
		connection = new IORedis(config.queue.redisUrl, {
			maxRetriesPerRequest: null,
			enableReadyCheck: true,
		});
	}
	return connection;
}

export async function closeRedis(): Promise<void> {
	if (connection) {
		await connection.quit();
		connection = null;
	}
}
