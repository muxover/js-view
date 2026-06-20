import type { Page } from "playwright";
import { createWorker } from "tesseract.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface ScreenshotResult {
	screenshot: string;
	ocrText?: string;
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
		const worker = await createWorker(config.ocrLang);
		try {
			const { data } = await worker.recognize(buffer);
			ocrText = data.text.trim() || undefined;
		} finally {
			await worker.terminate();
		}
	} catch (err) {
		logger.warn({ err }, "OCR failed; returning screenshot without text");
	}

	return { screenshot, ocrText };
}
