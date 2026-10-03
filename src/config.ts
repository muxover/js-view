import type { OutputFormat, WaitUntil } from "./types.js";

export type ProcessRole = "api" | "worker" | "all";

function str(name: string, fallback: string): string {
	const v = process.env[name];
	return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
	const v = process.env[name];
	if (v === undefined || v === "") return fallback;
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
	const v = process.env[name];
	if (v === undefined || v === "") return fallback;
	return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

// Empty means "use the browser's own user agent", which always matches the
// engine and client hints it actually sends.
function parseUserAgents(): string[] {
	return str("USER_AGENTS", "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export interface Config {
	role: ProcessRole;
	port: number;
	host: string;
	rateLimit: { windowMs: number; max: number };
	defaults: {
		timeoutMs: number;
		maxTimeoutMs: number;
		waitUntil: WaitUntil;
		outputFormat: OutputFormat;
		/** Cap on returned content length. 0 means no cap. */
		maxChars: number;
	};
	browser: {
		poolSize: number;
		maxUses: number;
		headful: boolean;
		noSandbox: boolean;
		/** Explicit Chromium/Chrome binary; skips auto-detection. */
		executablePath: string;
		/** Installed browser channel to fall back to: chrome, msedge, or none. */
		channels: string[];
	};
	security: {
		apiKey: string;
		blockPrivateHosts: boolean;
	};
	stealth: {
		enabled: boolean;
		userAgents: string[];
		randomizeViewport: boolean;
		proxyUrl: string;
	};
	sessionDir: string;
	queue: {
		redisUrl: string;
		name: string;
		concurrency: number;
		enabled: boolean;
	};
	ocrLang: string;
	logLevel: string;
	/** Shut the service down after this many ms with no requests. 0 disables it. */
	idleShutdownMs: number;
}

export function loadConfig(): Config {
	const redisUrl = str("REDIS_URL", "");
	return {
		role: str("JSVIEW_ROLE", "all") as ProcessRole,
		port: int("PORT", 8080),
		host: str("HOST", "0.0.0.0"),
		rateLimit: {
			windowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
			max: int("RATE_LIMIT_MAX", 60),
		},
		defaults: {
			timeoutMs: int("DEFAULT_TIMEOUT_MS", 15_000),
			maxTimeoutMs: int("MAX_TIMEOUT_MS", 60_000),
			waitUntil: str("DEFAULT_WAIT_UNTIL", "networkidle") as WaitUntil,
			outputFormat: str("DEFAULT_OUTPUT_FORMAT", "markdown") as OutputFormat,
			maxChars: int("MAX_CHARS", 0),
		},
		browser: {
			poolSize: int("BROWSER_POOL_SIZE", 2),
			maxUses: int("BROWSER_MAX_USES", 50),
			headful: bool("HEADFUL", false),
			noSandbox: bool("BROWSER_NO_SANDBOX", true),
			executablePath: str("CHROMIUM_PATH", ""),
			channels: str("BROWSER_CHANNELS", "chrome,msedge")
				.split(",")
				.map((c) => c.trim())
				.filter((c) => c && c !== "none"),
		},
		security: {
			apiKey: str("API_KEY", ""),
			blockPrivateHosts: bool("BLOCK_PRIVATE_HOSTS", true),
		},
		stealth: {
			enabled: bool("STEALTH_ENABLED", true),
			userAgents: parseUserAgents(),
			randomizeViewport: bool("RANDOMIZE_VIEWPORT", true),
			proxyUrl: str("PROXY_URL", ""),
		},
		sessionDir: str("SESSION_DIR", "./sessions"),
		queue: {
			redisUrl,
			name: str("QUEUE_NAME", "jsview-render"),
			concurrency: int("QUEUE_CONCURRENCY", 2),
			enabled: redisUrl !== "",
		},
		ocrLang: str("OCR_LANG", "eng"),
		logLevel: str("LOG_LEVEL", "info"),
		idleShutdownMs: int("IDLE_SHUTDOWN_MS", 0),
	};
}

export const config = loadConfig();
