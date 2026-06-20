import type { RenderRequest, RenderResponse } from "../types.js";
import { config } from "../config.js";
import { render } from "./renderer.js";

/**
 * Route a render request either through the Redis-backed queue (when enabled)
 * for isolated, scalable processing, or run it inline in-process.
 */
export async function dispatchRender(
	req: RenderRequest,
): Promise<RenderResponse> {
	if (config.queue.enabled) {
		const { enqueueRender } = await import("../queue/queue.js");
		return enqueueRender(req);
	}
	return render(req);
}
