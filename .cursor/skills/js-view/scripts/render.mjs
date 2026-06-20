#!/usr/bin/env node
/**
 * JS-View skill client.
 *
 * Renders a JavaScript-heavy page with a real headless browser and prints the
 * extracted result as JSON. The skill is self-contained: on first run it
 * installs its own renderer (Playwright + Chromium) inside this folder, so it
 * works anywhere you copy it without a separate service or extra setup.
 *
 * Usage:
 *   node scripts/render.mjs --url "https://example.com"
 *   node scripts/render.mjs --url <url> --wait-for ".item" --scroll 3 --capture-network
 *   node scripts/render.mjs --url <url> --screenshot --out result.json
 */

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token.startsWith("--")) continue;
		const key = token.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("--")) {
			args[key] = true;
		} else {
			args[key] = next;
			i += 1;
		}
	}
	return args;
}

// Run a setup command via the shell. We pass one command string (instead of an
// args array with shell:true) to avoid Node's DEP0190 warning. Child output goes
// to our stderr so stdout stays clean JSON for the agent.
function run(command) {
	const res = spawnSync(command, {
		cwd: SKILL_ROOT,
		stdio: ["ignore", 2, 2],
		shell: true,
	});
	if (res.status !== 0) {
		throw new Error(`\`${command}\` failed`);
	}
}

function ensureDeps() {
	if (!existsSync(join(SKILL_ROOT, "node_modules", "playwright"))) {
		console.error("[js-view] first run: installing renderer (one time)...");
		run("npm install --no-audit --no-fund");
	}
	const marker = join(SKILL_ROOT, "node_modules", ".chromium-installed");
	if (!existsSync(marker)) {
		console.error("[js-view] installing Chromium (first run, one time)...");
		run("npx playwright install chromium");
		try {
			writeFileSync(marker, "ok");
		} catch {
			/* marker is best-effort */
		}
	}
}

function buildOptions(args) {
	if (!args.url) {
		console.error("Error: --url is required");
		process.exit(2);
	}

	const opts = { url: args.url };
	if (args.format) opts.output_format = args.format;
	if (args["wait-until"]) opts.wait_until = args["wait-until"];
	if (args["wait-for"]) opts.wait_for_selector = args["wait-for"];
	if (args.timeout) opts.timeout_ms = Number.parseInt(args.timeout, 10);
	if (args.session) opts.session_id = args.session;
	if (args["capture-network"]) opts.capture_network = true;
	if (args.screenshot) opts.screenshot = true;
	if (args["ocr-lang"]) opts.ocr_lang = args["ocr-lang"];
	if (args["no-clean"]) opts.clean = false;
	if (args.headful) opts.headful = true;
	if (args.proxy) opts.proxy = { server: args.proxy };

	const actions = [];
	if (args.scroll) {
		actions.push({ type: "scroll", count: Number.parseInt(args.scroll, 10) });
	}
	if (args.click) {
		actions.push({ type: "click", selector: args.click, optional: true });
	}
	if (args.type) {
		const eq = String(args.type).indexOf("=");
		if (eq > 0) {
			actions.push({
				type: "type",
				selector: String(args.type).slice(0, eq),
				text: String(args.type).slice(eq + 1),
				submit: true,
			});
		}
	}
	if (actions.length) opts.actions = actions;

	return opts;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const opts = buildOptions(args);

	ensureDeps();

	const { renderPage } = await import("./engine.mjs");
	const data = await renderPage(opts);

	if (args.out) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(args.out, JSON.stringify(data, null, 2), "utf8");
		console.error(`[js-view] wrote full result to ${args.out}`);
	}

	const summary = {
		title: data.title,
		links: data.links?.length ?? 0,
		metadata: data.metadata,
		content: data.content,
	};
	if (data.ocr_text) summary.ocr_text = data.ocr_text;
	if (data.network) summary.network_calls = data.network.length;
	if (data.screenshot && !args.out) {
		summary.screenshot = "<base64 omitted; pass --out to save the full result>";
	}
	console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
