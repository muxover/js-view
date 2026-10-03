import type { BrowserContext, Page } from "playwright";

// Popups and new tabs a page opens while rendering; their URLs join the links.
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
