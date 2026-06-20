import { z } from "zod";

const scrollAction = z.object({
	type: z.literal("scroll"),
	count: z.number().int().min(1).max(100).optional(),
	delay_ms: z.number().int().min(0).max(10_000).optional(),
});

const clickAction = z.object({
	type: z.literal("click"),
	selector: z.string().min(1),
	optional: z.boolean().optional(),
});

const typeAction = z.object({
	type: z.literal("type"),
	selector: z.string().min(1),
	text: z.string(),
	submit: z.boolean().optional(),
});

const waitAction = z.object({
	type: z.literal("wait"),
	selector: z.string().min(1).optional(),
	ms: z.number().int().min(0).max(60_000).optional(),
});

const navigateAction = z.object({
	type: z.literal("navigate"),
	url: z.string().url(),
	wait_until: z
		.enum(["load", "domcontentloaded", "networkidle", "commit"])
		.optional(),
});

const action = z.discriminatedUnion("type", [
	scrollAction,
	clickAction,
	typeAction,
	waitAction,
	navigateAction,
]);

const proxy = z.object({
	server: z.string().min(1),
	username: z.string().optional(),
	password: z.string().optional(),
});

export const renderRequestSchema = z.object({
	url: z.string().url(),
	wait_until: z
		.enum(["load", "domcontentloaded", "networkidle", "commit"])
		.optional(),
	output_format: z.enum(["markdown", "text", "html", "json"]).optional(),
	timeout_ms: z.number().int().min(1000).max(120_000).optional(),
	actions: z.array(action).max(50).optional(),
	session_id: z.string().min(1).max(128).optional(),
	capture_network: z.boolean().optional(),
	screenshot: z.boolean().optional(),
	wait_for_selector: z.string().min(1).optional(),
	proxy: proxy.optional(),
	clean: z.boolean().optional(),
});

export type ValidatedRenderRequest = z.infer<typeof renderRequestSchema>;
