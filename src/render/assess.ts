import type { RenderOutcome } from "../types.js";

export interface Assessment {
	outcome: RenderOutcome;
	hints: string[];
}

interface PageFacts {
	title: string;
	content: string;
	html: string;
	statusCode?: number;
	finalUrl: string;
}

const CHALLENGE_TITLE =
	/just a moment|attention required|access denied|are you a robot|verify you are human|security check|pardon our interruption|request blocked|captcha/i;
const CHALLENGE_MARKUP =
	/challenges\.cloudflare\.com|cf-challenge|cf_chl_|id="challenge-|g-recaptcha|h-captcha|px-captcha|datadome/i;
const PASSWORD_FIELD = /<input[^>]+type=["']?password/i;
const LOGIN_PATH = /\/(log-?in|sign-?in|auth|sso|account\/login)(\/|\?|$)/i;

// A real article is rarely this short, so thin pages with challenge or login
// markers are treated as walls rather than content.
const THIN = 600;

export function assessPage(page: PageFacts): Assessment {
	const text = page.content.trim();
	const thin = text.length < THIN;
	const status = page.statusCode ?? 0;

	if (
		CHALLENGE_TITLE.test(page.title) ||
		(thin && CHALLENGE_MARKUP.test(page.html)) ||
		(thin && (status === 403 || status === 429))
	) {
		return {
			outcome: "blocked",
			hints: [
				"The site served a bot check instead of the page.",
				"A residential proxy or a signed-in session may get through; strong bot protection can still refuse.",
			],
		};
	}

	if (
		thin &&
		(PASSWORD_FIELD.test(page.html) ||
			LOGIN_PATH.test(new URL(page.finalUrl).pathname))
	) {
		return {
			outcome: "login_required",
			hints: [
				"The page is behind a sign-in.",
				"Save a session once with `npx @muxover/js-view login <url> --session <name>`, then render with that session.",
			],
		};
	}

	if (status >= 400) {
		return {
			outcome: "http_error",
			hints: [`The server answered ${status}.`],
		};
	}

	if (
		text.length < 20 ||
		(text.length < 120 && /^(loading|please wait)/i.test(text))
	) {
		return {
			outcome: "empty",
			hints: [
				"The page rendered almost no readable text.",
				"Wait for a selector that marks the content, scroll for lazy-loaded items, or retry without main-content extraction.",
			],
		};
	}

	return { outcome: "ok", hints: [] };
}

/** Cut content to max characters, preferring a paragraph boundary. */
export function truncate(
	content: string,
	max: number,
): { content: string; total?: number } {
	if (!max || content.length <= max) return { content };
	const cut = content.lastIndexOf("\n\n", max);
	const end = cut > max * 0.6 ? cut : max;
	return {
		content: `${content.slice(0, end).trimEnd()}\n\n[truncated: ${end} of ${content.length} characters. Narrow it with selector, or raise max_chars.]`,
		total: content.length,
	};
}
