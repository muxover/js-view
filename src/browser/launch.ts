import { chromium as playwrightChromium } from "playwright";
import { chromium as extraChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, LaunchOptions } from "playwright";
import { config } from "../config.js";
import { HttpError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

let stealthRegistered = false;

function launcher(stealth: boolean) {
	if (!stealth) return playwrightChromium;
	if (!stealthRegistered) {
		// playwright-extra accepts puppeteer-extra stealth plugins.
		(extraChromium as any).use(StealthPlugin());
		stealthRegistered = true;
	}
	return extraChromium as unknown as typeof playwrightChromium;
}

const BASE_ARGS = [
	"--disable-dev-shm-usage",
	"--disable-blink-features=AutomationControlled",
	"--disable-gpu",
];

// The sandbox can't run as root in most containers, so it's off by default;
// turn it back on (BROWSER_NO_SANDBOX=false) wherever the host allows it.
const SANDBOX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

export const MISSING_BROWSER_HINT =
	"No Chromium found. Run `npx @muxover/js-view install`, install Chrome, or set CHROMIUM_PATH to a Chrome/Chromium binary.";

export class BrowserMissingError extends HttpError {
	constructor() {
		super(503, MISSING_BROWSER_HINT);
		this.name = "BrowserMissingError";
	}
}

function isMissingExecutable(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /Executable doesn't exist|is not found at|distribution '.+' is not found|ENOENT/i.test(
		msg,
	);
}

// Explicit path first; otherwise Playwright's own Chromium, then any Chrome or
// Edge already installed, so most machines render without a download.
function candidates(preferInstalled: boolean): LaunchOptions[] {
	if (config.browser.executablePath) {
		return [{ executablePath: config.browser.executablePath }];
	}
	const installed = config.browser.channels.map((channel) => ({ channel }));
	return preferInstalled ? [...installed, {}] : [{}, ...installed];
}

export interface LaunchOverrides {
	headful?: boolean;
	stealth?: boolean;
	/** Try the installed Chrome/Edge before Playwright's Chromium. */
	preferInstalled?: boolean;
}

export async function launchBrowser(
	overrides: LaunchOverrides = {},
): Promise<Browser> {
	const args = config.browser.noSandbox
		? [...SANDBOX_ARGS, ...BASE_ARGS]
		: BASE_ARGS;
	const headful = overrides.headful ?? config.browser.headful;
	const stealth = overrides.stealth ?? config.stealth.enabled;
	const base: LaunchOptions = { headless: !headful, args };

	for (const extra of candidates(overrides.preferInstalled ?? false)) {
		try {
			const browser = await launcher(stealth).launch({ ...base, ...extra });
			logger.debug(
				{ channel: extra.channel, version: browser.version() },
				"Launched browser",
			);
			return browser;
		} catch (err) {
			if (!isMissingExecutable(err)) throw err;
			logger.debug({ channel: extra.channel }, "Browser not available");
		}
	}
	throw new BrowserMissingError();
}
