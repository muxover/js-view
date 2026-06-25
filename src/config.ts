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

const DEFAULT_USER_AGENTS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
];

function parseUserAgents(): string[] {
	const raw = str("USER_AGENTS", "");
	if (!raw) return DEFAULT_USER_AGENTS;
	const list = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return list.length ? list : DEFAULT_USER_AGENTS;
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
	};
	browser: {
		poolSize: number;
		maxUses: number;
		headful: boolean;
		noSandbox: boolean;
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
		},
		browser: {
			poolSize: int("BROWSER_POOL_SIZE", 2),
			maxUses: int("BROWSER_MAX_USES", 50),
			headful: bool("HEADFUL", false),
			noSandbox: bool("BROWSER_NO_SANDBOX", true),
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
