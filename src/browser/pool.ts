import type { Browser, BrowserContext } from "playwright";
import { launchBrowser } from "./launch.js";
import {
	randomUserAgent,
	randomViewport,
	defaultHeaders,
	resolveProxy,
} from "./stealth.js";
import { loadSessionStatePath } from "./session.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type { ProxyConfig } from "../types.js";

interface PooledBrowser {
	browser: Browser;
	uses: number;
	busy: boolean;
}

export interface LeasedContext {
	context: BrowserContext;
	userAgent: string;
	viewport: { width: number; height: number };
	usedProxy: boolean;
	release: () => Promise<void>;
}

export interface AcquireOptions {
	sessionId?: string;
	proxy?: ProxyConfig;
}

/**
 * A bounded pool of Chromium browsers. Each render gets a fresh, isolated
 * BrowserContext; browsers are recycled after a configurable number of uses to
 * bound memory growth.
 */
export class BrowserPool {
	private browsers: PooledBrowser[] = [];
	private waiters: Array<(b: PooledBrowser) => void> = [];
	private closed = false;

	constructor(private readonly size = config.browser.poolSize) {}

	private async createBrowser(): Promise<PooledBrowser> {
		const browser = await launchBrowser();
		const entry: PooledBrowser = { browser, uses: 0, busy: false };
		this.browsers.push(entry);
		logger.debug({ poolSize: this.browsers.length }, "Created browser");
		return entry;
	}

	private async acquireBrowser(): Promise<PooledBrowser> {
		if (this.closed) throw new Error("Browser pool is closed");

		// Drop browsers that have crashed/disconnected before handing one out.
		this.browsers = this.browsers.filter(
			(b) => b.busy || b.browser.isConnected(),
		);

		const free = this.browsers.find((b) => !b.busy && b.browser.isConnected());
		if (free) {
			free.busy = true;
			return free;
		}

		if (this.browsers.length < this.size) {
			const entry = await this.createBrowser();
			entry.busy = true;
			return entry;
		}

		// Wait for a browser to be released.
		return new Promise<PooledBrowser>((resolve) => {
			this.waiters.push((b) => {
				b.busy = true;
				resolve(b);
			});
		});
	}

	private async releaseBrowser(
		entry: PooledBrowser,
		countUse = true,
	): Promise<void> {
		if (countUse) entry.uses += 1;

		// Recycle browsers that have served their quota to reclaim memory.
		if (entry.uses >= config.browser.maxUses) {
			logger.debug({ uses: entry.uses }, "Recycling browser");
			this.browsers = this.browsers.filter((b) => b !== entry);
			try {
				await entry.browser.close();
			} catch (err) {
				logger.warn({ err }, "Error closing recycled browser");
			}
			const waiter = this.waiters.shift();
			if (waiter) {
				const replacement = await this.createBrowser();
				waiter(replacement);
			}
			return;
		}

		const waiter = this.waiters.shift();
		if (waiter) {
			waiter(entry);
		} else {
			entry.busy = false;
		}
	}

	/** Lease an isolated browser context configured with stealth + session. */
	async acquireContext(opts: AcquireOptions = {}): Promise<LeasedContext> {
		const entry = await this.acquireBrowser();
		try {
			const userAgent = randomUserAgent();
			const viewport = randomViewport();
			const proxy = resolveProxy(opts.proxy);
			const storageState = await loadSessionStatePath(opts.sessionId);

			const context = await entry.browser.newContext({
				userAgent,
				viewport,
				proxy: proxy as any,
				storageState,
				ignoreHTTPSErrors: true,
				extraHTTPHeaders: defaultHeaders(),
				locale: "en-US",
			});

			const release = async () => {
				try {
					await context.close();
				} catch (err) {
					logger.warn({ err }, "Error closing context");
				} finally {
					await this.releaseBrowser(entry);
				}
			};

			return {
				context,
				userAgent,
				viewport,
				usedProxy: Boolean(proxy),
				release,
			};
		} catch (err) {
			// A dead browser would only fail the next caller too — drop it.
			if (!entry.browser.isConnected()) {
				this.browsers = this.browsers.filter((b) => b !== entry);
				const waiter = this.waiters.shift();
				if (waiter) waiter(await this.createBrowser());
			} else {
				// The lease never rendered, so don't spend one of its recycle uses.
				await this.releaseBrowser(entry, false);
			}
			throw err;
		}
	}

	async close(): Promise<void> {
		this.closed = true;
		await Promise.all(
			this.browsers.map(async (b) => {
				try {
					await b.browser.close();
				} catch {
					/* ignore */
				}
			}),
		);
		this.browsers = [];
	}

	get stats() {
		return {
			total: this.browsers.length,
			busy: this.browsers.filter((b) => b.busy).length,
			waiters: this.waiters.length,
		};
	}
}

let sharedPool: BrowserPool | null = null;

export function getPool(): BrowserPool {
	if (!sharedPool) sharedPool = new BrowserPool();
	return sharedPool;
}

export async function closePool(): Promise<void> {
	if (sharedPool) {
		await sharedPool.close();
		sharedPool = null;
	}
}
