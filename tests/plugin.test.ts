import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const { version } = json("package.json");

// every install path pins the same npm version, so a release has to bump them all
describe("plugin manifests", () => {
	it("carry the package version", () => {
		expect(json(".claude-plugin/plugin.json").version).toBe(version);
		expect(json(".cursor-plugin/plugin.json").version).toBe(version);
		expect(json("plugin.json").version).toBe(version);
	});

	it("match the latest changelog entry and its release notes", () => {
		const changelog = readFileSync("CHANGELOG.md", "utf8");
		expect(changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1]).toBe(version);
		const notes = `release-notes/v${version}.md`;
		expect(existsSync(notes)).toBe(true);
		expect(readFileSync(notes, "utf8")).toMatch(
			new RegExp(`^# JS-View v${version.replace(/\./g, "\\.")} — `),
		);
	});

	it("start the MCP server from this exact npm version", () => {
		const args = ["-y", `@muxover/js-view@${version}`, "mcp"];
		expect(
			json(".claude-plugin/plugin.json").mcpServers["js-view"].args,
		).toEqual(args);
		expect(json("mcp.json").mcpServers["js-view"].args).toEqual(args);
	});

	it("list the plugin from the repo root", () => {
		expect(json(".claude-plugin/marketplace.json").plugins[0]).toMatchObject({
			name: "js-view",
			source: "./",
		});
		expect(json(".cursor-plugin/marketplace.json").plugins[0]).toMatchObject({
			name: "js-view",
			source: "./",
		});
		for (const file of [
			".claude-plugin/marketplace.json",
			".cursor-plugin/marketplace.json",
			".agents/plugins/marketplace.json",
		]) {
			expect(json(file).name).toBe("js-view");
		}
		expect(json(".agents/plugins/marketplace.json").plugins[0].source).toEqual({
			source: "local",
			path: "./",
		});
	});

	it("ship a skill with name and description", () => {
		const skill = readFileSync("skills/js-view/SKILL.md", "utf8");
		expect(skill).toMatch(/^---\nname: js-view\ndescription: .{50,}\n---\n/);
	});
});

describe("Dockerfile", () => {
	it("uses the Playwright image that matches the playwright package", () => {
		const pinned = json("package.json").dependencies.playwright;
		expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
		expect(readFileSync("Dockerfile", "utf8")).toContain(
			`mcr.microsoft.com/playwright:v${pinned}-`,
		);
	});
});
