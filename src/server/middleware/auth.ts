import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";

function presented(req: Request): string | undefined {
	const header = req.header("authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7).trim();
	const key = req.header("x-api-key");
	return key?.trim() || undefined;
}

/** Require a matching API key when one is configured; a no-op otherwise. */
export function requireApiKey(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const expected = config.security.apiKey;
	if (!expected) return next();
	if (presented(req) === expected) return next();
	res.status(401).json({ error: "Unauthorized" });
}
