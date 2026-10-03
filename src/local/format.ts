import type { RenderResponse } from "../types.js";

/** Title, address, and outcome lines that head a render's text output. */
export function header(res: RenderResponse): string {
	const m = res.metadata;
	const lines = [
		`Title: ${res.title || "(none)"}`,
		`URL: ${m.final_url}`,
		`Status: ${m.status_code ?? "n/a"} | ${res.outcome} | ${m.render_time_ms} ms`,
	];
	if (res.total_chars) {
		lines.push(
			`Length: ${res.content.length} of ${res.total_chars} characters`,
		);
	}
	for (const hint of res.hints) lines.push(`Note: ${hint}`);
	return lines.join("\n");
}
