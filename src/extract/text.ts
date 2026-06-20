/** Normalize extracted text: collapse runs of whitespace and blank lines. */
export function normalizeText(text: string): string {
	return text
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
