import { lookup } from "node:dns/promises";
import net from "node:net";
import type { BrowserContext } from "playwright";
import { config } from "../config.js";
import { HttpError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// http/https reach the network; data: is inert (inline content, no host).
const ALLOWED_SCHEMES = new Set(["http:", "https:", "data:"]);

export function parseAllowedUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new HttpError(400, "Invalid URL");
	}
	if (!ALLOWED_SCHEMES.has(url.protocol)) {
		throw new HttpError(400, `Unsupported URL scheme: ${url.protocol}`);
	}
	return url;
}

function isPrivateAddress(ip: string): boolean {
	const v = net.isIP(ip);
	if (v === 4) {
		const [a, b] = ip.split(".").map(Number);
		if (a === 10 || a === 127 || a === 0) return true;
		if (a === 169 && b === 254) return true; // link-local + cloud metadata
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		return false;
	}
	if (v === 6) {
		const lower = ip.toLowerCase();
		if (lower === "::1" || lower === "::") return true;
		if (
			lower.startsWith("fe80") ||
			lower.startsWith("fc") ||
			lower.startsWith("fd")
		)
			return true;
		// IPv4-mapped (::ffff:a.b.c.d) — unwrap and recheck.
		const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		return false;
	}
	return false;
}

/** Resolve a host to its addresses, returning null when it can't be resolved. */
async function hostAddresses(host: string): Promise<string[] | null> {
	if (net.isIP(host)) return [host];
	try {
		const records = await lookup(host, { all: true });
		return records.map((r) => r.address);
	} catch {
		return null;
	}
}

async function pointsAtPrivateHost(url: URL): Promise<boolean> {
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	const addrs = await hostAddresses(host);
	if (!addrs) return true; // unresolvable — refuse rather than guess
	return addrs.some(isPrivateAddress);
}

/**
 * Reject URLs that point at the local host or a private network before we hand
 * them to a browser. Resolves DNS so a public name that maps to an internal IP
 * is still caught. Disabled when BLOCK_PRIVATE_HOSTS is off.
 */
export async function assertPublicUrl(raw: string): Promise<void> {
	const url = parseAllowedUrl(raw);
	if (url.protocol === "data:" || !config.security.blockPrivateHosts) return;
	if (await pointsAtPrivateHost(url)) {
		throw new HttpError(403, "Refusing to fetch a private host");
	}
}

/**
 * Re-check every request the page makes, not just the initial navigation, so a
 * redirect, sub-resource, or DNS rebind to a private address is still blocked.
 * Resolutions are cached per context to keep the hot path cheap.
 */
export async function installUrlGuard(context: BrowserContext): Promise<void> {
	if (!config.security.blockPrivateHosts) return;
	const cache = new Map<string, Promise<boolean>>();

	const isBlocked = async (raw: string): Promise<boolean> => {
		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			return true;
		}
		if (url.protocol === "data:") return false;
		if (!ALLOWED_SCHEMES.has(url.protocol)) return true;
		let check = cache.get(url.host);
		if (!check) {
			check = pointsAtPrivateHost(url);
			cache.set(url.host, check);
		}
		return check;
	};

	await context.route("**/*", async (route) => {
		const blocked = await isBlocked(route.request().url());
		try {
			if (blocked) {
				logger.debug({ url: route.request().url() }, "Blocked private request");
				await route.abort("blockedbyclient");
			} else {
				await route.continue();
			}
		} catch {
			/* request already handled */
		}
	});
}
