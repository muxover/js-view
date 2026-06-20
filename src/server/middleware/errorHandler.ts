import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
	err: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction,
): void {
	if (err instanceof HttpError) {
		res.status(err.statusCode).json({
			error: err.message,
			details: err.details,
		});
		return;
	}

	logger.error({ err }, "Unhandled error");
	const message = err instanceof Error ? err.message : "Internal server error";
	res.status(500).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
	res.status(404).json({ error: "Not found" });
}
