import { chromium as playwrightChromium } from "playwright";
import { chromium as extraChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "playwright";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let stealthRegistered = false;

function registerStealth(): void {
	if (stealthRegistered) return;
	// playwright-extra accepts puppeteer-extra stealth plugins.
	(extraChromium as any).use(StealthPlugin());
	stealthRegistered = true;
}

const BASE_ARGS = [
	"--disable-dev-shm-usage",
	"--disable-blink-features=AutomationControlled",
	"--disable-gpu",
];

// The sandbox can't run as root in most containers, so it's off by default;
// turn it back on (BROWSER_NO_SANDBOX=false) wherever the host allows it.
const SANDBOX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

export async function launchBrowser(): Promise<Browser> {
	const headless = !config.browser.headful;
	const args = config.browser.noSandbox
		? [...SANDBOX_ARGS, ...BASE_ARGS]
		: BASE_ARGS;
	const options = { headless, args };

	if (config.stealth.enabled) {
		registerStealth();
		logger.debug("Launching stealth Chromium");
		return (await (extraChromium as any).launch(options)) as Browser;
	}

	logger.debug("Launching standard Chromium");
	return playwrightChromium.launch(options);
}
