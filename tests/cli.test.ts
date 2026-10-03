import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { startProxy, startSite, type Site } from "./fixtures/site.js";

const CLI = "dist/cli.js";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// async on purpose: the fixture site runs in this process and must keep serving
function run(...args: string[]) {
	return new Promise<{ code: number; out: string; err: string }>((resolve) => {
		execFile(
			process.execPath,
			[CLI, ...args],
			{
				env: { ...process.env, LOG_LEVEL: "silent", REDIS_URL: "" },
				timeout: 60_000,
			},
			(error, out, err) => {
				const code = error ? Number((error as { code?: number }).code ?? 1) : 0;
				resolve({ code, out, err });
			},
		);
	});
}

describe.skipIf(!existsSync(CLI))("cli (built)", () => {
	let site: Site;
	beforeAll(async () => {
		site = await startSite();
	});
	afterAll(() => site.close());

	it("prints the package version", async () => {
		expect((await run("--version")).out.trim()).toBe(pkg.version);
	});

	it("rejects unknown flags with usage and exit 2", async () => {
		const res = await run("https://example.com", "--nope");
		expect(res.code).toBe(2);
		expect(res.err).toContain("Usage: js-view");
	});

	it("renders a page to stdout with the header on stderr", async () => {
		const res = await run(site.url("/spa"), "-f", "text");
		expect(res.code).toBe(0);
		expect(res.out).toContain("Apple\n\nBanana");
		expect(res.err).toContain("Title: Store");
	});

	it("exits 3 when the page is a wall, not content", async () => {
		expect((await run(site.url("/challenge"))).code).toBe(3);
	});

	it("adds a scheme to a bare host", async () => {
		const res = await run(site.url("/docs").replace("http://", ""), "--links");
		expect(res.out).toContain(`${site.url("/blog")}\tBlog`);
	});

	it("renders through a proxy that needs a username and password", async () => {
		const proxy = await startProxy(site, "jax", "s3cret");
		try {
			const res = await run(
				"http://jsview.test/docs",
				"-f",
				"text",
				"--proxy",
				proxy.url,
			);
			expect(res.out).toContain("Install the tool");
			expect(proxy.authorized()).toBeGreaterThan(0);
		} finally {
			await proxy.close();
		}
	});

	it("finds Playwright's installer", async () => {
		const res = await run("install", "--dry-run");
		expect(res.code).toBe(0);
		expect(res.out).toMatch(/chromium/i);
	});

	it("fills an input before reading", async () => {
		const res = await run(
			site.url("/search"),
			"-f",
			"text",
			"--type",
			"#q=playwright",
		);
		expect(res.out).toContain("Results for playwright");
	});

	it("prints the full result with --json", async () => {
		const res = await run(
			site.url("/spa"),
			"--json",
			"-w",
			"article",
			"--wait-until",
			"load",
		);
		const body = JSON.parse(res.out);
		expect(body.outcome).toBe("ok");
		expect(body.content).toContain("Banana");
	});

	it("shows help, and rejects unknown commands", async () => {
		expect((await run("--help")).out).toContain("Commands:");
		const res = await run("nonsense");
		expect(res.code).toBe(2);
		expect(res.err).toContain('unknown command "nonsense"');
	});

	it("refuses to start a worker without Redis", async () => {
		const res = await run("worker");
		expect(res.code).toBe(2);
		expect(res.err).toContain("REDIS_URL");
	});

	it("serves the HTTP API", async () => {
		const child = spawn(process.execPath, [CLI, "serve", "--port", "18934"], {
			env: { ...process.env, LOG_LEVEL: "silent", REDIS_URL: "" },
		});
		try {
			let health: Response | undefined;
			for (let i = 0; i < 50 && !health; i++) {
				await new Promise((r) => setTimeout(r, 200));
				health = await fetch("http://127.0.0.1:18934/health").catch(
					() => undefined,
				);
			}
			expect(health?.status).toBe(200);
		} finally {
			child.kill();
		}
	});
});
