import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Persists Playwright storage state (cookies + localStorage) per session id so
 * agents can keep a logged-in / warmed-up session across multiple renders.
 */

function sanitize(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function sessionPath(id: string): string {
	return path.join(config.sessionDir, `${sanitize(id)}.json`);
}

export async function ensureSessionDir(): Promise<void> {
	await fs.mkdir(config.sessionDir, { recursive: true });
}

export async function loadSessionStatePath(
	sessionId?: string,
): Promise<string | undefined> {
	if (!sessionId) return undefined;
	const file = sessionPath(sessionId);
	try {
		await fs.access(file);
		return file;
	} catch {
		return undefined;
	}
}

/** Persist the current context storage state for later reuse. */
export async function saveSessionState(
	sessionId: string,
	state: unknown,
): Promise<void> {
	await ensureSessionDir();
	const file = sessionPath(sessionId);
	await fs.writeFile(file, JSON.stringify(state), "utf8");
	logger.debug({ sessionId }, "Saved session state");
}

export async function deleteSession(sessionId: string): Promise<boolean> {
	const file = sessionPath(sessionId);
	try {
		await fs.unlink(file);
		return true;
	} catch {
		return false;
	}
}

export async function listSessions(): Promise<string[]> {
	try {
		const files = await fs.readdir(config.sessionDir);
		return files
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(/\.json$/, ""));
	} catch {
		return [];
	}
}
