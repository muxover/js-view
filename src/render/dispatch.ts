import type { RenderRequest, RenderResponse } from "../types.js";
import { config } from "../config.js";
import { render } from "./renderer.js";

// through the queue when Redis is configured, otherwise in-process
export async function dispatchRender(
	req: RenderRequest,
): Promise<RenderResponse> {
	if (config.queue.enabled) {
		const { enqueueRender } = await import("../queue/queue.js");
		return enqueueRender(req);
	}
	return render(req);
}
