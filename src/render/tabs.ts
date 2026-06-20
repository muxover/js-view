import type { BrowserContext, Page } from "playwright";

/**
 * Tracks additional tabs/popups a page opens during rendering (e.g. SPAs that
 * spawn auth windows or "open in new tab" flows) so their URLs and content can
 * be folded into the result. Multi-tab awareness for agents.
 */
export function trackTabs(context: BrowserContext, mainPage: Page) {
	const extraPages = new Set<Page>();

	const onPage = (page: Page) => {
		if (page !== mainPage) extraPages.add(page);
	};
	context.on("page", onPage);

	return {
		stop(): Page[] {
			context.off("page", onPage);
			return [...extraPages].filter((p) => !p.isClosed());
		},
	};
}

/** Collect the final URLs of any extra tabs that were opened. */
export async function collectTabUrls(pages: Page[]): Promise<string[]> {
	const urls: string[] = [];
	for (const page of pages) {
		try {
			urls.push(page.url());
		} catch {
			/* tab may have closed */
		}
	}
	return urls;
}
