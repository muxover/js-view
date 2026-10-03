import { launchBrowser } from "../browser/launch.js";
import { loadSessionStatePath, saveSessionState } from "../browser/session.js";
import { assertPublicUrl } from "../security/url.js";

// Saves cookies and storage under sessionId until the window closes, so later
// renders start signed in.
export async function login(url: string, sessionId: string): Promise<void> {
	await assertPublicUrl(url);
	const browser = await launchBrowser({
		headful: true,
		stealth: false,
		// sites trust a real Chrome sign-in more than a bundled Chromium
		preferInstalled: true,
	});
	const context = await browser.newContext({
		storageState: await loadSessionStatePath(sessionId),
		viewport: null,
	});
	const page = await context.newPage();
	await page.goto(url).catch(() => {});

	// storageState can't be read once the window is gone, so snapshot as we go.
	let last: unknown;
	const snapshot = async () => {
		try {
			last = await context.storageState();
		} catch {
			/* context closing */
		}
	};
	await snapshot();
	const timer = setInterval(() => void snapshot(), 1000);

	// closing the window or Ctrl+C in the terminal both finish the login
	await new Promise<void>((resolve) => {
		process.once("SIGINT", () => resolve());
		browser.on("disconnected", () => resolve());
		context.on("page", (p) => p.on("close", () => void closeIfDone()));
		page.on("close", () => void closeIfDone());
		async function closeIfDone() {
			if (context.pages().length === 0) {
				await browser.close().catch(() => {});
				resolve();
			}
		}
	});
	clearInterval(timer);
	await snapshot();
	if (last) await saveSessionState(sessionId, last);
	await browser.close().catch(() => {});
}
