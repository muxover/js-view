export type WaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

export type OutputFormat = "markdown" | "text" | "html" | "json";

export type RenderActionType =
	| "scroll"
	| "click"
	| "type"
	| "wait"
	| "navigate";

export interface ScrollAction {
	type: "scroll";
	/** Number of scroll passes to perform (for infinite-scroll pages). */
	count?: number;
	/** Delay in ms between scroll passes to allow lazy content to load. */
	delay_ms?: number;
}

export interface ClickAction {
	type: "click";
	/** CSS selector of the element to click (e.g. a "load more" button). */
	selector: string;
	/** If true, do not fail when the selector is missing. */
	optional?: boolean;
}

export interface TypeAction {
	type: "type";
	selector: string;
	text: string;
	/** Press Enter after typing. */
	submit?: boolean;
}

export interface WaitAction {
	type: "wait";
	/** Wait for a selector to appear, or a fixed duration if ms is set. */
	selector?: string;
	ms?: number;
}

export interface NavigateAction {
	type: "navigate";
	url: string;
	wait_until?: WaitUntil;
}

export type RenderAction =
	| ScrollAction
	| ClickAction
	| TypeAction
	| WaitAction
	| NavigateAction;

export interface ProxyConfig {
	server: string;
	username?: string;
	password?: string;
}

export interface RenderRequest {
	url: string;
	wait_until?: WaitUntil;
	output_format?: OutputFormat;
	timeout_ms?: number;
	actions?: RenderAction[];
	/** Persist/reuse cookies and localStorage across calls under this id. */
	session_id?: string;
	/** Capture XHR/fetch responses observed during rendering. */
	capture_network?: boolean;
	/** Capture a screenshot and run OCR on it. */
	screenshot?: boolean;
	/** Wait for a specific selector before extracting content. */
	wait_for_selector?: string;
	/** Per-request proxy override. */
	proxy?: ProxyConfig;
	/** Strip ads / navigation chrome from the extracted content. */
	clean?: boolean;
	/** Only extract the elements matching this CSS selector. */
	selector?: string;
	/** Cut the content to this many characters. */
	max_chars?: number;
	/** Screenshot the whole page rather than the viewport. Defaults to true. */
	full_page?: boolean;
	/** Run OCR over the screenshot. Defaults to true. */
	ocr?: boolean;
	/** Screenshot encoding. Defaults to png. */
	screenshot_format?: "png" | "jpeg";
}

/**
 * What the render actually got: the page, a bot challenge, a login wall, an
 * error page, or nothing readable.
 */
export type RenderOutcome =
	| "ok"
	| "blocked"
	| "login_required"
	| "http_error"
	| "empty";

export interface CapturedRequest {
	url: string;
	method: string;
	status: number;
	resource_type: string;
	content_type?: string;
	/** Truncated response body for JSON/text resources. */
	body_preview?: string;
}

export interface RenderMetadata {
	render_time_ms: number;
	js_execution: boolean;
	scroll_events: number;
	click_events: number;
	status_code?: number;
	final_url: string;
	user_agent: string;
	viewport: { width: number; height: number };
	used_session: boolean;
	used_proxy: boolean;
}

export interface RenderResponse {
	title: string;
	content: string;
	links: string[];
	outcome: RenderOutcome;
	/** Why the outcome isn't "ok", and what to try next. */
	hints: string[];
	/** Set when max_chars cut the content; the untruncated length. */
	total_chars?: number;
	metadata: RenderMetadata;
	/** Base64-encoded PNG, present when screenshot was requested. */
	screenshot?: string;
	/** Text recognized from the screenshot via OCR. */
	ocr_text?: string;
	/** Captured network calls, present when capture_network was requested. */
	network?: CapturedRequest[];
}
