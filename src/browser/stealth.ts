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

export function randomUserAgent(): string {
	return pick(config.stealth.userAgents);
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

/** Resolve the effective proxy for a render (per-request override wins). */
export function resolveProxy(
	requestProxy?: ProxyConfig,
): ProxyConfig | undefined {
	if (requestProxy?.server) return requestProxy;
	return parseProxyUrl(config.stealth.proxyUrl);
}

/** Extra HTTP headers that make automated traffic look more browser-like. */
export function defaultHeaders(): Record<string, string> {
	return {
		"Accept-Language": "en-US,en;q=0.9",
		"Sec-Ch-Ua": '"Chromium";v="126", "Not.A/Brand";v="24"',
		"Sec-Ch-Ua-Mobile": "?0",
		"Upgrade-Insecure-Requests": "1",
	};
}
