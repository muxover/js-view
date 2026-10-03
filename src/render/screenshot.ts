import type { Page } from "playwright";
import { createWorker, type Worker } from "tesseract.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface ScreenshotResult {
	screenshot: string;
	ocrText?: string;
}

export interface ScreenshotOptions {
	fullPage?: boolean;
	ocr?: boolean;
	selector?: string;
	type?: "png" | "jpeg";
}

// Spinning up a Tesseract worker reloads the language model each time, so keep
// one alive and reuse it across renders.
let workerPromise: Promise<Worker> | null = null;

function ocrWorker(): Promise<Worker> {
	if (!workerPromise) {
		workerPromise = createWorker(config.ocrLang).catch((err) => {
			workerPromise = null;
			throw err;
		});
	}
	return workerPromise;
}

export async function closeOcrWorker(): Promise<void> {
	const pending = workerPromise;
	workerPromise = null;
	if (pending) await (await pending).terminate().catch(() => {});
}

// OCR is best-effort; its text is left out when it fails.
export async function captureScreenshot(
	page: Page,
	opts: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
	const type = opts.type ?? "png";
	const shotOpts = type === "jpeg" ? { type, quality: 80 } : { type };
	const buffer = opts.selector
		? await page.locator(opts.selector).first().screenshot(shotOpts)
		: await page.screenshot({ ...shotOpts, fullPage: opts.fullPage ?? true });
	const screenshot = buffer.toString("base64");

	let ocrText: string | undefined;
	if (opts.ocr ?? true) {
		try {
			const worker = await ocrWorker();
			const { data } = await worker.recognize(buffer);
			ocrText = data.text.trim() || undefined;
		} catch (err) {
			logger.warn({ err }, "OCR failed; returning screenshot without text");
		}
	}

	return { screenshot, ocrText };
}
