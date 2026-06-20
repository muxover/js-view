import { Router } from "express";
import type { Request, Response } from "express";
import { renderRequestSchema } from "./schema.js";
import { dispatchRender } from "../render/dispatch.js";
import { getPool } from "../browser/pool.js";
import { deleteSession, listSessions } from "../browser/session.js";
import { renderRateLimiter } from "./middleware/rateLimit.js";
import { HttpError } from "../utils/errors.js";
import { config } from "../config.js";
import type { RenderRequest } from "../types.js";

export const router = Router();

router.get("/health", (_req: Request, res: Response) => {
	res.json({
		status: "ok",
		role: config.role,
		queue_enabled: config.queue.enabled,
		pool: getPool().stats,
	});
});

router.post(
	"/render",
	renderRateLimiter,
	async (req: Request, res: Response, next) => {
		try {
			const parsed = renderRequestSchema.safeParse(req.body);
			if (!parsed.success) {
				throw new HttpError(
					400,
					"Invalid render request",
					parsed.error.flatten(),
				);
			}
			const result = await dispatchRender(parsed.data as RenderRequest);
			res.json(result);
		} catch (err) {
			next(err);
		}
	},
);

router.get("/sessions", async (_req: Request, res: Response, next) => {
	try {
		res.json({ sessions: await listSessions() });
	} catch (err) {
		next(err);
	}
});

router.delete("/sessions/:id", async (req: Request, res: Response, next) => {
	try {
		const { id } = req.params;
		const sessionId = Array.isArray(id) ? id[0] : id;
		const deleted = await deleteSession(sessionId);
		res.json({ deleted });
	} catch (err) {
		next(err);
	}
});
