import type { ProxyConfig } from "../types.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const VIEWPORTS = [
	{ width: 1280, height: 720 },
	{ width: 1366, height: 768 },
	{ width: 1440, height: 900 },
	{ width: 1536, height: 864 },
	{ width: 1920, height: 1080 },
];

function pick<T>(list: T[]): T {
	return list[Math.floor(Math.random() * list.length)];
}

const PLATFORM_TOKENS: Record<string, string> = {
	win32: "Windows NT 10.0; Win64; x64",
	darwin: "Macintosh; Intel Mac OS X 10_15_7",
	linux: "X11; Linux x86_64",
};

// Headless Chromium advertises itself as "HeadlessChrome". Rebuild the reduced
// user agent real Chrome sends so it matches the engine's version and hints.
export function chromeUserAgent(
	browserVersion: string,
	platform: string = process.platform,
): string {
	const major = browserVersion.split(".")[0];
	const os = PLATFORM_TOKENS[platform] ?? PLATFORM_TOKENS.linux;
	return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/** A configured USER_AGENTS entry, or the browser's own user agent. */
export function pickUserAgent(browserVersion: string): string {
	const list = config.stealth.userAgents;
	return list.length ? pick(list) : chromeUserAgent(browserVersion);
}

export function randomViewport(): { width: number; height: number } {
	if (!config.stealth.randomizeViewport) {
		return { width: 1366, height: 768 };
	}
	const base = pick(VIEWPORTS);
	// Jitter by a few pixels so two requests are rarely byte-identical.
	return {
		width: base.width + Math.floor(Math.random() * 17) - 8,
		height: base.height + Math.floor(Math.random() * 17) - 8,
	};
}

/** Parse a proxy URL (http://user:pass@host:port) into Playwright proxy config. */
export function parseProxyUrl(proxyUrl: string): ProxyConfig | undefined {
	if (!proxyUrl) return undefined;
	// A bare host:port has no scheme; URL() would otherwise read "host" as one.
	const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(proxyUrl);
	try {
		const u = new URL(hasScheme ? proxyUrl : `http://${proxyUrl}`);
		const cfg: ProxyConfig = {
			server: hasScheme ? `${u.protocol}//${u.host}` : u.host,
		};
		if (u.username) cfg.username = decodeURIComponent(u.username);
		if (u.password) cfg.password = decodeURIComponent(u.password);
		return cfg;
	} catch {
		logger.warn({ proxyUrl }, "Ignoring malformed PROXY_URL");
		return undefined;
	}
}

// a per-request proxy wins over PROXY_URL
export function resolveProxy(
	requestProxy?: ProxyConfig,
): ProxyConfig | undefined {
	if (requestProxy?.server) return requestProxy;
	return parseProxyUrl(config.stealth.proxyUrl);
}

export function defaultHeaders(): Record<string, string> {
	return { "Accept-Language": "en-US,en;q=0.9" };
}
