import type { Page } from "playwright";
import { createWorker, type Worker } from "tesseract.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface ScreenshotResult {
	screenshot: string;
	ocrText?: string;
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

/**
 * Capture a full-page PNG screenshot and run OCR over it. The screenshot is
 * returned base64-encoded; OCR text is best-effort and omitted on failure.
 */
export async function captureScreenshot(page: Page): Promise<ScreenshotResult> {
	const buffer = await page.screenshot({ fullPage: true, type: "png" });
	const screenshot = buffer.toString("base64");

	let ocrText: string | undefined;
	try {
		const worker = await ocrWorker();
		const { data } = await worker.recognize(buffer);
		ocrText = data.text.trim() || undefined;
	} catch (err) {
		logger.warn({ err }, "OCR failed; returning screenshot without text");
	}

	return { screenshot, ocrText };
}
